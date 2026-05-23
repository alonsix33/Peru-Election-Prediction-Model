const { nowPeru, electoralPhase } = require('./clock');
const { aggregatePolls } = require('./aggregator');
const { redistributeUndecided } = require('./undecided');
const { bayesianIntegration } = require('./bayesian');
const { runMonteCarlo } = require('./montecarlo');
const db = require('../db');

/**
 * Ejecuta el pipeline estadístico completo:
 * 1. Cargar encuestas de DB
 * 2. Agregar con house effects
 * 3. Redistribuir indecisos
 * 4. Integración bayesiana con Polymarket
 * 5. Monte Carlo 10,000 simulaciones
 *
 * @param {Object} options
 * @param {boolean} options.saveToDB - Guardar resultado en model_predictions
 * @param {string} options.trigger - 'auto_polymarket_update' | 'user_simulation'
 * @returns {Object} { candidates, runoffSummary, meta }
 */
async function runFullPipeline({ saveToDB = false, trigger = 'auto_polymarket_update', pmTimestamp = null, overrideTimestamp = null, overrideAlpha = null, electionRound = 2 } = {}) {
  const now = nowPeru();
  const phase = electoralPhase();
  console.log(`\n🧮 Pipeline @ ${now.toFormat('dd/MM HH:mm')} Lima (fase: ${phase}, trigger: ${trigger})...`);

  // 1. Cargar encuestas
  const { rows: pollsters } = await db.query('SELECT * FROM pollsters');
  const pollsterWeights = {};
  for (const p of pollsters) {
    pollsterWeights[p.name] = parseFloat(p.weight_multiplier);
  }

  const { rows: dbPolls } = await db.query(`
    SELECT p.*, ps.name as pollster_name
    FROM polls p JOIN pollsters ps ON p.pollster_id = ps.id
    WHERE p.election_round = $1
  `, [electionRound]);

  // Normalización de nombres (corrige datos legacy en DB)
  const NAME_FIX = { 'Martín Vizcarra': 'Mario Vizcarra' };

  const { rows: dbResults } = await db.query('SELECT * FROM poll_results');
  const resultsByPoll = {};
  for (const r of dbResults) {
    if (!resultsByPoll[r.poll_id]) resultsByPoll[r.poll_id] = [];
    const name = NAME_FIX[r.candidate] || r.candidate;
    resultsByPoll[r.poll_id].push({ candidate: name, pct_raw: parseFloat(r.pct_raw) });
  }

  const polls = dbPolls.map(p => ({
    pollster_name: p.pollster_name,
    field_end: p.field_end,
    sample_n: p.sample_n,
    poll_type: p.poll_type,
    margin_error: parseFloat(p.margin_error),
    pct_undecided: p.pct_undecided ? parseFloat(p.pct_undecided) : null,
    pct_blank_null: p.pct_blank_null ? parseFloat(p.pct_blank_null) : null,
    results: resultsByPoll[p.id] || []
  }));

  // 2. Agregar encuestas
  const aggregated = aggregatePolls(polls, pollsterWeights);
  console.log('   ✅ Agregación:', Object.keys(aggregated).length, 'candidatos');

  // 3. Redistribuir indecisos
  const recentPolls = polls
    .filter(p => p.pct_undecided !== null)
    .sort((a, b) => new Date(b.field_end) - new Date(a.field_end))
    .slice(0, 5);
  const avgUndecided = recentPolls.length > 0
    ? recentPolls.reduce((s, p) => s + p.pct_undecided, 0) / recentPolls.length
    : 25;

  const withUndecided = redistributeUndecided(aggregated, avgUndecided, undefined, electionRound);
  console.log('   ✅ Indecisos redistribuidos:', avgUndecided.toFixed(1) + '%', electionRound === 2 ? '(R2 proporcional)' : '(R1 CIT ceilings)');

  // 4. Integración Bayesiana con Polymarket
  let pmSnapshots;
  if (pmTimestamp) {
    const { rows } = await db.query(`
      SELECT candidate, probability, volume_usd
      FROM polymarket_snapshots
      WHERE captured_at_lima = $1 AND election_round = $2
    `, [pmTimestamp, electionRound]);
    pmSnapshots = rows;
  } else {
    const { rows } = await db.query(`
      SELECT candidate, probability, volume_usd
      FROM polymarket_snapshots
      WHERE election_round = $1
        AND captured_at_lima = (
          SELECT MAX(captured_at_lima) FROM polymarket_snapshots WHERE election_round = $1
        )
    `, [electionRound]);
    pmSnapshots = rows;
  }

  const polymarketData = {};
  let pmVolume = 0;
  for (const s of pmSnapshots) {
    polymarketData[s.candidate] = parseFloat(s.probability);
    pmVolume = parseFloat(s.volume_usd);
  }

  const bayesian = bayesianIntegration(withUndecided, polymarketData, pmVolume, overrideAlpha);
  console.log('   ✅ Bayesian: α=' + bayesian.polymarket_weight.toFixed(3));

  // 5. Monte Carlo — conteo de sims depende de la fase
  // pre_veda: 20k (cada 60min, ruido irrelevante vs incertidumbre estructural)
  // veda + election_day: 50k (cada 15-30min, colas importan más)
  const simCount = phase === 'election_day' || phase === 'veda' ? 50_000 : 20_000;
  const { results: mcResults, runoffSummary, riskScenarios } = runMonteCarlo(bayesian.candidates, simCount);
  console.log(`   ✅ Monte Carlo: ${simCount.toLocaleString()} simulaciones`);

  // 5b. Escenarios analíticos R2 (no requieren MC adicional)
  if (electionRound === 2 && riskScenarios) {
    const keikoPollsPct = bayesian.candidates['Keiko Fujimori']?.polls_pct ?? 50;
    const sanchezPollsPct = bayesian.candidates['Roberto Sánchez Palomino']?.polls_pct ?? 50;

    // Aproximación de la función error (Abramowitz & Stegun)
    const erf = (x) => {
      const s = x < 0 ? -1 : 1, a = Math.abs(x);
      const t = 1 / (1 + 0.3275911 * a);
      return s * (1 - (0.254829592*t - 0.284496736*t**2 + 1.421413741*t**3 - 1.453152027*t**4 + 1.061405429*t**5) * Math.exp(-a*a));
    };
    const Phi = (z) => 0.5 * (1 + erf(z / Math.sqrt(2)));

    // lead > 0 → Sánchez lidera encuestas
    const lead = sanchezPollsPct - keikoPollsPct;
    const sigma = 3.0;
    const rt2 = Math.sqrt(2);

    riskScenarios.polls_only_keiko_win   = parseFloat(((1 - Phi(lead / (sigma * rt2))) * 100).toFixed(1));
    riskScenarios.polls_only_sanchez_win = parseFloat((Phi(lead / (sigma * rt2)) * 100).toFixed(1));
    riskScenarios.bias_5pts_sanchez_win  = parseFloat((Phi((lead + 5) / (sigma * rt2)) * 100).toFixed(1));
    riskScenarios.bias_5pts_keiko_win    = parseFloat(((1 - Phi((lead + 5) / (sigma * rt2))) * 100).toFixed(1));

    // Opción E: P(voto blanco/nulo) por rechazo bilateral calibrado.
    // P(blank) = [P(rechaza KF) × P(rechaza RSP) + ρ × σ_KF × σ_RSP] × franchise_factor
    // ρ ≈ -0.20: correlación negativa — izquierda rechaza KF, derecha rechaza RSP → grupos distintos.
    // franchise_factor=0.75: encuestas sobreestiman blanqueo 1.3-1.5x históricamente.
    // Tasas: última medición Ipsos disponible en antivoto_snapshots (Def. no votaría).
    const { rows: antRows } = await db.query(`
      SELECT candidate, pct_no FROM antivoto_snapshots
      WHERE election_round = $1
        AND field_end = (SELECT MAX(field_end) FROM antivoto_snapshots WHERE election_round = $1)
    `, [electionRound]);
    const antMap = {};
    for (const r of antRows) antMap[r.candidate] = parseFloat(r.pct_no) / 100;
    const rejKF  = antMap['Keiko Fujimori']           ?? 0.48; // fallback: Ipsos abr 2026
    const rejRSP = antMap['Roberto Sánchez Palomino'] ?? 0.43; // fallback: Ipsos abr 2026
    const rhoBlank  = -0.20;
    const sigmaKF   = Math.sqrt(rejKF  * (1 - rejKF));
    const sigmaRSP  = Math.sqrt(rejRSP * (1 - rejRSP));
    const pRejectBoth = rejKF * rejRSP + rhoBlank * sigmaKF * sigmaRSP;
    riskScenarios.expected_blank_null = parseFloat((Math.max(0, pRejectBoth) * 0.75 * 100).toFixed(1));
    console.log(`   ✅ Escenarios R2: solo encuestas KF=${riskScenarios.polls_only_keiko_win}% / RSP=${riskScenarios.polls_only_sanchez_win}%, B/N modelo=${riskScenarios.expected_blank_null}%`);
  }

  const α = bayesian.polymarket_weight;

  // 6. Guardar en DB si se solicita
  if (saveToDB) {
    const runoffJson = JSON.stringify(runoffSummary);
    const riskJson = JSON.stringify(riskScenarios);
    for (const [candidate, data] of Object.entries(mcResults)) {
      const bc = bayesian.candidates[candidate];
      const isFinal = trigger === 'final_election_day';
      await db.query(`
        INSERT INTO model_predictions
          (generated_at_lima, electoral_phase, polymarket_weight, polls_weight,
           candidate, predicted_pct_mean, predicted_pct_p10, predicted_pct_p25,
           predicted_pct_p40, predicted_pct_p60, predicted_pct_p75, predicted_pct_p90,
           prob_first_round, prob_win_overall, model_version, trigger, runoff_json,
           polls_pct, polymarket_pct, posterior_pct, risk_json,
           is_final_snapshot, frozen_at, election_round)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24)
      `, [overrideTimestamp || now.toISO(), phase, α, 1 - α,
          candidate, data.mean, data.p10, data.p25 ?? null,
          data.p40 ?? null, data.p60 ?? null, data.p75 ?? null, data.p90,
          data.prob_runoff, data.prob_win, '2.0', trigger, runoffJson,
          bc?.polls_pct ?? null, bc?.polymarket_pct ?? null, bc?.posterior_pct ?? null, riskJson,
          isFinal, isFinal ? (overrideTimestamp || now.toISO()) : null,
          electionRound]);
    }
    console.log('   ✅ Guardado en DB (trigger: ' + trigger + ')');
  }

  // Construir respuesta
  const sorted = Object.entries(mcResults).sort((a, b) => b[1].mean - a[1].mean);

  // Log top 3
  const top3 = sorted.slice(0, 3);
  for (let i = 0; i < top3.length; i++) {
    const [name, d] = top3[i];
    console.log(`   ${i + 1}. ${name} ${d.mean.toFixed(1)}% | P(ganar) ${d.prob_win.toFixed(1)}%`);
  }

  return {
    generated_at_lima: now.toISO(),
    electoral_phase: phase,
    polymarket_weight: α,
    polls_weight: 1 - α,
    avg_undecided: avgUndecided,
    polymarket_candidates: Object.keys(polymarketData).length,
    candidates: sorted.map(([candidate, data]) => ({
      candidate,
      mean: data.mean,
      p10: data.p10,
      p25: data.p25 ?? null,
      p40: data.p40 ?? null,
      p60: data.p60 ?? null,
      p75: data.p75 ?? null,
      p90: data.p90,
      prob_runoff: data.prob_runoff,
      prob_win: data.prob_win,
      polls_pct: bayesian.candidates[candidate]?.polls_pct ?? null,
      polymarket_pct: bayesian.candidates[candidate]?.polymarket_pct ?? null,
      posterior_pct: bayesian.candidates[candidate]?.posterior_pct ?? null
    })),
    runoff_scenarios: runoffSummary,
    risk_scenarios: riskScenarios
  };
}

module.exports = { runFullPipeline };
