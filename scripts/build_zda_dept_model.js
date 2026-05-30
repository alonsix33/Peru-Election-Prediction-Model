#!/usr/bin/env node
/**
 * build_zda_dept_model.js
 *
 * Construye r1_zda_dept_model.json: un modelo por departamento de mesas ZDA
 * usando datos verificables de múltiples fuentes.
 *
 * FUENTES (en orden de confianza):
 *   A) API ONPE via browser: kf_r2_share_zda real para Amazonas (239 mesas) y Áncash parcial (261/412)
 *   B) Prensa (RPP, ONPE statement): nro ZDAs por dept y % RSP/KF en ZDAs donde se publicó
 *   C) Nuestro baseline: reg_kf_r2_share por dept de r1_districts_flat.json
 *   D) Nacional: kf_r2_share_zda = 28.2% (99,088 KF / (99,088+252,290)) verificado RPP
 */

const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

// === FUENTE A: nuestra muestra de 490 mesas ===
const zdaSummary = JSON.parse(fs.readFileSync(path.join(ROOT, 'backend/data/r1_zda_summary.json')));
const zdaByDeptSample = {};
zdaSummary.forEach(d => {
  const dept = d.deptNombre;
  if (!zdaByDeptSample[dept]) zdaByDeptSample[dept] = { kfV: 0, rspV: 0, mesas: 0 };
  zdaByDeptSample[dept].kfV  += d.zdaKfV  || 0;
  zdaByDeptSample[dept].rspV += d.zdaRspV || 0;
  zdaByDeptSample[dept].mesas += d.zdaMesas || 0;
});

// === FUENTE B: prensa + ONPE ===
// zdaCount: ONPE statement via RPP (4,703 total; desglose donde publicado)
// rspPctZda: % RSP en ZDAs (de total valid votes, no pairwise) — solo donde prensa dio dato
// kfPctZda: % KF en ZDAs — solo donde prensa dio dato
// Nota: kf_r2_share = kfPct/(kfPct+rspPct)
const pressData = {
  // [dept ONPE nombre]: { zdaCount, rspPctZda?, kfPctZda?, source, confidence }
  'CAJAMARCA':    { zdaCount: 636, rspPctZda: 40,   kfPctZda: null, source: 'RPP: RSP>40%', confidence: 'media' },
  'ÁNCASH':       { zdaCount: 412, rspPctZda: null,  kfPctZda: null, source: 'RPP: solo count', confidence: 'alta-sample' },
  'PIURA':        { zdaCount: 371, rspPctZda: null,  kfPctZda: null, source: 'RPP: solo count', confidence: 'baja' },
  'PUNO':         { zdaCount: 289, rspPctZda: null,  kfPctZda: null, source: 'RPP: solo count', confidence: 'baja' },
  'HUANCAVELICA': { zdaCount: null, rspPctZda: 45.8, kfPctZda: null, source: 'RPP: RSP=45.8%', confidence: 'media' },
  'LAMBAYEQUE':   { zdaCount: null, rspPctZda: null,  kfPctZda: 23.3, source: 'RPP: KF=23.3%', confidence: 'media' },
  'TUMBES':       { zdaCount: 6,   rspPctZda: null,  kfPctZda: 33.8, source: 'RPP: KF=33.8%', confidence: 'alta-pocos' },
  'LIMA':         { zdaCount: null, rspPctZda: null,  kfPctZda: 19.0, source: 'RPP: KF=19.0%', confidence: 'media' },
  // Depts donde RSP>40% pero sin número exacto (RPP menciona: Apurímac, Ayacucho, Huánuco, Amazonas)
  'APURÍMAC':     { zdaCount: null, rspPctZda: 40,   kfPctZda: null, source: 'RPP: RSP>40%', confidence: 'media' },
  'AYACUCHO':     { zdaCount: null, rspPctZda: 40,   kfPctZda: null, source: 'RPP: RSP>40%', confidence: 'media' },
  'HUÁNUCO':      { zdaCount: null, rspPctZda: 40,   kfPctZda: null, source: 'RPP: RSP>40%', confidence: 'media' },
  'AMAZONAS':     { zdaCount: 239, rspPctZda: null,  kfPctZda: null, source: 'API 239 mesas', confidence: 'alta-muestra' },
};

