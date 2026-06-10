/**
 * test_projector_v2_backcast.js
 *
 * Backcast del projector híbrido sobre los 711 snapshots reales de la noche
 * electoral R2 2026 (7-10 jun). Valida que el híbrido (v1 estratificado hasta
 * 88% + cola JEE desde 92%) cumpla las métricas de aceptación medidas en sandbox.
 *
 * Correr: node scripts/test_projector_v2_backcast.js
 * Datos:  scripts/data/snapshots_export_r2_2026.json.gz
 *         (regenerable via GET /api/admin/snapshots/export)
 *
 * Métricas de aceptación (calibradas contra el contraste v1 vs v2 del 10-jun):
 *   1. Estabilidad plateau (50-80% actas): σ ≤ 0.12pp (v1 logró 0.071)
 *   2. Punto final (97.16%) en [50.05, 50.15] — banda verdad del modelo JEE
 *   3. Ningún snapshot con pct ≥ 30% proyecta RSP (proj < 50)
 *   4. Salto máximo entre snapshots consecutivos (Δpct < 1.5) ≤ 0.40pp
 *   5. % de snapshots ≥93% dentro de banda-verdad [50.01, 50.15] ≥ 55%
 *   6. CI95 final: ancho en [0.08, 0.40]pp (ni delirante ni roto)
 */
'use strict';

const fs   = require('fs');
const path = require('path');
const zlib = require('zlib');

const { project } = require(path.join(__dirname, '..', 'backend', 'model', 'electionNightProjector.js'));

const DATA = path.join(__dirname, 'data', 'snapshots_export_r2_2026.json.gz');
const raw  = JSON.parse(zlib.gunzipSync(fs.readFileSync(DATA)).toString('utf8'));
const rows = Array.isArray(raw) ? raw : (raw.snapshots || raw.rows);

const results = [];
for (const r of rows) {
  const pct = parseFloat(r.pct_actas);
  const kf  = parseInt(r.keiko_votos), rsp = parseInt(r.sanchez_votos);
  if (!pct || !kf) continue;
  const res = project({
    pct_actas:      pct,
    actas_total:    r.actas_total != null ? parseInt(r.actas_total) : null,
    keiko_votos:    kf,
    sanchez_votos:  rsp,
    dept_breakdown: r.dept_breakdown || [],
    ext_breakdown:  r.ext_breakdown  || [],
    pais_breakdown: r.pais_breakdown || [],
    captured_at:    r.captured_at,
  });
  if (res.status !== 'ok') continue;
  results.push({
    pct:   res.pct_actas,
    proj:  res.projected.kf_r2_share,
    ci_lo: res.projected.ci_95.lo,
    ci_hi: res.projected.ci_95.hi,
    prob:  res.projected.prob_kf_win,
    tail_w: res.debug.tail_w,
  });
}
results.sort((a, b) => a.pct - b.pct);
console.log(`Backcast: ${results.length} snapshots proyectados\n`);

// ── tabla de hitos ───────────────────────────────────────────────────────────
const MILES = [4.52, 10, 25, 50, 70, 80, 90, 92.13, 94, 96, 97.16];
console.log('  pct    proj    CI95           prob  tail_w');
for (const m of MILES) {
  let best = results[0];
  for (const r of results) if (Math.abs(r.pct - m) < Math.abs(best.pct - m)) best = r;
  if (Math.abs(best.pct - m) > 1.5) continue;
  console.log(`${best.pct.toFixed(2).padStart(6)}  ${best.proj.toFixed(2)}  [${best.ci_lo.toFixed(2)},${best.ci_hi.toFixed(2)}]  ${String(best.prob).padStart(3)}%  ${best.tail_w}`);
}

// ── métricas ─────────────────────────────────────────────────────────────────
const pstdev = a => {
  const m = a.reduce((s, x) => s + x, 0) / a.length;
  return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / a.length);
};
const plateau = results.filter(r => r.pct >= 50 && r.pct <= 80).map(r => r.proj);
const tail93  = results.filter(r => r.pct >= 93);
const inBand  = tail93.filter(r => r.proj >= 50.01 && r.proj <= 50.15);
const below50 = results.filter(r => r.pct >= 30 && r.proj < 50);
let maxJump = 0;
for (let i = 1; i < results.length; i++) {
  if (results[i].pct - results[i - 1].pct < 1.5 && results[i - 1].pct >= 30) {
    maxJump = Math.max(maxJump, Math.abs(results[i].proj - results[i - 1].proj));
  }
}
const last = results[results.length - 1];
const ciWidth = last.ci_hi - last.ci_lo;

