// ╔═══════════════════════════════════════════════════════════════════════╗
// ║  R1 2026 — Resultados del EXTERIOR por continente y país            ║
// ║  Correr desde: resultadoelectoral.onpe.gob.pe (consola del browser) ║
// ║  Output: r1_exterior.json                                           ║
// ╚═══════════════════════════════════════════════════════════════════════╝
//
// INSTRUCCIONES:
//   1. Ir a https://resultadoelectoral.onpe.gob.pe/main/resumen
//   2. DevTools → Console
//   3. Pegar este script completo y Enter
//   4. Espera ~30 segundos — descarga r1_exterior.json automáticamente
//
// Por qué necesitamos esto:
//   - Los votos del exterior YA ESTÁN incluidos en el total nacional de ONPE
//   - Pero pct_actas solo cuenta actas domésticas
//   - El exterior reporta ANTES (mesas cierran según huso horario)
//   - Si KF es fuerte en exterior, el kf_r2_share temprano está sesgado arriba
//   - Necesitamos el baseline R1 para cuantificar ese sesgo

(async () => {
const BASE = '/presentacion-backend';
const IE   = 10;   // R1 2026
const AMBITO_EXT = '2';

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function f(path) {
  try {
    const r = await fetch(`${BASE}/${path}`, {
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(15000),
    });
    if (r.status === 204 || r.status >= 400) return null;
    const text = await r.text();
    if (text.startsWith('<')) return null;
    return JSON.parse(text)?.data ?? JSON.parse(text);
  } catch(e) { return null; }
}

function pair(arr) {
  if (!Array.isArray(arr)) return null;
  // Try by party code first (more reliable)
  let kf  = arr.find(c => c.codigoAgrupacionPolitica === 8);
  let rsp = arr.find(c => c.codigoAgrupacionPolitica === 10);
  // Fallback: by name
  if (!kf)  kf  = arr.find(c => ((c.nombreCandidato||'')+(c.nombreAgrupacionPolitica||'')).toUpperCase().includes('KEIKO'));
  if (!rsp) rsp = arr.find(c => ((c.nombreCandidato||'')+(c.nombreAgrupacionPolitica||'')).toUpperCase().includes('SÁNCHEZ'));
  if (!kf && !rsp) return null;
  const kfV  = kf?.totalVotosValidos  ?? 0;
  const rspV = rsp?.totalVotosValidos ?? 0;
  return {
    kfPct:       +(kf?.porcentajeVotosValidos  ?? 0).toFixed(3),
    rspPct:      +(rsp?.porcentajeVotosValidos ?? 0).toFixed(3),
    kfV, rspV,
    kf_r2_share: kfV + rspV > 0 ? +(kfV / (kfV + rspV) * 100).toFixed(2) : null,
  };
}

console.log('🌍 Fetching R1 exterior results...\n');
const result = { meta: { idEleccion: IE, generado: new Date().toISOString() }, continentes: {}, paises: {} };

// 1. Fetch continents
const contsRes = await f(`ubigeos/departamentos?idEleccion=${IE}&idAmbitoGeografico=${AMBITO_EXT}`);
if (!contsRes?.length) { console.error('❌ No continentes devueltos'); return; }

console.log(`Continentes: ${contsRes.length}`);

// 2. Per-continent aggregate
for (const cont of contsRes) {
  await sleep(500);
  const cands = await f(
    `resumen-general/participantes?idEleccion=${IE}&idAmbitoGeografico=${AMBITO_EXT}` +
    `&tipoFiltro=ubigeo_nivel_01&idUbigeoDepartamento=${cont.ubigeo}`
  );
  const tots = await f(
    `resumen-general/totales?idEleccion=${IE}&idAmbitoGeografico=${AMBITO_EXT}` +
    `&tipoFiltro=ubigeo_nivel_01&idUbigeoDepartamento=${cont.ubigeo}`
  );
  const p = pair(cands);
  result.continentes[cont.ubigeo] = {
    ubigeo:      cont.ubigeo,
    nombre:      cont.nombre,
    kfV:         p?.kfV    ?? null,
    rspV:        p?.rspV   ?? null,
    kfPct:       p?.kfPct  ?? null,
    rspPct:      p?.rspPct ?? null,
    kf_r2_share: p?.kf_r2_share ?? null,
    totalActas:  tots?.totalActas ?? null,
    actasContabilizadas: tots?.actasContabilizadas ?? null,
  };
  console.log(`  ${cont.nombre}: KF=${p?.kf_r2_share ?? 'N/A'}%`);

  // 3. Countries within continent
  await sleep(300);
  const paisesRes = await f(
    `ubigeos/provincias?idEleccion=${IE}&idAmbitoGeografico=${AMBITO_EXT}` +
    `&idUbigeoDepartamento=${cont.ubigeo}`
  );
  if (!paisesRes?.length) continue;

  for (const pais of paisesRes) {
    await sleep(400);
    const pc = await f(
      `resumen-general/participantes?idEleccion=${IE}&idAmbitoGeografico=${AMBITO_EXT}` +
      `&tipoFiltro=ubigeo_nivel_02&idUbigeoDepartamento=${cont.ubigeo}` +
      `&idUbigeoProvincia=${pais.ubigeo}`
    );
    const pt = await f(
      `resumen-general/totales?idEleccion=${IE}&idAmbitoGeografico=${AMBITO_EXT}` +
      `&tipoFiltro=ubigeo_nivel_02&idUbigeoDepartamento=${cont.ubigeo}` +
      `&idUbigeoProvincia=${pais.ubigeo}`
    );
    const pp = pair(pc);
    if (!pp) continue;
    result.paises[pais.ubigeo] = {
      ubigeo:      pais.ubigeo,
      nombre:      pais.nombre,
      continente:  cont.nombre,
      contUbigeo:  cont.ubigeo,
      kfV:         pp.kfV,
      rspV:        pp.rspV,
      kfPct:       pp.kfPct,
      rspPct:      pp.rspPct,
      kf_r2_share: pp.kf_r2_share,
      totalActas:  pt?.totalActas ?? null,
    };
  }
  console.log(`    ${Object.keys(result.paises).length} países acumulados`);
}

// 4. Totals
const totKf  = Object.values(result.continentes).reduce((s, c) => s + (c.kfV  || 0), 0);
const totRsp = Object.values(result.continentes).reduce((s, c) => s + (c.rspV || 0), 0);
result.meta.total_kfV         = totKf;
result.meta.total_rspV        = totRsp;
result.meta.total_kf_r2_share = totKf + totRsp > 0 ? +(totKf / (totKf + totRsp) * 100).toFixed(2) : null;
result.meta.continentes_count = Object.keys(result.continentes).length;
result.meta.paises_count      = Object.keys(result.paises).length;

console.log(`\n✅ EXTERIOR R1 TOTAL:`);
console.log(`   KF:  ${totKf.toLocaleString()} votos`);
console.log(`   RSP: ${totRsp.toLocaleString()} votos`);
console.log(`   kf_r2_share: ${result.meta.total_kf_r2_share}%`);
console.log(`   ${Object.keys(result.continentes).length} continentes, ${Object.keys(result.paises).length} países\n`);

// 5. Download
const blob = new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' });
const a = document.createElement('a');
a.href = URL.createObjectURL(blob);
a.download = 'r1_exterior.json';
document.body.appendChild(a); a.click(); document.body.removeChild(a);
console.log('📥 Descargado: r1_exterior.json');
console.log('   → Guardar en: backend/data/r1_exterior.json');
})();