// Nacional ZDAs (verificado):
// KF: 99,088 votos = 11.84%   RSP: 252,290 votos = 30.15%
// kf_r2_share_zda_nacional = 99088/(99088+252290) = 28.22%
const NACIONAL_KF_ZDA = 99088;
const NACIONAL_RSP_ZDA = 252290;
const NACIONAL_KF_R2_SHARE_ZDA = NACIONAL_KF_ZDA / (NACIONAL_KF_ZDA + NACIONAL_RSP_ZDA) * 100; // 28.22%

// Total mesas por tipo (fuentes: ONPE mesa/totales, RPP ONPE statement)
const TOTAL_ZDA_MESAS = 4703;
const TOTAL_MESAS_NACIONAL = 92718; // mesa/totales endpoint (incluye ZDAs)
const TOTAL_REGULAR_MESAS = TOTAL_MESAS_NACIONAL - TOTAL_ZDA_MESAS; // ~88,015

// Distribucion ZDAs conocida: Cajamarca(636)+Áncash(412)+Piura(371)+Puno(289)+Tumbes(6) = 1714
// Amazonas tenemos muestra = 239
// Subtotal conocido: 1714 + 239 = 1953
// Restante: 4703 - 1953 = 2750 en depts sin dato de count
const zdaCountKnown = 636 + 412 + 371 + 289 + 6 + 239;
const zdaCountUnknown = TOTAL_ZDA_MESAS - zdaCountKnown; // 2750

// === FUENTE C: reg_kf_r2_share por dept de nuestro baseline ===
const flat = JSON.parse(fs.readFileSync(path.join(ROOT, 'backend/data/r1_districts_flat.json')));
const regByDept = {};
for (const d of Object.values(flat)) {
  const k = d.deptNombre;
  if (!regByDept[k]) regByDept[k] = { kfV: 0, rspV: 0, totalActas: 0 };
  regByDept[k].kfV  += d.kfV  || 0;
  regByDept[k].rspV += d.rspV || 0;
  regByDept[k].totalActas += d.totalActas || 0;
}

// === MODELO UNIFICADO ===
// Para cada dept, estima kf_r2_share_zda con nivel de confianza declarado

