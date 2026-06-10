# CLAUDE.md — Peru Election Prediction Model 2026

Contexto persistente del proyecto. Actualizar cuando un hallazgo cambie la calibración o arquitectura.

---

## Stack y despliegue

| Capa | Tecnología | Hosting |
|---|---|---|
| Frontend | React 19 + Vite + Chart.js | Cloudflare Pages |
| Backend | Node.js/Express | Railway |
| DB | PostgreSQL | Railway |
| Monitoreo PM | Polymarket API | Railway (cron) |

**Comandos clave:**
```bash
# Backend
cd backend && npm run dev         # desarrollo (node --watch)
npm run db:seed                   # sembrar datos R1
psql $DATABASE_URL -f db/seed_r2.sql  # datos R2

# Frontend
cd frontend && npm run dev        # Vite dev server
npm run build                     # build producción

# Sandboxes de análisis
python3 scripts/sandbox_r1_pm_correction.py
python3 scripts/sandbox_r1_corrections.py
```

---

## Arquitectura del modelo (pipeline)

```
seed.sql / seed_r2.sql
     ↓
aggregator.js   → house effects + weighted average
     ↓
bayesian.js     → blend polls + Polymarket (Φ⁻¹ para R2)
     ↓
undecided.js    → redistribución de indecisos
     ↓
montecarlo.js   → 10,000 sims con t-Student df=4 + shocks
     ↓
pipeline.js     → orquesta todo, expone API REST
```

---

## Parámetros calibrados — NO cambiar sin evidencia

| Parámetro | Valor | Evidencia |
|---|---|---|
| σ base | 3.0pp | Calibrado contra R2 histórico peruano |
| σ dinámico | `√(9 + (días×0.30)²)` | A 20 días: ~6.7pp |
| λ decay pre-veda | 0.08 | Encuestas de 10d = 45% peso |
| λ decay veda/post-veda | 0.05 | Sin info nueva → no penalizar más; simulacros 29-30 may retienen ~70% el 7J |
| α R2 election day | 0.50 | Cap conservador: PM tiene sesgo estructural hacia candidato conocido en mercados de baja liquidez |
| α R2 veda inicio | 0.22 | Mismo techo que pre_veda — evita caída brusca al congelarse encuestas |
| α R1 máximo | ≤ 0.27 | α_r2 / √N_eff = 0.50/√5 |
| Voto oculto shock | +3 a +6pp | 10% sims, **solo Sánchez** en R2 |
| Shock líder negativo | -5 a -15pp | 15% sims |
| Shock #2 negativo | -5 a -12pp | 10% sims |
| Shock positivo | +5 a +12pp | 10% sims (efecto Castillo) |

---

## House effects actuales — aggregator.js

Calibrados con ONPE R1 2026. **Signo negativo = encuestadora subestima → corrige sumando.**

| Encuestadora | Keiko | Sánchez | Aliaga (R1) |
|---|---|---|---|
| Ipsos | +0.5pp | **-2.0pp** | -0.5pp |
| Datum | +0.8pp | **-2.0pp** | -0.8pp |
| IEP | **0.0pp** | **0.0pp** | -1.5pp |
| CPI | -0.5pp | **-2.0pp** | +1.2pp |
| CIT | +1.5pp | **-1.5pp** | +3.5pp |

Evidencia de calibración Sánchez:
- Ipsos R1: 8.57% vs ONPE 12.0% → gap -3.43pp → HE = -2.0pp (calibrado con R2)
- Datum R1: 7.45% vs ONPE 12.0% → gap -4.55pp → HE = -2.0pp (calibrado con R2)
- IEP R1 Sánchez: 9.6% vs ONPE 12.0% → gap -2.4pp (dentro MoE ±2.8pp) → HE = 0.0pp (referencia)
- IEP R1 Keiko: 14.4% vs ONPE 17.2% → gap -2.8pp (dentro MoE ±2.8pp) → HE = 0.0pp (referencia)
- Nota: valores IEP normalizados con pool=69.6% (top 11 cand. + Otros); PDF oficial IEP Mar II-26.
  La normalización anterior (pool=56.6%) inflaba los valores ~23% — corregido 24 may 2026.
- IEP es encuestadora de referencia: HE = 0.0pp para todos los candidatos R2
- Cross-check R2 (IEP ref pura = S+1.6pp): con -2.0pp Ipsos/Datum convergen
  en K+0.8-2.0pp para polls de mayo — consistente con race genuinamente ajustada.

---

## Índices de sesgo rural (para correcciones R1)

