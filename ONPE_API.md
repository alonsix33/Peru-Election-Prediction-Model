# ONPE API — Documentación de Ingeniería Inversa

Registro exhaustivo de todos los endpoints, parámetros y estructuras descubiertos
interactuando con `resultadoelectoral.onpe.gob.pe`. Actualizar cada vez que
se confirme algo nuevo.

**Última actualización:** 2026-05-30  
**Basado en:** R1 2026 (idEleccion=10), datos al 100% de actas  
**Método de descubrimiento:** XHR intercept + fetch desde consola dentro del dominio ONPE

---

## 1. Base URL y CORS

```
https://resultadoelectoral.onpe.gob.pe/presentacion-backend
```

- En el código de frontend: usar rutas relativas `/presentacion-backend/...`
  (desde dentro del dominio no hay CORS).
- Desde otro dominio (ej. Railway): todas las requests fallan silenciosamente
  con status 0 — parecen 204 pero son errores CORS. No hay proxy necesario si
  el frontend vive en el dominio ONPE; si no, necesitamos un proxy en Railway.
- No se requiere token de autenticación ni cookie de sesión.
- El frontend es Angular (usa `XMLHttpRequest`, no `fetch`).

### Detección de CORS al interceptar

```javascript
// SOLO correr esto desde resultadoelectoral.onpe.gob.pe
const _open = XMLHttpRequest.prototype.open;
XMLHttpRequest.prototype.open = function(method, url, ...rest) {
  if (url && url.includes('presentacion-backend')) {
    console.log(`🔵 XHR ${method}: ${url}`);
  }
  return _open.call(this, method, url, ...rest);
};
```

---

## 2. Proceso electoral activo

```
GET /proceso/proceso-electoral-activo
```

```json
{
  "success": true,
  "message": "",
  "data": {
    "id": 2,
    "nombre": "ELECCIONES GENERALES Y PARLAMENTO ANDINO 2026",
    "acronimo": "EG2026",
    "fechaProceso": 1775970000000,
    "idEleccionPrincipal": 10,
    "tipoProcesoElectoral": "bicameralidad",
    "activoFechaProceso": true
  }
}
```

Usar este endpoint al arrancar para detectar `idEleccion` actual sin hardcodear.

---

## 3. IDs de elección

| idEleccion | Descripción | Estado (30 may) |
|---|---|---|
| 10 | Primera vuelta presidencial 2026 | ✅ datos completos (100% actas) |
| 11 | Segunda vuelta presidencial 2026 | ⏳ 204 (no iniciada aún) |
| 15 | Otra elección del proceso (¿Senadores?) | 200 con datos |

> **Para R2:** `idEleccion=11` devuelve 204 en todos los endpoints hasta que
> comiencen a llegar actas el 7 de junio. Confirmar el id real intercept&ando
> el XHR cuando el sitio cargue los primeros resultados de segunda vuelta.

---

## 4. Estructura de respuesta (todos los endpoints)

```json
{ "success": true, "message": "", "data": <payload> }
```

Para leer siempre:

```javascript
async function g(path) {
  try {
    const r = await fetch(`/presentacion-backend/${path}`,
      { signal: AbortSignal.timeout(15000) });
    if (r.status === 204 || r.status >= 400) return null;
    const text = await r.text();
    if (text.startsWith('<')) return null; // HTML = SPA 404
    const j = JSON.parse(text);
    return j?.data ?? j;
  } catch(e) { return null; }
}
```

| Status | Significado |
|---|---|
| 200 + JSON | OK |
| 204 | Sin datos (elección no iniciada, o periodo archivado) |
| 500 | Parámetros inválidos (ubigeo inexistente, combinación incorrecta) |
| 200 + HTML | Ruta no existe — SPA sirve su index.html |

---

## 5. Endpoints de catálogo geográfico (`/ubigeos/`)

**DESCUBRIMIENTO CLAVE** — existe una familia completa de endpoints para
enumerar la jerarquía geográfica sin sondear por incremento.

### Respuesta estándar ubigeo