function estimateZdaKfR2Share(deptName) {
  // Prioridad 1: muestra directa de API
  const sample = zdaByDeptSample[deptName];
  if (sample && sample.mesas >= 50) { // muestra significativa
    const share = sample.kfV / (sample.kfV + sample.rspV) * 100;
    return { value: parseFloat(share.toFixed(1)), confidence: 'A-API', n: sample.mesas };
  }

  // Prioridad 2: datos de prensa con % específico
  const press = pressData[deptName];
  if (press) {
    if (press.kfPctZda !== null && press.rspPctZda !== null) {
      // Tenemos ambos → pairwise directo
      const v = press.kfPctZda / (press.kfPctZda + press.rspPctZda) * 100;
      return { value: parseFloat(v.toFixed(1)), confidence: 'B-prensa-exacto', n: null };
    }
    if (press.kfPctZda !== null) {
      // Solo KF%. Estimamos RSP usando la razón KF/RSP nacional en ZDAs: 99088/252290 = 0.393
      const rspEst = press.kfPctZda / 0.393;
      const v = press.kfPctZda / (press.kfPctZda + rspEst) * 100;
      return { value: parseFloat(v.toFixed(1)), confidence: 'B-prensa-KF', n: null };
    }
    if (press.rspPctZda !== null) {
      // Solo RSP mínimo (prensa dice ">40%"). Usamos rspPct como lower bound.
      // KF estimado = KF_nacional / RSP_nacional * RSP_dept
      const kfEst = (11.84 / 30.15) * press.rspPctZda;
      const v = kfEst / (kfEst + press.rspPctZda) * 100;
      return { value: parseFloat(v.toFixed(1)), confidence: 'B-prensa-RSP', n: null };
    }
    if (sample && sample.mesas > 0) {
      const share = sample.kfV / (sample.kfV + sample.rspV) * 100;
      return { value: parseFloat(share.toFixed(1)), confidence: 'A-API-parcial', n: sample.mesas };
    }
  }

  // Prioridad 3: ajuste por reg_kf_r2_share del dept vs promedio nacional
  // Hipótesis: la desviación en ZDAs sigue la desviación en regulares
  const reg = regByDept[deptName];
  if (reg && (reg.kfV + reg.rspV) > 0) {
    const regShare = reg.kfV / (reg.kfV + reg.rspV) * 100;
    const regNacional = 58.8; // KF 17.19% / (KF17.19+RSP12.04) nacional regular
    const zdaNacional = NACIONAL_KF_R2_SHARE_ZDA;
    // Ajuste lineal: si dept es X pp más KF que nacional en regulares, igual X en ZDAs
    const adj = regShare - regNacional;
    const v = Math.max(5, Math.min(90, zdaNacional + adj * 0.7)); // amortiguado 70%
    return { value: parseFloat(v.toFixed(1)), confidence: 'C-ajuste-reg', n: null };
  }

  // Prioridad 4: promedio nacional ZDA
  return { value: parseFloat(NACIONAL_KF_R2_SHARE_ZDA.toFixed(1)), confidence: 'D-nacional', n: null };
}

// Depts con ZDAs (RSP ganó en 21 de 24 → solo 3 sin ZDAs: Callao, Moquegua, Tacna implícitamente)
// Lista de todos los depts de nuestro flat
const allDepts = [...new Set(Object.values(flat).map(d => d.deptNombre))];

// Distribución de ZDAs desconocida para depts sin dato: se distribuye proporcional a votos rurales
// Usamos reg_kf_r2_share inverso como proxy de ruralidad (más RSP = más rural = más ZDAs)
const deptsWithUnknownZdaCount = allDepts.filter(d => {
  const p = pressData[d];
  return !p || p.zdaCount === null;
}).filter(d => !['CALLAO', 'MOQUEGUA', 'TACNA'].includes(d)); // depts probablemente sin ZDAs

const totalRegVotes = deptsWithUnknownZdaCount.reduce((s, d) => {
  const r = regByDept[d];
  return s + (r ? r.kfV + r.rspV : 0);
}, 0);

