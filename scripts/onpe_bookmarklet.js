/**
 * ONPE Election Night Bookmarklet — R2 2026
 *
 * PURPOSE
 * -------
 * ONPE's /presentacion-backend/* API only works same-origin.
 * External servers (Railway) always receive the Angular SPA HTML.
 * This script runs INSIDE https://resultadoelectoral.onpe.gob.pe,
 * where relative-URL fetches reach the real API, then POSTs each
 * snapshot to the Railway admin endpoint.
 *
 * SETUP (do before June 7)
 * ─────────────────────────
 * 1. On Railway, set environment variable:
 *      ADMIN_SECRET=<random 32-char string>   (e.g. openssl rand -hex 16)
 *
 * 2. Edit the two constants below:
 *      RAILWAY_URL  — your Railway backend URL (no trailing slash)
 *      ADMIN_SECRET — same value as the Railway env var
 *
 * 3. On election night (20:00 PET June 7):
 *    a. Open https://resultadoelectoral.onpe.gob.pe in Chrome/Firefox
 *    b. Open DevTools → Console
 *    c. Paste this entire script and press Enter
 *    d. You should see: "🗳️ ONPE bookmarklet started. Polling every 2 min."
 *    e. Leave the tab open. It will auto-poll until you close it or call stopONPE()
 *
 * CONFIRM idEleccion ON ELECTION NIGHT
 * ──────────────────────────────────────
 * Before running this script, confirm R2's idEleccion by running in console:
 *   fetch('/presentacion-backend/proceso/proceso-electoral-activo')
 *     .then(r=>r.json()).then(j=>console.log(j.data.idEleccionPrincipal))
 * Expected: 11. If different, update ID_ELECCION below.
 *
 * BOOKMARKLET VERSION (minified, for bookmark bar)
 * ─────────────────────────────────────────────────
 * See the bottom of this file for a one-liner you can save as a bookmark.
 */

// ── CONFIG — edit these ──────────────────────────────────────────────
const RAILWAY_URL   = 'https://peru-election-prediction-model-production.up.railway.app';
const ADMIN_SECRET  = 'ccbae813cc173f66b00ae96e14ca191d';
const ID_ELECCION   = 11;          // R2 idEleccion — confirm on election night
const POLL_INTERVAL = 2 * 60 * 1000; // milliseconds between polls (2 min)
// ────────────────────────────────────────────────────────────────────

const BASE = '/presentacion-backend';
const AMBITO_NAC = '1';
const AMBITO_EXT = '2';

async function g(path) {
  try {
    const r = await fetch(`${BASE}/${path}`, { signal: AbortSignal.timeout(15000) });
    if (r.status === 204 || r.status >= 400) return null;
    const text = await r.text();
    if (text.trimStart().startsWith('<')) return null;
    const j = JSON.parse(text);
    return j?.data ?? j;
  } catch { return null; }
}

function extractPair(arr) {
  if (!Array.isArray(arr) || !arr.length) return null;
  // Match by party code (most robust), fallback to name
  const kf  = arr.find(c => c.codigoAgrupacionPolitica === 8)
            ?? arr.find(c => (c.nombreCandidato||'').toUpperCase().includes('FUJIMORI'));
  const rsp = arr.find(c => c.codigoAgrupacionPolitica === 10)
            ?? arr.find(c => (c.nombreCandidato||'').toUpperCase().includes('SANCHEZ')
                          && (c.nombreCandidato||'').toUpperCase().includes('ROBERTO'));
  if (!kf && !rsp) return null;
  const kfV  = kf?.totalVotosValidos  ?? 0;
  const rspV = rsp?.totalVotosValidos ?? 0;
  const tot2 = kfV + rspV;
  return {
    keiko_votos:   kfV,
    keiko_pct:     parseFloat((kf?.porcentajeVotosValidos  ?? kf?.porcentajeVotosEmitidos  ?? 0).toFixed(3)),
    sanchez_votos: rspV,
    sanchez_pct:   parseFloat((rsp?.porcentajeVotosValidos ?? rsp?.porcentajeVotosEmitidos ?? 0).toFixed(3)),
    kf_r2_share:   tot2 > 0 ? Math.round(kfV / tot2 * 10000) / 100 : null,
  };
}

async function fetchNacional() {
  const data = await g(
    `resumen-general/participantes?idEleccion=${ID_ELECCION}&idAmbitoGeografico=${AMBITO_NAC}&tipoFiltro=nacional`
  );
  return Array.isArray(data) ? extractPair(data) : null;
}

async function fetchTotales() {
  const data = await g(
    `resumen-general/totales?idEleccion=${ID_ELECCION}&idAmbitoGeografico=${AMBITO_NAC}&tipoFiltro=nacional`
  );
  if (!data) return null;
  return {
    processed: data.actasProcesadas ?? data.actas_procesadas ?? data.actasContabilizadas ?? null,
    total:     data.actasTotal      ?? data.actas_total      ?? data.totalActas          ?? null,
    pct:       data.porcentajeActas ?? data.pct_actas        ?? data.porcentaje          ?? data.actasContabilizadas ?? null,
    raw:       data,
  };
}

