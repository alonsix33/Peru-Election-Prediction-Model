// Pegar en DevTools Console en resultadosegundavuelta.onpe.gob.pe
// Requiere que el bookmarklet ya esté corriendo (usa buildSnapshot que ya existe en la página)
// Llama a: copySnapshot()

window.copySnapshot = async function() {
  const ID_ELECCION   = 10;
  const AMBITO_NAC    = 0;

  const BASE = 'https://resultadosegundavuelta.onpe.gob.pe/presentacion-backend/resumen-general';

  async function g(path) {
    try {
      const r = await fetch(`${BASE}/${path}`, { headers: { 'Accept': 'application/json' } });
      const t = await r.text();
      return JSON.parse(t);
    } catch { return null; }
  }

  function extractPair(data) {
    if (!Array.isArray(data)) return null;
    const kf  = data.find(x => (x.nombreCandidato || '').includes('KEIKO') || (x.nombreAgrupacionPolitica || '').includes('FUERZA'));
    const rsp = data.find(x => (x.nombreCandidato || '').includes('SÁNCHEZ') || (x.nombreCandidato || '').includes('SANCHEZ'));
    if (!kf || !rsp) return null;
    return {
      keiko_votos:   kf.totalVotosValidos  ?? 0,
      sanchez_votos: rsp.totalVotosValidos ?? 0,
    };
  }

  console.log('📋 Recolectando snapshot...');

  const [ubigeos, totales] = await Promise.all([
    g(`ubigeos/departamentos?idEleccion=${ID_ELECCION}&idAmbitoGeografico=${AMBITO_NAC}`),
    g(`totales?idEleccion=${ID_ELECCION}&tipoFiltro=eleccion`),
  ]);

  const depts = await Promise.all((ubigeos || []).map(async dept => {
    const [data, tot] = await Promise.all([
      g(`participantes?idEleccion=${ID_ELECCION}&idAmbitoGeografico=${AMBITO_NAC}&tipoFiltro=ubigeo_nivel_01&idUbigeoDepartamento=${dept.ubigeo}`),
      g(`totales?idEleccion=${ID_ELECCION}&idAmbitoGeografico=${AMBITO_NAC}&tipoFiltro=ubigeo_nivel_01&idUbigeoDepartamento=${dept.ubigeo}`),
    ]);
    const pair = extractPair(data);
    if (!pair) return null;
    const actas_procesadas = tot?.actasProcesadas ?? null;
    const actas_total      = tot?.actasTotal ?? tot?.totalActas ?? null;
    let pct_actas = tot?.porcentajeActas ?? tot?.actasContabilizadas ?? null;
    if (pct_actas === null && actas_procesadas != null && actas_total > 0)
      pct_actas = parseFloat((actas_procesadas / actas_total * 100).toFixed(2));
    return { nombre: dept.nombre, ubigeo: dept.ubigeo, kf: pair.keiko_votos, rsp: pair.sanchez_votos, pct: pct_actas };
  }));

  const validDepts = depts.filter(Boolean);
  const kf_votos   = validDepts.reduce((s, d) => s + d.kf,  0);
  const rsp_votos  = validDepts.reduce((s, d) => s + d.rsp, 0);
  const total      = kf_votos + rsp_votos;

  const pct_actas_raw = totales?.porcentajeActas ?? totales?.actasContabilizadas ?? null;
  const actas_total   = totales?.totalActas ?? null;
  const actas_proc    = totales?.actasProcesadas ?? totales?.contabilizadas ?? null;

  const out = {
    pct_actas:    pct_actas_raw,
    actas_total,
    actas_processed: actas_proc,
    keiko_votos:  kf_votos,
    keiko_pct:    total > 0 ? parseFloat((kf_votos  / total * 100).toFixed(3)) : null,
    sanchez_votos: rsp_votos,
    sanchez_pct:  total > 0 ? parseFloat((rsp_votos / total * 100).toFixed(3)) : null,
    dept_breakdown: validDepts,
  };

  const txt = JSON.stringify(out, null, 2);
  await navigator.clipboard.writeText(txt).catch(() => {});
  console.log(`📋 ✅ Copiado — ${validDepts.length} depts, KF ${out.keiko_pct}%, actas ${out.pct_actas}%`);
  console.log(txt);
};

console.log('📋 copySnapshot() listo — llama copySnapshot() para copiar el JSON al clipboard');
