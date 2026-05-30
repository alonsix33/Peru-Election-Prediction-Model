#!/usr/bin/env node
/**
 * verify_r2_onpe.js
 *
 * Pre-election-night verification script.
 * Run the night of June 7 BEFORE setting ONPE_POLLING_ENABLED=true to confirm:
 *   1. idEleccion for R2 (may differ from 11)
 *   2. Candidate names & codigoAgrupacionPolitica
 *   3. All API fields the projector and onpeLive.js depend on
 *   4. Exterior breakdown is reachable
 *   5. Department breakdown is reachable
 *
 * Usage:
 *   node scripts/verify_r2_onpe.js
 *
 * From Railway shell (one-off):
 *   node scripts/verify_r2_onpe.js
 *
 * Expected output when R2 not started yet:
 *   All endpoint checks will return 204 / null — that is CORRECT behavior.
 *   What matters is that the endpoints respond (not timeout) and that the
 *   proceso-activo endpoint confirms the idEleccion.
 */

'use strict';

const ONPE_BASE = 'https://resultadoelectoral.onpe.gob.pe/presentacion-backend';

// ── What we expect ────────────────────────────────────────────────────────────
const EXPECTED = {
  KF_CODIGO:  8,
  RSP_CODIGO: 10,
  KF_NOMBRE_FRAGMENT:  'FUJIMORI',
  RSP_NOMBRE_FRAGMENT: 'SANCHEZ',
  KF_PARTIDO:  'FUERZA POPULAR',
  RSP_PARTIDO: 'JUNTOS POR EL PERU',
  TOTAL_ACTAS_APROX: 97421,   // 92718 regular + 4703 ZDA
  MIN_DEPTS: 25,
  MIN_CONTINENTS: 5,
};

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (compatible; PeruElectionVerifier/1.0)',
  'Accept': 'application/json',
};

let passed = 0;
let failed = 0;
let warnings = 0;

function ok(label, detail = '') {
  passed++;
  console.log(`  ✅  ${label}${detail ? ' — ' + detail : ''}`);
}
function fail(label, detail = '') {
  failed++;
  console.log(`  ❌  ${label}${detail ? ' — ' + detail : ''}`);
}
function warn(label, detail = '') {
  warnings++;
  console.log(`  ⚠️   ${label}${detail ? ' — ' + detail : ''}`);
}
function info(label, detail = '') {
  console.log(`  ℹ️   ${label}${detail ? ': ' + detail : ''}`);
}
function section(title) {
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`  ${title}`);
  console.log('─'.repeat(60));
}

async function fetchJson(path) {
  try {
    const res = await fetch(`${ONPE_BASE}/${path}`, {
      headers: HEADERS,
      signal: AbortSignal.timeout(12_000),
    });
    if (res.status === 204) return { status: 204, data: null };
    if (!res.ok)           return { status: res.status, data: null };
    const text = await res.text();
    if (text.trimStart().startsWith('<')) return { status: 200, data: null, html: true };
    const json = JSON.parse(text);
    return { status: 200, data: json?.data ?? json };
  } catch (e) {
    return { status: 0, data: null, error: e.message };
  }
}

// ─────────────────────────────────────────────────────────────────────────────

async function checkProcesoActivo() {
  section('1. Proceso electoral activo → confirmar idEleccion');

  const r = await fetchJson('proceso/proceso-electoral-activo');

  if (r.status === 0) {
    fail('proceso-electoral-activo: no response', r.error);
    return null;
  }
  if (!r.data) {
    warn('proceso-electoral-activo: devolvió null/204 — ¿todavía R1?');
    return null;
  }

  const d = r.data;
  info('Proceso', d.nombre || d.acronimo || JSON.stringify(d).slice(0, 80));
  info('idEleccionPrincipal', d.idEleccionPrincipal);
  info('fechaProceso', d.fechaProceso ? new Date(d.fechaProceso).toISOString() : 'N/A');

  if (d.idEleccionPrincipal === 11) {
    ok('idEleccion=11 confirmado para R2');
  } else if (d.idEleccionPrincipal === 10) {
    warn('idEleccion=10 (R1 sigue como activo) — verificar después de las 20:00');
  } else {
    warn(`idEleccion=${d.idEleccionPrincipal} — DISTINTO a 11. Actualizar ONPE_ID_ELECCION en Railway`);
  }

  return d.idEleccionPrincipal;
}