async function fetchDepartamentos() {
  const ubigeos = await g(
    `ubigeos/departamentos?idEleccion=${ID_ELECCION}&idAmbitoGeografico=${AMBITO_NAC}`
  );
  if (!Array.isArray(ubigeos) || !ubigeos.length) return [];
  const results = await Promise.all(ubigeos.map(async dept => {
    const data = await g(
      `resumen-general/participantes?idEleccion=${ID_ELECCION}` +
      `&idAmbitoGeografico=${AMBITO_NAC}&tipoFiltro=ubigeo_nivel_01` +
      `&idUbigeoDepartamento=${dept.ubigeo}`
    );
    const pair = extractPair(data);
    if (!pair) return null;
    return { nombre: dept.nombre, ubigeo: dept.ubigeo, ...pair };
  }));
  return results.filter(Boolean);
}

async function fetchExtranjero() {
  const continentes = await g(
    `ubigeos/departamentos?idEleccion=${ID_ELECCION}&idAmbitoGeografico=${AMBITO_EXT}`
  );
  if (!Array.isArray(continentes) || !continentes.length) return [];
  const results = await Promise.all(continentes.map(async cont => {
    const data = await g(
      `resumen-general/participantes?idEleccion=${ID_ELECCION}` +
      `&idAmbitoGeografico=${AMBITO_EXT}&tipoFiltro=ubigeo_nivel_01` +
      `&idUbigeoDepartamento=${cont.ubigeo}`
    );
    const pair = extractPair(data);
    if (!pair) return null;
    return { nombre: cont.nombre, ubigeo: cont.ubigeo, ...pair };
  }));
  return results.filter(Boolean);
}

async function buildSnapshot() {
  const [nacional, totales, departamentos, extranjero] = await Promise.all([
    fetchNacional(),
    fetchTotales(),
    fetchDepartamentos(),
    fetchExtranjero(),
  ]);

  const hasData = nacional !== null && (nacional.keiko_votos > 0 || nacional.sanchez_votos > 0);

  return {
    captured_at:     new Date().toISOString(),
    has_data:        hasData,
    actas_total:     totales?.total     ?? null,
    actas_processed: totales?.processed ?? null,
    pct_actas:       totales?.pct       ?? null,
    keiko_votos:     nacional?.keiko_votos   ?? null,
    keiko_pct:       nacional?.keiko_pct     ?? null,
    sanchez_votos:   nacional?.sanchez_votos ?? null,
    sanchez_pct:     nacional?.sanchez_pct   ?? null,
    dept_breakdown:  departamentos,
    ext_breakdown:   extranjero,
    totales_raw:     totales?.raw ?? null,
  };
}