```json
{ "ubigeo": "140000", "nombre": "LAMBAYEQUE" }
```

- `ubigeo`: STRING de 6 dígitos con cero a la izquierda (`"010000"`, no `10000`).
- `nombre`: MAYÚSCULAS.

### 5.1 Perú (idAmbitoGeografico=1)

```
GET /ubigeos/departamentos?idEleccion={IE}&idAmbitoGeografico=1
→ Array[25]  { ubigeo, nombre }

GET /ubigeos/provincias?idEleccion={IE}&idAmbitoGeografico=1&idUbigeoDepartamento={deptUbigeo}
→ Array[N]   { ubigeo, nombre }

GET /ubigeos/distritos?idEleccion={IE}&idAmbitoGeografico=1&idUbigeoProvincia={provUbigeo}
→ Array[N]   { ubigeo, nombre }
```

**Confirmado con XHR intercept** — estas son las llamadas reales del sitio de ONPE.

Ejemplo flujo Lambayeque → Chiclayo → distritos:
```
/ubigeos/departamentos?idEleccion=10&idAmbitoGeografico=1
  → [..., { ubigeo:"130000", nombre:"LAMBAYEQUE" }, ...]

/ubigeos/provincias?idEleccion=10&idAmbitoGeografico=1&idUbigeoDepartamento=130000
  → [{ ubigeo:"130100", nombre:"CHICLAYO" }, ...]  (3 provincias)

/ubigeos/distritos?idEleccion=10&idAmbitoGeografico=1&idUbigeoProvincia=130100
  → [{ ubigeo:"130101", nombre:"CHICLAYO" }, { ubigeo:"130102", nombre:"..." }, ...]
```

Ejemplo flujo Lima (ONPE 140000) → provincias:
```
/ubigeos/provincias?idEleccion=10&idAmbitoGeografico=1&idUbigeoDepartamento=140000
  → 10 provincias: BARRANCA, CAJATAMBO, CANTA, CAÑETE, HUARAL,
                   HUAROCHIRÍ, HUAURA, LIMA (la ciudad), OYÓN, YAUYOS

/ubigeos/distritos?idEleccion=10&idAmbitoGeografico=1&idUbigeoProvincia=140100
  → 43 distritos (Lima-prov): ANCÓN, ATE, BARRANCO, ... (prefijos 1401xx)
```

> ✅ **BARRANCA es correcta** — ONPE `140000` = LIMA (no Lambayeque).
> La confusión inicial fue asumir el código INEI. Lambayeque en ONPE = `130000`.

### 5.2 Extranjero (idAmbitoGeografico=2)

```
GET /ubigeos/departamentos?idEleccion={IE}&idAmbitoGeografico=2
→ Array[5]  continentes { ubigeo, nombre }

GET /ubigeos/provincias?idEleccion={IE}&idAmbitoGeografico=2&idUbigeoDepartamento={contUbigeo}
→ Array[N]  países { ubigeo, nombre }

GET /ubigeos/distritos?idEleccion={IE}&idAmbitoGeografico=2&idUbigeoProvincia={paisUbigeo}
→ Array[N]  ciudades { ubigeo, nombre }
```

**Confirmado**: continentes → países → ciudades. Mismos parámetros que Perú,
cambiando solo `idAmbitoGeografico=2`.

---

## 6. Endpoint principal: `resumen-general/participantes`

Devuelve candidatos con votos por ámbito geográfico.

### Parámetros por nivel

```
GET /resumen-general/participantes
  ?idEleccion={IE}
  &tipoFiltro=ubigeo_nivel_0{1|2|3}
  &idAmbitoGeografico={1|2}
  &idUbigeoDepartamento={deptUbigeo}    ← requerido para nivel 1, 2, 3
  &idUbigeoProvincia={provUbigeo}       ← requerido para nivel 2 y 3
  &idUbigeoDistrito={distUbigeo}        ← requerido para nivel 3
```