async function checkNacional(IE) {
  section(`2. Nacional — candidatos R2 (idEleccion=${IE})`);

  // First try the nacional totales to get pct_actas
  const totR = await fetchJson(
    `resumen-general/totales?idEleccion=${IE}&idAmbitoGeografico=1&tipoFiltro=nacional`
  );
  if (totR.status === 204 || !totR.data) {
    warn('totales nacional: 204 — R2 no iniciado todavía (esperado antes de las 20:00)');
  } else {
    const t = totR.data;
    info('totales raw', JSON.stringify(t).slice(0, 200));

    // Check field names (different ONPE builds have used different names)
    const processed = t.actasProcesadas ?? t.actas_procesadas ?? t.actasContabilizadas;
    const total     = t.actasTotal      ?? t.actas_total      ?? t.totalActas;
    const pct       = t.porcentajeActas ?? t.pct_actas        ?? t.porcentaje;

    if (processed != null) ok('actasProcesadas present', processed);
    else                   fail('actasProcesadas missing — check field names in onpeLive.js');
    if (total != null)     ok('actasTotal present', total);
    else                   fail('actasTotal missing');
    if (pct != null)       ok('porcentajeActas present', pct + '%');
    else                   fail('porcentajeActas missing');

    const expectedTotal = EXPECTED.TOTAL_ACTAS_APROX;
    if (total && Math.abs(total - expectedTotal) > 5000) {
      warn(`totalActas=${total} difiere bastante de ${expectedTotal} — ¿cambió el padrón?`);
    } else if (total) {
      ok(`totalActas=${total} cerca de esperado ${expectedTotal}`);
    }
  }

  // Check candidates
  const candR = await fetchJson(
    `resumen-general/participantes?idEleccion=${IE}&idAmbitoGeografico=1&tipoFiltro=nacional`
  );
  if (candR.status === 204 || !candR.data) {
    warn('participantes nacional: 204 — R2 no iniciado todavía (esperado antes de las 20:00)');
    return false;
  }
  if (!Array.isArray(candR.data)) {
    fail('participantes nacional: respuesta no es array', JSON.stringify(candR.data).slice(0, 80));
    return false;
  }

  const cands = candR.data;
  info(`Candidatos recibidos: ${cands.length}`);

  if (cands.length === 0) {
    warn('Array de candidatos vacío — R2 sin datos aún');
    return false;
  }

  // Verify by partido code
  const kf  = cands.find(c => c.codigoAgrupacionPolitica === EXPECTED.KF_CODIGO);
  const rsp = cands.find(c => c.codigoAgrupacionPolitica === EXPECTED.RSP_CODIGO);

  if (kf) {
    ok(`KF encontrada por código ${EXPECTED.KF_CODIGO}`, kf.nombreCandidato);
    if (kf.nombreCandidato?.toUpperCase().includes(EXPECTED.KF_NOMBRE_FRAGMENT)) {
      ok('Nombre KF contiene FUJIMORI');
    } else {
      warn(`Nombre KF: "${kf.nombreCandidato}" — fragment FUJIMORI no encontrado`);
    }
  } else {
    fail(`KF NOT found by codigoAgrupacionPolitica=${EXPECTED.KF_CODIGO}`);
    // Try by name
    const kfByName = cands.find(c =>
      (c.nombreCandidato || '').toUpperCase().includes(EXPECTED.KF_NOMBRE_FRAGMENT)
    );
    if (kfByName) {
      warn(`KF encontrada por nombre: código=${kfByName.codigoAgrupacionPolitica} — actualizar EXPECTED.KF_CODIGO`);
    }
  }

  if (rsp) {
    ok(`RSP encontrado por código ${EXPECTED.RSP_CODIGO}`, rsp.nombreCandidato);
    if (rsp.nombreCandidato?.toUpperCase().includes(EXPECTED.RSP_NOMBRE_FRAGMENT)) {
      ok('Nombre RSP contiene SANCHEZ');
    } else {
      warn(`Nombre RSP: "${rsp.nombreCandidato}" — fragment SANCHEZ no encontrado`);
    }
  } else {
    fail(`RSP NOT found by codigoAgrupacionPolitica=${EXPECTED.RSP_CODIGO}`);
    const rspByName = cands.find(c =>
      (c.nombreCandidato || '').toUpperCase().includes(EXPECTED.RSP_NOMBRE_FRAGMENT)
    );
    if (rspByName) {
      warn(`RSP encontrado por nombre: código=${rspByName.codigoAgrupacionPolitica} — actualizar EXPECTED.RSP_CODIGO`);
    }
  }

  // Check vote fields
  if (kf || rsp) {
    const sample = kf || rsp;
    const fields = {
      totalVotosValidos:      sample.totalVotosValidos,
      porcentajeVotosValidos: sample.porcentajeVotosValidos,
      porcentajeVotosEmitidos: sample.porcentajeVotosEmitidos,
    };
    info('Campos de votos en candidato', JSON.stringify(fields));
    if (sample.totalVotosValidos != null) ok('totalVotosValidos presente');
    else fail('totalVotosValidos AUSENTE — onpeLive.js extractVotos fallará');
    if (sample.porcentajeVotosValidos != null) ok('porcentajeVotosValidos presente');
    else warn('porcentajeVotosValidos ausente — usará porcentajeVotosEmitidos');
  }

  // Report current totals
  if (kf && rsp) {
    const kfV  = kf.totalVotosValidos  ?? 0;
    const rspV = rsp.totalVotosValidos ?? 0;
    const kf_r2_share = kfV + rspV > 0 ? (kfV / (kfV + rspV) * 100).toFixed(2) : 'N/A';
    console.log('\n  📊 RESULTADO NACIONAL ACTUAL:');
    info(`KF  ${kf.porcentajeVotosValidos?.toFixed(2)}% (${kfV.toLocaleString()} votos)`);
    info(`RSP ${rsp.porcentajeVotosValidos?.toFixed(2)}% (${rspV.toLocaleString()} votos)`);
    info(`kf_r2_share: ${kf_r2_share}%  (> 50 = KF wins)`);
  }

  return true;
}

