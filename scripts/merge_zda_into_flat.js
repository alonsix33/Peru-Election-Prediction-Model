#!/usr/bin/env node
/**
 * merge_zda_into_flat.js
 *
 * Input:  backend/data/r1_zda_mesas.json   (from browser scan — keyed by codigoMesa OR array)
 * Input:  backend/data/r1_districts_flat.json
 * Output: backend/data/r1_districts_flat.json  (adds zdaMesas, zdaKfV, zdaRspV, zdaKfR2Share)
 * Output: backend/data/r1_zda_summary.json     (aggregated by district)
 *
 * Usage:
 *   node scripts/merge_zda_into_flat.js [path/to/zda_completo.json]
 *
 * If a path argument is provided, that file is used as the source; otherwise
 * backend/data/r1_zda_mesas.json is used.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const flatPath = path.join(ROOT, 'backend/data/r1_districts_flat.json');
const zdaDefaultPath = path.join(ROOT, 'backend/data/r1_zda_mesas.json');
const zdaSummaryPath = path.join(ROOT, 'backend/data/r1_zda_summary.json');

const zdaInputPath = process.argv[2] || zdaDefaultPath;

console.log(`Loading ZDAs from: ${zdaInputPath}`);
const zdaRaw = JSON.parse(fs.readFileSync(zdaInputPath, 'utf8'));

// Normalize: accept keyed-by-codigoMesa object OR array
let mesas;
if (Array.isArray(zdaRaw)) {
  mesas = zdaRaw;
} else if (zdaRaw.mesas && Array.isArray(zdaRaw.mesas)) {
  mesas = zdaRaw.mesas;
} else {
  // keyed object
  mesas = Object.values(zdaRaw);
}

console.log(`Total ZDA mesas: ${mesas.length}`);

// Aggregate by district ubigeo (idUbigeo)
const byDist = {};
let totalKF = 0, totalRSP = 0, totalElectores = 0, totalEmitidos = 0;

for (const m of mesas) {
  const u = m.idUbigeo;
  if (!u) continue;
  if (!byDist[u]) {
    byDist[u] = { mesas: 0, kfV: 0, rspV: 0, electores: 0, emitidos: 0, validos: 0 };
  }
  const d = byDist[u];
  d.mesas++;
  d.kfV += (m.kfV || 0);
  d.rspV += (m.rspV || 0);
  d.electores += (m.totalElectoresHabiles || 0);
  d.emitidos += (m.totalVotosEmitidos || 0);
  d.validos += (m.totalVotosValidos || 0);

  totalKF += (m.kfV || 0);
  totalRSP += (m.rspV || 0);
  totalElectores += (m.totalElectoresHabiles || 0);
  totalEmitidos += (m.totalVotosEmitidos || 0);
}

const distCount = Object.keys(byDist).length;
console.log(`Districts with ZDAs: ${distCount}`);
console.log(`Global ZDA kf_r2_share: ${(totalKF / (totalKF + totalRSP) * 100).toFixed(2)}%`);
console.log(`  KF total: ${totalKF}  RSP total: ${totalRSP}`);
console.log(`  Electores: ${totalElectores}  Emitidos: ${totalEmitidos}`);

// Load flat districts
console.log('\nLoading r1_districts_flat.json...');
const flat = JSON.parse(fs.readFileSync(flatPath, 'utf8'));

let merged = 0, notFound = 0;

for (const [u, agg] of Object.entries(byDist)) {
  const kfR2 = (agg.kfV + agg.rspV) > 0
    ? parseFloat((agg.kfV / (agg.kfV + agg.rspV) * 100).toFixed(2))
    : null;

  const summaryEntry = {
    zdaMesas: agg.mesas,
    zdaElectores: agg.electores,
    zdaEmitidos: agg.emitidos,
    zdaValidos: agg.validos,
    zdaKfV: agg.kfV,
    zdaRspV: agg.rspV,
    zdaKfR2Share: kfR2,
  };

  if (flat[u]) {
    Object.assign(flat[u], summaryEntry);
    merged++;
  } else {
    console.warn(`  WARNING: ubigeo ${u} not found in flat districts`);
    notFound++;
  }
}

console.log(`\nMerged: ${merged} districts  |  Not found: ${notFound}`);

// Also mark districts with no ZDAs as zdaMesas=0 so we know they were checked
for (const dist of Object.values(flat)) {
  if (dist.zdaMesas === undefined) {
    dist.zdaMesas = 0;
    dist.zdaKfV = 0;
    dist.zdaRspV = 0;
    dist.zdaElectores = 0;
    dist.zdaEmitidos = 0;
    dist.zdaValidos = 0;
    dist.zdaKfR2Share = null;
  }
}

// Save updated flat
fs.writeFileSync(flatPath, JSON.stringify(flat, null, 2));
console.log(`\nSaved: ${flatPath}`);

// Save district-level summary for quick inspection
const summary = Object.entries(byDist).map(([u, agg]) => {
  const dist = flat[u] || {};
  return {
    ubigeo: u,
    nombre: dist.nombre || 'UNKNOWN',
    deptNombre: dist.deptNombre || '??',
    provNombre: dist.provNombre || '??',
    zdaMesas: agg.mesas,
    zdaKfV: agg.kfV,
    zdaRspV: agg.rspV,
    zdaValidos: agg.validos,
    zdaKfR2Share: (agg.kfV + agg.rspV) > 0
      ? parseFloat((agg.kfV / (agg.kfV + agg.rspV) * 100).toFixed(2))
      : null,
    regularKfR2Share: dist.kf_r2_share || null,
  };
}).sort((a, b) => a.ubigeo.localeCompare(b.ubigeo));

fs.writeFileSync(zdaSummaryPath, JSON.stringify(summary, null, 2));
console.log(`Saved: ${zdaSummaryPath}`);

// Print top/bottom districts by zdaKfR2Share
const withShare = summary.filter(d => d.zdaKfR2Share !== null);
withShare.sort((a, b) => a.zdaKfR2Share - b.zdaKfR2Share);
console.log('\n--- Bottom 10 ZDA districts (most RSP) ---');
withShare.slice(0, 10).forEach(d =>
  console.log(`  ${d.ubigeo} ${d.deptNombre}/${d.nombre}: ${d.zdaKfR2Share}% KF (${d.zdaMesas} mesas)`));
console.log('\n--- Top 10 ZDA districts (most KF) ---');
withShare.slice(-10).reverse().forEach(d =>
  console.log(`  ${d.ubigeo} ${d.deptNombre}/${d.nombre}: ${d.zdaKfR2Share}% KF (${d.zdaMesas} mesas)`));