| tipoFiltro | idAmbitoGeografico | Ámbito |
|---|---|---|
| `ubigeo_nivel_01` | 1 | Departamento (Perú) |
| `ubigeo_nivel_02` | 1 | Provincia (Perú) |
| `ubigeo_nivel_03` | 1 | Distrito (Perú) |
| `ubigeo_nivel_01` | 2 | Continente (Extranjero) |
| `ubigeo_nivel_02` | 2 | País (Extranjero) |
| `ubigeo_nivel_03` | 2 | Ciudad (Extranjero) |
| `nacional` | 1 | Nacional total (204 para R1 archivado) |

**Sin `idUbigeoProvincia` en nivel_02 → 500.** No existe modo "listar provincias"
en este endpoint — para eso usar `/ubigeos/provincias`.

### Respuesta: array de candidatos (mismos campos en todos los niveles)

```json
[
  {
    "nombreAgrupacionPolitica": "FUERZA POPULAR",
    "codigoAgrupacionPolitica": 8,
    "nombreCandidato": "KEIKO SOFIA FUJIMORI HIGUCHI",
    "dniCandidato": "10001088",
    "totalVotosValidos": 1089534,
    "porcentajeVotosValidos": 17.913,
    "porcentajeVotosEmitidos": 15.769
  }
]
```

**Campos iguales en nivel_01, nivel_02 y nivel_03** — confirmado por test.
No hay campo de actas en este endpoint; para eso usar `resumen-general/totales`.

> ⚠️ Algunos candidatos tienen `porcentajeVotosValidos: 0` y otros
> `undefined`. Usar siempre `?? 0`.

---

## 7. Endpoint: `resumen-general/totales`

Estadísticas de actas y participación (sin candidatos).

```
GET /resumen-general/totales
  ?idEleccion={IE}
  &tipoFiltro={nacional|ubigeo_nivel_01|ubigeo_nivel_02|ubigeo_nivel_03}
  &idAmbitoGeografico={1|2}
  [&idUbigeoDepartamento=...]
  [&idUbigeoProvincia=...]
  [&idUbigeoDistrito=...]
```

**Confirmado:** el XHR intercept mostró el sitio llamando a nivel_03 para
mostrar el % de actas de un distrito específico:
```
/resumen-general/totales?idEleccion=10&tipoFiltro=ubigeo_nivel_03
  &idAmbitoGeografico=1&idUbigeoDepartamento=140000
  &idUbigeoProvincia=140100&idUbigeoDistrito=140115
```

Campos clave en `data`:
```json
{
  "actasContabilizadas": 98.147,
  "contabilizadas": 91047,
  "totalActas": 92766,
  "participacionCiudadana": 72.492,
  "fechaActualizacion": 1780100105418,
  "totalVotosEmitidos": 19808624,
  "totalVotosValidos": 14568656
}
```

`fechaActualizacion` = Unix timestamp en milisegundos.

---

## 8. Sistema de ubigeos

### Codificación (STRING de 6 caracteres)

```
DDPPZZ
DD = código departamento (01–25), 2 dígitos con cero
PP = código provincia (01–N, 00 si nivel dept)
ZZ = código distrito (01–N, 00 si nivel provincia)
```

- Los ubigeos son **strings** en la API: `"010000"`, no `10000`.
- En los parámetros de query también se pasan como string (la URL los serializa igual).

### ⚠️ ONPE ubigeo ≠ INEI ubigeo — diferencia crítica

**ONPE usa su propio sistema de códigos, distinto al INEI.**
La diferencia clave: **Callao está en `240000`** (en INEI es `070000`).
Como consecuencia todos los departamentos que siguen a Cajamarca están
corridos una posición: Cusco = `070000` en ONPE, Lima = `140000`, etc.

Tabla de equivalencias ONPE ↔ INEI:

| ONPE ubigeo | Departamento | INEI ubigeo |
|---|---|---|
| 010000 | AMAZONAS | 010000 ✓ igual |
| 020000 | ÁNCASH | 020000 ✓ igual |
| 030000 | APURÍMAC | 030000 ✓ igual |
| 040000 | AREQUIPA | 040000 ✓ igual |
| 050000 | AYACUCHO | 050000 ✓ igual |
| 060000 | CAJAMARCA | 060000 ✓ igual |
| **070000** | **CUSCO** | 080000 distinto |
| **080000** | **HUANCAVELICA** | 090000 distinto |
| **090000** | **HUÁNUCO** | 100000 distinto |
| **100000** | **ICA** | 110000 distinto |
| **110000** | **JUNÍN** | 120000 distinto |
| **120000** | **LA LIBERTAD** | 130000 distinto |
| **130000** | **LAMBAYEQUE** | 140000 distinto |
| **140000** | **LIMA** | 150000 distinto |
| **150000** | **LORETO** | 160000 distinto |
| **160000** | **MADRE DE DIOS** | 170000 distinto |
| **170000** | **MOQUEGUA** | 180000 distinto |
| **180000** | **PASCO** | 190000 distinto |
| **190000** | **PIURA** | 200000 distinto |
| **200000** | **PUNO** | 210000 distinto |
| **210000** | **SAN MARTÍN** | 220000 distinto |
| **220000** | **TACNA** | 230000 distinto |
| **230000** | **TUMBES** | 240000 distinto |
| **240000** | **CALLAO** | 070000 muy distinto |
| **250000** | **UCAYALI** | 250000 ✓ igual |

**Siempre usar `/ubigeos/departamentos` para obtener los ubigeos dinámicamente.**
Nunca hardcodear asumiendo el sistema INEI.

### Departamentos de Perú (idAmbitoGeografico=1)

Datos R1 2026 al 100% de actas, con ubigeos ONPE correctos.
`kf_r2_share` = KF_votos / (KF_votos + RSP_votos) × 100.

| ubigeo ONPE | Departamento | KF% R1 | RSP% R1 | kf_r2_share |
|---|---|---|---|---|
| 010000 | Amazonas | 17.37 | 36.27 | 32.4% |
| 020000 | Áncash | 18.00 | 15.00 | 54.5% |
| 030000 | Apurímac | 6.90 | 41.06 | 14.4% |
| 040000 | Arequipa | 7.33 | 10.09 | 42.1% |
| 050000 | Ayacucho | 8.12 | 31.43 | 20.5% |
| 060000 | Cajamarca | 13.85 | 41.72 | 24.9% |
| 070000 | Cusco | 6.14 | 22.85 | 21.2% |
| 080000 | Huancavelica | 7.08 | 43.40 | 14.0% |
| 090000 | Huánuco | 15.46 | 29.88 | 34.1% |
| 100000 | Ica | 20.33 | 7.73 | 72.5% |
| 110000 | Junín | 17.11 | 12.32 | 58.1% |
| 120000 | La Libertad | 20.26 | 9.46 | 68.2% |
| 130000 | Lambayeque | 26.41 | 10.74 | 71.1% |
| 140000 | Lima | 17.91 | 3.28 | 84.5% |
| 150000 | Loreto | 28.36 | 9.86 | 74.2% |
| 160000 | Madre de Dios | 13.55 | 23.45 | 36.6% |
| 170000 | Moquegua | 6.64 | 12.92 | 34.0% |
| 180000 | Pasco | 18.87 | 18.67 | 50.3% |
| 190000 | Piura | 28.03 | 11.47 | 71.0% |
| 200000 | Puno | 3.90 | 24.98 | 13.5% |
| 210000 | San Martín | 23.26 | 23.94 | 49.3% |
| 220000 | Tacna | 6.85 | 11.92 | 36.5% |
| 230000 | Tumbes | 34.16 | 6.99 | 83.0% |
| 240000 | Callao | 20.70 | 3.01 | 87.3% |
| 250000 | Ucayali | 29.71 | 12.88 | 69.8% |

> Implicación para el modelo: los datos de 25 departamentos son solo el nivel
> más grueso. Con ~196 provincias (promedio 8 por dept) la proyección es mucho
> más precisa. Script de descarga masiva en §10.

### Provincias R1 2026 — baseline descargado ✅

196 provincias descargadas el 2026-05-30. Guardado en `backend/data/r1_province_baseline.json`.