async function poll() {
  const t0 = Date.now();
  console.log(`🗳️  ONPE fetch start ${new Date().toLocaleTimeString('es-PE')}`);
  try {
    const snap = await buildSnapshot();
    const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
    if (!snap.has_data) {
      console.log(`⏳ Sin datos aún (${elapsed}s)`);
      return;
    }
    console.log(
      `📊 K=${snap.keiko_pct}% S=${snap.sanchez_pct}%` +
      ` actas=${snap.pct_actas ?? '?'}%` +
      ` depts=${snap.dept_breakdown.length} ext=${snap.ext_breakdown.length}` +
      ` (${elapsed}s) → enviando a Railway...`
    );

    const resp = await fetch(`${RAILWAY_URL}/api/admin/inject-snapshot`, {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${ADMIN_SECRET}`,
      },
      body: JSON.stringify(snap),
      signal: AbortSignal.timeout(15000),
    });

    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      console.error(`❌ Railway error ${resp.status}:`, text.slice(0, 200));
    } else {
      const json = await resp.json().catch(() => ({}));
      console.log(`✅ Guardado. snapshot_id=${json.snapshot_id}`);
    }
  } catch (err) {
    console.error('❌ Poll error:', err.message);
  }
}

// ── Start ────────────────────────────────────────────────────────────
let _onpeTimer = null;

function startONPE() {
  if (_onpeTimer) { console.log('Ya corriendo. Usa stopONPE() para detener.'); return; }
  console.log(`🗳️  ONPE bookmarklet started. Polling every ${POLL_INTERVAL/60000} min.`);
  console.log(`   Railway: ${RAILWAY_URL}`);
  poll();  // immediate first run
  _onpeTimer = setInterval(poll, POLL_INTERVAL);
}

function stopONPE() {
  if (_onpeTimer) { clearInterval(_onpeTimer); _onpeTimer = null; }
  console.log('🛑 ONPE bookmarklet stopped.');
}

startONPE();

/*
 * ── BOOKMARKLET ONE-LINER ──────────────────────────────────────────
 * Create a browser bookmark with this as the URL (replace CONFIG values first).
 * Clicking it while on resultadoelectoral.onpe.gob.pe starts auto-polling.
 *
 * javascript:(function(){const RAILWAY_URL='https://YOUR_URL.railway.app';const ADMIN_SECRET='YOUR_SECRET';const ID_ELECCION=11;const POLL_INTERVAL=120000;const BASE='/presentacion-backend';const AMBITO_NAC='1';const AMBITO_EXT='2';async function g(p){try{const r=await fetch(`${BASE}/${p}`,{signal:AbortSignal.timeout(15000)});if(r.status===204||r.status>=400)return null;const t=await r.text();if(t.trimStart().startsWith('<'))return null;const j=JSON.parse(t);return j?.data??j;}catch{return null;}}function ep(a){if(!Array.isArray(a)||!a.length)return null;const k=a.find(c=>c.codigoAgrupacionPolitica===8)??a.find(c=>(c.nombreCandidato||'').toUpperCase().includes('FUJIMORI'));const s=a.find(c=>c.codigoAgrupacionPolitica===10)??a.find(c=>(c.nombreCandidato||'').toUpperCase().includes('SANCHEZ')&&(c.nombreCandidato||'').toUpperCase().includes('ROBERTO'));if(!k&&!s)return null;const kV=k?.totalVotosValidos??0;const sV=s?.totalVotosValidos??0;const t2=kV+sV;return{keiko_votos:kV,keiko_pct:parseFloat((k?.porcentajeVotosValidos??0).toFixed(3)),sanchez_votos:sV,sanchez_pct:parseFloat((s?.porcentajeVotosValidos??0).toFixed(3)),kf_r2_share:t2>0?Math.round(kV/t2*10000)/100:null};}async function poll(){const t0=Date.now();try{const[nac,tot,depts_,ext_]=await Promise.all([g(`resumen-general/participantes?idEleccion=${ID_ELECCION}&idAmbitoGeografico=1&tipoFiltro=nacional`).then(d=>Array.isArray(d)?ep(d):null),g(`resumen-general/totales?idEleccion=${ID_ELECCION}&idAmbitoGeografico=1&tipoFiltro=nacional`),g(`ubigeos/departamentos?idEleccion=${ID_ELECCION}&idAmbitoGeografico=1`).then(async u=>{if(!Array.isArray(u))return[];const r=await Promise.all(u.map(async d=>{const c=await g(`resumen-general/participantes?idEleccion=${ID_ELECCION}&idAmbitoGeografico=1&tipoFiltro=ubigeo_nivel_01&idUbigeoDepartamento=${d.ubigeo}`);const p=ep(c);return p?{nombre:d.nombre,ubigeo:d.ubigeo,...p}:null;}));return r.filter(Boolean);}),g(`ubigeos/departamentos?idEleccion=${ID_ELECCION}&idAmbitoGeografico=2`).then(async u=>{if(!Array.isArray(u))return[];const r=await Promise.all(u.map(async c=>{const d=await g(`resumen-general/participantes?idEleccion=${ID_ELECCION}&idAmbitoGeografico=2&tipoFiltro=ubigeo_nivel_01&idUbigeoDepartamento=${c.ubigeo}`);const p=ep(d);return p?{nombre:c.nombre,ubigeo:c.ubigeo,...p}:null;}));return r.filter(Boolean);})]);const hasData=nac!==null&&(nac.keiko_votos>0||nac.sanchez_votos>0);const snap={captured_at:new Date().toISOString(),has_data:hasData,actas_total:tot?.actasTotal??tot?.totalActas??null,actas_processed:tot?.actasProcesadas??tot?.actasContabilizadas??null,pct_actas:tot?.porcentajeActas??tot?.actasContabilizadas??null,keiko_votos:nac?.keiko_votos??null,keiko_pct:nac?.keiko_pct??null,sanchez_votos:nac?.sanchez_votos??null,sanchez_pct:nac?.sanchez_pct??null,dept_breakdown:depts_,ext_breakdown:ext_,totales_raw:tot??null};if(!hasData){console.log('⏳ Sin datos aún');return;}console.log(`📊 K=${snap.keiko_pct}% S=${snap.sanchez_pct}% actas=${snap.pct_actas??'?'}%`);const resp=await fetch(`${RAILWAY_URL}/api/admin/inject-snapshot`,{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${ADMIN_SECRET}`},body:JSON.stringify(snap),signal:AbortSignal.timeout(15000)});if(resp.ok){const j=await resp.json().catch(()=>({}));console.log(`✅ snapshot_id=${j.snapshot_id}`);}else{console.error(`❌ ${resp.status}`);}}catch(e){console.error('❌',e.message);}}if(window._onpeTimer)clearInterval(window._onpeTimer);poll();window._onpeTimer=setInterval(poll,POLL_INTERVAL);console.log(`🗳️ ONPE started — polling every ${POLL_INTERVAL/60000}min. stopONPE() to stop.`);window.stopONPE=()=>{clearInterval(window._onpeTimer);window._onpeTimer=null;console.log('🛑 stopped');}})();
 */