async function checkDepartamentos(IE) {
  section(`3. Departamentos — breakdown R2 (idEleccion=${IE})`);

  const ubR = await fetchJson(
    `ubigeos/departamentos?idEleccion=${IE}&idAmbitoGeografico=1`
  );
  if (ubR.status === 204 || !ubR.data) {
    warn('ubigeos/departamentos: 204 (esperado antes de resultados)');
    return;
  }
  const depts = Array.isArray(ubR.data) ? ubR.data : [];
  if (depts.length >= EXPECTED.MIN_DEPTS) {
    ok(`${depts.length} departamentos en catálogo`);
  } else {
    fail(`Solo ${depts.length} departamentos — esperados >= ${EXPECTED.MIN_DEPTS}`);
    return;
  }

  // Test one dept (Lima = 140000 in ONPE)
  const lima = depts.find(d => d.nombre === 'LIMA') || depts[0];
  if (!lima) { fail('No se encontró Lima en catálogo'); return; }
  info(`Probando resultados para ${lima.nombre} (ubigeo=${lima.ubigeo})`);

  const candR = await fetchJson(
    `resumen-general/participantes?idEleccion=${IE}&idAmbitoGeografico=1` +
    `&tipoFiltro=ubigeo_nivel_01&idUbigeoDepartamento=${lima.ubigeo}`
  );
  if (candR.status === 204 || !candR.data) {
    warn(`Resultados ${lima.nombre}: 204 (esperado antes de resultados)`);
  } else if (Array.isArray(candR.data)) {
    ok(`Resultados ${lima.nombre}: ${candR.data.length} candidatos`);
    const kf = candR.data.find(c => c.codigoAgrupacionPolitica === EXPECTED.KF_CODIGO);
    if (kf) {
      ok(`KF en ${lima.nombre}: ${kf.porcentajeVotosValidos?.toFixed(2)}%`);
    }
  } else {
    fail(`Resultados ${lima.nombre}: respuesta inesperada`);
  }

  // Report all depts for context
  console.log('\n  📋 Catálogo de departamentos (ubigeo ONPE):');
  for (const d of depts.slice(0, 10)) {
    info(`${d.ubigeo}  ${d.nombre}`);
  }
  if (depts.length > 10) info(`... y ${depts.length - 10} más`);
}