| ubigeo | Departamento | # Provs | kf_r2_share prom |
|---|---|---|---|
| 010000 | Amazonas | 7 | 36.0% |
| 020000 | Áncash | 20 | 43.8% |
| 030000 | Apurímac | 7 | 13.2% |
| 040000 | Arequipa | 8 | 32.9% |
| 050000 | Ayacucho | 11 | 17.0% |
| 060000 | Cajamarca | 13 | 24.0% |
| 070000 | Cusco | 13 | 15.5% |
| 080000 | Huancavelica | 7 | 18.6% |
| 090000 | Huánuco | 11 | 26.6% |
| 100000 | Ica | 5 | 69.2% |
| 110000 | Junín | 9 | 57.2% |
| 120000 | La Libertad | 12 | 56.5% |
| 130000 | Lambayeque | 3 | 65.7% |
| 140000 | Lima | 10 | 72.4% |
| 150000 | Loreto | 8 | 69.2% |
| 160000 | Madre de Dios | 3 | 36.6% |
| 170000 | Moquegua | 3 | 31.0% |
| 180000 | Pasco | 3 | 42.4% |
| 190000 | Piura | 8 | 66.1% |
| 200000 | Puno | 13 | 11.2% |
| 210000 | San Martín | 10 | 47.1% |
| 220000 | Tacna | 4 | 25.3% |
| 230000 | Tumbes | 3 | 84.6% |
| 240000 | Callao | 1 | 87.3% |
| 250000 | Ucayali | 4 | 63.9% |

**Extremos más RSP** (candidato Sánchez)  
`CHUMBIVILCAS/CUSCO: 3.33%`, `CANAS/CUSCO: 4.47%`, `CONDORCANQUI/AMAZONAS: 5.53%`, `AZÁNGARO/PUNO: 5.9%`

**Extremos más KF** (candidata Fujimori)  
`PUTUMAYO/LORETO: 91.19%`, `MARISCAL RAMÓN CASTILLA/LORETO: 89.86%`, `CONTRALMIRANTE VILLAR/TUMBES: 88.29%`, `MAYNAS/LORETO: 88.72%`

**Alta varianza intra-dept:** Piura: `AYABACA=22.74%` vs `SULLANA=87.72%`

### Extranjero (idAmbitoGeografico=2) — Continentes

| ubigeo | Continente | KF% | RSP% | kf_r2_share |
|---|---|---|---|---|
| 910000 | ÁFRICA | 13.91 | 2.29 | 85.9% |
| 920000 | AMÉRICA | 18.85 | 2.98 | 86.3% |
| 930000 | ASIA | (pendiente) | | |
| 940000 | EUROPA | 36.66 | 0.54 | 98.6% |
| 950000 | OCEANÍA | (pendiente) | | |

> Nota: el primer test agrupaba los continentes diferente (América Norte,
> América Sur, etc.) — ese resultado era incorrecto. La agrupación real de
> ONPE es: África, América, Asia, Europa, Oceanía.

### Extranjero — Países (muestra: América 920000)

24 países en América. Ejemplo de códigos:

| ubigeo | País |
|---|---|
| 920100 | ANTILLAS HOLANDESAS |
| 920200... | ARGENTINA |
| ... | BOLIVIA, BRASIL, CANADÁ, CHILE, COLOMBIA... |

Patrón: `{contCode}{PP}00` donde PP es secuencial. Países dentro de América
van de 920100 a 920N00 (N = número de países).

### Extranjero — Ciudades (muestra: Antillas Holandesas)

```json
[{ "ubigeo": "920101", "nombre": "ARUBA" }]
```

Patrón: `{contCode}{PP}{ZZ}` — misma lógica que Perú.

**Resultados por país confirmados:** Keiko en Antillas Holandesas = 24.535% ✅
El endpoint `resumen-general/participantes` funciona con `idAmbitoGeografico=2`
hasta nivel_03 (ciudad).

### Consistencia de ubigeos entre niveles — CONFIRMADO