const model = {};
for (const deptName of allDepts) {
  const reg = regByDept[deptName];
  const sample = zdaByDeptSample[deptName];
  const press = pressData[deptName];

  // ZDA count
  let zdaCount = press?.zdaCount || null;
  let zdaCountSource = zdaCount ? 'B-prensa' : 'estimado';
  if (deptName === 'AMAZONAS') zdaCount = 239; // nuestra muestra = count real

  if (!zdaCount && totalRegVotes > 0 && reg && (reg.kfV + reg.rspV) > 0) {
    // Proporcional al peso electoral rural del dept
    const deptVotes = reg.kfV + reg.rspV;
    const proportion = deptVotes / totalRegVotes;
    zdaCount = Math.round(zdaCountUnknown * proportion);
    zdaCountSource = 'D-estimado-prop';
  }

  // Total actas (incluyendo ZDAs)
  const totalActasReg = reg?.totalActas || null;
  const totalActasEstimado = totalActasReg ? totalActasReg + (zdaCount || 0) : null;

  // % ZDAs del total dept
  const pctZda = totalActasEstimado ? parseFloat(((zdaCount||0) / totalActasEstimado * 100).toFixed(1)) : null;

  // kf_r2_share en ZDAs
  const zdaEstimate = estimateZdaKfR2Share(deptName);

  // kf_r2_share en regulares
  const regKfR2Share = reg && (reg.kfV + reg.rspV) > 0
    ? parseFloat((reg.kfV / (reg.kfV + reg.rspV) * 100).toFixed(1)) : null;

  // "ZDA bias": cuánto difiere ZDAs de regulares (negativo = ZDAs más RSP-friendly)
  const zdaBias = (zdaEstimate.value !== null && regKfR2Share !== null)
    ? parseFloat((zdaEstimate.value - regKfR2Share).toFixed(1)) : null;

  model[deptName] = {
    ubigeo: reg ? Object.values(flat).find(d=>d.deptNombre===deptName)?.deptUbigeo : null,
    zdaCount,
    zdaCountSource,
    zdaCountKnown: press?.zdaCount || (deptName==='AMAZONAS' ? 239 : null),
    totalActasReg: reg?.totalActas || null,
    totalActasConZDA: totalActasEstimado,
    pctZda,
    regKfR2Share,
    zdaKfR2ShareEstimate: zdaEstimate.value,
    zdaKfR2ShareConfidence: zdaEstimate.confidence,
    zdaKfR2ShareN: zdaEstimate.n,
    zdaBias,
    // Impacto en resultado final del dept si ZDAs reportan todo al final:
    // finalSwing = pctZda% × zdaBias (en pp, aplicado al kf_r2_share running)
    expectedSwingPP: (pctZda !== null && zdaBias !== null)
      ? parseFloat((pctZda / 100 * zdaBias).toFixed(2)) : null,
  };
}

// Print summary
console.log('\n=== MODELO ZDA POR DEPARTAMENTO ===');
console.log('Dept           | ZDAs  | %ZDA | reg_kf | zda_kf | bias  | swing | conf');
console.log('----           | ----  | ---- | ------ | ------ | ----  | ----- | ----');
Object.entries(model)
  .filter(([,d]) => d.zdaCount > 0)
  .sort((a,b) => (b[1].zdaCount||0) - (a[1].zdaCount||0))
  .forEach(([name, d]) => {
    const cols = [
      name.padEnd(14),
      String(d.zdaCount||'?').padStart(5),
      (d.pctZda !== null ? d.pctZda+'%' : '??').padStart(5),
      (d.regKfR2Share !== null ? d.regKfR2Share+'%' : '??').padStart(7),
      (d.zdaKfR2ShareEstimate+'%').padStart(7),
      (d.zdaBias !== null ? d.zdaBias+'pp' : '??').padStart(6),
      (d.expectedSwingPP !== null ? d.expectedSwingPP+'pp' : '??').padStart(6),
      d.zdaKfR2ShareConfidence,
    ];
    console.log(cols.join(' | '));
  });

console.log(`\nNacional ZDA kf_r2_share: ${NACIONAL_KF_R2_SHARE_ZDA.toFixed(1)}% (verificado RPP)`);
console.log(`Total ZDAs: ${TOTAL_ZDA_MESAS} | Regular: ${TOTAL_REGULAR_MESAS}`);

// Save
const outPath = path.join(ROOT, 'backend/data/r1_zda_dept_model.json');
fs.writeFileSync(outPath, JSON.stringify({
  meta: {
    generated: new Date().toISOString(),
    nacional_kf_zda_votos: NACIONAL_KF_ZDA,
    nacional_rsp_zda_votos: NACIONAL_RSP_ZDA,
    nacional_kf_r2_share_zda: parseFloat(NACIONAL_KF_R2_SHARE_ZDA.toFixed(2)),
    total_zda_mesas: TOTAL_ZDA_MESAS,
    total_mesas_nacional: TOTAL_MESAS_NACIONAL,
    fuentes: [
      'A: API ONPE browser (490 mesas Amazonas+Áncash)',
      'B: RPP artículo mesas 900k + ONPE statement mayo 2026',
      'C: ajuste proporcional desde reg_kf_r2_share por dept',
      'D: promedio nacional ZDA (28.2%)',
    ],
  },
  byDept: model,
}, null, 2));
console.log(`\nGuardado: ${outPath}`);