async function checkExterior(IE) {
  section(`4. Exterior — breakdown (idEleccion=${IE})`);

  const contR = await fetchJson(
    `ubigeos/departamentos?idEleccion=${IE}&idAmbitoGeografico=2`
  );
  if (contR.status === 204 || !contR.data) {
    warn('ubigeos/departamentos exterior: 204 (esperado antes de resultados)');
    return;
  }
  const conts = Array.isArray(contR.data) ? contR.data : [];
  if (conts.length >= EXPECTED.MIN_CONTINENTS) {
    ok(`${conts.length} continentes en catálogo exterior`);
    for (const c of conts) info(`  ${c.ubigeo}  ${c.nombre}`);
  } else {
    fail(`Solo ${conts.length} continentes — esperados >= ${EXPECTED.MIN_CONTINENTS}`);
  }

  // Test one continent result
  if (conts.length === 0) return;
  const america = conts.find(c => c.nombre === 'AMERICA' || c.nombre === 'AMÉRICA') || conts[0];
  info(`Probando resultados para ${america.nombre} (ubigeo=${america.ubigeo})`);

  const candR = await fetchJson(
    `resumen-general/participantes?idEleccion=${IE}&idAmbitoGeografico=2` +
    `&tipoFiltro=ubigeo_nivel_01&idUbigeoDepartamento=${america.ubigeo}`
  );
  if (candR.status === 204 || !candR.data) {
    warn(`Resultados ${america.nombre}: 204 — R2 exterior sin datos`);
  } else if (Array.isArray(candR.data)) {
    ok(`Resultados ${america.nombre}: ${candR.data.length} candidatos`);
    const kf  = candR.data.find(c => c.codigoAgrupacionPolitica === EXPECTED.KF_CODIGO);
    const rsp = candR.data.find(c => c.codigoAgrupacionPolitica === EXPECTED.RSP_CODIGO);
    if (kf || rsp) {
      const kfV  = kf?.totalVotosValidos  ?? 0;
      const rspV = rsp?.totalVotosValidos ?? 0;
      const share = kfV + rspV > 0 ? (kfV / (kfV + rspV) * 100).toFixed(2) + '%' : 'N/A';
      info(`KF ${kfV.toLocaleString()}  RSP ${rspV.toLocaleString()}  kf_r2_share=${share}`);
    }
  }
}

async function checkLiveSnapshot(IE) {
  section(`5. Snapshot completo — simular lo que haría onpeLive.js (idEleccion=${IE})`);

  // Replicate onpeLive.js fetchNacional + fetchTotales
  const [candR, totR] = await Promise.all([
    fetchJson(`resumen-general/participantes?idEleccion=${IE}&idAmbitoGeografico=1&tipoFiltro=nacional`),
    fetchJson(`resumen-general/totales?idEleccion=${IE}&idAmbitoGeografico=1&tipoFiltro=nacional`),
  ]);

  const hasCands = candR.status === 200 && Array.isArray(candR.data) && candR.data.length > 0;
  const hasTots  = totR.status  === 200 && totR.data;

  if (!hasCands && !hasTots) {
    warn('Sin datos nacionales — R2 no iniciado (correcto antes de las 20:00)');
    info('Esto es lo esperado si se corre el script antes de que cierren mesas');
  }

  // Simulate the full snapshot object
  const kf  = hasCands ? candR.data.find(c => c.codigoAgrupacionPolitica === EXPECTED.KF_CODIGO)  : null;
  const rsp = hasCands ? candR.data.find(c => c.codigoAgrupacionPolitica === EXPECTED.RSP_CODIGO) : null;
  const tot = hasTots  ? totR.data : null;

  const snapshot = {
    captured_at:      new Date().toISOString(),
    has_data:         hasCands && ((kf?.totalVotosValidos ?? 0) + (rsp?.totalVotosValidos ?? 0)) > 0,
    actas_total:      tot?.actasTotal ?? tot?.actas_total ?? tot?.totalActas ?? null,
    actas_processed:  tot?.actasProcesadas ?? tot?.actas_procesadas ?? tot?.actasContabilizadas ?? null,
    pct_actas:        tot?.porcentajeActas ?? tot?.pct_actas ?? tot?.porcentaje ?? null,
    keiko_votos:      kf?.totalVotosValidos  ?? null,
    keiko_pct:        kf?.porcentajeVotosValidos  ?? null,
    sanchez_votos:    rsp?.totalVotosValidos ?? null,
    sanchez_pct:      rsp?.porcentajeVotosValidos ?? null,
  };

  console.log('\n  📦 Snapshot que se guardaría en onpe_live_snapshots:');
  console.log(JSON.stringify(snapshot, null, 4).split('\n').map(l => '  ' + l).join('\n'));

  if (snapshot.has_data) {
    ok('has_data=true — el projector procesaría este snapshot');

    // Run through projector logic mentally
    const kfV  = snapshot.keiko_votos  ?? 0;
    const rspV = snapshot.sanchez_votos ?? 0;
    const kf_r2_share = kfV + rspV > 0 ? (kfV / (kfV + rspV) * 100).toFixed(2) : 'N/A';
    info(`kf_r2_share observado: ${kf_r2_share}%`);
    info(`Actas: ${snapshot.actas_processed}/${snapshot.actas_total} (${snapshot.pct_actas}%)`);
  } else {
    info('has_data=false — projector retornaría { status: "pre_election" }');
  }
}

