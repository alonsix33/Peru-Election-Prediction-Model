/**
 * verify_exterior_77paises.js
 *
 * Run this in DevTools Console on https://resultadoelectoral.onpe.gob.pe
 * to confirm all 77 country-level exterior API endpoints are reachable.
 *
 * Usage:
 *   1. Open https://resultadoelectoral.onpe.gob.pe in Chrome/Firefox
 *   2. Open DevTools → Console
 *   3. Paste this script and press Enter
 *
 * Confirms:
 *   - Which countries return vote data (keiko_votos + sanchez_votos > 0)
 *   - Which return zero (polls haven't started / very small communities)
 *   - Which fail (API error or HTML response)
 *   - Summary table by continent
 *
 * Expected for R1 (idEleccion=10): most countries have data
 * Expected for R2 (idEleccion=11): only available from 20:00 PET June 7
 */

(async function verifyExterior() {
  // ── CONFIG ────────────────────────────────────────────────────────────────
  const ID_ELECCION = 10;   // Change to 11 for R2 verification on election night
  const CONCURRENT  = 10;   // Max concurrent requests (ONPE rate limit)
  // ─────────────────────────────────────────────────────────────────────────

  const BASE       = '/presentacion-backend';
  const AMBITO_EXT = '2';

  // 77 countries: [contUbigeo, paisUbigeo]
  // Matches PAIS_CATALOG in onpe_bookmarklet.js
  const PAIS_CATALOG = [
    ['910000','910100'],['910000','910300'],['910000','910400'],['910000','910500'],
    ['910000','910600'],['910000','911200'],['920000','920100'],['920000','920200'],
    ['920000','920400'],['920000','920500'],['920000','920600'],['920000','920700'],
    ['920000','920800'],['920000','920900'],['920000','921000'],['920000','921100'],
    ['920000','921200'],['920000','921300'],['920000','921500'],['920000','921700'],
    ['920000','921900'],['920000','922000'],['920000','922100'],['920000','922200'],
    ['920000','922300'],['920000','922400'],['920000','922600'],['920000','922700'],
    ['920000','922800'],['920000','923000'],['930000','930100'],['930000','930200'],
    ['930000','930400'],['930000','930600'],['930000','930700'],['930000','930800'],
    ['930000','931000'],['930000','931100'],['930000','931300'],['930000','931500'],
    ['930000','931900'],['930000','932000'],['930000','932400'],['930000','932500'],
    ['930000','932800'],['930000','933000'],['930000','933200'],['930000','933700'],
    ['930000','933800'],['940000','940200'],['940000','940300'],['940000','940400'],
    ['940000','940600'],['940000','940800'],['940000','940900'],['940000','941000'],
    ['940000','941100'],['940000','941200'],['940000','941300'],['940000','941400'],
    ['940000','941500'],['940000','941700'],['940000','941800'],['940000','942000'],
    ['940000','942100'],['940000','942300'],['940000','942400'],['940000','942500'],
    ['940000','942600'],['940000','942700'],['940000','942800'],['940000','942900'],
    ['940000','943600'],['940000','943700'],['940000','944200'],['950000','950100'],
    ['950000','950200'],
  ];

  const CONT_NAMES = {
    '910000': 'ÁFRICA',
    '920000': 'AMÉRICA',
    '930000': 'EUROPA',
    '940000': 'ASIA/OCEANÍA',
    '950000': 'ANTÁRTICA',
  };

  async function fetchPais(contUbigeo, paisUbigeo) {
    const url = `${BASE}/resumen-general/participantes?idEleccion=${ID_ELECCION}` +
      `&idAmbitoGeografico=${AMBITO_EXT}&tipoFiltro=ubigeo_nivel_02` +
      `&idUbigeoDepartamento=${contUbigeo}&idUbigeoProvincia=${paisUbigeo}`;
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(12000) });
      if (r.status === 204 || r.status >= 400) return { status: `HTTP_${r.status}`, kf: 0, rsp: 0 };
      const text = await r.text();
      if (text.trimStart().startsWith('<')) return { status: 'HTML_RESPONSE', kf: 0, rsp: 0 };
      const json = JSON.parse(text);
      const data = json?.data ?? json;
      if (!Array.isArray(data) || data.length === 0) return { status: 'EMPTY', kf: 0, rsp: 0 };
      const kEntry = data.find(c => c.codigoAgrupacionPolitica === 8)
                  ?? data.find(c => (c.nombreCandidato || '').toUpperCase().includes('FUJIMORI'));
      const sEntry = data.find(c => c.codigoAgrupacionPolitica === 10)
                  ?? data.find(c => (c.nombreCandidato || '').toUpperCase().includes('SANCHEZ')
                                 && (c.nombreCandidato || '').toUpperCase().includes('ROBERTO'));
      const kf  = kEntry?.totalVotosValidos ?? 0;
      const rsp = sEntry?.totalVotosValidos ?? 0;
      return { status: 'OK', kf, rsp };
    } catch (err) {
      return { status: `ERROR: ${err.message.slice(0, 50)}`, kf: 0, rsp: 0 };
    }
  }

  // Throttled parallel execution
  async function pAll(items, fn, limit) {
    const results = new Array(items.length);
    let idx = 0;
    async function worker() {
      while (idx < items.length) {
        const i = idx++;
        results[i] = await fn(items[i], i);
      }
    }
    await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
    return results;
  }

  console.log(`🌍 Verificando ${PAIS_CATALOG.length} países exterior (idEleccion=${ID_ELECCION})...`);
  const t0 = Date.now();

  const results = await pAll(PAIS_CATALOG, async ([contUbigeo, paisUbigeo]) => {
    const r = await fetchPais(contUbigeo, paisUbigeo);
    return { contUbigeo, paisUbigeo, ...r };
  }, CONCURRENT);

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);

  // ── Summary ────────────────────────────────────────────────────────────────
  const ok       = results.filter(r => r.status === 'OK' && (r.kf + r.rsp) > 0);
  const empty    = results.filter(r => r.status === 'OK' && (r.kf + r.rsp) === 0);
  const errored  = results.filter(r => r.status !== 'OK');

  console.log(`\n✅ Con datos: ${ok.length}  |  ⬜ Sin datos (0 votos): ${empty.length}  |  ❌ Error: ${errored.length}`);
  console.log(`   Tiempo: ${elapsed}s\n`);

  // By continent
  const byCont = {};
  for (const r of results) {
    if (!byCont[r.contUbigeo]) byCont[r.contUbigeo] = { ok: 0, empty: 0, err: 0, kf: 0, rsp: 0 };
    const c = byCont[r.contUbigeo];
    if (r.status === 'OK') {
      if (r.kf + r.rsp > 0) { c.ok++; c.kf += r.kf; c.rsp += r.rsp; }
      else c.empty++;
    } else {
      c.err++;
    }
  }

  console.log('── Por continente ─────────────────────────────────────────');
  for (const [ubigeo, c] of Object.entries(byCont)) {
    const total = c.kf + c.rsp;
    const kfPct = total > 0 ? (c.kf / total * 100).toFixed(1) : 'N/A';
    const name  = CONT_NAMES[ubigeo] ?? ubigeo;
    console.log(`  ${name.padEnd(14)} | con datos: ${c.ok}  sin votos: ${c.empty}  errores: ${c.err}  | KF: ${c.kf.toLocaleString()} (${kfPct}%)`);
  }

  if (errored.length > 0) {
    console.log('\n── Endpoints con error ─────────────────────────────────────');
    for (const r of errored) {
      console.log(`  pais=${r.paisUbigeo} cont=${r.contUbigeo} → ${r.status}`);
    }
  }

  if (empty.length > 0) {
    console.log('\n── Países sin votos (0 kf + 0 rsp) ────────────────────────');
    for (const r of empty) {
      console.log(`  pais=${r.paisUbigeo} cont=${r.contUbigeo}`);
    }
  }

  console.log('\n── Total votos exterior ────────────────────────────────────');
  const totalKF  = ok.reduce((s, r) => s + r.kf,  0);
  const totalRSP = ok.reduce((s, r) => s + r.rsp, 0);
  const totalAll = totalKF + totalRSP;
  console.log(`  KF:  ${totalKF.toLocaleString()}  (${totalAll > 0 ? (totalKF/totalAll*100).toFixed(2) : 'N/A'}%)`);
  console.log(`  RSP: ${totalRSP.toLocaleString()}  (${totalAll > 0 ? (totalRSP/totalAll*100).toFixed(2) : 'N/A'}%)`);
  console.log(`  Total: ${totalAll.toLocaleString()}`);

  console.log('\n── Diagnosis ───────────────────────────────────────────────');
  if (errored.length === 0) {
    console.log('  ✅ Todos los 77 endpoints responden correctamente.');
  } else {
    console.log(`  ⚠️  ${errored.length} endpoints con error — revisar antes del 7J.`);
  }
  if (ok.length < 10 && ID_ELECCION === 11) {
    console.log('  ⚠️  Muy pocos países con datos — confirma que ya abrió el conteo R2 (después de 20:00 PET).');
  }

  console.log('\nDone. Devuelve el array completo:');
  return results;
})().then(r => { window._paisVerify = r; console.log('Accede a resultados con window._paisVerify'); });
