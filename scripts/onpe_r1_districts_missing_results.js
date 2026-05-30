// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  R1 2026 — Resultados de distritos, depts 090000–250000 (exc. 240000)  ║
// ║  Procesa UN DEPARTAMENTO A LA VEZ para evitar rate-limit               ║
// ║  Correr desde: resultadoelectoral.onpe.gob.pe (consola del browser)    ║
// ║  Output: r1_results_missing_depts.json (keyed por ubigeo distrito)     ║
// ╚══════════════════════════════════════════════════════════════════════════╝
(async () => {
const BASE = '/presentacion-backend', IE = 10;

// Solo los 16 departamentos que faltan (090000–250000, excluyendo 240000 = CALLAO)
const PROVS_BY_DEPT = {
  '090000': [
    {dN:'HUÁNUCO',pU:'090200',pN:'AMBO'},
    {dN:'HUÁNUCO',pU:'090300',pN:'DOS DE MAYO'},
    {dN:'HUÁNUCO',pU:'090900',pN:'HUACAYBAMBA'},
    {dN:'HUÁNUCO',pU:'090400',pN:'HUAMALIES'},
    {dN:'HUÁNUCO',pU:'090100',pN:'HUÁNUCO'},
    {dN:'HUÁNUCO',pU:'091000',pN:'LAURICOCHA'},
    {dN:'HUÁNUCO',pU:'090600',pN:'LEONCIO PRADO'},
    {dN:'HUÁNUCO',pU:'090500',pN:'MARAÑÓN'},
    {dN:'HUÁNUCO',pU:'090700',pN:'PACHITEA'},
    {dN:'HUÁNUCO',pU:'090800',pN:'PUERTO INCA'},
    {dN:'HUÁNUCO',pU:'091100',pN:'YAROWILCA'},
  ],
  '100000': [
    {dN:'ICA',pU:'100200',pN:'CHINCHA'},
    {dN:'ICA',pU:'100100',pN:'ICA'},
    {dN:'ICA',pU:'100300',pN:'NASCA'},
    {dN:'ICA',pU:'100500',pN:'PALPA'},
    {dN:'ICA',pU:'100400',pN:'PISCO'},
  ],
  '110000': [
    {dN:'JUNÍN',pU:'110800',pN:'CHANCHAMAYO'},
    {dN:'JUNÍN',pU:'110900',pN:'CHUPACA'},
    {dN:'JUNÍN',pU:'110200',pN:'CONCEPCIÓN'},
    {dN:'JUNÍN',pU:'110100',pN:'HUANCAYO'},
    {dN:'JUNÍN',pU:'110300',pN:'JAUJA'},
    {dN:'JUNÍN',pU:'110400',pN:'JUNÍN'},
    {dN:'JUNÍN',pU:'110700',pN:'SATIPO'},
    {dN:'JUNÍN',pU:'110500',pN:'TARMA'},
    {dN:'JUNÍN',pU:'110600',pN:'YAULI'},
  ],
  '120000': [
    {dN:'LA LIBERTAD',pU:'120800',pN:'ASCOPE'},
    {dN:'LA LIBERTAD',pU:'120200',pN:'BOLÍVAR'},
    {dN:'LA LIBERTAD',pU:'120900',pN:'CHEPÉN'},
    {dN:'LA LIBERTAD',pU:'121100',pN:'GRAN CHIMÚ'},
    {dN:'LA LIBERTAD',pU:'121000',pN:'JULCÁN'},
    {dN:'LA LIBERTAD',pU:'120400',pN:'OTUZCO'},
    {dN:'LA LIBERTAD',pU:'120500',pN:'PACASMAYO'},
    {dN:'LA LIBERTAD',pU:'120600',pN:'PATAZ'},
    {dN:'LA LIBERTAD',pU:'120300',pN:'SÁNCHEZ CARRIÓN'},
    {dN:'LA LIBERTAD',pU:'120700',pN:'SANTIAGO DE CHUCO'},
    {dN:'LA LIBERTAD',pU:'120100',pN:'TRUJILLO'},
    {dN:'LA LIBERTAD',pU:'121200',pN:'VIRÚ'},
  ],
  '130000': [
    {dN:'LAMBAYEQUE',pU:'130100',pN:'CHICLAYO'},
    {dN:'LAMBAYEQUE',pU:'130200',pN:'FERREÑAFE'},
    {dN:'LAMBAYEQUE',pU:'130300',pN:'LAMBAYEQUE'},
  ],
  '140000': [
    {dN:'LIMA',pU:'140900',pN:'BARRANCA'},
    {dN:'LIMA',pU:'140200',pN:'CAJATAMBO'},
    {dN:'LIMA',pU:'140300',pN:'CANTA'},
    {dN:'LIMA',pU:'140400',pN:'CAÑETE'},
    {dN:'LIMA',pU:'140800',pN:'HUARAL'},
    {dN:'LIMA',pU:'140600',pN:'HUAROCHIRÍ'},
    {dN:'LIMA',pU:'140500',pN:'HUAURA'},
    {dN:'LIMA',pU:'140100',pN:'LIMA'},
    {dN:'LIMA',pU:'141000',pN:'OYÓN'},
    {dN:'LIMA',pU:'140700',pN:'YAUYOS'},
  ],
  '150000': [
    {dN:'LORETO',pU:'150200',pN:'ALTO AMAZONAS'},
    {dN:'LORETO',pU:'150700',pN:'DATEM DEL MARAÑÓN'},
    {dN:'LORETO',pU:'150300',pN:'LORETO'},
    {dN:'LORETO',pU:'150600',pN:'MARISCAL RAMÓN CASTILLA'},
    {dN:'LORETO',pU:'150100',pN:'MAYNAS'},
    {dN:'LORETO',pU:'150900',pN:'PUTUMAYO'},
    {dN:'LORETO',pU:'150400',pN:'REQUENA'},
    {dN:'LORETO',pU:'150500',pN:'UCAYALI'},
  ],
  '160000': [
    {dN:'MADRE DE DIOS',pU:'160200',pN:'MANÚ'},
    {dN:'MADRE DE DIOS',pU:'160300',pN:'TAHUAMANÚ'},
    {dN:'MADRE DE DIOS',pU:'160100',pN:'TAMBOPATA'},
  ],
  '170000': [
    {dN:'MOQUEGUA',pU:'170200',pN:'GENERAL SÁNCHEZ CERRO'},
    {dN:'MOQUEGUA',pU:'170300',pN:'ILO'},
    {dN:'MOQUEGUA',pU:'170100',pN:'MARISCAL NIETO'},
  ],
  '180000': [
    {dN:'PASCO',pU:'180200',pN:'DANIEL ALCIDES CARRIÓN'},
    {dN:'PASCO',pU:'180300',pN:'OXAPAMPA'},
    {dN:'PASCO',pU:'180100',pN:'PASCO'},
  ],
  '190000': [
    {dN:'PIURA',pU:'190200',pN:'AYABACA'},
    {dN:'PIURA',pU:'190300',pN:'HUANCABAMBA'},
    {dN:'PIURA',pU:'190400',pN:'MORROPÓN'},
    {dN:'PIURA',pU:'190500',pN:'PAITA'},
    {dN:'PIURA',pU:'190100',pN:'PIURA'},
    {dN:'PIURA',pU:'190800',pN:'SECHURA'},
    {dN:'PIURA',pU:'190600',pN:'SULLANA'},
    {dN:'PIURA',pU:'190700',pN:'TALARA'},
  ],
  '200000': [
    {dN:'PUNO',pU:'200200',pN:'AZÁNGARO'},
    {dN:'PUNO',pU:'200300',pN:'CARABAYA'},
    {dN:'PUNO',pU:'200400',pN:'CHUCUITO'},
    {dN:'PUNO',pU:'201200',pN:'EL COLLAO'},
    {dN:'PUNO',pU:'200500',pN:'HUANCANÉ'},
    {dN:'PUNO',pU:'200600',pN:'LAMPA'},
    {dN:'PUNO',pU:'200700',pN:'MELGAR'},
    {dN:'PUNO',pU:'201300',pN:'MOHO'},
    {dN:'PUNO',pU:'200100',pN:'PUNO'},
    {dN:'PUNO',pU:'201100',pN:'SAN ANTONIO DE PUTINA'},
    {dN:'PUNO',pU:'200800',pN:'SANDIA'},
    {dN:'PUNO',pU:'200900',pN:'SAN ROMÁN'},
    {dN:'PUNO',pU:'201000',pN:'YUNGUYO'},
  ],
  '210000': [
    {dN:'SAN MARTÍN',pU:'210700',pN:'BELLAVISTA'},
    {dN:'SAN MARTÍN',pU:'211000',pN:'EL DORADO'},
    {dN:'SAN MARTÍN',pU:'210200',pN:'HUALLAGA'},
    {dN:'SAN MARTÍN',pU:'210300',pN:'LAMAS'},
    {dN:'SAN MARTÍN',pU:'210400',pN:'MARISCAL CÁCERES'},
    {dN:'SAN MARTÍN',pU:'210100',pN:'MOYOBAMBA'},
    {dN:'SAN MARTÍN',pU:'210900',pN:'PICOTA'},
    {dN:'SAN MARTÍN',pU:'210500',pN:'RIOJA'},
    {dN:'SAN MARTÍN',pU:'210600',pN:'SAN MARTÍN'},
    {dN:'SAN MARTÍN',pU:'210800',pN:'TOCACHE'},
  ],
  '220000': [
    {dN:'TACNA',pU:'220400',pN:'CANDARAVE'},
    {dN:'TACNA',pU:'220300',pN:'JORGE BASADRE'},
    {dN:'TACNA',pU:'220100',pN:'TACNA'},
    {dN:'TACNA',pU:'220200',pN:'TARATA'},
  ],
  '230000': [
    {dN:'TUMBES',pU:'230200',pN:'CONTRALMIRANTE VILLAR'},
    {dN:'TUMBES',pU:'230100',pN:'TUMBES'},
    {dN:'TUMBES',pU:'230300',pN:'ZARUMILLA'},
  ],
  '250000': [
    {dN:'UCAYALI',pU:'250300',pN:'ATALAYA'},
    {dN:'UCAYALI',pU:'250100',pN:'CORONEL PORTILLO'},
    {dN:'UCAYALI',pU:'250200',pN:'PADRE ABAD'},
    {dN:'UCAYALI',pU:'250400',pN:'PURÚS'},
  ],
};

// ── Pool de concurrencia (6 simultáneos) ────────────────────────────
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

async function f(path) {
  return T(async () => {
    try {
      const r = await fetch(`${BASE}/${path}`, { signal: AbortSignal.timeout(25000) });
      if (r.status === 204 || r.status >= 400) return null;
      const text = await r.text();
      if (text.startsWith('<')) return null;
      return JSON.parse(text)?.data ?? null;
    } catch(e) { return null; }
  });
}

function pair(arr) {
  if (!Array.isArray(arr) || !arr.length) return null;
  const kf  = arr.find(c => c.codigoAgrupacionPolitica === 8);
  const rsp = arr.find(c => c.codigoAgrupacionPolitica === 10);
  if (!kf && !rsp) return null;
  const kfV = kf?.totalVotosValidos ?? 0;
  const rspV = rsp?.totalVotosValidos ?? 0;
  const tot2 = kfV + rspV;
  return {
    kfPct:       +(kf?.porcentajeVotosValidos  ?? 0).toFixed(3),
    rspPct:      +(rsp?.porcentajeVotosValidos ?? 0).toFixed(3),
    kfV, rspV,
    kf_r2_share: tot2 > 0 ? +(kfV / tot2 * 100).toFixed(2) : null,
  };
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

// ── Procesamiento SECUENCIAL por departamento ───────────────────────
const result = {};
const deptUbigeos = Object.keys(PROVS_BY_DEPT);

for (const dU of deptUbigeos) {
  const provs = PROVS_BY_DEPT[dU];
  const dN = provs[0].dN;
  console.log(`\n▶ ${dU} ${dN} (${provs.length} provincias)...`);

  // Provincias del departamento: en paralelo con pool de 6
  await Promise.all(provs.map(async p => {
    const dists = await f(
      `ubigeos/distritos?idEleccion=${IE}&idAmbitoGeografico=1&idUbigeoProvincia=${p.pU}`
    );
    if (!dists?.length) { console.warn(`  ⚠️ Sin distritos: ${p.pN}`); return; }

    await Promise.all(dists.map(async d => {
      const [cands, tots] = await Promise.all([
        f(`resumen-general/participantes?idEleccion=${IE}&tipoFiltro=ubigeo_nivel_03` +
          `&idAmbitoGeografico=1&idUbigeoDepartamento=${dU}` +
          `&idUbigeoProvincia=${p.pU}&idUbigeoDistrito=${d.ubigeo}`),
        f(`resumen-general/totales?idEleccion=${IE}&tipoFiltro=ubigeo_nivel_03` +
          `&idAmbitoGeografico=1&idUbigeoDepartamento=${dU}` +
          `&idUbigeoProvincia=${p.pU}&idUbigeoDistrito=${d.ubigeo}`),
      ]);

      const p2 = pair(cands);
      result[d.ubigeo] = {
        ubigeo: d.ubigeo, nombre: d.nombre,
        deptUbigeo: dU, deptNombre: dN,
        provUbigeo: p.pU, provNombre: p.pN,
        kfPct:       p2?.kfPct       ?? 0,
        rspPct:      p2?.rspPct      ?? 0,
        kfV:         p2?.kfV         ?? 0,
        rspV:        p2?.rspV        ?? 0,
        kf_r2_share: p2?.kf_r2_share ?? null,
        totalVotosValidos:   tots?.totalVotosValidos   ?? null,
        totalActas:          tots?.totalActas           ?? null,
        actasContabilizadas: tots?.actasContabilizadas ?? null,
      };
    }));

    console.log(`  ✓ ${p.pN}: ${dists.length} distritos`);
  }));

  const deptDists = Object.values(result).filter(d => d.deptUbigeo === dU);
  const withData = deptDists.filter(d => d.kf_r2_share !== null).length;
  console.log(`  → ${dU} ${dN}: ${deptDists.length} distritos, ${withData} con datos KF/RSP`);

  // Pausa de 2s entre departamentos para no sobrecargar el servidor
  if (dU !== deptUbigeos.at(-1)) {
    console.log('  ⏳ pausa 2s...');
    await sleep(2000);
  }
}

console.log(`\n✅ TOTAL: ${Object.keys(result).length} distritos`);

const blob = new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' });
const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
a.download = 'r1_results_missing_depts.json'; a.click();
})();