El sistema ONPE es consistente en todos los niveles:
- Dept `140000` (Lima) → prov `140100` (Lima-prov) → dist `140102` (Ancón), etc.
- Los distritos de Lima-prov tienen 43 entradas con prefijo `1401xx`.
- Pasar el código INEI `150100` (Lima en INEI) NO devuelve Lima — devuelve
  Loreto/Maynas (porque ONPE `150000` = Loreto). Esto confirma que el sistema
  ONPE se aplica de manera uniforme en todos los niveles.

**Regla:** obtener ubigeos siempre desde `/ubigeos/departamentos` → `/ubigeos/provincias`
→ `/ubigeos/distritos` en cadena. Nunca asumir el código INEI.

### ⚠️ Bug confirmado: `/ubigeos/provincias` falla para ubigeos 090000–250000

El endpoint `/ubigeos/provincias` devuelve **200 + HTML** (SPA index.html) para
todos los departamentos con ubigeo >= 090000, excepto Callao (240000).
Los departamentos 010000–080000 y 240000 devuelven JSON correctamente.

```
010000–080000, 240000  →  200 + JSON ✅
090000–250000 (exc 240000)  →  200 + HTML ❌ (SPA 404)
```

**No afecta la operación real:** `/ubigeos/distritos` funciona para TODOS
los departamentos sin excepción. Durante la noche del 7 de junio, usar la
lista de ubigeos ya cacheada en `r1_districts_baseline.json` en lugar de
llamar al endpoint de provincias en tiempo real.

### Distritos R1 2026 — baseline completo ✅

1892 distritos descargados el 2026-05-30. Guardado en `backend/data/r1_districts_baseline.json`.

| ubigeo | Departamento | Provs | Distritos |
|---|---|---|---|
| 010000 | Amazonas | 7 | 84 |
| 020000 | Áncash | 20 | 166 |
| 030000 | Apurímac | 7 | 85 |
| 040000 | Arequipa | 8 | 109 |
| 050000 | Ayacucho | 11 | 124 |
| 060000 | Cajamarca | 13 | 127 |
| 070000 | Cusco | 13 | 116 |
| 080000 | Huancavelica | 7 | 102 |
| 090000 | Huánuco | 11 | 84 |
| 100000 | Ica | 5 | 43 |
| 110000 | Junín | 9 | 124 |
| 120000 | La Libertad | 12 | 84 |
| 130000 | Lambayeque | 3 | 38 |
| 140000 | Lima | 10 | 171 |
| 150000 | Loreto | 8 | 54 |
| 160000 | Madre de Dios | 3 | 11 |
| 170000 | Moquegua | 3 | 21 |
| 180000 | Pasco | 3 | 29 |
| 190000 | Piura | 8 | 65 |
| 200000 | Puno | 13 | 110 |
| 210000 | San Martín | 10 | 78 |
| 220000 | Tacna | 4 | 28 |
| 230000 | Tumbes | 3 | 13 |
| 240000 | Callao | 1 | 7 |
| 250000 | Ucayali | 4 | 19 |

**Total: 25 depts / 196 provs / 1892 distritos**

---

## 9. Candidatos R2 — nombres y códigos

| Campo | Keiko Fujimori | Roberto Sánchez |
|---|---|---|
| `nombreCandidato` | `KEIKO SOFIA FUJIMORI HIGUCHI` | `ROBERTO HELBERT SANCHEZ PALOMINO` |
| `nombreAgrupacionPolitica` | `FUERZA POPULAR` | `JUNTOS POR EL PERÚ` |
| `codigoAgrupacionPolitica` | `8` | `10` |

> SANCHEZ sin tilde en la API. Buscar por `codigoAgrupacionPolitica` es más
> robusto que por nombre.

```javascript
const isKF  = c => c.codigoAgrupacionPolitica === 8;
const isRSP = c => c.codigoAgrupacionPolitica === 10;
// Fallback por nombre (si el id cambiara en R2):
const isKF_nombre  = c => (c.nombreCandidato||'').toUpperCase().includes('FUJIMORI');
const isRSP_nombre = c => (c.nombreCandidato||'').toUpperCase().includes('SANCHEZ')
                       && (c.nombreCandidato||'').toUpperCase().includes('ROBERTO');
```

