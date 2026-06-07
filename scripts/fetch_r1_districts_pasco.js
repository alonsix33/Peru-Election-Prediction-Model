/**
 * fetch_r1_districts_pasco.js
 *
 * Run in DevTools Console on https://resultadoelectoral.onpe.gob.pe
 * to fetch R1 2026 bilateral (KF vs RSP) district-level data for Pasco dept.
 *
 * R1 is already complete — idEleccion=10 returns finalized results.
 *
 * Output: JSON patch you can apply to r1_districts_flat.json (backend + frontend/public).
 *
 * Usage:
 *   1. Open https://resultadoelectoral.onpe.gob.pe in Chrome/Firefox
 *   2. Open DevTools → Console
 *   3. Paste this script and press Enter
 *   4. Copy the printed JSON patch from the console
 *   5. Share with Claude to update r1_districts_flat.json
 */

(async function fetchPascoR1Districts() {
  const ID_ELECCION   = 10;     // R1 2026 (finalized)
  const AMBITO_DOM    = '1';
  const BASE          = '/presentacion-backend';
  const CONCURRENT    = 10;

  // All 29 Pasco districts: [deptUbigeo, provUbigeo, distUbigeo]
  const PASCO_DISTRICTS = [
    // Province 180100 — PASCO
    ['180000','180100','180101'],  // CHAUPIMARCA
    ['180000','180100','180103'],  // HUACHÓN
    ['180000','180100','180104'],  // HUARIACA
    ['180000','180100','180105'],  // HUAYLLAY
    ['180000','180100','180106'],  // NINACACA
    ['180000','180100','180107'],  // PALLANCHACRA
    ['180000','180100','180108'],  // PAUCARTAMBO
    ['180000','180100','180109'],  // SAN FRANCISCO DE ASÍS DE YARUSYACÁN
    ['180000','180100','180110'],  // SIMÓN BOLÍVAR
    ['180000','180100','180111'],  // TICLACAYÁN
    ['180000','180100','180112'],  // TINYAHUARCO
    ['180000','180100','180113'],  // VICCO
    ['180000','180100','180114'],  // YANACANCHA
    // Province 180200 — DANIEL ALCIDES CARRIÓN
    ['180000','180200','180201'],  // YANAHUANCA
    ['180000','180200','180202'],  // CHACAYÁN
    ['180000','180200','180203'],  // GOYLLARISQUIZGA
    ['180000','180200','180204'],  // PAUCAR
    ['180000','180200','180205'],  // SAN PEDRO DE PILLAO
    ['180000','180200','180206'],  // SANTA ANA DE TUSI
    ['180000','180200','180207'],  // TAPUC
    ['180000','180200','180208'],  // VILCABAMBA
    // Province 180300 — OXAPAMPA
    ['180000','180300','180301'],  // OXAPAMPA
    ['180000','180300','180302'],  // CHONTABAMBA
    ['180000','180300','180303'],  // HUANCABAMBA
    ['180000','180300','180304'],  // PUERTO BERMÚDEZ
    ['180000','180300','180305'],  // VILLA RICA
    ['180000','180300','180306'],  // POZUZO
    ['180000','180300','180307'],  // PALCAZU
    ['180000','180300','180308'],  // CONSTITUCIÓN
  ];

  // Current proxy baselines (2021 R2) for comparison
  const PROXY_BASELINES = {
    '180101':25.81,'180103':49.77,'180104':24.74,'180105':22.58,
    '180106':20.67,'180107':20.12,'180108':22.75,'180109':18.59,
    '180110':19.65,'180111':22.38,'180112':24.37,'180113':37.04,
    '180114':23.73,'180201':14.16,'180202':12.94,'180203':14.02,
    '180204':16.69,'180205':11.68,'180206':11.91,'180207':15.81,
    '180208':22.63,'180301':66.12,'180302':64.19,'180303':72.84,
    '180304':55.65,'180305':57.45,'180306':69.58,'180307':55.31,
    '180308':29.69,
  };

  async function fetchDistrict([deptU, provU, distU]) {
    const url = `${BASE}/resumen-general/participantes?idEleccion=${ID_ELECCION}` +
      `&idAmbitoGeografico=${AMBITO_DOM}&tipoFiltro=ubigeo_nivel_03` +
      `&idUbigeoDepartamento=${deptU}&idUbigeoProvincia=${provU}&idUbigeoDistrito=${distU}`;
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(12000) });
      if (r.status === 204 || r.status >= 400) return { ubigeo: distU, status: `HTTP_${r.status}` };
      const text = await r.text();
      if (text.trimStart().startsWith('<')) return { ubigeo: distU, status: 'HTML' };
      const json = JSON.parse(text);
      const data = json?.data ?? json;
      if (!Array.isArray(data) || data.length === 0) return { ubigeo: distU, status: 'EMPTY' };

      // Find KF (codigoAgrupacionPolitica=8) and RSP (=10)
      const kfEntry = data.find(c => c.codigoAgrupacionPolitica === 8)
                   ?? data.find(c => (c.nombreCandidato||'').toUpperCase().includes('FUJIMORI'));
      const rspEntry = data.find(c => c.codigoAgrupacionPolitica === 10)
                    ?? data.find(c => (c.nombreCandidato||'').toUpperCase().includes('SANCHEZ')
                                   && (c.nombreCandidato||'').toUpperCase().includes('ROBERTO'));

      const kfV  = kfEntry?.totalVotosValidos  ?? 0;
      const rspV = rspEntry?.totalVotosValidos ?? 0;
      const total = kfV + rspV;
      const kf_r2_share = total > 0 ? parseFloat((kfV / total * 100).toFixed(3)) : null;

      // Also capture candidate names for verification
      const kfName  = kfEntry?.nombreCandidato  ?? 'NOT_FOUND';
      const rspName = rspEntry?.nombreCandidato ?? 'NOT_FOUND';

      return {
        ubigeo: distU, status: 'OK',
        kfV, rspV, total, kf_r2_share,
        kfName, rspName,
        kfPct:  parseFloat((kfEntry?.porcentajeVotosValidos  ?? 0).toFixed(3)),
        rspPct: parseFloat((rspEntry?.porcentajeVotosValidos ?? 0).toFixed(3)),
      };
    } catch (err) {
      return { ubigeo: distU, status: `ERROR: ${err.message.slice(0,60)}` };
    }
  }

  // Throttled execution
  async function pAll(items, fn, limit) {
    const results = new Array(items.length);
    let idx = 0;
    async function worker() {
      while (idx < items.length) { const i = idx++; results[i] = await fn(items[i], i); }
    }
    await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
    return results;
  }

  console.log(`🗳️  Fetching Pasco R1 2026 district data (idEleccion=${ID_ELECCION})...`);
  const t0 = Date.now();
  const results = await pAll(PASCO_DISTRICTS, fetchDistrict, CONCURRENT);
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);

  // ── Results table ────────────────────────────────────────────────────────
  const ok      = results.filter(r => r.status === 'OK');
  const errored = results.filter(r => r.status !== 'OK');

  console.log(`\n✅ OK: ${ok.length}  ❌ Error: ${errored.length}  (${elapsed}s)\n`);

  const provLabel = { '18': {'01':'PASCO prov', '02':'D.A. CARRIÓN', '03':'OXAPAMPA'} };
  console.log('── Per-district results ────────────────────────────────────────────────');
  console.log('  ubigeo   kf_r2_share  proxy_2021  gap     kfV    rspV   total');
  for (const r of results) {
    if (r.status !== 'OK') {
      console.log(`  ${r.ubigeo}  ❌ ${r.status}`);
      continue;
    }
    const proxy  = PROXY_BASELINES[r.ubigeo] ?? '?';
    const gap    = r.kf_r2_share != null ? (r.kf_r2_share - proxy).toFixed(2) : '?';
    const gapStr = parseFloat(gap) > 0 ? `+${gap}` : gap;
    console.log(
      `  ${r.ubigeo}  ${String(r.kf_r2_share ?? 'null').padStart(8)}%` +
      `  ${String(proxy).padStart(8)}%  ${gapStr.padStart(7)}pp` +
      `  ${String(r.kfV).padStart(6)} ${String(r.rspV).padStart(6)} ${String(r.total).padStart(7)}`
    );
  }

  // ── Province-level weighted averages ────────────────────────────────────
  console.log('\n── Province weighted averages ──────────────────────────────────────────');
  for (const [provU, label] of [['180100','PASCO'],['180200','D.A. CARRIÓN'],['180300','OXAPAMPA']]) {
    const dists = ok.filter(r => r.ubigeo.startsWith(provU.slice(0,4)));
    const totKF  = dists.reduce((s,r) => s + r.kfV,  0);
    const totRSP = dists.reduce((s,r) => s + r.rspV, 0);
    const avg    = totKF + totRSP > 0 ? (totKF/(totKF+totRSP)*100).toFixed(2) : 'N/A';
    console.log(`  ${label.padEnd(15)} R1-2026 bilateral avg: ${avg}%  (kfV=${totKF} rspV=${totRSP})`);
  }

  if (errored.length > 0) {
    console.log('\n── Errors ──────────────────────────────────────────────────────────────');
    errored.forEach(r => console.log(`  ${r.ubigeo} → ${r.status}`));
  }

  // ── JSON patch ───────────────────────────────────────────────────────────
  console.log('\n── JSON patch for r1_districts_flat.json ───────────────────────────────');
  const patch = {};
  for (const r of ok) {
    if (r.kf_r2_share == null) continue;
    patch[r.ubigeo] = {
      kf_r2_share: r.kf_r2_share,
      kfV:         r.kfV,
      rspV:        r.rspV,
      source:      'r1_2026',
    };
  }
  const patchJson = JSON.stringify(patch, null, 2);
  console.log(patchJson);
  console.log('\n📋 Copy the JSON above and share it with Claude to patch r1_districts_flat.json');

  window._pascoPatch = patch;
  console.log('Also stored at window._pascoPatch');
  return patch;
})();