const checks = [
  ['plateau σ ≤ 0.12pp',            pstdev(plateau) <= 0.12,            `σ=${pstdev(plateau).toFixed(3)}`],
  ['punto final ∈ [50.05, 50.15]',  last.proj >= 50.05 && last.proj <= 50.15, `proj=${last.proj}`],
  ['sin proj<50 (pct≥30%)',         below50.length === 0,               `count=${below50.length}`],
  ['salto máx ≤ 0.40pp',            maxJump <= 0.40,                    `max=${maxJump.toFixed(2)}`],
  ['banda-verdad ≥93%: ≥55%',       inBand.length / tail93.length >= 0.55, `${(100 * inBand.length / tail93.length).toFixed(0)}%`],
  ['CI95 final ancho ∈ [0.08,0.40]', ciWidth >= 0.08 && ciWidth <= 0.40, `ancho=${ciWidth.toFixed(3)}`],
];

console.log('\nMÉTRICAS DE ACEPTACIÓN');
let failed = 0;
for (const [name, ok, detail] of checks) {
  console.log(`  ${ok ? '✅' : '❌'} ${name}  (${detail})`);
  if (!ok) failed++;
}
console.log(`\nEstado final: ${last.proj}% CI[${last.ci_lo}, ${last.ci_hi}] prob=${last.prob}% @ ${last.pct}% actas`);

// ── Crossover v2 — checks de consistencia ────────────────────────────────────
const { computeCrossover } = require(path.join(__dirname, '..', 'backend', 'model', 'crossoverTracker.js'));

const valid = rows.filter(r => r.pct_actas && r.keiko_votos);
const lastSnap = valid[valid.length - 1];
const lastT = new Date(lastSnap.captured_at).getTime();
let prevSnap = null;
for (const r of valid) {
  if (lastT - new Date(r.captured_at).getTime() >= 3 * 3600 * 1000) prevSnap = r;
}
const extOf = s => ({
  kf:  (s.ext_breakdown || []).reduce((a, c) => a + (c.keiko_votos  || 0), 0),
  rsp: (s.ext_breakdown || []).reduce((a, c) => a + (c.sanchez_votos || 0), 0),
});
const e = extOf(lastSnap);
const cx = computeCrossover({
  pct_actas:   parseFloat(lastSnap.pct_actas),
  actas_total: lastSnap.actas_total != null ? parseInt(lastSnap.actas_total) : null,
  nacional:    { kf_votos: parseInt(lastSnap.keiko_votos), rsp_votos: parseInt(lastSnap.sanchez_votos) },
  extranjero:  { kf_votos: e.kf, rsp_votos: e.rsp },
  pais_breakdown:      lastSnap.pais_breakdown || [],
  prev_pais_breakdown: prevSnap?.pais_breakdown || [],
  dept_breakdown:      lastSnap.dept_breakdown || [],
});

console.log(`\nCrossover v2: status=${cx.status} pct=${cx.crossover_pct} CI[${cx.ci_lo},${cx.ci_hi}]`
  + ` conf=${cx.confidence}% preJEE=${cx.prob_pre_jee}% lead=${cx.proj_final_lead}`
  + ` activos=${cx.active_countries} congelados=${cx.frozen_countries}`);

// lead implícito del projector híbrido (share final → votos sobre universo estimado)
const projLeadKF = -cx.proj_final_lead; // positivo = KF
const cxChecks = [
  ['crossover status válido',          cx.status === 'projected' || cx.status === 'crossed', cx.status],
  ['crossover_pct ∈ [97.4, 99.8]',     cx.status !== 'projected' || (cx.crossover_pct >= 97.4 && cx.crossover_pct <= 99.8), `pct=${cx.crossover_pct}`],
  ['confidence ≥ 90%',                 cx.confidence >= 90,                       `conf=${cx.confidence}`],
  ['lead final KF ∈ [+10k, +70k]',     projLeadKF >= 10000 && projLeadKF <= 70000, `lead=${projLeadKF}`],
  ['prob_pre_jee ∈ [30, 100]',         cx.prob_pre_jee >= 30 && cx.prob_pre_jee <= 100, `p=${cx.prob_pre_jee}`],
];
console.log('\nCHECKS CROSSOVER');
for (const [name, ok, detail] of cxChecks) {
  console.log(`  ${ok ? '✅' : '❌'} ${name}  (${detail})`);
  if (!ok) failed++;
}

process.exit(failed ? 1 : 0);
