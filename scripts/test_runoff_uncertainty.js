/**
 * Sensitivity test: runoffUncertainty parameter
 *
 * Tests how changing the hardcoded `runoffUncertainty = 11.0` in simulateRunoff()
 * affects P(win) per candidate and p_close_race (<5pp margin).
 *
 * Does NOT import from production code. Uses same math but allows overriding
 * the target parameter.
 *
 * Run: node scripts/test_runoff_uncertainty.js
 */

// ── Current posterior (approximate, based on model output T-2 days) ──────────
// These are the posterior_pct values going into simulateRunoff.
// Two scenarios:
//   A) Current model: Keiko leads ~3.68pp (published polls + PM blend)
//   B) Near-tie: Sánchez +0.6pp (leaked Ipsos simulacro scenario)
const SCENARIOS = [
  { label: 'Modelo actual (KF +3.68pp)',     keiko: 51.84, sanchez: 48.16 },
  { label: 'Empate técnico (RSP +0.6pp)',    keiko: 49.70, sanchez: 50.30 },
];

// ── Simulation parameters ────────────────────────────────────────────────────
const N_SIMS     = 200_000;
const DAYS_LEFT  = 2;        // T-2 days
const SIGMA_TEMPORAL = Math.sqrt(9.0 + (DAYS_LEFT * 0.30) ** 2);  // ≈3.06pp
const CLOSE_THRESHOLD = 5;   // pp — definition of "empate técnico"

// runoffUncertainty values to test: current + candidates
const UNCERTAINTY_VALUES = [11, 9, 6, 5, 3];

// ── Math helpers ─────────────────────────────────────────────────────────────
function randn() {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

function randt(df = 4) {
  const z = randn();
  let chi2 = 0;
  for (let i = 0; i < df; i++) { const n = randn(); chi2 += n * n; }
  return z / Math.sqrt(chi2 / df);
}

// Logistic compression — exact copy of simulateRunoff() step 4
function logisticCompress(rawKeiko, rawSanchez) {
  const totalValid = rawKeiko + rawSanchez;
  if (totalValid <= 0) return { keiko: rawKeiko, sanchez: rawSanchez };
  const rawPctA = rawKeiko / totalValid;
  const MAX_WIN = 0.62;
  const K = 2.5;
  const compressedA = 0.5 + (MAX_WIN - 0.5) * Math.tanh(K * (rawPctA - 0.5));
  return {
    keiko:   compressedA * totalValid,
    sanchez: (1 - compressedA) * totalValid,
  };
}

// ── Core test function ───────────────────────────────────────────────────────
function runTest(keikoBase, sanchezBase, runoffUncertainty) {
  let keikoWins    = 0;
  let sanchezWins  = 0;
  let closeCount   = 0;
  const margins    = [];

  for (let i = 0; i < N_SIMS; i++) {
    // 1. MC perturbation (t-Student, same as montecarlo.js)
    const noiseKeiko   = randt(4) * SIGMA_TEMPORAL;
    const noiseSanchez = randt(4) * SIGMA_TEMPORAL;
    let k = Math.max(0.1, keikoBase   + noiseKeiko);
    let s = Math.max(0.1, sanchezBase + noiseSanchez);

    // Normalize to 100
    const tot = k + s;
    k = (k / tot) * 100;
    s = (s / tot) * 100;

    // 2. Logistic compression
    const comp = logisticCompress(k, s);
    k = comp.keiko;
    s = comp.sanchez;

    // 3. runoffUncertainty shock (exact logic from simulateRunoff step 5)
    const shockA = randn() * runoffUncertainty;
    const shockB = -shockA * 0.7;
    k += shockA;
    s += shockB;

    // 4. Tally
    if (k >= s) keikoWins++; else sanchezWins++;
    const margin = Math.abs(k - s);
    if (margin < CLOSE_THRESHOLD) closeCount++;
    margins.push(k - s); // positive = Keiko leads
  }

  // Median absolute margin
  const absMargins = margins.map(Math.abs).sort((a, b) => a - b);
  const medianMargin = absMargins[Math.floor(N_SIMS / 2)];

  return {
    keikoPwin:    (keikoWins   / N_SIMS * 100).toFixed(1),
    sanchezPwin:  (sanchezWins / N_SIMS * 100).toFixed(1),
    pCloseRace:   (closeCount  / N_SIMS * 100).toFixed(1),
    medianMargin: medianMargin.toFixed(2),
  };
}

// ── Run ──────────────────────────────────────────────────────────────────────
console.log(`\n${'═'.repeat(90)}`);
console.log('  SENSITIVITY TEST: runoffUncertainty');
console.log(`  σ_MC(T-2) = ${SIGMA_TEMPORAL.toFixed(2)}pp  |  N = ${N_SIMS.toLocaleString()} sims  |  "empate técnico" = margen < ${CLOSE_THRESHOLD}pp`);
console.log(`${'═'.repeat(90)}\n`);

for (const scenario of SCENARIOS) {
  console.log(`─── Escenario: ${scenario.label} ───`);
  console.log(`    Posterior entrada: Keiko ${scenario.keiko}%  vs  Sánchez ${scenario.sanchez}%`);

  // Show post-compression values
  const comp0 = logisticCompress(scenario.keiko, scenario.sanchez);
  console.log(`    Post-compresión logística: Keiko ${comp0.keiko.toFixed(3)}%  vs  Sánchez ${comp0.sanchez.toFixed(3)}%`);
  console.log();
  console.log(`    ${'runoffUncert'.padEnd(14)} | ${'KF P(win)'.padStart(10)} | ${'RSP P(win)'.padStart(11)} | ${'p_close_race'.padStart(13)} | ${'mediana margen'.padStart(15)}`);
  console.log(`    ${'─'.repeat(75)}`);

  for (const u of UNCERTAINTY_VALUES) {
    const r = runTest(scenario.keiko, scenario.sanchez, u);
    const tag = u === 11 ? ' ← actual' : '';
    console.log(`    ${String(u).padEnd(14)} | ${(r.keikoPwin + '%').padStart(10)} | ${(r.sanchezPwin + '%').padStart(11)} | ${(r.pCloseRace + '%').padStart(13)} | ${(r.medianMargin + 'pp').padStart(15)}${tag}`);
  }
  console.log();
}

console.log('Nota: "mediana margen" = mediana del margen absoluto en las 200k sims.');
console.log('El modelo actual usa runoffUncertainty=11. La logística comprime el margen antes del shock.\n');
