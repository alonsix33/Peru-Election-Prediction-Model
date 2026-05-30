// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  R1 2026 — Mesas ZDA por lotes (rate-limit: ~500 req/sesión)            ║
// ║  Correr desde: resultadoelectoral.onpe.gob.pe (consola del browser)     ║
// ║  ▶ CAMBIAR BATCH_START Y BATCH_END antes de correr                      ║
// ║                                                                          ║
// ║  Lotes sugeridos (abrir pestaña nueva para cada uno):                   ║
// ║    Lote 1:  900001 – 900500  ✅ HECHO                                   ║
// ║    Lote 2:  900501 – 901000                                             ║
// ║    Lote 3:  901001 – 901500                                             ║
// ║    Lote 4:  901501 – 902000                                             ║
// ║    Lote 5:  902001 – 902500                                             ║
// ║    Lote 6:  902501 – 903000                                             ║
// ║    Lote 7:  903001 – 903500                                             ║
// ║    Lote 8:  903501 – 904000                                             ║
// ║    Lote 9:  904001 – 904500                                             ║
// ║    Lote 10: 904501 – 904703                                             ║
// ╚══════════════════════════════════════════════════════════════════════════╝
(async () => {
const BATCH_START = 900501;  // ← CAMBIAR PARA CADA LOTE
const BATCH_END   = 901000;  // ← CAMBIAR PARA CADA LOTE
const BASE = '/presentacion-backend';

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

async function fetchMesa(code) {
  return T(async () => {
    try {
      const r = await fetch(`${BASE}/actas/buscar/mesa?codigoMesa=${code}`,
        { signal: AbortSignal.timeout(20000) });
      if (r.status === 204 || r.status >= 400) return null;
      const text = await r.text();
      if (!text || text.startsWith('<')) return null;
      const arr = JSON.parse(text)?.data;
      return Array.isArray(arr) && arr.length ? arr[0] : null;
    } catch(e) { return null; }
  });
}

const result = {};
const codes = [];
for (let c = BATCH_START; c <= BATCH_END; c++) codes.push(c);

let done = 0;
await Promise.all(codes.map(async code => {
  const m = await fetchMesa(code);
  if (m) {
    const kf  = m.detalle?.find(d => d.adAgrupacionPolitica === 8);
    const rsp = m.detalle?.find(d => d.adAgrupacionPolitica === 10);
    const kfV = kf?.adVotos ?? 0;
    const rspV = rsp?.adVotos ?? 0;
    const tot2 = kfV + rspV;
    result[code] = {
      codigoMesa: code,
      idUbigeo: m.idUbigeo ? String(m.idUbigeo).padStart(6,'0') : null,
      centroPoblado: m.centroPoblado,
      nombreLocalVotacion: m.nombreLocalVotacion,
      totalElectoresHabiles: m.totalElectoresHabiles,
      totalVotosEmitidos: m.totalVotosEmitidos,
      totalVotosValidos: m.totalVotosValidos,
      kfV, rspV,
      kf_r2_share: tot2 > 0 ? +(kfV/tot2*100).toFixed(2) : null,
      estadoActa: m.codigoEstadoActa,
    };
  }
  done++;
  if (done % 100 === 0) console.log(`${done}/${codes.length} | con datos: ${Object.keys(result).length}`);
}));

console.log(`✅ Lote ${BATCH_START}–${BATCH_END}: ${Object.keys(result).length}/${codes.length} mesas`);

// Resumen rápido
const depts = {};
for (const m of Object.values(result)) {
  if (!m.idUbigeo) continue;
  const d = m.idUbigeo.substring(0,2)+'0000';
  depts[d] = (depts[d]||0)+1;
}
console.log('Por dept:', JSON.stringify(depts));

const blob = new Blob([JSON.stringify(result,null,2)],{type:'application/json'});
const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
a.download = `r1_zda_lote_${BATCH_START}-${BATCH_END}.json`; a.click();
})();
