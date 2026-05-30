// ╔════════════════════════════════════════════════════════════════════════╗
// ║  R1 2026 — Mesas Zonas de Difícil Acceso (ZDA), códigos 900001–904703 ║
// ║  Fuente ONPE oficial: 4,703 mesas, 1,109,876 electores hábiles        ║
// ║  Correr desde: resultadoelectoral.onpe.gob.pe (consola del browser)   ║
// ║  Output: r1_zda_mesas.json                                            ║
// ╚════════════════════════════════════════════════════════════════════════╝
(async () => {
const BASE = '/presentacion-backend';
const FIRST = 900001, LAST = 904703;
const TOTAL = LAST - FIRST + 1; // 4703

// Pool de concurrencia — conservador para no quemar el rate limit
function makePool(n) {
  let active = 0;
  const queue = [];
  return fn => new Promise((res, rej) => {
    const run = () => {
      active++;
      fn().then(v => { active--; res(v); drain(); })
          .catch(e => { active--; rej(e); drain(); });
    };
    const drain = () => { if (queue.length && active < n) queue.shift()(); };
    if (active < n) run(); else queue.push(run);
  });
}
const T = makePool(6);
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function fetchMesa(code) {
  return T(async () => {
    try {
      const r = await fetch(`${BASE}/actas/buscar/mesa?codigoMesa=${code}`,
        { signal: AbortSignal.timeout(20000) });
      if (r.status === 204 || r.status >= 400) return null;
      const text = await r.text();
      if (!text || text.startsWith('<')) return null;
      const j = JSON.parse(text);
      const arr = j?.data ?? j;
      return Array.isArray(arr) && arr.length > 0 ? arr[0] : null;
    } catch(e) { return null; }
  });
}

function extractVotes(mesa) {
  if (!mesa?.detalle) return { kfV: 0, rspV: 0 };
  const kf  = mesa.detalle.find(d => d.adAgrupacionPolitica === 8);
  const rsp = mesa.detalle.find(d => d.adAgrupacionPolitica === 10);
  return {
    kfV:  kf?.adVotos  ?? 0,
    rspV: rsp?.adVotos ?? 0,
  };
}

// Resultado: keyed por codigoMesa
const mesas = {};
let done = 0, errors = 0, empty = 0;

// Procesar en chunks de 500 con pausa entre chunks
const CHUNK = 500;
for (let start = FIRST; start <= LAST; start += CHUNK) {
  const end = Math.min(start + CHUNK - 1, LAST);
  const codes = [];
  for (let c = start; c <= end; c++) codes.push(c);

  await Promise.all(codes.map(async code => {
    const m = await fetchMesa(code);
    if (!m) {
      empty++;
    } else {
      const { kfV, rspV } = extractVotes(m);
      const tot2 = kfV + rspV;
      // idUbigeo viene como número (ej: 10201) → convertir a string 6-digit
      const ubigeo = m.idUbigeo ? String(m.idUbigeo).padStart(6, '0') : null;
      mesas[code] = {
        codigoMesa:              code,
        idUbigeo:                ubigeo,
        centroPoblado:           m.centroPoblado,
        nombreLocalVotacion:     m.nombreLocalVotacion,
        totalElectoresHabiles:   m.totalElectoresHabiles,
        totalVotosEmitidos:      m.totalVotosEmitidos,
        totalVotosValidos:       m.totalVotosValidos,
        kfV,
        rspV,
        kf_r2_share: tot2 > 0 ? +(kfV / tot2 * 100).toFixed(2) : null,
        estadoActa:  m.codigoEstadoActa,
      };
    }
    done++;
  }));

  errors = done - empty - Object.keys(mesas).length;
  console.log(`✓ ${start}–${end} | total: ${Object.keys(mesas).length} mesas / ${done} procesadas / ${empty} vacías`);

  // Pausa de 1.5s entre chunks
  if (end < LAST) await sleep(1500);
}

console.log(`\n✅ MESAS ZDA: ${Object.keys(mesas).length} / ${TOTAL}`);

// Resumen por ubigeo-departamento
const byDept = {};
for (const m of Object.values(mesas)) {
  if (!m.idUbigeo) continue;
  const dept = m.idUbigeo.substring(0, 2) + '0000';
  if (!byDept[dept]) byDept[dept] = { mesas: 0, electores: 0, kfV: 0, rspV: 0 };
  byDept[dept].mesas++;
  byDept[dept].electores += m.totalElectoresHabiles ?? 0;
  byDept[dept].kfV  += m.kfV;
  byDept[dept].rspV += m.rspV;
}
for (const [dept, d] of Object.entries(byDept).sort(([a],[b]) => a.localeCompare(b))) {
  const tot2 = d.kfV + d.rspV;
  const kf_r2 = tot2 > 0 ? (d.kfV / tot2 * 100).toFixed(1) : 'N/A';
  console.log(`  ${dept}: ${d.mesas} mesas, ${d.electores} electores, kf_r2_share=${kf_r2}%`);
}

// Descarga
const blob = new Blob([JSON.stringify(mesas, null, 2)], { type: 'application/json' });
const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
a.download = 'r1_zda_mesas.json'; a.click();
})();
