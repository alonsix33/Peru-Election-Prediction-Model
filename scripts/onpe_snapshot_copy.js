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

  const DEPTS = [
    {ubigeo:'010000',nombre:'AMAZONAS'},{ubigeo:'020000',nombre:'ÁNCASH'},
    {ubigeo:'030000',nombre:'APURÍMAC'},{ubigeo:'040000',nombre:'AREQUIPA'},
    {ubigeo:'050000',nombre:'AYACUCHO'},{ubigeo:'060000',nombre:'CAJAMARCA'},
    {ubigeo:'240000',nombre:'CALLAO'},  {ubigeo:'070000',nombre:'CUSCO'},
    {ubigeo:'080000',nombre:'HUANCAVELICA'},{ubigeo:'090000',nombre:'HUÁNUCO'},
    {ubigeo:'100000',nombre:'ICA'},     {ubigeo:'110000',nombre:'JUNÍN'},
    {ubigeo:'120000',nombre:'LA LIBERTAD'},{ubigeo:'130000',nombre:'LAMBAYEQUE'},
    {ubigeo:'140000',nombre:'LIMA'},    {ubigeo:'150000',nombre:'LORETO'},
    {ubigeo:'160000',nombre:'MADRE DE DIOS'},{ubigeo:'170000',nombre:'MOQUEGUA'},
    {ubigeo:'180000',nombre:'PASCO'},   {ubigeo:'190000',nombre:'PIURA'},
    {ubigeo:'200000',nombre:'PUNO'},    {ubigeo:'210000',nombre:'SAN MARTÍN'},
    {ubigeo:'220000',nombre:'TACNA'},   {ubigeo:'230000',nombre:'TUMBES'},
    {ubigeo:'250000',nombre:'UCAYALI'},
  ];

  window.copySnapshot = async function() {
    console.log('📋 Recolectando nacional + 25 depts...');

    const totales = await g(`resumen-general/totales?idEleccion=${ID_ELECCION}&tipoFiltro=eleccion`);

    const depts = await Promise.all(DEPTS.map(async dept => {
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
