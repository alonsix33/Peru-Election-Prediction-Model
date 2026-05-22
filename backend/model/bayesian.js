const { getPolymarketWeight } = require('./weights');

/**
 * Convierte P(ganar) de Polymarket → voto share implícito via Φ⁻¹.
 *
 * PM publica P(win), no vote share. Tratarlos como vote share directo introduce
 * un sesgo masivo: PM 75% P(win) ≠ 75% de votos — implica solo ~52% con σ=3pp.
 * La conversión correcta: voteShare = 50 + Φ⁻¹(pWin) × σ
 *
 * σ = 3.0pp: incertidumbre histórica típica en R2 peruano (RMSE encuestas ±3pp).
 * Si pWin > 98% o < 2% → clamp para evitar infinitos en Φ⁻¹.
 */
function pmWinProbToVoteShare(pWin, sigma = 3.0) {
  const p = Math.min(0.98, Math.max(0.02, pWin / 100));
  // Rational approximation of Φ⁻¹ (Abramowitz & Stegun 26.2.17, |ε| < 4.5e-4)
  const t = p < 0.5
    ? Math.sqrt(-2 * Math.log(p))
    : Math.sqrt(-2 * Math.log(1 - p));
  const c = [2.515517, 0.802853, 0.010328];
  const d = [1.432788, 0.189269, 0.001308];
  const z0 = t - (c[0] + c[1]*t + c[2]*t*t) / (1 + d[0]*t + d[1]*t*t + d[2]*t*t*t);
  const z = p < 0.5 ? -z0 : z0;
  return 50 + z * sigma;
}

/**
 * Integración Bayesiana encuestas + Polymarket.
 *
 * Fórmula (sección 6, Fase 3):
 *   α = getPolymarketWeight(volumeUSD)  ← dinámico según hora Lima
 *   posterior = α × PM_voteShare + (1-α) × P_encuestas
 *
 * PM_voteShare = pmWinProbToVoteShare(PM_pwin) — convierte P(ganar) a voto share
 * implícito antes de integrar, evitando distorsión cuando α sube en la veda.
 *
 * @param {Object} pollsEstimate - Salida de redistributeUndecided():
 *   { candidate: { estimated_pct, ... } }
 * @param {Object} polymarketData - Datos más recientes de Polymarket:
 *   { candidate: probability (0-100) }
 * @param {number} volumeUSD - Volumen total del evento en USD
 * @returns {Object} - { candidates: { candidate: { posterior_pct, polls_pct, polymarket_pct } },
 *                       polymarket_weight, polls_weight }
 */
function bayesianIntegration(pollsEstimate, polymarketData, volumeUSD, overrideAlpha = null) {
  const α = overrideAlpha !== null ? overrideAlpha : getPolymarketWeight(volumeUSD);

  // Post-elección: no hay integración
  if (α === null) {
    return {
      candidates: Object.fromEntries(
        Object.entries(pollsEstimate).map(([c, d]) => [c, {
          posterior_pct: d.estimated_pct,
          polls_pct: d.estimated_pct,
          polymarket_pct: null,
          source: 'polls_only'
        }])
      ),
      polymarket_weight: 0,
      polls_weight: 1
    };
  }

  const pollsWeight = 1 - α;
  const candidates = {};

  // Recopilar todos los candidatos de ambas fuentes
  const allCandidates = new Set([
    ...Object.keys(pollsEstimate),
    ...Object.keys(polymarketData)
  ]);

  for (const candidate of allCandidates) {
    const pollsPct = pollsEstimate[candidate]?.estimated_pct ?? 0;
    const polyPct = polymarketData[candidate] ?? 0;

    // Convertir P(ganar) PM → voto share implícito, luego cap ±10pp desde 50%.
    // Sin esta conversión, PM 75% P(win) se trata como 75% de votos → sesgo masivo.
    // Con conversión: PM 75% → ~52% voto share (con σ=3pp) → coherente con encuestas.
    const pmVoteShare = polyPct > 0 ? pmWinProbToVoteShare(polyPct) : 0;
    const polyPctCapped = polyPct > 0
      ? 50 + Math.max(-10, Math.min(10, pmVoteShare - 50))
      : 0;

    let posterior_pct;
    let source;

    if (pollsPct > 0 && polyPct > 0) {
      // Ambas fuentes disponibles: integración bayesiana
      posterior_pct = α * polyPctCapped + pollsWeight * pollsPct;
      source = 'integrated';
    } else if (pollsPct > 0) {
      // Solo encuestas (candidato no está en Polymarket)
      posterior_pct = pollsPct;
      source = 'polls_only';
    } else {
      // Solo Polymarket (candidato no está en encuestas)
      posterior_pct = polyPctCapped * α;
      source = 'polymarket_only';
    }

    candidates[candidate] = {
      posterior_pct,
      polls_pct: pollsPct,
      polymarket_pct: polyPct || null,
      source
    };
  }

  return {
    candidates,
    polymarket_weight: α,
    polls_weight: pollsWeight
  };
}

module.exports = { bayesianIntegration };
