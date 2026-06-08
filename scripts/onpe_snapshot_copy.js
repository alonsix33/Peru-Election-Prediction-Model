// Pegar en DevTools Console en resultadosegundavuelta.onpe.gob.pe
// Script autónomo — no depende del bookmarklet. Llama copySnapshot()

(function() {
  const ID_ELECCION = 10;
  const AMBITO_NAC  = 0;
  const BASE        = '/presentacion-backend';

  async function g(path) {
    try {
      const r = await fetch(`${BASE}/${path}`, { headers: { Accept: 'application/json' } });
      return JSON.parse(await r.text());
    } catch { return null; }
  }

  function extractPair(data) {
    if (!Array.isArray(data)) return null;
    const kf  = data.find(x => (x.nombreCandidato || '').toUpperCase().includes('KEIKO'));
    const rsp = data.find(x => (x.nombreCandidato || '').toUpperCase().includes('NCHEZ'));
    if (!kf || !rsp) return null;
    return { keiko_votos: kf.totalVotosValidos ?? 0, sanchez_votos: rsp.totalVotosValidos ?? 0 };
  }

  window.copySnapshot = async function() {
    console.log('📋 Recolectando nacional + 25 depts...');

    const [ubigeos, totales] = await Promise.all([
      g(`ubigeos/departamentos?idEleccion=${ID_ELECCION}&idAmbitoGeografico=${AMBITO_NAC}`),
      g(`resumen-general/totales?idEleccion=${ID_ELECCION}&tipoFiltro=eleccion`),
    ]);

    const depts = await Promise.all((ubigeos || []).map(async dept => {
      const [data, tot] = await Promise.all([
        g(`resumen-general/participantes?idEleccion=${ID_ELECCION}&idAmbitoGeografico=${AMBITO_NAC}&tipoFiltro=ubigeo_nivel_01&idUbigeoDepartamento=${dept.ubigeo}`),
        g(`resumen-general/totales?idEleccion=${ID_ELECCION}&idAmbitoGeografico=${AMBITO_NAC}&tipoFiltro=ubigeo_nivel_01&idUbigeoDepartamento=${dept.ubigeo}`),
      ]);
      const pair = extractPair(data);
      if (!pair) return null;
      const proc  = tot?.actasProcesadas ?? null;
      const total = tot?.actasTotal ?? tot?.totalActas ?? null;
      let pct = tot?.porcentajeActas ?? tot?.actasContabilizadas ?? null;
      if (pct === null && proc != null && total > 0) pct = parseFloat((proc / total * 100).toFixed(2));
      return { nombre: dept.nombre, ubigeo: dept.ubigeo, kf: pair.keiko_votos, rsp: pair.sanchez_votos, pct };
    }));

    const valid = depts.filter(Boolean);
    const kf_v  = valid.reduce((s, d) => s + d.kf,  0);
    const rsp_v = valid.reduce((s, d) => s + d.rsp, 0);
    const tot   = kf_v + rsp_v;

    const out = {
      pct_actas:     totales?.porcentajeActas ?? totales?.actasContabilizadas ?? null,
      actas_total:   totales?.totalActas ?? null,
      actas_proc:    totales?.actasProcesadas ?? totales?.contabilizadas ?? null,
      keiko_votos:   kf_v,
      keiko_pct:     tot > 0 ? parseFloat((kf_v  / tot * 100).toFixed(3)) : null,
      sanchez_votos: rsp_v,
      sanchez_pct:   tot > 0 ? parseFloat((rsp_v / tot * 100).toFixed(3)) : null,
      depts: valid,
    };

    const txt = JSON.stringify(out, null, 2);
    await navigator.clipboard.writeText(txt).catch(() => {});
    console.log(`📋 ✅ KF ${out.keiko_pct}% | RSP ${out.sanchez_pct}% | actas ${out.pct_actas}% | ${valid.length} depts`);
    console.log(txt);
  };

  console.log('📋 copySnapshot() listo — llama copySnapshot()');
})();
