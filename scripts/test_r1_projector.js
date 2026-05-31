/**
 * Backttest: inject real R1 ONPE final results into electionNightProjector
 * and verify it reproduces the known values.
 *
 * Expected at 100% actas:
 *   observed.kf_r2_share  ≈ 58.81%  (national, includes exterior)
 *   dom_kf_r2_share        ≈ 58.46%  (domestic only, debug field)
 *   national_shift_pp      ≈ 0.00pp  (R2-vs-R1 shift using R1 data as "R2")
 *   projected.kf_r2_share ≈ 58.81%  (should equal observed at 100%)
 */

'use strict';

const path = require('path');
const BACKEND = path.join(__dirname, '..', 'backend');

const { project } = require(path.join(BACKEND, 'model/electionNightProjector'));
const provBaseline = require(path.join(BACKEND, 'data/r1_province_baseline.json'));
const r1Exterior   = require(path.join(BACKEND, 'data/r1_exterior.json'));

// ── R1 ONPE official final vote counts ──────────────────────────────────────
const KF_NATIONAL  = 2_877_678;  // from LiveResultsTab DEMO (ONPE R1 oficial)
const RSP_NATIONAL = 2_015_114;
const KF_EXT       = 52_454;     // from r1_exterior.json meta
const RSP_EXT      =  7_994;
const KF_DOM       = KF_NATIONAL - KF_EXT;   // 2,825,224
const RSP_DOM      = RSP_NATIONAL - RSP_EXT; // 2,007,120

// Build dept_breakdown from province_baseline (25 depts)
const dept_breakdown = Object.entries(provBaseline).map(([ubigeo, dept]) => {
  const provs = dept.provincias || [];
  const kfV  = provs.reduce((s, p) => s + (p.kfV  || 0), 0);
  const rspV = provs.reduce((s, p) => s + (p.rspV || 0), 0);
  return { ubigeo, nombre: dept.nombre, keiko_votos: kfV, sanchez_votos: rspV };
}).filter(d => d.keiko_votos + d.sanchez_votos > 0);

// Build ext_breakdown from r1_exterior.json continents
const ext_breakdown = Object.values(r1Exterior.continentes).map(c => ({
  ubigeo: c.ubigeo, nombre: c.nombre,
  keiko_votos: c.kfV, sanchez_votos: c.rspV,
}));

const snapshot = {
  pct_actas:     100,
  keiko_votos:   KF_NATIONAL,
  sanchez_votos: RSP_NATIONAL,
  dept_breakdown,
  ext_breakdown,
  captured_at:   '2026-04-13T01:00:00-05:00', // R1 final count ~midnight Lima
};

// ── Run projector ────────────────────────────────────────────────────────────
const result = project(snapshot);

// ── Expected values ──────────────────────────────────────────────────────────
const EXP_OBS_KF_R2_SHARE_NAT = 100 * KF_NATIONAL  / (KF_NATIONAL  + RSP_NATIONAL); // 58.81
const EXP_DOM_KF_R2_SHARE     = 100 * KF_DOM / (KF_DOM + RSP_DOM);                  // 58.46

// ── Print results ────────────────────────────────────────────────────────────
const pass = (label, got, exp, tol = 0.05) => {
  const ok = Math.abs(got - exp) <= tol;
  console.log(`${ok ? '✅' : '❌'} ${label}`);
  console.log(`     got: ${got.toFixed(4)}%   expected: ${exp.toFixed(4)}%   delta: ${(got - exp).toFixed(4)}pp`);
  return ok;
};

console.log('\n══ BACKTEST: R1 final data → electionNightProjector ══\n');
console.log(`Input: KF ${KF_NATIONAL.toLocaleString('es-PE')} votos · RSP ${RSP_NATIONAL.toLocaleString('es-PE')} votos · 100% actas`);
console.log(`       ${dept_breakdown.length} depts · ${ext_breakdown.length} continentes\n`);

if (result.status !== 'ok') {
  console.error('❌ Projector returned non-ok status:', result.status, result.message);
  process.exit(1);
}

let allPass = true;
allPass &= pass('observed.kf_r2_share (national)', result.observed.kf_r2_share, EXP_OBS_KF_R2_SHARE_NAT, 0.01);
allPass &= pass('dom_kf_r2_share (debug)',          result.debug.dom_kf_r2_share, EXP_DOM_KF_R2_SHARE,     0.05);
allPass &= pass('national_shift_pp ≈ 0',            result.national_shift_pp,     0,                       0.10);
allPass &= pass('projected.kf_r2_share ≈ national', result.projected.kf_r2_share, EXP_OBS_KF_R2_SHARE_NAT, 1.0);

console.log('\n── Other outputs ──────────────────────────────────────────────────');
console.log('phase:              ', result.phase, '—', result.phaseLabel);
console.log('projected.kf_r2:   ', result.projected.kf_r2_share, '%');
console.log('projected CI 95:   ', `[${result.projected.ci_95.lo}, ${result.projected.ci_95.hi}]`);
console.log('projected CI 80:   ', `[${result.projected.ci_80.lo}, ${result.projected.ci_80.hi}]`);
console.log('sigma_pp:          ', result.projected.sigma_pp, 'pp');
console.log('national_shift_pp: ', result.national_shift_pp, 'pp');
console.log('ZDA remaining:     ', result.zda.remaining_mesas, 'mesas');
console.log('ext remaining vv:  ', result.debug.ext_remaining_vv, '(R2 exterior est. − reported R1 bilateral)');
console.log('stratified shift:  ', result.debug.stratified_shift_used ? 'YES' : 'NO (fallback)');

console.log('\n── Top 5 dept shifts ─────────────────────────────────────────────');
result.dept_shifts.slice(0, 5).forEach(d =>
  console.log(`  ${d.nombre}: R1=${d.r1_kf_r2_share}% → R2=${d.current_kf_r2_share}% (${d.shift_pp >= 0 ? '+' : ''}${d.shift_pp}pp)`)
);

console.log('\n── Exterior ──────────────────────────────────────────────────────');
console.log('r1 kf_r2_share:   ', result.exterior.r1_kf_r2_share, '%');
console.log('observed:          ', result.exterior.obs_kf_votos, 'KF /', result.exterior.obs_rsp_votos, 'RSP →', result.exterior.obs_kf_r2_share, '%');
console.log('remaining est:    ', result.exterior.remaining_vv_est, 'vv');

console.log('\n──────────────────────────────────────────────────────────────────');
if (allPass) {
  console.log('✅ ALL CHECKS PASSED — projector reproduces R1 known results\n');
} else {
  console.log('❌ SOME CHECKS FAILED — review deltas above\n');
  process.exit(1);
}