async function checkProjectorData() {
  section('6. Datos del projector — verificar archivos baseline');

  const path = require('path');
  const fs   = require('fs');
  const DATA = path.join(__dirname, '..', 'backend', 'data');

  const files = [
    { name: 'r1_districts_flat.json',  required: true,  desc: 'baseline distrital R1' },
    { name: 'r1_province_baseline.json', required: true, desc: 'fallback provincial' },
    { name: 'r1_zda_dept_model.json',  required: true,  desc: 'modelo ZDA por dept' },
    { name: 'r1_exterior.json',        required: true,  desc: 'baseline exterior R1' },
    { name: 'r1_zda_mesas.json',       required: false, desc: 'mesas ZDA individuales' },
  ];

  for (const f of files) {
    const fp = path.join(DATA, f.name);
    if (fs.existsSync(fp)) {
      const stat = fs.statSync(fp);
      const kb = (stat.size / 1024).toFixed(1);
      ok(`${f.name} (${kb} KB) — ${f.desc}`);

      // Extra checks per file
      try {
        const json = JSON.parse(fs.readFileSync(fp, 'utf8'));
        if (f.name === 'r1_districts_flat.json') {
          const n = Object.keys(json).length;
          const withData = Object.values(json).filter(v => (v.kfV || 0) + (v.rspV || 0) > 0).length;
          info(`  ${n} distritos total, ${withData} con votos reales`);
        }
        if (f.name === 'r1_exterior.json') {
          info(`  kf_r2_share total: ${json.meta?.total_kf_r2_share}%`);
          info(`  kfV=${json.meta?.total_kfV?.toLocaleString()} rspV=${json.meta?.total_rspV?.toLocaleString()}`);
        }
        if (f.name === 'r1_zda_dept_model.json') {
          const n = Object.keys(json.byDept || {}).length;
          info(`  ${n} departamentos, nacional ZDA=${json.meta?.nacional_kf_r2_share_zda}%`);
        }
      } catch (e) {
        fail(`  Error leyendo ${f.name}: ${e.message}`);
      }
    } else if (f.required) {
      fail(`${f.name} FALTA — requerido`);
    } else {
      warn(`${f.name} no encontrado — opcional, no crítico`);
    }
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║  Verificación R2 — Segunda Vuelta 7 junio 2026              ║');
  console.log(`║  ${new Date().toISOString()}                       ║`);
  console.log('╚══════════════════════════════════════════════════════════════╝');

  // 1. Confirm idEleccion
  let detectedIE = await checkProcesoActivo();
  const IE = detectedIE ?? 11;  // fallback to 11 if not detected

  if (!detectedIE) {
    warn(`Usando idEleccion=${IE} como fallback — confirmar cuando ONPE publique R2`);
  }

  // 2-5. API checks
  await checkNacional(IE);
  await checkDepartamentos(IE);
  await checkExterior(IE);
  await checkLiveSnapshot(IE);

  // 6. Local files
  await checkProjectorData();

  // ── Summary ──────────────────────────────────────────────────────────────
  section('RESUMEN');
  console.log(`  Total checks: ${passed + failed + warnings}`);
  console.log(`  ✅ Pasaron: ${passed}`);
  if (warnings) console.log(`  ⚠️  Advertencias: ${warnings}`);
  if (failed)   console.log(`  ❌ Fallaron: ${failed}`);

  console.log('');
  if (failed === 0) {
    console.log('  🟢 SISTEMA LISTO para activar ONPE_POLLING_ENABLED=true');
  } else {
    console.log('  🔴 Hay errores que requieren atención antes de activar el polling');
  }

  console.log('');
  console.log('  Variables Railway a confirmar antes del 7J:');
  console.log(`    ONPE_ID_ELECCION=${IE}     ← ajustar si checkProcesoActivo devuelve otro valor`);
  console.log('    ONPE_POLLING_ENABLED=true  ← setear a las 20:00 PET');
  console.log('');
  console.log('  Endpoint a monitorear:');
  console.log('    GET /api/onpe/projection   ← retorna pre_election hasta los primeros datos');
  console.log('');
}

main().catch(e => {
  console.error('Error inesperado:', e);
  process.exit(1);
});