---

## 10. Script completo de extracción (probado R1, listo para R2)

```javascript
const BASE = '/presentacion-backend';
const IE   = 11; // R2 — cambiar según /proceso/proceso-electoral-activo

async function g(path) {
  try {
    const r = await fetch(`${BASE}/${path}`, { signal: AbortSignal.timeout(15000) });
    if (r.status === 204 || r.status >= 400) return null;
    const text = await r.text();
    if (text.startsWith('<')) return null;
    const j = JSON.parse(text);
    return j?.data ?? j;
  } catch(e) { return null; }
}

// ── Catálogos geográficos ──────────────────────────────────────────
const getDepts    = ()           => g(`ubigeos/departamentos?idEleccion=${IE}&idAmbitoGeografico=1`);
const getProvs    = deptUbigeo   => g(`ubigeos/provincias?idEleccion=${IE}&idAmbitoGeografico=1&idUbigeoDepartamento=${deptUbigeo}`);
const getDists    = provUbigeo   => g(`ubigeos/distritos?idEleccion=${IE}&idAmbitoGeografico=1&idUbigeoProvincia=${provUbigeo}`);
const getContinentes = ()        => g(`ubigeos/departamentos?idEleccion=${IE}&idAmbitoGeografico=2`);
const getPaises   = contUbigeo   => g(`ubigeos/provincias?idEleccion=${IE}&idAmbitoGeografico=2&idUbigeoDepartamento=${contUbigeo}`);
const getCiudades = paisUbigeo   => g(`ubigeos/distritos?idEleccion=${IE}&idAmbitoGeografico=2&idUbigeoProvincia=${paisUbigeo}`);

// ── Resultados por nivel ───────────────────────────────────────────
const resDept = (dept)           => g(`resumen-general/participantes?idEleccion=${IE}&tipoFiltro=ubigeo_nivel_01&idAmbitoGeografico=1&idUbigeoDepartamento=${dept}`);
const resProv = (dept, prov)     => g(`resumen-general/participantes?idEleccion=${IE}&tipoFiltro=ubigeo_nivel_02&idAmbitoGeografico=1&idUbigeoDepartamento=${dept}&idUbigeoProvincia=${prov}`);
const resDist = (dept, prov, dist) => g(`resumen-general/participantes?idEleccion=${IE}&tipoFiltro=ubigeo_nivel_03&idAmbitoGeografico=1&idUbigeoDepartamento=${dept}&idUbigeoProvincia=${prov}&idUbigeoDistrito=${dist}`);
const resCont = (cont)           => g(`resumen-general/participantes?idEleccion=${IE}&tipoFiltro=ubigeo_nivel_01&idAmbitoGeografico=2&idUbigeoDepartamento=${cont}`);
const resPais = (cont, pais)     => g(`resumen-general/participantes?idEleccion=${IE}&tipoFiltro=ubigeo_nivel_02&idAmbitoGeografico=2&idUbigeoDepartamento=${cont}&idUbigeoProvincia=${pais}`);

// ── Actas por nivel ────────────────────────────────────────────────
const actasDept = (dept) => g(`resumen-general/totales?idEleccion=${IE}&tipoFiltro=ubigeo_nivel_01&idAmbitoGeografico=1&idUbigeoDepartamento=${dept}`);

// ── Extractor KF/RSP ──────────────────────────────────────────────
const pct = v => +(v ?? 0).toFixed(2);

function extractPair(arr) {
  if (!Array.isArray(arr) || !arr.length) return null;
  const kf  = arr.find(c => c.codigoAgrupacionPolitica === 8);
  const rsp = arr.find(c => c.codigoAgrupacionPolitica === 10);
  if (!kf && !rsp) return null;
  const kfV = kf?.totalVotosValidos ?? 0;
  const rspV = rsp?.totalVotosValidos ?? 0;
  const tot2 = kfV + rspV;
  return {
    kfPct:       pct(kf?.porcentajeVotosValidos),
    rspPct:      pct(rsp?.porcentajeVotosValidos),
    kfVotos:     kfV,
    rspVotos:    rspV,
    kf_r2_share: tot2 > 0 ? +(kfV / tot2 * 100).toFixed(1) : null,
  };
}
```