Basados en patrón Castillo 2021 (subestimación rural -6.2pp):

| Candidato | Índice rural | Base electoral |
|---|---|---|
| Roberto Sánchez | 1.0 | Sierra sur/central |
| Ricardo Belmont | 0.6 | Lima + sierra |
| Jorge Nieto | 0.4 | Perfil mixto |
| Keiko Fujimori | 0.0 | Lima / costa |
| R. López Aliaga | 0.0 | Lima urbano |

---

## Hallazgos clave R1 2026 (POST_MORTEM_2026.md)

### Qué falló
1. **PM raw como vote share**: se usó `P(ganar)` directamente como `%votos`. Ratio Keiko: 45.5% PM / 17.2% ONPE = **2.65x**. Keiko llegó al modelo con 30% predicho vs 17.2% real.
2. **Sesgo rural ignorado**: encuestas subestimaron candidatos rurales 3-5pp (R1 fue el Castillo 2026).
3. **α=0.77 en R1**: demasiado alto para una carrera de N=26 candidatos.

### MAE real por encuestadora (última pre-veda)
Verificado con verificación profunda (24 may 2026). Poll = última encuesta permitida de cada casa.
MAE calculado sobre 6 candidatos: Keiko, Sánchez, Aliaga, Nieto, Belmont, Álvarez.

| Encuestadora | Poll (campo) | MAE vs ONPE |
|---|---|---|
| IEP | 28–30 mar | **2.3pp** ✅ |
| Ipsos | 3–4 abr intención | **3.6pp** ⚠️ |
| CPI | 3–4 abr simulacro | **3.8pp** ⚠️ |
| Datum | 1–4 abr intención | **3.9pp** ⚠️ |
| CIT | 30 mar–1 abr simulacro | **4.9pp** ⚠️ |

CPI mejoró de 6.4pp (poll 21-23 mar) a 3.8pp en su simulacro final. CIT era un simulacro más reciente de lo previsto (n=1500 vs n=1220 del 20-23 mar). Belmont estaba en todos los polls; datos anteriores lo omitían por error. Carlos Álvarez sobreestimado por TODOS los polls (+2.7 a +5.7pp) — su colapso fue detectado solo por Polymarket en tiempo real.

### Contrafactual: qué hubiera dado (sandbox_r1_corrections.py)
| Corrección | MAE |
|---|---|
| Modelo real (α=0.77, PM raw) | 4.00pp |
| + N-scaling (α=0, sin PM) | 3.26pp |
| + Rural bias (+3pp × índice) | 2.62pp |
| + IEP dominante (peso ×2) | **1.59pp** |

### Por qué Φ⁻¹ R2-style NO funciona en R1
En R2 (binaria): `base = 50%`, conversión directa.  
En R1 (N=26): `base = 100/26 = 3.85%` → todos los candidatos quedan con implied ~3-4% → MAE 8.59pp (catastrófico).

### El problema Aliaga
Aliaga aparece ~+3pp en todas las encuestas pre-R1. Sin corrección (modelo correcto) se infla. En el modelo real, dos errores se cancelaban (PM lo bajaba). **No hay solución limpia sin datos de campo adicionales.**

---

## Convenciones del código

- **Candidato R2**: nombre exacto `'Roberto Sánchez Palomino'` y `'Keiko Fujimori'`
- **Valid-vote normalization**: `raw_pct / declared_pool × 100` (ver aggregator.js)
- **MAE**: métrica primaria de precisión. Target: ≤3.5pp ✅, ≤4.5pp ⚠️, >4.5pp ❌
- **Errores con signo**: `pred - actual`. Positivo = sobreestima. Negativo = subestima.
- Nombres de archivo sandboxes: `scripts/sandbox_r1_*.py`
- Sección docs en español, código en inglés/español mezclado (legacy)

---

## Estado actual del modelo R2

