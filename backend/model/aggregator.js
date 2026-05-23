const { getPollWeight } = require('./weights');

/**
 * House effects — sesgos sistemáticos por encuestadora (sección 5.3).
 * Positivo = la encuestadora sobreestima a ese candidato.
 * Se RESTA del resultado crudo para corregir.
 */
const HOUSE_EFFECTS = {
  // Candidatos R1-only (Aliaga, López Chau) se conservan para referencia histórica
  // pero no aparecerán en encuestas R2 — no afectan el modelo actual.
  //
  // House effects para Roberto Sánchez Palomino calibrados con ONPE R1 2026:
  //   ONPE 100%: 12.0% votos válidos
  //   Ipsos:  8.57% → subestimó −3.43pp  → house effect = −3.0pp (conservador)
  //   Datum:  7.45% → subestimó −4.55pp  → house effect = −3.5pp (conservador)
  //   IEP:   11.84% → error     −0.16pp  → house effect =  0.0pp (preciso)
  //   CPI:   ~9.5%  → subestimó ~−2.5pp  → house effect = −2.0pp (estimado)
  //   CIT:   urban-focused, sin datos R1 directos → house effect = −1.5pp (estimado)
  // Valores conservadores (60-75% del gap R1) para R2, dado que en segunda vuelta
  // los metodología y foco geográfico pueden ajustarse.
  CIT: {
    'Rafael López Aliaga':       +3.5,
    'Keiko Fujimori':            +1.5,
    'López Chau':                +0.5,
    'Roberto Sánchez Palomino': -1.5,   // estimado: sesgo urbano CIT en R1
  },
  CPI: {
    'Rafael López Aliaga':       +1.2,
    'Keiko Fujimori':            -0.5,
    'López Chau':                +0.8,
    'Roberto Sánchez Palomino': -2.0,   // estimado: CPI mayor MAE general en R1
  },
  Ipsos: {
    'Rafael López Aliaga':       -0.5,
    'Keiko Fujimori':            +0.5,
    'López Chau':                -0.3,
    'Roberto Sánchez Palomino': -3.0,   // ONPE R1: Ipsos 8.57% vs ONPE 12.0% (−3.43pp)
  },
  Datum: {
    'Rafael López Aliaga':       -0.8,
    'Keiko Fujimori':            +0.8,
    'López Chau':                -0.3,
    'Roberto Sánchez Palomino': -3.5,   // ONPE R1: Datum 7.45% vs ONPE 12.0% (−4.55pp)
  },
  IEP: {
    'Rafael López Aliaga':       -1.5,
    'Keiko Fujimori':            -0.5,
    'López Chau':                +0.2,
    'Roberto Sánchez Palomino':  0.0,   // ONPE R1: IEP 11.84% vs ONPE 12.0% (−0.16pp ✅)
  }
};

/**
 * Obtiene el house effect para una encuestadora y candidato.
 * Si no hay house effect definido, retorna 0.
 */
function getHouseEffect(pollsterName, candidate) {
  return (HOUSE_EFFECTS[pollsterName] && HOUSE_EFFECTS[pollsterName][candidate]) || 0;
}

/**
 * Agrega encuestas ponderadas con house effects.
 *
 * Fórmula (sección 6, Fase 1):
 *   W(encuesta) = decaimiento × sqrt(n/2000) × peso_encuestadora × peso_tipo
 *   Resultado_candidato = Σ(resultado_ajustado × W) / Σ(W)
 *   resultado_ajustado = resultado_crudo − house_effect
 *
 * @param {Array} polls - Encuestas con estructura:
 *   { pollster_name, field_end, sample_n, poll_type, margin_error,
 *     results: [{ candidate, pct_raw }] }
 * @param {Object} pollsterWeights - { pollster_name: weight_multiplier }
 * @returns {Object} - { candidate: { weighted_pct, n_polls } }
 */
function aggregatePolls(polls, pollsterWeights) {
  // Acumuladores por candidato
  const accum = {};  // { candidate: { weightedSum, totalWeight, errors[], n_polls } }

  for (const poll of polls) {
    const multiplier = pollsterWeights[poll.pollster_name] || 1.00;
    const W = getPollWeight(poll, multiplier);

    // Si el peso es despreciable, saltar esta encuesta
    if (W < 0.001) continue;

    for (const result of poll.results) {
      const candidate = result.candidate;
      const houseEffect = getHouseEffect(poll.pollster_name, candidate);
      const adjustedPct = result.pct_raw - houseEffect;

      if (!accum[candidate]) {
        accum[candidate] = {
          weightedSum: 0,
          totalWeight: 0,
          n_polls: 0
        };
      }

      accum[candidate].weightedSum += adjustedPct * W;
      accum[candidate].totalWeight += W;
      accum[candidate].n_polls += 1;
    }
  }

  // Calcular resultado final por candidato
  const aggregated = {};

  for (const [candidate, data] of Object.entries(accum)) {
    const weighted_pct = data.totalWeight > 0
      ? data.weightedSum / data.totalWeight
      : 0;

    aggregated[candidate] = {
      weighted_pct: Math.max(0, weighted_pct),
      n_polls: data.n_polls
    };
  }

  return aggregated;
}

module.exports = { aggregatePolls, HOUSE_EFFECTS, getHouseEffect };
