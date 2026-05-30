const ONPE_BASE = 'https://resultadoelectoral.onpe.gob.pe/presentacion-backend';
const ID_ELECCION = process.env.ONPE_ID_ELECCION || '11';  // 10=R1, 11=R2
const AMBITO_NAC = '1';
const AMBITO_EXT = '2';

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (compatible; PeruElectionBot/1.0)',
  'Accept': 'application/json',
};

async function fetchJson(url) {
  try {
    const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(10_000) });
    if (res.status === 204) return null;
    if (!res.ok) return null;
    const text = await res.text();
    // ONPE's web server returns its SPA index.html as a 200 catch-all
    // when a route isn't handled by the API. Detect and discard.
    if (text.startsWith('<') || text.trimStart().startsWith('<!')) return null;
    const json = JSON.parse(text);
    // Unwrap ONPE's {success, message, data} envelope when present
    return json?.data !== undefined ? json.data : json;
  } catch {
    return null;
  }
}

function findCandidate(arr, fragments) {
  if (!Array.isArray(arr)) return null;
  return arr.find(c => {
    const name = ((c.nombreCandidato || '') + ' ' + (c.nombreAgrupacionPolitica || '')).toUpperCase();
    return fragments.some(f => name.includes(f));
  }) ?? null;
}

function extractPct(c) {
  if (!c) return null;
  return parseFloat(c.porcentajeVotosValidos ?? c.porcentajeVotosEmitidos ?? 0);
}

function extractVotos(c) {
  if (!c) return null;
  return parseInt(c.totalVotosValidos ?? c.totalVotos ?? 0, 10);
}

async function fetchNacional() {
  const data = await fetchJson(
    `${ONPE_BASE}/resumen-general/participantes?idEleccion=${ID_ELECCION}&idAmbitoGeografico=${AMBITO_NAC}&tipoFiltro=nacional`
  );
  if (!Array.isArray(data)) return null;
  const keiko  = findCandidate(data, ['KEIKO', 'FUJIMORI']);
  const sanchez = findCandidate(data, ['SÁNCHEZ', 'SANCHEZ', 'ROBERTO SÁNCHEZ']);
  if (!keiko && !sanchez) return null;
  return {
    keiko_votos:  extractVotos(keiko),
    keiko_pct:    extractPct(keiko),
    sanchez_votos: extractVotos(sanchez),
    sanchez_pct:  extractPct(sanchez),
  };
}

async function fetchTotales() {
  const data = await fetchJson(
    `${ONPE_BASE}/resumen-general/totales?idEleccion=${ID_ELECCION}&idAmbitoGeografico=${AMBITO_NAC}&tipoFiltro=nacional`
  );
  if (!data) return null;
  // Try multiple possible field name conventions from ONPE API
  const processed = data.actasProcesadas ?? data.actas_procesadas ?? data.actasContabilizadas ?? null;
  const total     = data.actasTotal ?? data.actas_total ?? data.totalActas ?? null;
  const pct       = data.porcentajeActas ?? data.pct_actas ?? data.porcentaje ?? null;
  return { processed, total, pct, raw: data };
}

async function fetchDepartamentos() {
  const ubigeoList = await fetchJson(
    `${ONPE_BASE}/ubigeos/departamentos?idEleccion=${ID_ELECCION}&idAmbitoGeografico=${AMBITO_NAC}`
  );
  if (!Array.isArray(ubigeoList) || !ubigeoList.length) return [];

  const results = await Promise.all(
    ubigeoList.map(async dept => {
      const data = await fetchJson(
        `${ONPE_BASE}/resumen-general/participantes?idEleccion=${ID_ELECCION}&idAmbitoGeografico=${AMBITO_NAC}` +
        `&tipoFiltro=ubigeo_nivel_01&idUbigeoDepartamento=${dept.ubigeo}`
      );
      if (!Array.isArray(data)) return null;
      const keiko   = findCandidate(data, ['KEIKO', 'FUJIMORI']);
      const sanchez = findCandidate(data, ['SÁNCHEZ', 'SANCHEZ']);
      if (!keiko && !sanchez) return null;
      return {
        nombre:        dept.nombre,
        ubigeo:        dept.ubigeo,
        keiko_votos:   extractVotos(keiko),
        keiko_pct:     extractPct(keiko),
        sanchez_votos: extractVotos(sanchez),
        sanchez_pct:   extractPct(sanchez),
      };
    })
  );
  return results.filter(Boolean);
}

async function fetchExtranjero() {
  const continentesList = await fetchJson(
    `${ONPE_BASE}/ubigeos/departamentos?idEleccion=${ID_ELECCION}&idAmbitoGeografico=${AMBITO_EXT}`
  );
  if (!Array.isArray(continentesList) || !continentesList.length) return [];

  const results = await Promise.all(
    continentesList.map(async cont => {
      const data = await fetchJson(
        `${ONPE_BASE}/resumen-general/participantes?idEleccion=${ID_ELECCION}&idAmbitoGeografico=${AMBITO_EXT}` +
        `&tipoFiltro=ubigeo_nivel_01&idUbigeoDepartamento=${cont.ubigeo}`
      );
      if (!Array.isArray(data)) return null;
      const keiko   = findCandidate(data, ['KEIKO', 'FUJIMORI']);
      const sanchez = findCandidate(data, ['SÁNCHEZ', 'SANCHEZ']);
      if (!keiko && !sanchez) return null;
      return {
        nombre:        cont.nombre,
        ubigeo:        cont.ubigeo,
        keiko_votos:   extractVotos(keiko),
        keiko_pct:     extractPct(keiko),
        sanchez_votos: extractVotos(sanchez),
        sanchez_pct:   extractPct(sanchez),
      };
    })
  );
  return results.filter(Boolean);
}

async function fetchOnpeLiveSnapshot() {
  const [nacional, totales, departamentos, extranjero] = await Promise.all([
    fetchNacional(),
    fetchTotales(),
    fetchDepartamentos(),
    fetchExtranjero(),
  ]);

  const hasData = nacional !== null && (nacional.keiko_votos > 0 || nacional.sanchez_votos > 0);

  return {
    captured_at:   new Date().toISOString(),
    has_data:      hasData,
    actas_total:   totales?.total ?? null,
    actas_processed: totales?.processed ?? null,
    pct_actas:     totales?.pct ?? null,
    keiko_votos:   nacional?.keiko_votos ?? null,
    keiko_pct:     nacional?.keiko_pct ?? null,
    sanchez_votos: nacional?.sanchez_votos ?? null,
    sanchez_pct:   nacional?.sanchez_pct ?? null,
    dept_breakdown: departamentos,
    ext_breakdown:  extranjero,
    totales_raw:    totales?.raw ?? null,
  };
}

module.exports = { fetchOnpeLiveSnapshot };
