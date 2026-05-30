// ╔══════════════════════════════════════════════════════════════════════╗
// ║  R1 2026 — Baseline plano por distrito (mismo formato que R2 live)  ║
// ║  Correr desde: resultadoelectoral.onpe.gob.pe (consola del browser) ║
// ╚══════════════════════════════════════════════════════════════════════╝
(async () => {
const BASE = '/presentacion-backend', IE = 10;

// 196 provincias hardcodeadas — bypaseamos /ubigeos/provincias (roto para 090000+)
const PROVS = [
  {dU:"010000",dN:"AMAZONAS",pU:"010200",pN:"BAGUA"},
  {dU:"010000",dN:"AMAZONAS",pU:"010300",pN:"BONGARÁ"},
  {dU:"010000",dN:"AMAZONAS",pU:"010100",pN:"CHACHAPOYAS"},
  {dU:"010000",dN:"AMAZONAS",pU:"010600",pN:"CONDORCANQUI"},
  {dU:"010000",dN:"AMAZONAS",pU:"010400",pN:"LUYA"},
  {dU:"010000",dN:"AMAZONAS",pU:"010500",pN:"RODRÍGUEZ DE MENDOZA"},
  {dU:"010000",dN:"AMAZONAS",pU:"010700",pN:"UTCUBAMBA"},
  {dU:"020000",dN:"ÁNCASH",pU:"020200",pN:"AIJA"},
  {dU:"020000",dN:"ÁNCASH",pU:"021600",pN:"ANTONIO RAIMONDI"},
  {dU:"020000",dN:"ÁNCASH",pU:"021800",pN:"ASUNCIÓN"},
  {dU:"020000",dN:"ÁNCASH",pU:"020300",pN:"BOLOGNESI"},
  {dU:"020000",dN:"ÁNCASH",pU:"020400",pN:"CARHUAZ"},
  {dU:"020000",dN:"ÁNCASH",pU:"021700",pN:"CARLOS FERMÍN FITZCARRALD"},
  {dU:"020000",dN:"ÁNCASH",pU:"020500",pN:"CASMA"},
  {dU:"020000",dN:"ÁNCASH",pU:"020600",pN:"CORONGO"},
  {dU:"020000",dN:"ÁNCASH",pU:"020100",pN:"HUARAZ"},
  {dU:"020000",dN:"ÁNCASH",pU:"020800",pN:"HUARI"},
  {dU:"020000",dN:"ÁNCASH",pU:"021900",pN:"HUARMEY"},
  {dU:"020000",dN:"ÁNCASH",pU:"020700",pN:"HUAYLAS"},
  {dU:"020000",dN:"ÁNCASH",pU:"020900",pN:"MARISCAL LUZURIAGA"},
  {dU:"020000",dN:"ÁNCASH",pU:"022000",pN:"OCROS"},
  {dU:"020000",dN:"ÁNCASH",pU:"021000",pN:"PALLASCA"},
  {dU:"020000",dN:"ÁNCASH",pU:"021100",pN:"POMABAMBA"},
  {dU:"020000",dN:"ÁNCASH",pU:"021200",pN:"RECUAY"},
  {dU:"020000",dN:"ÁNCASH",pU:"021300",pN:"SANTA"},
  {dU:"020000",dN:"ÁNCASH",pU:"021400",pN:"SIHUAS"},
  {dU:"020000",dN:"ÁNCASH",pU:"021500",pN:"YUNGAY"},
  {dU:"030000",dN:"APURÍMAC",pU:"030100",pN:"ABANCAY"},
  {dU:"030000",dN:"APURÍMAC",pU:"030300",pN:"ANDAHUAYLAS"},
  {dU:"030000",dN:"APURÍMAC",pU:"030400",pN:"ANTABAMBA"},
  {dU:"030000",dN:"APURÍMAC",pU:"030200",pN:"AYMARAES"},
  {dU:"030000",dN:"APURÍMAC",pU:"030700",pN:"CHINCHEROS"},
  {dU:"030000",dN:"APURÍMAC",pU:"030500",pN:"COTABAMBAS"},
  {dU:"030000",dN:"APURÍMAC",pU:"030600",pN:"GRAU"},
  {dU:"040000",dN:"AREQUIPA",pU:"040100",pN:"AREQUIPA"},
  {dU:"040000",dN:"AREQUIPA",pU:"040300",pN:"CAMANÁ"},
  {dU:"040000",dN:"AREQUIPA",pU:"040400",pN:"CARAVELÍ"},
  {dU:"040000",dN:"AREQUIPA",pU:"040500",pN:"CASTILLA"},
  {dU:"040000",dN:"AREQUIPA",pU:"040200",pN:"CAYLLOMA"},
  {dU:"040000",dN:"AREQUIPA",pU:"040600",pN:"CONDESUYOS"},
  {dU:"040000",dN:"AREQUIPA",pU:"040700",pN:"ISLAY"},
  {dU:"040000",dN:"AREQUIPA",pU:"040800",pN:"LA UNIÓN"},
  {dU:"050000",dN:"AYACUCHO",pU:"050200",pN:"CANGALLO"},
  {dU:"050000",dN:"AYACUCHO",pU:"050100",pN:"HUAMANGA"},
  {dU:"050000",dN:"AYACUCHO",pU:"050800",pN:"HUANCA SANCOS"},
  {dU:"050000",dN:"AYACUCHO",pU:"050300",pN:"HUANTA"},
  {dU:"050000",dN:"AYACUCHO",pU:"050400",pN:"LA MAR"},
  {dU:"050000",dN:"AYACUCHO",pU:"050500",pN:"LUCANAS"},
  {dU:"050000",dN:"AYACUCHO",pU:"050600",pN:"PARINACOCHAS"},
  {dU:"050000",dN:"AYACUCHO",pU:"051000",pN:"PÁUCAR DEL SARA SARA"},
  {dU:"050000",dN:"AYACUCHO",pU:"051100",pN:"SUCRE"},
  {dU:"050000",dN:"AYACUCHO",pU:"050700",pN:"VÍCTOR FAJARDO"},
  {dU:"050000",dN:"AYACUCHO",pU:"050900",pN:"VILCAS HUAMÁN"},
  {dU:"060000",dN:"CAJAMARCA",pU:"060200",pN:"CAJABAMBA"},
  {dU:"060000",dN:"CAJAMARCA",pU:"060100",pN:"CAJAMARCA"},
  {dU:"060000",dN:"CAJAMARCA",pU:"060300",pN:"CELENDÍN"},
  {dU:"060000",dN:"CAJAMARCA",pU:"060600",pN:"CHOTA"},
  {dU:"060000",dN:"CAJAMARCA",pU:"060400",pN:"CONTUMAZA"},
  {dU:"060000",dN:"CAJAMARCA",pU:"060500",pN:"CUTERVO"},
  {dU:"060000",dN:"CAJAMARCA",pU:"060700",pN:"HUALGAYOC"},
  {dU:"060000",dN:"CAJAMARCA",pU:"060800",pN:"JAÉN"},
  {dU:"060000",dN:"CAJAMARCA",pU:"061100",pN:"SAN IGNACIO"},
  {dU:"060000",dN:"CAJAMARCA",pU:"061200",pN:"SAN MARCOS"},
  {dU:"060000",dN:"CAJAMARCA",pU:"061000",pN:"SAN MIGUEL"},
  {dU:"060000",dN:"CAJAMARCA",pU:"061300",pN:"SAN PABLO"},
  {dU:"060000",dN:"CAJAMARCA",pU:"060900",pN:"SANTA CRUZ"},
  {dU:"070000",dN:"CUSCO",pU:"070200",pN:"ACOMAYO"},
  {dU:"070000",dN:"CUSCO",pU:"070300",pN:"ANTA"},
  {dU:"070000",dN:"CUSCO",pU:"070400",pN:"CALCA"},
  {dU:"070000",dN:"CUSCO",pU:"070500",pN:"CANAS"},
  {dU:"070000",dN:"CUSCO",pU:"070600",pN:"CANCHIS"},
  {dU:"070000",dN:"CUSCO",pU:"070700",pN:"CHUMBIVILCAS"},
  {dU:"070000",dN:"CUSCO",pU:"070100",pN:"CUSCO"},
  {dU:"070000",dN:"CUSCO",pU:"070800",pN:"ESPINAR"},
  {dU:"070000",dN:"CUSCO",pU:"070900",pN:"LA CONVENCIÓN"},
  {dU:"070000",dN:"CUSCO",pU:"071000",pN:"PARURO"},
  {dU:"070000",dN:"CUSCO",pU:"071100",pN:"PAUCARTAMBO"},
  {dU:"070000",dN:"CUSCO",pU:"071200",pN:"QUISPICANCHI"},
  {dU:"070000",dN:"CUSCO",pU:"071300",pN:"URUBAMBA"},
  {dU:"080000",dN:"HUANCAVELICA",pU:"080200",pN:"ACOBAMBA"},
  {dU:"080000",dN:"HUANCAVELICA",pU:"080300",pN:"ANGARAES"},
  {dU:"080000",dN:"HUANCAVELICA",pU:"080400",pN:"CASTROVIRREYNA"},
  {dU:"080000",dN:"HUANCAVELICA",pU:"080700",pN:"CHURCAMPA"},
  {dU:"080000",dN:"HUANCAVELICA",pU:"080100",pN:"HUANCAVELICA"},
  {dU:"080000",dN:"HUANCAVELICA",pU:"080600",pN:"HUAYTARA"},
  {dU:"080000",dN:"HUANCAVELICA",pU:"080500",pN:"TAYACAJA"},
  {dU:"090000",dN:"HUÁNUCO",pU:"090200",pN:"AMBO"},
  {dU:"090000",dN:"HUÁNUCO",pU:"090300",pN:"DOS DE MAYO"},
  {dU:"090000",dN:"HUÁNUCO",pU:"090900",pN:"HUACAYBAMBA"},
  {dU:"090000",dN:"HUÁNUCO",pU:"090400",pN:"HUAMALIES"},
  {dU:"090000",dN:"HUÁNUCO",pU:"090100",pN:"HUÁNUCO"},
  {dU:"090000",dN:"HUÁNUCO",pU:"091000",pN:"LAURICOCHA"},
  {dU:"090000",dN:"HUÁNUCO",pU:"090600",pN:"LEONCIO PRADO"},
  {dU:"090000",dN:"HUÁNUCO",pU:"090500",pN:"MARAÑÓN"},
  {dU:"090000",dN:"HUÁNUCO",pU:"090700",pN:"PACHITEA"},
  {dU:"090000",dN:"HUÁNUCO",pU:"090800",pN:"PUERTO INCA"},
  {dU:"090000",dN:"HUÁNUCO",pU:"091100",pN:"YAROWILCA"},
  {dU:"100000",dN:"ICA",pU:"100200",pN:"CHINCHA"},
  {dU:"100000",dN:"ICA",pU:"100100",pN:"ICA"},
  {dU:"100000",dN:"ICA",pU:"100300",pN:"NASCA"},
  {dU:"100000",dN:"ICA",pU:"100500",pN:"PALPA"},
  {dU:"100000",dN:"ICA",pU:"100400",pN:"PISCO"},
  {dU:"110000",dN:"JUNÍN",pU:"110800",pN:"CHANCHAMAYO"},
  {dU:"110000",dN:"JUNÍN",pU:"110900",pN:"CHUPACA"},
  {dU:"110000",dN:"JUNÍN",pU:"110200",pN:"CONCEPCIÓN"},
  {dU:"110000",dN:"JUNÍN",pU:"110100",pN:"HUANCAYO"},
  {dU:"110000",dN:"JUNÍN",pU:"110300",pN:"JAUJA"},
  {dU:"110000",dN:"JUNÍN",pU:"110400",pN:"JUNÍN"},
  {dU:"110000",dN:"JUNÍN",pU:"110700",pN:"SATIPO"},
  {dU:"110000",dN:"JUNÍN",pU:"110500",pN:"TARMA"},
  {dU:"110000",dN:"JUNÍN",pU:"110600",pN:"YAULI"},
  {dU:"120000",dN:"LA LIBERTAD",pU:"120800",pN:"ASCOPE"},
  {dU:"120000",dN:"LA LIBERTAD",pU:"120200",pN:"BOLÍVAR"},
  {dU:"120000",dN:"LA LIBERTAD",pU:"120900",pN:"CHEPÉN"},
  {dU:"120000",dN:"LA LIBERTAD",pU:"121100",pN:"GRAN CHIMÚ"},
  {dU:"120000",dN:"LA LIBERTAD",pU:"121000",pN:"JULCÁN"},
  {dU:"120000",dN:"LA LIBERTAD",pU:"120400",pN:"OTUZCO"},
  {dU:"120000",dN:"LA LIBERTAD",pU:"120500",pN:"PACASMAYO"},
  {dU:"120000",dN:"LA LIBERTAD",pU:"120600",pN:"PATAZ"},
  {dU:"120000",dN:"LA LIBERTAD",pU:"120300",pN:"SÁNCHEZ CARRIÓN"},
  {dU:"120000",dN:"LA LIBERTAD",pU:"120700",pN:"SANTIAGO DE CHUCO"},
  {dU:"120000",dN:"LA LIBERTAD",pU:"120100",pN:"TRUJILLO"},
  {dU:"120000",dN:"LA LIBERTAD",pU:"121200",pN:"VIRÚ"},
  {dU:"130000",dN:"LAMBAYEQUE",pU:"130100",pN:"CHICLAYO"},
  {dU:"130000",dN:"LAMBAYEQUE",pU:"130200",pN:"FERREÑAFE"},
  {dU:"130000",dN:"LAMBAYEQUE",pU:"130300",pN:"LAMBAYEQUE"},
  {dU:"140000",dN:"LIMA",pU:"140900",pN:"BARRANCA"},
  {dU:"140000",dN:"LIMA",pU:"140200",pN:"CAJATAMBO"},
  {dU:"140000",dN:"LIMA",pU:"140300",pN:"CANTA"},
  {dU:"140000",dN:"LIMA",pU:"140400",pN:"CAÑETE"},
  {dU:"140000",dN:"LIMA",pU:"140800",pN:"HUARAL"},
  {dU:"140000",dN:"LIMA",pU:"140600",pN:"HUAROCHIRÍ"},
  {dU:"140000",dN:"LIMA",pU:"140500",pN:"HUAURA"},
  {dU:"140000",dN:"LIMA",pU:"140100",pN:"LIMA"},
  {dU:"140000",dN:"LIMA",pU:"141000",pN:"OYÓN"},
  {dU:"140000",dN:"LIMA",pU:"140700",pN:"YAUYOS"},
  {dU:"150000",dN:"LORETO",pU:"150200",pN:"ALTO AMAZONAS"},
  {dU:"150000",dN:"LORETO",pU:"150700",pN:"DATEM DEL MARAÑÓN"},
  {dU:"150000",dN:"LORETO",pU:"150300",pN:"LORETO"},
  {dU:"150000",dN:"LORETO",pU:"150600",pN:"MARISCAL RAMÓN CASTILLA"},
  {dU:"150000",dN:"LORETO",pU:"150100",pN:"MAYNAS"},
  {dU:"150000",dN:"LORETO",pU:"150900",pN:"PUTUMAYO"},
  {dU:"150000",dN:"LORETO",pU:"150400",pN:"REQUENA"},
  {dU:"150000",dN:"LORETO",pU:"150500",pN:"UCAYALI"},
  {dU:"160000",dN:"MADRE DE DIOS",pU:"160200",pN:"MANÚ"},
  {dU:"160000",dN:"MADRE DE DIOS",pU:"160300",pN:"TAHUAMANÚ"},
  {dU:"160000",dN:"MADRE DE DIOS",pU:"160100",pN:"TAMBOPATA"},
  {dU:"170000",dN:"MOQUEGUA",pU:"170200",pN:"GENERAL SÁNCHEZ CERRO"},
  {dU:"170000",dN:"MOQUEGUA",pU:"170300",pN:"ILO"},
  {dU:"170000",dN:"MOQUEGUA",pU:"170100",pN:"MARISCAL NIETO"},
  {dU:"180000",dN:"PASCO",pU:"180200",pN:"DANIEL ALCIDES CARRIÓN"},
  {dU:"180000",dN:"PASCO",pU:"180300",pN:"OXAPAMPA"},
  {dU:"180000",dN:"PASCO",pU:"180100",pN:"PASCO"},
  {dU:"190000",dN:"PIURA",pU:"190200",pN:"AYABACA"},
  {dU:"190000",dN:"PIURA",pU:"190300",pN:"HUANCABAMBA"},
  {dU:"190000",dN:"PIURA",pU:"190400",pN:"MORROPÓN"},
  {dU:"190000",dN:"PIURA",pU:"190500",pN:"PAITA"},
  {dU:"190000",dN:"PIURA",pU:"190100",pN:"PIURA"},
  {dU:"190000",dN:"PIURA",pU:"190800",pN:"SECHURA"},
  {dU:"190000",dN:"PIURA",pU:"190600",pN:"SULLANA"},
  {dU:"190000",dN:"PIURA",pU:"190700",pN:"TALARA"},
  {dU:"200000",dN:"PUNO",pU:"200200",pN:"AZÁNGARO"},
  {dU:"200000",dN:"PUNO",pU:"200300",pN:"CARABAYA"},
  {dU:"200000",dN:"PUNO",pU:"200400",pN:"CHUCUITO"},
  {dU:"200000",dN:"PUNO",pU:"201200",pN:"EL COLLAO"},
  {dU:"200000",dN:"PUNO",pU:"200500",pN:"HUANCANÉ"},
  {dU:"200000",dN:"PUNO",pU:"200600",pN:"LAMPA"},
  {dU:"200000",dN:"PUNO",pU:"200700",pN:"MELGAR"},
  {dU:"200000",dN:"PUNO",pU:"201300",pN:"MOHO"},
  {dU:"200000",dN:"PUNO",pU:"200100",pN:"PUNO"},
  {dU:"200000",dN:"PUNO",pU:"201100",pN:"SAN ANTONIO DE PUTINA"},
  {dU:"200000",dN:"PUNO",pU:"200800",pN:"SANDIA"},
  {dU:"200000",dN:"PUNO",pU:"200900",pN:"SAN ROMÁN"},
  {dU:"200000",dN:"PUNO",pU:"201000",pN:"YUNGUYO"},
  {dU:"210000",dN:"SAN MARTÍN",pU:"210700",pN:"BELLAVISTA"},
  {dU:"210000",dN:"SAN MARTÍN",pU:"211000",pN:"EL DORADO"},
  {dU:"210000",dN:"SAN MARTÍN",pU:"210200",pN:"HUALLAGA"},
  {dU:"210000",dN:"SAN MARTÍN",pU:"210300",pN:"LAMAS"},
  {dU:"210000",dN:"SAN MARTÍN",pU:"210400",pN:"MARISCAL CÁCERES"},
  {dU:"210000",dN:"SAN MARTÍN",pU:"210100",pN:"MOYOBAMBA"},
  {dU:"210000",dN:"SAN MARTÍN",pU:"210900",pN:"PICOTA"},
  {dU:"210000",dN:"SAN MARTÍN",pU:"210500",pN:"RIOJA"},
  {dU:"210000",dN:"SAN MARTÍN",pU:"210600",pN:"SAN MARTÍN"},
  {dU:"210000",dN:"SAN MARTÍN",pU:"210800",pN:"TOCACHE"},
  {dU:"220000",dN:"TACNA",pU:"220400",pN:"CANDARAVE"},
  {dU:"220000",dN:"TACNA",pU:"220300",pN:"JORGE BASADRE"},
  {dU:"220000",dN:"TACNA",pU:"220100",pN:"TACNA"},
  {dU:"220000",dN:"TACNA",pU:"220200",pN:"TARATA"},
  {dU:"230000",dN:"TUMBES",pU:"230200",pN:"CONTRALMIRANTE VILLAR"},
  {dU:"230000",dN:"TUMBES",pU:"230100",pN:"TUMBES"},
  {dU:"230000",dN:"TUMBES",pU:"230300",pN:"ZARUMILLA"},
  {dU:"240000",dN:"CALLAO",pU:"240100",pN:"CALLAO"},
  {dU:"250000",dN:"UCAYALI",pU:"250300",pN:"ATALAYA"},
  {dU:"250000",dN:"UCAYALI",pU:"250100",pN:"CORONEL PORTILLO"},
  {dU:"250000",dN:"UCAYALI",pU:"250200",pN:"PADRE ABAD"},
  {dU:"250000",dN:"UCAYALI",pU:"250400",pN:"PURÚS"},
];

// ── Pool de concurrencia (8 requests en paralelo) ────────────────────
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
const T = makePool(8);

// ── Fetch helper (maneja 204, HTML, timeout) ─────────────────────────
async function f(path) {
  return T(async () => {
    try {
      const r = await fetch(`${BASE}/${path}`, { signal: AbortSignal.timeout(20000) });
      if (r.status === 204 || r.status >= 400) return null;
      const text = await r.text();
      if (text.startsWith('<')) return null;
      return JSON.parse(text)?.data ?? null;
    } catch(e) { return null; }
  });
}

// ── Extractor KF/RSP ─────────────────────────────────────────────────
function pair(arr) {
  if (!Array.isArray(arr) || !arr.length) return null;
  const kf  = arr.find(c => c.codigoAgrupacionPolitica === 8);
  const rsp = arr.find(c => c.codigoAgrupacionPolitica === 10);
  if (!kf && !rsp) return null;
  const kfV  = kf?.totalVotosValidos  ?? 0;
  const rspV = rsp?.totalVotosValidos ?? 0;
  const tot2 = kfV + rspV;
  return {
    kfPct:       +(kf?.porcentajeVotosValidos  ?? 0).toFixed(3),
    rspPct:      +(rsp?.porcentajeVotosValidos ?? 0).toFixed(3),
    kfV,
    rspV,
    kf_r2_share: tot2 > 0 ? +(kfV / tot2 * 100).toFixed(2) : null,
  };
}

// ── Resultado: objeto plano keyed por ubigeo distrito ────────────────
const result = {};
let provsDone = 0;

await Promise.all(PROVS.map(async p => {
  const dists = await f(
    `ubigeos/distritos?idEleccion=${IE}&idAmbitoGeografico=1&idUbigeoProvincia=${p.pU}`
  );
  if (!dists?.length) {
    console.warn(`⚠️ Sin distritos: ${p.pN} (${p.pU})`);
    provsDone++;
    return;
  }

  await Promise.all(dists.map(async d => {
    const [cands, tots] = await Promise.all([
      f(`resumen-general/participantes?idEleccion=${IE}&tipoFiltro=ubigeo_nivel_03` +
        `&idAmbitoGeografico=1&idUbigeoDepartamento=${p.dU}` +
        `&idUbigeoProvincia=${p.pU}&idUbigeoDistrito=${d.ubigeo}`),
      f(`resumen-general/totales?idEleccion=${IE}&tipoFiltro=ubigeo_nivel_03` +
        `&idAmbitoGeografico=1&idUbigeoDepartamento=${p.dU}` +
        `&idUbigeoProvincia=${p.pU}&idUbigeoDistrito=${d.ubigeo}`),
    ]);

    const p2 = pair(cands);
    result[d.ubigeo] = {
      ubigeo:             d.ubigeo,
      nombre:             d.nombre,
      deptUbigeo:         p.dU,
      deptNombre:         p.dN,
      provUbigeo:         p.pU,
      provNombre:         p.pN,
      kfPct:              p2?.kfPct              ?? 0,
      rspPct:             p2?.rspPct             ?? 0,
      kfV:                p2?.kfV                ?? 0,
      rspV:               p2?.rspV               ?? 0,
      kf_r2_share:        p2?.kf_r2_share        ?? null,
      totalVotosValidos:  tots?.totalVotosValidos ?? null,
      totalActas:         tots?.totalActas        ?? null,
      actasContabilizadas: tots?.actasContabilizadas ?? null,
    };
  }));

  provsDone++;
  if (provsDone % 20 === 0 || provsDone === PROVS.length)
    console.log(`📊 ${provsDone}/${PROVS.length} provincias — ${Object.keys(result).length} distritos`);
}));

console.log(`✅ LISTO: ${Object.keys(result).length} distritos`);

// Muestra resumen por dept
const depts = {};
for (const d of Object.values(result)) {
  if (!depts[d.deptUbigeo]) depts[d.deptUbigeo] = { nombre: d.deptNombre, n: 0 };
  depts[d.deptUbigeo].n++;
}
for (const [u, d] of Object.entries(depts).sort(([a],[b]) => a.localeCompare(b)))
  console.log(`  ${u} ${d.nombre.padEnd(20)} ${d.n} distritos`);

// ── Descarga ─────────────────────────────────────────────────────────
const blob = new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' });
const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
a.download = 'r1_districts_flat.json'; a.click();
})();