---

## 11. Flujo completo de descarga (todos los niveles)

```javascript
// Descargar jerarquía completa Perú en paralelo
async function downloadAll() {
  const depts = await getDepts();

  // Nivel 1: depts en paralelo
  const deptResults = await Promise.all(
    depts.map(async d => {
      const [cands, totales] = await Promise.all([resDept(d.ubigeo), actasDept(d.ubigeo)]);
      return { ...d, pair: extractPair(cands), actas: totales };
    })
  );

  // Nivel 2: provincias (secuencial por dept para no sobrecargar)
  const provResults = [];
  for (const dept of depts) {
    const provs = await getProvs(dept.ubigeo);
    if (!provs) continue;
    const pairs = await Promise.all(
      provs.map(async p => {
        const cands = await resProv(dept.ubigeo, p.ubigeo);
        return { ...p, deptUbigeo: dept.ubigeo, pair: extractPair(cands) };
      })
    );
    provResults.push(...pairs);
  }

  // Nivel 3: distritos (solo bajo demanda — demasiado volumen para descargar todo)
  // Llamar resDist(dept, prov, dist) individualmente cuando el usuario haga drill-down

  return { depts: deptResults, provs: provResults };
}
```

> Nota de rendimiento: ~25 depts × ~8 provs promedio = ~200 requests de nivel 2.
> A 2 req/s = ~100s. Hacer en paralelo con throttle (máx 10 concurrent).

---

## 12. Pendientes / Por confirmar

- [ ] **Confirmar idEleccion R2** — el 7 de junio, interceptar XHR del sitio
      cuando cargue los primeros resultados; confirmar que es 11
- [x] **Confirmar ubigeos/provincias** — el endpoint devuelve correctamente
      las provincias de Lima (140000) con prefijo `140xxx`. La confusión
      inicial era por usar el código INEI (140000=Lambayeque) en lugar del
      ONPE (140000=Lima). Resuelto.
- [x] **196 provincias R1 descargadas** — `backend/data/r1_province_baseline.json`
- [x] **1892 distritos R1 descargados** — `backend/data/r1_districts_baseline.json`
- [ ] **Lima Metropolitana vs Lima Provincias** — verificar si para la
      elección presidencial Lima aparece como una sola circumscripción (140000)
      o si hay separación. Actualmente aparece como una sola con 10 provincias.
- [ ] **Datos de actas por nivel** — probar `resumen-general/totales` con
      nivel_02 y nivel_03 para ver si devuelve % de actas por provincia/distrito
- [ ] **R2 candidatos** — confirmar que los `codigoAgrupacionPolitica` de
      Keiko (8) y Sánchez (10) se mantienen igual en idEleccion=11
- [ ] **Países extranjero con resultados** — confirmar `resPais(cont, pais)`
      funciona para todos los países (solo probamos estructura, no resultados)
- [ ] **idEleccion=15** — identificar a qué elección pertenece (¿Senadores DEM?)

---

## 13. Lo que NO funciona

| Endpoint / parámetro | Resultado | Nota |
|---|---|---|
| `ubigeoNivel1={code}` | Datos incorrectos o 204 | Parámetro obsoleto |
| `participantes-ubicacion-geografica-nombre` | Datos con parámetros distintos | `resumen-general/participantes` es el canónico |
| `geografico/ubigeos?...` | 200 HTML | SPA 404 — ruta no existe |
| `eleccion-presidencial/ubigeos?...` | 200 HTML | SPA 404 — ruta no existe |
| `/participantes` sin `idUbigeoProvincia` (nivel_02) | 500 | Requiere provincia explícita |
| Fetch desde dominio distinto | Status 0 / CORS | Correr desde ONPE o usar proxy |
| `resumen-general/participantes?tipoFiltro=nacional` | 204 | R1 archivado; probar en R2 |
