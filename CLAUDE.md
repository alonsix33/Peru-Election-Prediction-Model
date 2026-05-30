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
| λ decay post-veda | 0.12 | Más agresivo sin encuestas nuevas |
| α R2 election day | 0.60 | N-scaling desde α_r2_max |
| α R1 máximo | ≤ 0.27 | α_r2 / √N_eff = 0.60/√5 |
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
- [x] N-scaling α: pre_veda 0.20-0.25, veda →0.60, election_day 0.60
- [x] Cholesky para errores correlacionados entre encuestadoras
- [x] seed_r2.sql: Ipsos ×1.30, Datum ×1.05 (mejor desempeño R1 en R2)
- [x] Encuesta IEP mayo 22-26 ingresada (KF 36%, RSP 30%, n=1204) — nota metodológica: B/N no se leyó como opción → 6% espontáneo (no comparable con abr 24%)
- [ ] Pesos IEP en seed_r2.sql: verificar que refleja desempeño R1 (cerca a ONPE)

---

## Archivos críticos

| Archivo | Propósito |
|---|---|
| `backend/model/aggregator.js` | House effects + weighted aggregation |
| `backend/model/bayesian.js` | Blend polls+PM, Φ⁻¹ conversion |
| `backend/model/montecarlo.js` | 10k sims, shocks, voto oculto |
| `backend/model/weights.js` | α schedule, λ decay |
| `backend/model/electionNightProjector.js` | Motor de proyección noche electoral (3 estratos) |
| `backend/db/seed_r2.sql` | Pesos encuestadoras R2 |
| `backend/db/r2_projections.sql` | Tabla proyecciones noche electoral |
| `backend/data/r1_exterior.json` | Baseline exterior R1 (86.78% KF, 77 países) |
| `backend/data/r1_zda_dept_model.json` | Modelo ZDA por dept (25 depts, fuentes A/B/C/D) |
| `backend/data/r1_province_baseline.json` | Baseline provincial R1 (196 provincias, 100% cobertura) |
| `backend/data/r1_districts_flat.json` | Baseline distrital R1 (1518/1892 con datos) |
| `scripts/verify_r2_onpe.js` | Verificación pre-electoral (correr 7J ~19:45 PET) |
| `POST_MORTEM_2026.md` | Análisis completo post R1, incluye §8 contrafactual |
| `ELECTION_NIGHT_PLAN.md` | Especificación técnica projector (metodología, activación) |
| `ONPE_API.md` | Documentación ingeniería inversa ONPE API |
| `scripts/sandbox_r1_corrections.py` | Pruebas de correcciones (MAE 4.00→1.59pp) |
| `frontend/src/components/tabs/BacktestingTab.jsx` | Visualización histórica |

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

### ZDAs siempre proyectadas desde snapshot 1
Las 4,703 mesas ZDAs (900001–904703) están **siempre pre-bakeadas** en la
proyección desde el primer snapshot. No hay "activación" en ningún umbral.
- Antes de que reporten: proyectadas al 28.2% + shift nacional
- Cuando reportan (~94%): sus valores reales reemplazan el prior
- El campo `zda.always_projected = true` lo confirma en la API
- La variación al llegar sus datos reales es acotada por el CI bootstrap