- [x] Φ⁻¹ para conversión PM→voteShare (bayesian.js `pmWinProbToVoteShare`)
- [x] σ=3.0, t-Student df=4 (fat tails)
- [x] Decay λ=0.08/0.12, pool normalization
- [x] House effects Sánchez calibrados con ONPE R1 ✅ (commit d9c9609)
- [x] Voto oculto Sánchez-específico por nombre ✅ (commit d9c9609)
- [x] N-scaling α: pre_veda 0.20-0.22, veda →0.50, election_day 0.50 (rebajado de 0.60: PM sesgo estructural Keiko)
- [x] Cholesky para errores correlacionados entre encuestadoras
- [x] seed_r2.sql: Ipsos ×1.30, Datum ×1.05 (mejor desempeño R1 en R2)
- [x] Encuesta IEP mayo 22-26 ingresada (KF 36%, RSP 30%, n=1204) — nota metodológica: B/N no se leyó como opción → 6% espontáneo (no comparable con abr 24%)
- [x] CIT mayo 14-17 simulacro ingresado (KF 40.5% RSP 36.0% B/N 23.5% n=1220) — en seed_r2.sql, auto-insertado en cada deploy
- [x] CIT mayo 26-29 ingresado (KF 41.1% RSP ~33.4% B/V 14.2% NS/NR 12.3% n=1220) — en seed_r2.sql, última CIT antes de veda (31 may)
- [x] Datum mayo 26-30 ingresado (simulacro KF 39.7%/RSP 35.4%, n=1501, ±2.5pp) — última encuesta Datum antes de veda
- [x] **Phase 1 — Projector estratificado** (commit en PR #131): `electionNightProjector.js` extiende shift a 3 granularidades (district → province → dept → naive). Backtest R1: shift=0.00pp ✅, district 1270 units / 3,766,559 VV R1. Nuevas columnas DB: `province_breakdown`, `district_breakdown` en `onpe_live_snapshots`; `province_shifts`, `district_shifts`, `shift_granularity` en `r2_election_projections`.
- [x] **Phase 2 — API routes** (PR #131): `inject-snapshot` almacena province/district breakdown; `live-projection` devuelve `provinces[]`, `districts[]`, `shift_granularity`
- [x] **Phase 3 — Bookmarklet extendido** (PR #131): recoge 196 provincias + 1518 distritos con throttle 20/25 concurrent. Catálogos hardcodeados para evitar bug ONPE `/ubigeos/provincias`.
- [x] **Phase 4 — LiveResultsTab drill-down** (PR #131): panel de dept → lista de provincias → lista de distritos en modo live; `ShiftBadge` ±pp; `StatusBar` muestra granularidad activa.
- [x] `startup.js` migraciones idempotentes (`ALTER TABLE ... ADD COLUMN IF NOT EXISTS`) para columnas province/district en Railway live DB
- [ ] Pesos IEP en seed_r2.sql: verificar que refleja desempeño R1 (cerca a ONPE)
- [ ] Encuesta CIT mayo 2026 — buscar e ingresar si ya fue publicada

### Mecanismo de auto-inserción de encuestas
`startup.js → autoMigrate()` ejecuta `seed_r2.sql` en **cada deploy** de Railway (no solo
la primera vez). Todas las encuestas R2 deben vivir en `seed_r2.sql` para insertarse
automáticamente. El endpoint `/api/force-run` también las inserta, pero solo al llamarlo
manualmente. La deduplicación es idempotente (IF NOT EXISTS por pollster + field_end).

---

## Archivos críticos

| Archivo | Propósito |
|---|---|
| `backend/model/aggregator.js` | House effects + weighted aggregation |
| `backend/model/bayesian.js` | Blend polls+PM, Φ⁻¹ conversion |
| `backend/model/montecarlo.js` | 10k sims, shocks, voto oculto |
| `backend/model/weights.js` | α schedule, λ decay |
| `backend/model/electionNightProjector.js` | Motor de proyección noche electoral — HÍBRIDO: shift estratificado (v1) hasta 88% actas + cola JEE desde 92% (`_jeeBlocks()`, `_bootstrapJEE()`, blend `tail_w`). Contabilidad real: universo 92,766 actas, VV/acta vivo, exterior por actas-país |
| `scripts/test_projector_v2_backcast.js` | Suite de aceptación del híbrido: backcast sobre los 711 snapshots reales R2 (`scripts/data/snapshots_export_r2_2026.json.gz`). Correr SIEMPRE antes de tocar el projector |
| `backend/db/seed_r2.sql` | Pesos encuestadoras R2 |
| `backend/db/r2_projections.sql` | Tabla proyecciones noche electoral |
| `backend/data/r1_exterior.json` | Baseline exterior R1 (86.78% KF, 77 países) |
| `backend/data/r1_zda_dept_model.json` | Modelo ZDA por dept (25 depts, fuentes A/B/C/D) |
| `backend/data/r1_province_baseline.json` | Baseline provincial R1 (196 provincias, 100% cobertura) |
| `backend/data/r1_districts_flat.json` | Baseline distrital R1 (1886/1892 con datos reales r1_2026 — el proxy 2021 fue reemplazado) |
| `frontend/public/r1_districts_flat.json` | Copia pública para panel distrital del mapa (lazy-load) |
| `scripts/verify_r2_onpe.js` | Verificación pre-electoral (correr 7J ~19:45 PET) |
| `scripts/onpe_bookmarklet.js` | Script de noche electoral — correr en browser ONPE para relay a Railway. Recoge nacional + 25 depts + 196 provincias + **1886 distritos** + exterior. PROV_CATALOG y DIST_CATALOG hardcodeados (evita bug `/ubigeos/provincias`). |
| `POST_MORTEM_2026.md` | Análisis completo post R1, incluye §8 contrafactual |
| `ELECTION_NIGHT_PLAN.md` | Especificación técnica projector (metodología, activación) |
| `ONPE_API.md` | Documentación ingeniería inversa ONPE API |
| `scripts/sandbox_r1_corrections.py` | Pruebas de correcciones (MAE 4.00→1.59pp) |
| `scripts/build_proxy_districts_2021.py` | Rellena 374 baselines distritales faltantes usando proxy 2021 R2; 368/374 matched (98.4%). Aliases: CAPASO↔CAPAZO, ESTIQUE PAMPA↔ESTIQUE-PAMPA, RAIMONDI↔RAYMONDI |
| `scripts/sandbox_r2_backtest_2021.py` | Backtest real R2 2021 con datos jmcastagnetto. Valida: al 42% actas, proyector -1.0pp vs raw +3.0pp |
| `scripts/sandbox_election_night_2021.py` | Simula noche electoral 2021 minuto a minuto con timestamps reales de noticiarios. Calibra expectativas para 7J 2026. |
| `frontend/src/components/tabs/BacktestingTab.jsx` | Visualización histórica |
| `frontend/src/components/tabs/LiveResultsTab.jsx` | Tab 7J Resultados — mapa, panel drill-down (dept→provincia→distrito en live), tabla, needle. `ShiftBadge` ±pp, `StatusBar` con granularidad activa. |
| `frontend/src/components/PeruDeptMap.jsx` | Mapa SVG departamental (react-simple-maps, matching por nombre) |

---

## Hallazgos verificados — proyector noche electoral

### Nacional ONPE incluye exterior
Verificado el 30 may 2026: `province_baseline sum (25 depts) = 58.46%` y
`province + r1_exterior = 58.81%` — el total nacional publicado por ONPE incluye
los votos del exterior. El endpoint `tipoFiltro=nacional` los embebe.

Consecuencia: cuando se obtiene `keiko_votos` del nacional endpoint en R2, ya trae
los votos del exterior. El projector los resta vía `ext_breakdown` para obtener
`dom_kf_r2_share` limpio antes de calcular el shift.

Constantes en `electionNightProjector.js`:
- `R1_KF_R2_SHARE_DOMESTIC = 58.46` — usado como baseline del shift (correcto)
- `R1_KF_R2_SHARE_NATIONAL = 58.81` — referencia solo

### Impacto de la separación exterior
A 40% de actas con el exterior ya completamente contado (caso típico: mesas
exteriores cierran primero por husos horarios), no separar el exterior produce
un sesgo de **+0.85pp** en el kf_r2_share proyectado (sobreestima KF). La
separación correcta elimina esa contaminación.

### Shift estratificado — umbrales de granularidad

El projector auto-selecciona la granularidad más fina con suficiente masa de votos R1:

| Nivel | Activación | Requisitos mínimos |
|---|---|---|
| district | 1270 units, 3.77M VV | ≥50 units reportando AND ≥2,000 VV R1 acumulados |
| province | 196 units, — VV | ≥15 units AND ≥5,000 VV R1 |
| dept | 25 units, — VV | ≥3 units AND ≥5,000 VV R1 |
| naive | fallback | cualquier snapshot sin masa suficiente |

Backtest con datos finales R1 reales (KF 2,877,678 / RSP 2,015,114):
- `shift_granularity: district` (1270 units, 3,766,559 R1 VV) ✅
- `observed_kf_r2_share: 58.81%` (nacional ONPE) ✅
- `dom_kf_r2_share: 58.46%` (sin exterior) ✅
- `national_shift: 0.00pp` ✅
- Proyección final dentro de ±1.5pp ✅

Funciones: `_shiftFromBreakdown(breakdown, baseline, minVV)` genérica; `_computeStratifiedShift()` orquesta jerarquía.

### ZDAs siempre proyectadas desde snapshot 1
Las 4,703 mesas ZDAs (900001–904703) están **siempre pre-bakeadas** en la
proyección desde el primer snapshot. No hay "activación" en ningún umbral.
- Antes de que reporten: proyectadas al 28.2% + shift nacional
- Cuando reportan (~94%): sus valores reales reemplazan el prior
- El campo `zda.always_projected = true` lo confirma en la API
- La variación al llegar sus datos reales es acotada por el CI bootstrap

---

## Noche electoral — relay ONPE (7J 2026)

### Problema confirmado (30 may 2026)
La API ONPE `/presentacion-backend/*` **solo funciona same-origin** desde dentro del
browser en `resultadoelectoral.onpe.gob.pe`. Desde Railway (Node.js externo) o
cualquier servidor externo, el Nginx de ONPE devuelve el HTML del SPA Angular con
HTTP 200 como catch-all — nunca el JSON real. Incluso con headers `Origin`/`Referer`
correctos.

Consecuencia: `ONPE_POLLING_ENABLED=true` en Railway **nunca producirá datos** —
el cron siempre obtendrá HTML y `has_data` se mantendrá `false`.

### Solución implementada
**Relay browser → Railway:**

1. `POST /api/admin/inject-snapshot` (nuevo endpoint en Railway)
   - Protegido por `Authorization: Bearer <ADMIN_SECRET>`
   - Recibe snapshot, guarda en `onpe_live_snapshots`, corre proyector
   - Setup requerido: `ADMIN_SECRET=<random 32 chars>` en Railway env vars

2. `scripts/onpe_bookmarklet.js` (correr en DevTools Console en el sitio ONPE)
   - Desde dentro del dominio ONPE, los fetches son same-origin → funcionan
   - Recoge: nacional + totales + 25 depts + **196 provincias** + **1518 distritos** + exterior
   - POST a Railway cada 2 minutos (auto-loop). Tiempo por poll: ~15-20s (throttle 20/25 concurrent)
   - Contiene versión minificada como bookmarklet de barra de favoritos
   - Catálogos `PROV_CATALOG` y `DIST_CATALOG` hardcodeados — evita bug de ONPE:
     `/ubigeos/provincias` devuelve HTML (SPA 404) para depts `090000–250000`;
     `/ubigeos/distritos` sí funciona para todos pero los catálogos embebidos
     eliminan 196 requests extra y garantizan cobertura idéntica al baseline R1

### Checklist pre-7J
- [x] Set `ADMIN_SECRET` en Railway Environment Variables — **ya configurado** (rotar si se compromete)
- [ ] El 7J: editar `RAILWAY_URL` y `ADMIN_SECRET` reales al inicio de `scripts/onpe_bookmarklet.js` SOLO en tu copia local — NUNCA commitear los valores reales
- [x] `VITE_API_URL` en Cloudflare Pages → Settings → Environment Variables (ver `frontend/.env.example`)
- [ ] Confirmar `idEleccion` R2 el 7J: interceptar XHR en sitio ONPE → buscar `idEleccion=XX` en las llamadas (esperado: 11)
- [ ] A las 20:00 PET del 7J: abrir ONPE, pegar script en DevTools Console
- [ ] Verificar primer POST exitoso (console.log `✅ Guardado. snapshot_id=X`)
- [ ] NO activar `ONPE_POLLING_ENABLED` en Railway — inútil y consume compute

### Cobertura distrital (panel mapa)
`frontend/public/r1_districts_flat.json`: 1892 distritos, **1886 con kf_r2_share (99.7%)**.
Los 368 antes faltantes fueron re-colectados con datos reales R1 2026 (`source: 'r1_2026'`)
— ya NO se usa proxy 2021. Solo 6 distritos con cero votos bilaterales; usan fallback
provincia/dept en el proyector — correcto.
DIST_CATALOG en bookmarklet extendido de 1518 → 1886 ubigeos para colectar datos en vivo el 7J.

### Projector híbrido (implementado 10-jun, validado con backcast de 711 snapshots)
- **Universo real de actas R2 2026: 92,766** (90,223 dom + 2,543 ext, ONPE oficial) —
  NO los 97,421+2,543 en mesas del plan pre-electoral. VV/acta real ≈ 200 (no 174).
  El projector usa `snapshot.actas_total` con fallback a la constante `ACTAS_TOTAL_R2`.
- **Cola JEE** (`tail_w`: 0 hasta 88% de actas, 1 desde 92%): a ese nivel el restante
  doméstico es el pool de actas observadas en JEE (2026: ~1,580; Lima 919 + Callao 69 +
  Piura 68 — 67% en plazas KF). Son errores formales urbanos → se proyectan a
  cum local + h(−1pp) con merma f(10%). Precedente 2021: el tramo 99.888%→100% rompió
  a nivel local o por encima (gap 50,989→44,058 pro-KF).
- **Penalización de actas tardías** (medida con votos exactos, ventana 92→97%): la cola
  RURAL corre muy por debajo del cum del dept (Piura −29pp, Amazonas −25pp, mediana −7pp).
  NO confundir con las observadas JEE — son poblaciones distintas. El marginal de Lima
  93→96.8% fue 56.7% (cola rural), pero sus 919 observadas urbanas ≈ cum 63.5%.
- **Exterior**: restante por actas-país (`pais.totalActas × ext_vpam_live × (1−pct)`),
  no constante global. Países sin datos heredan el shift EXTERIOR medido en vivo
  (−22.5pp en 2026), no el doméstico (−11.5pp). Deriva tardía intra-país −2pp×(1−pct).
- prob_win capeado a 99 — nunca afirmar 100% con actas pendientes.
- Validación: `node scripts/test_projector_v2_backcast.js` (6 checks de aceptación).
  Al 97.16%: híbrido **50.11% CI[50.03, 50.19] prob 99** vs v1 50.02 CI[50.00,50.05]
  (banda verdad modelo JEE: 50.08-50.12; DATAdaf 50.16).
- DB: unique index `idx_r2_proj_snapshot_unique` + dedupe en `startup.js` (los duplicados
  1-18× del historial venían de corridas concurrentes de `re-project-all`).

### API endpoints nuevos (7J)
| Endpoint | Propósito |
|---|---|
| `GET /api/live-projection` | Adapter frontend: traduce salida del proyector al shape que LiveResultsTab espera |
| `POST /api/admin/inject-snapshot` | Relay noche electoral: recibe snapshot del browser, guarda y proyecta |

### Esquema DB — columnas añadidas (PR #131)

**`onpe_live_snapshots`:**
- `province_breakdown JSONB` — array de `{ubigeo, deptUbigeo, keiko_votos, sanchez_votos}` (196 provincias)
- `district_breakdown JSONB` — array de `{ubigeo, keiko_votos, sanchez_votos}` (1518 distritos)

**`r2_election_projections`:**
- `shift_granularity VARCHAR(20)` — `'district'` | `'province'` | `'dept'` | `'naive'`
- `province_shifts JSONB` — shift per-province con fallback chain
- `district_shifts JSONB` — shift per-district con fallback chain

Migraciones idempotentes en `startup.js → autoMigrate()` para Railway live DB (no requieren rollback manual).

---

## Calibración noche electoral — backtest 2021 (sandbox_election_night_2021.py)

### Cronología real 6-7 junio 2021 (fuente: RPP/Gestión/La República live blogs)

| Hora PET | % Actas | Raw KF% | Proyector KF% | Error proy |
|---|---|---|---|---|
| 23:04 Jun 6 | 42.0% | **52.9%** | ~47.5% | -2.2pp |
| 02:38 Jun 7 | 80.7% | 51.5% | ~49.0% | -0.7pp |
| 04:12 Jun 7 | 86.5% | 50.8% | ~49.2% | -0.5pp |
| 05:30 Jun 7 | 88.2% | 50.4% | ~49.5% | -0.2pp |
| 09:06 Jun 7 | 91.2% | 50.1% | ~49.4% | -0.3pp |
| **11:29 Jun 7** | **92.6%** | **49.9%** | ~49.5% | Raw flip aquí |
| 13:04 Jun 7 | 93.0% | 49.875% | ~49.5% | -0.2pp |

**Keiko celebró toda la noche porque el raw la mostraba ganando de 23:04 hasta las 11:29 AM (12.5 horas).
El proyector habría mostrado a Castillo ganando desde el primer snapshot.**

### Sesgo Lima-primero (2021)
- Lima+Callao = **39.5% del VV total**, reporta primero (delay 0.00-0.05)
- Lima R2 KF: 64.8% → al dominar el conteo inicial, infla el raw KF en ~3pp
- Sierra Sur = 12.5% del VV, reporta último (delay 0.68-0.93), KF ~15% en 2021
- Diferencial Lima vs Sierra Sur: **-7.7pp** de shift entre regiones

### Errores del proyector por milestone (2021 R2, n=1835 distritos)
| % Actas | Error proyector vs final |
|---|---|
| ~40% (11 PM) | ±2.2pp (simulado, Lima-first puro) |
| ~80% (3 AM) | ±0.7pp |
| ~88% (6 AM) | ±0.2–0.5pp |
| ~92% (11 AM) | ±0.2pp |

*Nota: el error simulado al 40% es mayor que el backtest porque la simulación pone Lima 100% primero; en realidad también llegan distritos mixtos en ese rango, lo que mejora el proyector.*

### Efectos geográficos para 2026
- **Arequipa**: 2021 shift R1→R2 = **+20pp para KF** (fuente: De Soto 18.7% + Aliaga + derecha anti-Castillo se consolidaron detrás de KF; Mendoza/Lescano fueron a Castillo). R2 2021 final: Castillo **64.9%** / KF **35.1%** (margen ~30pp). En 2026 el patrón es INVERSO: Nieto 18.7% + Belmont 10.9% + Aliaga 10.6% → RSP. Esperamos shift NEGATIVO grande para KF en Arequipa.
- **Puno**: 2021 R1 KF=6.2%, R2 KF=10.7% (pro-Castillo). En 2026 será pro-Sánchez. Reporta tarde (delay 0.68) → proyector corregirá cuando entren sus datos.
- **Lima+Callao**: El bias de reporte temprano es estructural, igual en 2026.

### Cronología esperada 7J 2026 (basada en 2021)
| Hora PET | Evento |
|---|---|
| 16:00 | Cierran urnas |
| ~23:00 | Primer snapshot ONPE (~40-45% actas) — bookmarklet activo |
| ~03:00 | ~80% actas |
| ~06:00 | ~88-90% actas |
| ~11:00 | ~92% actas (zona de resolución si margen pequeño) |
| +1 día | Votos impugnados / exterior completado |

### Umbrales para llamar la carrera (proyector)
- **≥3pp al 40% (~11 PM)** → llamable con confianza razonable
- **≥2pp al 80% (~3 AM)** → llamable con alta confianza
- **≥0.5pp al 90% (~6 AM)** → definitivo (< 0.5pp error esperado)

**NO usar raw count para llamar la carrera** — el raw en 2021 estuvo 12.5 horas equivocado.

---

## Análisis de validación del shift estratificado (scripts/analyze_shift_2021.py)

### Hallazgos clave — datos reales jmcastagnetto 2021 (1835 distritos)

| Métrica | Valor |
|---|---|
| Correlación R1 bilateral → R2 bilateral | **0.928** |
| R² (R1 predice R2) | **0.773** |
| Shift nacional medio (ponderado VV) | **-0.35pp** (≈ cero) |
| MAE asumiendo shift=0 | **6.99pp** |
| MAE con shift regional uniforme | **5.51pp** (21% mejora) |
| MAE con shift departamental uniforme | **4.32pp** (38% mejora) |

**Conclusión**: R1 bilateral es buen prior para R2 (corr=0.928), pero asumir shift=0 da 7pp de error. Aplicar shift por dept reduce a 4.32pp. El shift varía enormemente por dept — no es uniforme.

### Shifts por dept 2021 (los más extremos)
| Dept | R1 KF% | R2 KF% | Shift |
|---|---|---|---|
| Loreto | 76.5% | 52.7% | **-23.8pp** |
| Tumbes | 82.4% | 65.9% | **-16.6pp** |
| Piura | 72.5% | 60.0% | **-12.5pp** |
| Arequipa | 15.1% | 35.1% | **+20.0pp** |
| Tacna | 15.2% | 28.8% | **+13.6pp** |
| Moquegua | 13.4% | 26.8% | **+13.5pp** |
| Lima | 67.0% | 64.6% | **-2.4pp** |

**Para 2026**: el patrón por dept será diferente (R2 es KF vs RSP, no KF vs Castillo). La magnitud de los shifts puede ser similar pero las direcciones cambian según cómo migran Aliaga/Nieto/Belmont en cada región.

### Problema crítico: producción vs sandbox

El sandbox (`sandbox_r2_backtest_2021.py`) usa **shifts por dept** en la proyección:
```python
shift = dept_shift.get(d['dept'], nat_shift)  # dept-específico, fallback a nacional
```

El projector de producción (`electionNightProjector.js`) usa **un único shift nacional** para todos los distritos pendientes. El backtest fue validado con la versión correcta (dept-level), pero production corre con la versión menos precisa.

### Problema de simulación de llegada (señalado por @chubakueno)

El sandbox simula llegada con `dept_delay + Normal(0, σ=0.07)`. Con σ=0.07:
- Un distrito de Lima puede llegar en t=0.14 (tarde)
- Un distrito de Cajamarca puede llegar en t=0.35 (pronto)
- Esto no es realista: en la realidad Lima llega como **bloque** antes de que la sierra empiece

Consecuencia: el error estimado al 40% (~±2.2pp) puede ser **optimista**. Con llegada más extrema (Lima 100% antes de cualquier sierra), el shift nacional al 40% estaría más contaminado por Lima, y el error real podría ser mayor.

### Corrección importante — mejora dept-shift en tiempo real vs oracle

El análisis `analyze_shift_2021.py` mostraba MAE 6.99pp → 4.32pp (38%) con dept-shift.
**Ese número asume conocer los shifts finales de cada dept (oracle).** En tiempo real:
- Al 40% de actas: dept-shift mejora solo **0.15pp** vs shift nacional
- Razón: a 40%, los depts con shifts grandes (Arequipa +20pp, Loreto -24pp) tienen pocos
  distritos reportando → estimación ruidosa. 42.7% del VV pendiente cae a fallback nacional.
- La mejora crece progresivamente conforme llegan más datos (60-80% actas)

El proyector actual ya reduce el error del raw en **~85%** desde el primer snapshot:
- Raw at 40%: +14pp de error vs final
- Proyector actual at 40%: ~-2.1pp de error vs final

### Fixes implementados (commit 158a21a — 4 jun 2026)

**Bug #1 — CI centrado en raw, no en proyección (CRÍTICO — silencioso)**
`_bootstrapCI()` usaba `obs_kf_r2_share` (raw) como centro del bootstrap en vez de
`reg_proj_kf_r2` (proyección corregida). A 40% actas Lima-first producía CI [73%, 83%]
cuando lo correcto era [41.5%, 51.7%]. **Fijo: CI ahora centrado en la proyección.**

**Bug #2 — Shift nacional uniforme para todos los depts (MEJORADO)**
`reg_proj_kf_r2` ahora es promedio ponderado por VV de proyecciones por dept:
cada dept usa su propio shift observado; si no hay datos suficientes, cae al shift nacional.
VV restante por dept estimado como `max(0, r1_bilateral_vv - reported_r2_pair)`.

**Ubigeos ONPE (≠ INEI) — crítico para mocks y tests**
El sistema usa ubigeos propios de ONPE (confirmado en ONPE_API.md):
- Lima = `140000`, Callao = `240000`, Arequipa = `040000`
- ICA = `100000`, Puno = `200000`, Loreto = `150000`
- **NO** usar INEI (donde Lima sería 150000)

**Bug #3 — Fallback nacional contamina depts sin datos (CRÍTICO — corregido)**
Depts sin datos usaban `national_shift` (Lima-contaminado) como fallback, en vez de `0pp`.
El shift nacional R1→R2 es ≈0 globalmente; aplicar el shift de Lima (-2.7pp) a la sierra era
estrictamente peor. Cambio: `deptShiftMap.get(ubigeo) ?? 0` en vez de `?? national_shift`.
Mismo fix en `sandbox_r2_backtest_2021.py` para consistencia.

**Validación final (backtest 2021, todos los fixes combinados):**
| % Actas | Raw error | Proyector error | Mejora vs raw |
|---|---|---|---|
| 5% | +10.6pp | **+0.13pp** | 80× |
| 10% | +14.6pp | **+0.16pp** | 91× |
| 40% | +14.3pp | **-0.70pp** | 20× |
| 80% | +6.3pp | **-0.71pp** | 9× |

CI 95%: [43.7, 53.9] @40% · width 10pp @40%, 2.1pp @80%, 16pp @5% ✅
A 5-10% actas (solo Lima reportando): error ~0.15pp vs 3pp antes del fix ✅

### Verificación del relay (Priority 1 — hacer antes del 7J)
Script: `node scripts/verify_relay.js` (sin vars = localhost:3000 con secret "test-secret")
Con Railway: `RAILWAY_URL=https://xxx.railway.app ADMIN_SECRET=xxx node scripts/verify_relay.js`
Tests: OPTIONS preflight CORS, 401 sin auth, 401 con auth incorrecta, POST vacío, POST snapshot real.

### Sigma del sandbox (análisis en curso — scripts/analyze_sigma_arrival.py)
σ=0.07 permite mezcla artificial entre depts. Con llegada bloc (Lima como bloque puro),
el error al 40% puede ser mayor que ±2.2pp. El análisis MC cuantifica el rango realista.
**Implicación**: si el margen real es ~0.5-1pp, el proyector podría tener incertidumbre
sobre el ganador al primer snapshot incluso con los fixes de hoy.
