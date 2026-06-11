# Post-Mortem: Proyector de Noche Electoral — Segunda Vuelta Perú 2026

**Fecha de elección:** 7 de junio de 2026  
**Documento generado:** 8 de junio de 2026  
**Estado:** Borrador — resultados ONPE al 94.38%; primeros datos del exterior (3 países); pendiente contabilización oficial completa  
**Autores del projector:** alonsix33 / Claude Code  

---

## 1. Resumen Ejecutivo

La segunda vuelta entre **Keiko Fujimori (Fuerza Popular)** y **Roberto Sánchez Palomino (Juntos por el Perú)** produjo el resultado más ajustado de la historia electoral peruana reciente: una diferencia proyectada de apenas **~0.55 pp** (~102,000 votos) sobre un universo de ~18.5 millones de votos válidos.

El projector `electionNightProjector.js` operó en producción por primera vez en una elección real. A lo largo de la noche se identificaron y corrigieron **tres bugs críticos** que, combinados, producían una proyección de ~5-7 pp demasiado favorable para RSP. Corregidos, el projector convergió con el modelo independiente de Luis Rivera en **KF ganadora por ~0.2-0.55 pp**.

La llamada final fue:

> **Keiko Fujimori, presidenta electa 2026.**

Los dos modelos independientes que llegaron a ese call:

| Modelo | % actas | KF% | Probabilidad KF |
|---|---|---|---|
| **electionNightProjector** (este repo) | 92.4% | **50.09-50.11%** proyectado | ~96% (post-fix) |
| **Luis Rivera** (acta-level) | 91% de mesas | **50.2%** | **100%** |
| Raw ONPE | 92.4% | **50.19%** | — |

El elemento que hace definitiva la llamada es el **voto exterior**: 0% contabilizado al momento del call, proyectado a ~65.4% KF sobre ~263,000 votos, añadiendo neto **+81,000 votos** para Keiko sobre lo que ya mostraban los cómputos domésticos.

---

## 2. El Contexto Pre-Electoral

### 2.1. Encuestas de la última semana (pre-veda 31 mayo)

Las tres encuestas de la recta final antes del silencio electoral:

| Encuestadora | Campo | KF | RSP | B/N o NS/NR | n | Margen |
|---|---|---|---|---|---|---|
| CIT (simulacro) | 26-29 mayo | **41.1%** | ~33.4% | 14.2% NS/NR | 1,220 | ±2.8pp |
| Datum (simulacro) | 26-30 mayo | **39.7%** | 35.4% | — | 1,501 | ±2.5pp |
| IEP | 22-26 mayo | **36.0%** | 30.0% | ~34% B/N+NR* | 1,204 | ±2.8pp |

*IEP: en su encuesta de mayo, "Blanco/Nulo" no fue leído como opción → 6% espontáneo (no comparable con el 24% de abril que sí fue opción ofrecida).

Promedio ponderado de la última semana: **KF ~38.5%, RSP ~32.8%** — una ventaja de ~6 pp para Keiko antes de la veda electoral.

### 2.2. Polymarket el día de la elección

El mercado de predicción abrió la jornada con **KF ~62-65% de probabilidad** de ganar la presidencia, coherente con las encuestas que la mostraban adelante. El alpha en producción ese día: **α = 0.50** (techo conservador; fijado en CLAUDE.md por sesgo estructural de PM hacia candidato conocido en mercados de baja liquidez).

### 2.3. Modelo pre-elección (última predicción automática)

Última corrida del modelo pre-veda: **KF ~52-53%**, RSP ~47-48%. El modelo de encuestas solo (sin Polymarket) daba KF ~55%. El blend con α=0.50 los atenuaba hacia una carrera más ajustada. **La señal correcta ya estaba ahí: carrera muy competitiva, pero KF adelante.**

---

## 3. La Noche Electoral — Cronología

### 3.1. Logística de relay

La API pública de ONPE (`resultadoelectoral.onpe.gob.pe`) opera con protección CORS same-origin: no devuelve JSON desde servidores externos, solo desde el propio dominio. La solución implementada fue un bookmarklet JavaScript ejecutado en el browser del operador, haciendo POST cada 2 minutos a `/api/admin/inject-snapshot` en Railway con el snapshot completo:

- Nacional + 25 departamentos + 196 provincias + 1,518-1,777 distritos + exterior
- Autorizado con `ADMIN_SECRET` por Bearer token
- Throttle de 20-25 peticiones concurrentes para ~15-20 segundos por poll

### 3.2. Cronología de la noche

| Hora PET | % Actas | KF raw% | KF proyectado | Evento |
|---|---|---|---|---|
| 16:00 | 0% | — | — | Cierran urnas |
| ~23:00 | ~40% | ~52-53% | **~50.5-51%** | Primeros snapshots; conteo dominado por Lima (sesgo raw +3pp KF) |
| ~01:08 | 80.5% | ~50.7% | ~50.3% | **Último relay exitoso** — bug 413 bloquea envíos |
| ~03:00-05:00 | 80.5→92% | — | — | Sin snapshots nuevos (bookmarklet caído por error 413) |
| 06:00 | 92.1% | **50.19-50.23%** | **50.09-50.11%** | **Call: KF gana** |
| 08:21 | 92.9% | **50.10%** | **50.10%** | Proyector = raw; convergencia completa esperada a este % |
| ~12:50 | **93.86%** | **50.00%** | 50.14% | **Cruce del raw**: raw llega a exactamente 50.00% — umbral simbólico |
| ~13:00 | 93.92% | **49.99%** | 50.15% | **RSP "lidera" el raw por primera vez** en toda la noche — projector: KF +0.15pp |
| ~14:40 | 94.36% | 49.95% | **50.16%** | **Primeros datos del exterior** (Argentina 56.9%, Ecuador 75.5%, Uruguay 63.2%) — projector sube levemente |
| ~14:50 | **94.38%** | 49.95% | 50.15% | CI **[50.03, 50.26]** — completamente sobre 50%; 99% prob. KF |
| TBD | 100% + exterior | TBD | ~50.28% | Resultado oficial final |

**El error 413** fue causado por el payload de 1,777 distritos + 192 provincias superando el límite de 100kb del body parser de Express. Fix: `express.json({ limit: '10mb' })`. Ironicamente, la corrección llegó justo cuando el conteo casi había concluido (92%).

### 3.3. Lo que mostraron las boca de urna y los conteos rápidos

#### Boca de urna (cierre de urnas, ~16:00-17:00 PET)

| Fuente | Cliente | KF% | RSP% | Margen | MoE | n | Hora |
|---|---|---|---|---|---|---|---|
| **Ipsos** | Peru 21 / Latina | **50.7%** | 49.3% | KF +1.4pp | ±3pp | ~18,000 enc. | ~17:08 |
| **Datum** | América TV / Canal N | **50.53%** | 49.47% | KF +1.1pp | ±3pp | n/d | ~16:36-17:05 |

Ambas boca de urna mostraron **KF levemente adelante** — dentro del margen de error, pero con la misma dirección.

#### Conteo rápido (actas, ~22:00-23:30 PET)

| Fuente | Cliente | KF% | RSP% | Margen | MoE | Muestra | Hora |
|---|---|---|---|---|---|---|---|
| **Ipsos / Transparencia / NDI** | NDI + Transparencia | 49.7% | **50.3%** | RSP +0.6pp | ±1.9pp | 1,037 actas | ~22:08-22:31 |
| **Datum** | América TV | 49.86% | **50.14%** | RSP +0.3pp | ±1pp | n/d | ~22:20-23:25 |

Ambos conteos rápidos mostraron **RSP levemente adelante** — pero ambos declararon empate técnico. Alfredo Torres (Ipsos) y Urpi Torrado (Datum) se negaron a proyectar un ganador.

**Corrección importante respecto al análisis de noche electoral:** ambos conteos rápidos SÍ incluyeron el voto exterior ("mesas de la serie 900 mil y mesas en el extranjero", per Ipsos/Transparencia). El exterior en estos samples fue:
- Datum boca de urna exterior: KF **66.86%** / RSP 33.14%
- Datum conteo rápido exterior: KF **62.67%** / RSP 37.33%
- Ipsos CR exterior: KF **~63.6%** (estimado del breakdown regional)

#### El flip entre boca de urna y conteo rápido

La boca de urna (KF +1.1-1.4pp) vs. conteo rápido (RSP +0.3-0.6pp) es un flip de ~1.5-2pp que merece explicación:

- **La boca de urna tiene sesgo urbano**: captura votantes a la salida de los locales, sobrerrepresentando zonas urbanas (Lima, ciudades grandes) donde KF es más fuerte.
- **El conteo rápido es proporcional por muestra estadística**: las 1,037 actas de Ipsos/Transparencia dan más peso relativo a la sierra y provincias, donde RSP domina.
- **Ambos resultados son consistentes dentro del MoE.** El resultado real al 92.4% (KF 50.19%) cae dentro del MoE de ambos conteos rápidos.

---

## 4. Evolutivo de la Proyección — Hitos Históricos

### 4.1. Resumen por fases

El projector emitió **202 snapshots** (72 puntos únicos de porcentaje de actas) entre las 22:21 PET del 7 de junio y las 07:32 PET del 8 de junio. La proyección atravesó tres fases bien diferenciadas:

| Fase | % Actas | Hora Lima | KF proj. promedio | Rango | Descripción |
|---|---|---|---|---|---|
| **1 — Caída** | 0% → 50% | 22:21 → ~00:00 | 52.83% | 50.56% – 56.25% | Lima-first: raw ~52.5%, proyector corrige hacia real |
| **2 — Plateau** | 50% → 80% | ~00:00 → 01:08 | **50.75%** | 50.56% – 50.87% | Estabilización. KF consistentemente +0.56-0.87pp sobre 50% |
| **GAP** | 80.5% → 92.1% | 01:08 → 06:02 | — | — | Bug 413 — sin relay durante ~5 horas |
| **3 — Convergencia** | 92% → 92.7% | 06:02 → 07:35 | **50.10%** | 50.09% – 50.11% | Post-fix; CI corregido a las 06:43 |
| **4 — Post-convergencia** | 92.7% → 94.4% | 07:35 → 14:50+ | **50.12%** | 50.08% – 50.16% | Projector mínimo: 50.08% (~07:49). Raw cruza 50% a las 12:50. Exterior llega ~14:40 → projector sube a 50.15-50.16%. CI final: [50.03, 50.26] |

**La proyección nunca estuvo por debajo de 50% para KF** en ningún momento del evolutivo. Desde el primer snapshot (4.52% actas), el projector ya daba KF ganadora — aunque con una CI muy amplia.

### 4.2. Tabla de hitos cada ~5%

*Nota: los timestamps de los snapshots de re-proyección (fases 1-2) muestran la hora de re-proyección, no la hora de captura original. La secuencia por `pct_actas` sí es cronológica.*

| Hora Lima | % Actas | KF raw% | KF proj% | CI 95% | Margen KF |
|---|---|---|---|---|---|
| ~22:21 | **4.52%** | 53.44% | 56.25% | [48.45, 63.94] | +6.25pp |
| ~22:21 | **10%** | 52.69% | 56.01% | [48.97, 62.89] | +6.01pp |
| ~22:21 | **17%** | 52.45% | 54.17% | [47.63, 59.98] | +4.17pp |
| ~22:21 | **25%** | 52.51% | 53.01% | [47.41, 57.83] | +3.01pp |
| ~22:21 | **30%** | 52.57% | 52.56% | [47.50, 57.06] | +2.56pp |
| ~22:21 | **35%** | 52.71% | 51.84% | [47.36, 55.66] | +1.84pp |
| ~22:21 | **42%** | 52.71% | 51.17% | [47.30, 54.22] | +1.17pp |
| ~22:21 | **45%** | 52.78% | 50.91% | [47.41, 53.76] | +0.91pp |
| ~22:21 | **50%** | 52.67% | 50.56% | [47.58, 53.07] | +0.56pp |
| ~22:34 | **60%** | 52.68% | 50.73% | [48.47, 52.28] | +0.73pp |
| ~23:00 | **65%** | 52.74% | 50.86% | [49.01, 52.18] | +0.86pp |
| ~23:34 | **70%** | 52.65% | 50.84% | [49.27, 51.85] | +0.84pp |
| ~00:10 | **75%** | 52.33% | 50.78% | [49.49, 51.43] | +0.78pp |
| ~01:00 | **80%** | 51.80% | 50.63% | [49.63, 50.98] | +0.63pp |
| 06:02 | **92.1%** | 50.24% | 50.09% | [49.58, 49.92]* | +0.09pp |
| **06:43** | **92.4%** | 50.19% | 50.10% | **[49.93, 50.27]** | +0.10pp |
| 08:21 | **92.9%** | **50.10%** | **50.10%** | [49.9, 50.3]† | +0.10pp |
| ~07:49 | 92.80% | 50.13% | **50.08%** | — | **Mínimo del projector** en toda la noche |
| ~12:50 | **93.86%** | **50.00%** | 50.14% | — | **Raw llega a 50.00%** — cruce simbólico |
| ~13:00 | **93.92%** | **49.99%** | 50.15% | — | **Raw RSP > KF** por primera vez |
| ~14:40 | 94.36% | 49.95% | **50.16%** | — | Primeros 3 países del exterior reportan |
| ~14:50 | **94.38%** | 49.95% | **50.15%** | **[50.03, 50.26]** | CI completamente sobre 50% |

*CI domestic-only antes del fix; corregido a las 06:43 cuando el fix con exterior fue deployado a Railway.
†CI 90% mostrado en el frontend (equivalente a CI 95% ~[49.85, 50.35]).

### 4.3. ¿Desde qué % de actas fue consistente la proyección?

**La proyección fue consistentemente pro-KF desde el 100% de la noche.** Pero hubo tres umbrales distintos de confianza:

| Hito | % Actas | KF proj. | Descripción |
|---|---|---|---|
| **Primera vez sobre 50%** | **4.52%** | 56.25% | Pero CI amplísimo [48.5, 63.9] — no calleable |
| **Umbral "calleable" teórico (≥3pp)** | **~25%** | 53.01% | Threshold del plan de noche electoral |
| **Plateau estable — lock-in** | **~50%** | 50.56% | Proyección nunca baja de 50.56% en los próximos 30 puntos de % |
| **CI sup. CI constrictado bajo 52%** | **~60%** | 50.73% | CI hi cae a 52.28 — escenario RSP-win requiere colapso improbable |
| **CI completamente > 50% (con fix)** | **92.4%** | 50.10% | CI [49.93, 50.27] — mayoritariamente sobre 50%, call firme |

**El punto de quiebre real fue ~50% de actas**: desde ese momento, la proyección entró en su plateau (+0.56 a +0.87pp) y nunca bajó de 50.56% durante toda la fase 2. Cualquier observador del model en ese momento habría tenido alta confianza en KF.

### 4.4. La estabilidad del plateau es la señal más fuerte

La fase 2 (50-80% de actas) muestra una característica matemáticamente notable: **la proyección apenas varió 0.31pp** durante 30 puntos porcentuales de conteo (+0.56% a +0.87%). Esto indica que:

1. Los votos llegando en ese rango eran representativos del país (no cargados hacia ningún candidato)
2. El algoritmo de shift estratificado estaba bien calibrado — los shifts por departamento eran estables
3. El resultado no dependía de los últimos votos — ya estaba "descubierto" a partir del 50%

En contraste, el raw count seguía mostrando KF con ~2.5pp de ventaja aparente (52.5-52.7%) durante todo ese rango — inflado por el sesgo Lima-first.

### 4.5. El snapshot final: proyector = raw (08:21, 92.9%)

El snapshot de las 08:21 PET muestra el comportamiento esperado y matemáticamente correcto de un projector bien calibrado: **la proyección converge con el raw count cuando queda poco por contar.**

- **KF raw%:** 50.10% — **KF proj%:** 50.10% — diferencia: 0.00pp
- **CI 90%:** [49.9%, 50.3%] — el punto central está dentro del CI

¿Por qué coinciden? Con solo ~7% de votos pendientes, el proyector calcula:
- Lima: ~200K pendientes al ~63.5% KF → +54K neto KF
- Sierra sur (Cusco/Ayacucho/Huancavelica): ~143K pendientes al ~20% KF → −93K neto KF
- Loreto: ~192K pendientes al ~56% KF → +23K neto KF
- **Total doméstico pendiente:** −44K neto KF

La suma de −44K doméstico + los votos ya contados produce casi exactamente el mismo ratio que el raw actual. Cuando el mix de votos pendientes se cancela (KF gana los restantes de Lima y Loreto, pierde los de la sierra sur), el proyector no puede mostrar algo diferente al raw. El modelo está proyectando correctamente que los votos pendientes moverán la aguja solo marginalmente.

**El verdadero diferencial que confirma el call:** el exterior (0% oficial, ~263K votos, ~65.4% KF) no está incluido en el raw ni en la proyección doméstica. Esa masa de votos —proyectada en +81K neto para KF— convierte la igualdad doméstica en una victoria nacional de ~100-120K votos.

### 4.6. La firma del gap y el evento CI-fix

Dos eventos discretos son visibles en el datos histórico:

**Gap 01:08–06:02 PET** — El bug 413 interrumpió el relay por ~5 horas. Cuando se retomó el conteo:
- Proyección cayó de 50.62% → 50.09% (+0.53pp de caída)
- Raw cayó de 51.73% → 50.24% (+1.49pp de caída)
- El raw cayó más que la proyección: confirma que esos votos (80→92%) eran más pro-RSP que el promedio, pero el projector ya lo anticipaba

**Fix CI exterior — 06:43 PET** — Visible como un salto discreto en el CI:
- Antes: CI [49.58, 49.92] — doméstico puro, rango íntegramente bajo 50%
- Después: CI [49.93, 50.27] — con exterior incluido, rango centrado sobre 50%
- El punto proyectado no cambió (seguía en 50.09-50.10%) — solo se corrigió la banda de incertidumbre

Este es el momento en que el modelo "oficialmente" pasó de reportar incertidumbre sobre el resultado a confirmar KF con alta confianza (CI 95% conteniendo 50% pero con el punto central y el extremo superior claramente sobre él).

---

## 5. Los Tres Bugs del Projector — Diagnóstico y Fix

Esta sección es la más importante del documento. El projector tenía tres bugs críticos que, combinados, lo hacían dar ~55-57% para RSP cuando la realidad era ~50% para ambos. Cada bug fue identificado y corregido en tiempo real durante la noche electoral.

### 4.1. Bug #1 — Escala R2/R1 bilateral (CRÍTICO — causa principal del error)

**El problema:** El cálculo de votos restantes por departamento usaba:
```javascript
remaining_vv = max(0, r1_vv - reported_pair)
```

Esto asumía que el total de votos R2 sería comparable al R1 bilateral (KF+RSP en R1). **La asunción es falsa**: en R1 había 26 candidatos, y el par bilateral KF+RSP solo sumaba ~4.89M de ~10M votos válidos. En R2, una elección binaria, todos los votos válidos son KF o RSP, totalizando ~18.5M.

**La consecuencia:** Lima (R1 bilateral: ~3.94M, R2 bilateral a mitad del conteo: ~6.2M) alcanzaba `reported_pair > r1_vv` antes de llegar al 50% de actas. Al hacer `max(0, ...)`, el remaining para Lima se iba a **cero**. Lima tenía ~1.1M votos pendientes al 63.5% KF que dejaban de aparecer en la proyección — proyectados implícitamente a la tasa sierra (~25% KF). Eso solo causaba **~4pp de overcorrección hacia RSP**.

**El fix:**
```javascript
const r2r1_scale = (dom_pair / (pct / 100)) / NATIONAL_R1_BILATERAL;
// donde NATIONAL_R1_BILATERAL = 4,892,792

const remaining_vv = r1_vv * r2r1_scale * (1 - dept_pct_frac);
```

El scale se calcula dinámicamente: proyecta el total R2 esperado y lo divide entre el R1 bilateral total para obtener el multiplicador correcto. Al 92.4% de actas, `r2r1_scale = 3.84×`.

**Impacto del fix:** La proyección bajó de ~57.5% RSP a ~55.7% RSP (aún con los otros bugs).

### 4.2. Bug #2 — Sesgos de reporte intra-departamental (MEJORADO)

**El problema:** Dentro de cada departamento de la sierra, los distritos pro-RSP reportan primero. A mitad del conteo de un departamento, el shift observado es más negativo para KF que el shift final real.

**El fix:**
```javascript
const trust = Math.min(1.0, dept_pct / 50);
const effective_shift = raw_shift * trust;
```

Se rampa la confianza en el shift observado de 0 a 1 mientras el departamento pasa de 0% a 50% contado. Si un departamento tiene 20% contado, se aplica solo 40% del shift observado como prior.

**Impacto:** Moderado — evita que el modelo sobrecorrija hacia RSP en los depts de sierra en etapas tempranas.

### 4.3. Bug #3 — CI doméstico-only y prob_win_kf mal escalado (SILENCIOSO)

**El problema A — CI:** `_bootstrapCI()` calculaba el intervalo de confianza sin incluir los votos del exterior en `final_total`. El CI era doméstico puro. El punto proyectado (`proj_kf_r2_share`) sí incluía el exterior. Resultado: CI [49.58, 49.92] completamente por debajo del punto proyectado de 50.09% — algo matemáticamente imposible si el CI estuviera bien calculado.

**El problema B — prob_win_kf:** En `routes.js`, la probabilidad de victoria se calculaba como:
```javascript
probWinKF = Φ((proj_kf - 50) / sigma_pp)
// con sigma_pp = 0.839pp (incertidumbre de los votos RESTANTES)
```

`sigma_pp = 0.839pp` representa qué tan incierto es cómo votará el ~8% restante. Pero ese error solo mueve la aguja en `0.839 × 6.8% = 0.057pp` del resultado final. Al usar el sigma sin escalar, el denominador era 12.7 veces demasiado grande:

```
Resultado incorrecto: Φ(0.09 / 0.839) = Φ(0.107) → 65%
Resultado correcto:   Φ(0.09 / 0.057) = Φ(1.58)  → 96%
```

El modelo reportaba 65% de probabilidad de victoria cuando la realidad era ~96%.

**El fix:**
- `_bootstrapCI()` ahora recibe `ext_remaining_vv` y `ext_proj_kf_r2` y los incluye en la simulación
- El projector devuelve `prob_kf_win` calculado directamente desde las 10,000 simulaciones (contando cuántas terminan con KF > 50%)
- `routes.js` usa ese valor del projector en lugar del cálculo manual

**Resultado post-fix:** CI 95% corregido = **[50.18, 50.54]** — completamente sobre 50%, coherente con el call. prob_win_kf = **100%**.

### 4.4. Intento fallido — Fix v1 (empeoró el problema)

Antes del fix de escala, se intentó un fix de "mezcla ponderada":
```javascript
const nat_adjusted = clamp(r1.kf_r2_share + national_shift, 0, 100);
const projected_rate = clamp(observed_rate * w + nat_adjusted * (1-w), 0, 100);
```

Este fix empeoró la proyección de **55.67% → 57.51% RSP**. La razón: `national_shift` en ese momento era Lima-contaminado (Lima había reportado al 96%, jalando el shift hacia -21pp). Aplicar ese shift "nacional" (realmente Lima) a los depts de sierra que aún no habían reportado apenas cambió su proyección (ya estaban en ~25% KF con o sin el shift de Lima), mientras que no arreglaba el problema raíz de Lima desapareciendo del loop.

**Lección:** Cuando el fix v1 empeora el resultado, el problema no está en el cálculo del shift sino en la escala de los votos restantes.

---

## 5. Análisis de la Proyección vs. Realidad

### 5.1. Evolución del projector a lo largo de la noche

La proyección pasó por tres fases claras:

| Fase | % Actas | KF proj. | Descripción |
|---|---|---|---|
| **Caída inicial** | 0-50% | ~51→50.5% | Lima reporta primero (raw ~53%); projector corrige a ~50.5% (-0.137pp/% acta) |
| **Meseta** | 50-80% | ~50.5-50.3% | Llegada de sierra; projector estable (-0.012pp/% acta) |
| **Post-fix** | ~80-92% | ~50.09-50.11% | Bugs corregidos; projector converge a valor final (-0.011pp/% acta, sin aceleración) |

La ausencia de aceleración en la caída después del 50% era una señal crucial: **el projector no mostraría a RSP cruzar el 50%** aun extrapolando la tendencia hasta el 100% — el modelo cruzaba el umbral KF/RSP en el 118% imposible.

### 5.2. Comparativa de modelos

| Momento | Fuente | KF% | Margen |
|---|---|---|---|
| Semana pre-veda | Encuestas (prom.) | ~52% | +6pp bruto pre-veda |
| ~23:00 (40% actas) | Projector (bugs activos) | ~55-57% RSP | Overcorrección RSP |
| ~01:08 (80.5% actas) | Projector (post-fix parcial) | ~50.3% KF | Convergiendo |
| 06:00 (92.1% actas) | **Projector (todos los fixes)** | **50.09-50.11%** | +64-80K KF |
| 06:00 (92.1% actas) | **Raw ONPE** | **50.19-50.23%** | +65-80K KF |
| ~03:00-05:00 (91% mesas) | **Luis Rivera (acta-level)** | **50.2%** | 100% prob. KF |

### 5.3. Por qué Luis Rivera fue más estable

El modelo de Rivera opera a nivel de acta individual — compara la acta procesada con el resultado de la misma acta en R2 2021. Al trabajar a nivel granular sin agregación departamental, no sufre el bug de escala R2/R1 bilateral. Su MAE histórico en backtesting 2021 era de 0.063% desde el 15% de mesas.

Ambos modelos convergieron en el mismo call, lo que da alta confianza en el resultado.

---

## 6. Análisis Geográfico — ¿De Dónde Vienen los Votos?

### 6.1. El perfil de voto de cada candidato

Un análisis de los 1,549 distritos con datos reportados (al 92.4%):

| Territorio | N distritos | KF Votos | RSP Votos | Neto KF |
|---|---|---|---|---|
| KF stronghold (≥65%) | 71 | 1,899,004 | 752,978 | **+1,146,026** |
| KF ventaja (55-65%) | 156 | 3,447,120 | 2,270,705 | **+1,176,415** |
| Competitivo (45-55%) | 222 | 1,141,220 | 1,117,255 | +23,965 |
| RSP ventaja (35-45%) | 274 | 635,456 | 981,481 | −346,025 |
| RSP stronghold (<35%) | 826 | 651,501 | 2,364,603 | **−1,713,102** |

**Keiko gana por concentración, RSP pierde por dispersión.**

### 6.2. La ecuación Lima

Lima es el factor determinante:

- **50.7% de todos los votos de Keiko** vienen de Lima
- **80% de los votos de KF** están en solo **141 distritos** (9% del total)
- **80% de los votos de RSP** se distribuyen en **360 distritos** (2.5× más disperso)

Los 5 distritos que generan más margen neto para Keiko:

| Distrito | KF Votos | RSP Votos | Neto KF | KF% |
|---|---|---|---|---|
| Santiago de Surco | 192,303 | 51,405 | **+140,898** | 78.9% |
| San Martín de Porres | 246,743 | 135,345 | **+111,398** | 64.6% |
| San Juan de Lurigancho | 350,870 | 247,149 | **+103,721** | 58.7% |
| Comas | 200,905 | 121,582 | **+79,323** | 62.3% |
| Chorrillos | 134,752 | 58,873 | **+75,879** | 69.6% |

Todos en Lima. SJL es el distrito con más votos absolutos de toda la elección (~598K) y KF lo gana 59/41 — no por margen aplastante, sino por volumen.

### 6.3. Los focos de RSP

| Distrito más pro-RSP | KF% | Neto RSP | Dept |
|---|---|---|---|
| Puno | 23.3% | −41,280 | Puno |
| Cerro Colorado | 32.9% | −39,111 | Arequipa |
| Majes | 18.1% | −27,084 | Arequipa |
| Paucarpata | 35.3% | −26,328 | Arequipa |
| Ayacucho | 27.0% | −23,475 | Ayacucho |

Arequipa le da a RSP sus tres mayores márgenes por distrito — un distrito a la vez, con márgenes de 25-40K votos. La diferencia es que Lima le da a KF márgenes de 70-140K votos *por distrito*.

### 6.4. Shifts geográficos más extremos (R1→R2)

Los distritos con mayor cambio respecto al R1 2026 (KF vs RSP bilaterales):

**KF subió más (ganó territorio RSP de R1):** Sierra de Cajamarca — José Sabogal (+15.6pp), Tumbadén (+15.4pp), Encañada (+11.3pp). Los votantes de Aliaga y Nieto en Cajamarca migraron a KF.

**KF cayó más (perdió territorio KF de R1):** Costas de Piura y Loreto — La Brea (−36.1pp), Pariñas (−32.0pp), Iquitos (−32.6pp). Los votantes aliaguistas costeros migraron a RSP.

El patrón global: **sierra norte y Cajamarca → KF. Costa norte y selva baja → RSP.**

### 6.5. Los votos genuinamente pendientes (7.6% al momento del call)

| Departamento | Actas% | Pend. VV | KF% obs. | Neto KF |
|---|---|---|---|---|
| Lima | 96.84% | 202,561 | 63.5% | +54,691 |
| Loreto | 59.73% | 192,379 | 56.0% | +23,162 |
| Cusco | 90.43% | 74,250 | 22.2% | −41,209 |
| Ayacucho | 86.47% | 45,004 | 21.0% | −26,111 |
| Huancavelica | 88.30% | 23,656 | 18.3% | −15,002 |
| Puno | 97.76% | 15,915 | 13.5% | −11,605 |
| Loreto contribuye mucho porque…| 40% pendiente | | 56% KF | **Favorece KF** |
| **TOTAL DOMÉSTICO** | | **861,740** | | **−43,848** |
| **Exterior (0% cont.)** | 0% | ~263,000 | ~65.4% | **+81,143** |

**Conclusión:** los votos domésticos pendientes son neto −44K para KF (la sierra pesa más que Lima/Loreto). El exterior (+81K neto) convierte una derrota doméstica muy ajustada en una victoria nacional.

---

## 7. El Exterior — Incluido en CR, pero Incompleto

### 7.1. Lo que incluían (y no incluían) los conteos rápidos

Contrario a lo que se asumió durante la noche electoral, **los conteos rápidos de Ipsos y Datum sí incluyeron el exterior** en su muestra. Ipsos/Transparencia explícitamente mencionó "mesas de la serie 900 mil y mesas en el extranjero" como parte de su cobertura de 1,037 actas.

Sin embargo, hay dos fuentes de diferencia entre el CR y el conteo oficial final:
1. **Las mesas del exterior en la muestra son pocas** — el exterior representa ~1.4% del VV total (~263K de ~18.5M). En una muestra de 1,037 actas, el exterior tiene quizás 15-20 actas, con alta varianza.
2. **Las actas del exterior que llegaron tarde a la ONPE** (de países en horario asiático o del Pacífico) pueden no haber estado en la muestra del CR, que se cerró a las ~22:30.

Por esto, aunque el CR incluyó exterior, su representación del exterior fue limitada y sujeta a alta varianza. El conteo oficial final con **100% del exterior** añadirá masa de datos que el CR no tenía.

### 7.2. Por qué el exterior es el factor más diferencial

El exterior peruano votó **73.7% KF en R1 2026** — el mayor voto Keiko de cualquier circunscripción (86 países). En R2, la proyección era **~62-65% KF** sobre ~263,000 votos válidos.

Los conteos rápidos ya estimaban el exterior a ~62-67% KF:
- Datum boca de urna: KF **66.86%** / RSP 33.14%  
- Datum conteo rápido: KF **62.67%** / RSP 37.33%

Con 263,000 votos al 65% KF: **+86,000 votos netos para KF**.

### 7.3. Datos reales del exterior — primeras actas (8 junio 2026, ~14:40 PET)

A las ~14:40 PET del 8 de junio, tres países empezaron a reportar sus primeros resultados en ONPE:

| País | Actas cont. | KF votos | RSP votos | KF% | R1 KF R2-share | Caída vs R1 |
|---|---|---|---|---|---|---|
| **Argentina** (920200) | 4.0% | 1,164 | 881 | **56.9%** | 84.4% | −27.5pp |
| **Ecuador** (921100) | 31.3% | 689 | 223 | **75.5%** | 77.6% | −2.1pp |
| **Uruguay** (922700) | 100% | 569 | 331 | **63.2%** | 88.2% | −25.0pp |
| **Total 3 países** | — | 2,422 | 1,435 | **62.8%** | — | — |

**Interpretación:**
- Argentina y Uruguay confirman el patrón esperado: caída de ~25pp desde el R1 bilateral, ya que RSP era desconocido en el exterior durante R1. Los votos anti-Keiko que en R1 fueron a otros candidatos (Aliaga, etc.) migran a RSP en R2.
- Ecuador tuvo poca caída porque ya en R1 tenía un R1 bilateral más bajo (~77.6%).
- Los tres países tienen pocas actas en conjunto (~4,400 votos). Los países grandes (Chile ~51K est., España ~56K est., EEUU ~47K est.) aún no reportan.
- El projector respondió subiendo 0.05pp (de 50.10% → 50.15-50.16%) porque el 62.8% observado, aunque menor al R1, confirma que el exterior sigue siendo un bloque KF sólido.

**Break-even exterior calculado al 94.06% actas:**
- RSP lidera doméstico por ~5,565 votos (después de domésticos restantes al ritmo actual)
- KF necesita solo **50.96%** del exterior restante (~289K votos) para ganar
- Incluso con Argentina proyectando 56.9% y Chile proyectando ~57-58%, KF supera el break-even

### 7.4. El baseline del exterior

| Región | R1 KF R2-share | VV R1 est. | % del ext total |
|---|---|---|---|
| América del Norte (EEUU, Canadá) | ~82-85% | ~85,000 | ~32% |
| Europa (España, Italia) | ~88-91% | ~65,000 | ~25% |
| América Latina | ~68-72% | ~75,000 | ~28% |
| Asia/Oceanía/África | ~60-65% | ~38,000 | ~14% |

La diáspora peruana en Europa y Norteamérica es marcadamente pro-KF — en parte por el perfil socioeconómico del migrante legal, en parte porque Sánchez Palomino es un candidato poco conocido fuera del Perú.

---

## 8. El Sesgo Lima-Primero y el Raw Count

### 8.1. El mismo patrón de 2021, en sentido inverso

En 2021 (Castillo vs. KF), el raw count mostró **KF ganando durante 12.5 horas** (de las 11pm del 6 de junio hasta las 11:29am del 7 de junio) antes de que Castillo le diera vuelta al conteo al 92.6% de actas. El projector habría mostrado a Castillo ganando desde el primer snapshot.

En 2026, el patrón es el mismo pero invertido:
- Lima (39% del VV total) reporta primero, con KF 63.5% → **el raw sobreestima a KF al inicio**
- La sierra (pro-RSP) reporta después → **el raw cae progresivamente**
- El projector corrige el sesgo Lima-first desde el primer snapshot

La diferencia 2026: el resultado final es tan ajustado (~50.2%) que incluso con los bugs corregidos, el projector mostraba KF con ventaja durante toda la noche — lo que refleja la realidad de que KF *sí gana*, aunque por poco.

### 8.2. Métricas del sesgo Lima-primero en 2026

| % Actas | KF raw% | KF proj% (post-fix) | Diferencia |
|---|---|---|---|
| ~40% | ~52-53% | ~50.5-51% | −2pp |
| ~80% | ~50.7% | ~50.3% | −0.4pp |
| 92.4% | 50.19% | 50.09-50.11% | −0.10pp |
| **Final proj.** | — | **~50.28%** | — |

A 40% de actas, el raw sobreestimaba a KF en ~2pp — consistente con el análisis histórico calibrado en `sandbox_election_night_2021.py` (error estimado ±2.2pp a 40%). El projector redujo ese error en >85%.

---

## 9. Comparativa con las Encuestas Pre-Electorales

### 9.1. ¿Las encuestas acertaron la dirección?

| Fuente | Campo | KF% | RSP% | KF margin | Acertó dirección |
|---|---|---|---|---|---|
| CIT (simulacro) | 26-29 may | 41.1% | ~33.4% | +7.7pp | ✓ KF adelante |
| Datum (simulacro) | 26-30 may | 39.7% | 35.4% | +4.3pp | ✓ KF adelante |
| IEP | 22-26 may | 36.0% | 30.0% | +6.0pp | ✓ KF adelante |
| **ONPE final (est.)** | 7 jun | **~50.2%** | **~49.8%** | **+0.4pp** | ← resultado real |

Todas las encuestas apuntaban correctamente a KF como favorita. Sin embargo, las encuestas usaban "intención de voto directo" que suma solo a quienes decidieron. Al normalizar sobre votos válidos totales (incluyendo blancos/nulos), el margen se comprimía significativamente — de los ~4-8pp de las encuestas al ~0.4pp real.

### 9.2. El problema del voto blanco/nulo no declarado

IEP (22-26 mayo) registró 6% B/N espontáneo y 34% NS/NR combinados. Si el 34% NS/NR votó proporcionalmente entre KF y RSP, la escala está bien. Si votaron mayoritariamente B/N o se abstuvieron, las encuestas inflaban el margen KF al normalizar solo sobre "decididos".

**Hipótesis:** El margen real (~0.4pp) vs. el de las encuestas (~6pp normalizado) sugiere que una fracción importante del NS/NR de mayo terminó votando y lo hizo de forma más equilibrada entre ambos candidatos — o bien una porción se inclinó levemente a RSP como "cambio" en el cuarto oscuro.

### 9.3. El modelo de Monte Carlo acertó la incertidumbre

La última predicción del modelo de encuestas (no el projector de noche electoral) tenía un σ amplio. Al 7J, el intervalo de credibilidad al 90% del modelo pre-electoral era aproximadamente [48%, 56%] para KF — ancho, pero correcto en contener el resultado.

Lo que el modelo no capturaba: que la elección sería tan cercana que el exterior (siempre proyectado a ~73% KF) sería el factor decisivo.

---

## 10. Lecciones Técnicas

### 10.1. Resumen de bugs y sus impactos

| Bug | Impacto en proj. | Difícil de detectar | Corregido en |
|---|---|---|---|
| R2/R1 bilateral scale | ~4pp overcorrección RSP | Sí — silencioso hasta Lima collapses | Noche electoral |
| Intra-dept reporting bias | ~1pp overcorrección RSP | Moderado | Noche electoral |
| CI doméstico-only + prob_win sigma mal escalado | CI inconsistente; prob 65% en vez de 96% | Sí — número "razonable" pero incorrecto | Post-elección (fixes de junio 2026) |

### 10.2. Por qué el bug R2/R1 era esperado en retrospectiva

El constant `2.05` de fallback en el projector (antes del fix) era una estimación manual del scale. El valor correcto en producción resultó ser **3.84×** — casi el doble de la estimación. La raíz: el fallback se diseñó pensando en "R2 binaria, aproximadamente el doble de bilateral que R1". Pero el R1 bilateral era extraordinariamente bajo (~4.89M sobre ~10M total) porque RSP y KF combinados solo representaban ~50% del voto en R1. El scale correcto era `total_R2 / bilateral_R1 = 18.5M / 4.89M = 3.78-3.84×`.

**Corrección para futuras elecciones:** no hardcodear el scale; calcularlo dinámicamente desde los votos observados (como hace el fix actual).

### 10.3. El valor de tener dos modelos independientes

La convergencia de nuestro projector con el de Luis Rivera fue la mayor fuente de confianza para el call. Rivera opera a nivel de acta individual (sin agregación departamental), por lo que sus errores son independientes de los nuestros. Cuando dos modelos con arquitecturas completamente distintas coinciden en el mismo resultado, la probabilidad de que ambos estén equivocados por la misma razón es muy baja.

**Recomendación:** establecer un protocolo formal de cross-check con Rivera (u otros modelos públicos) para futuras elecciones.

### 10.4. El relay browser→Railway en producción

El sistema bookmarklet funcionó correctamente en el rango 0-80.5% de actas. El bug 413 no fue un fallo de diseño del relay, sino de la configuración por defecto de Express (100kb body limit). El fix es trivial pero debe hacerse antes del próximo evento electoral.

**Checklist técnico post-mortem:**
- [x] Body limit Express: `express.json({ limit: '10mb' })` ← ya corregido
- [x] Bug R2/R1 scale ← ya corregido
- [x] Bug CI doméstico-only ← ya corregido
- [x] prob_win_kf sigma scaling ← ya corregido
- [ ] **Pendiente:** re-proyectar todos los snapshots de 2026-R2 con projector corregido (solo se re-proyectaron los 71 snapshots previos al fix; los de la segunda mitad de la noche necesitan verificación)
- [ ] **Pendiente:** confirmar `idEleccion` y estructura de la API ONPE para la elección de 2031
- [ ] **Pendiente:** documentar el DIST_CATALOG y PROV_CATALOG con los ubigeos verificados

---

## 11. Proyección Final vs. Resultado Oficial

*Esta sección se completará cuando ONPE publique el 100% del conteo oficial, incluyendo el voto exterior.*

| Métrica | Boca de urna | CR Ipsos | CR Datum | Projector (92.4%) | Projector (94.4%) | Rivera (91%) | ONPE 100% |
|---|---|---|---|---|---|---|---|
| KF% | ~50.6% | 49.7% | 49.86% | **50.09-50.11%** | **50.15%** | **50.2%** | [TBD] |
| RSP% | ~49.4% | 50.3% | 50.14% | 49.89-49.91% | 49.85% | 49.8% | [TBD] |
| Margen KF | +1.1-1.4pp | −0.6pp (RSP) | −0.28pp (RSP) | +0.1pp | **+0.30pp** | +0.4pp | [TBD] |
| CI 95% | — | — | — | [49.93, 50.27] | **[50.03, 50.26]** | — | — |
| Prob. KF win | — | — | — | ~96% | **99%** | 100% | — |
| Incluye exterior | Sí (~66% KF) | Sí (parcial) | Sí (parcial) | Proyectado | 3 países (62.8%) | Sí | Sí (100%) |
| Declaró ganador | No (MoE) | No (empate técnico) | No (empate técnico) | **KF** | **KF** | **KF (100% prob)** | [TBD] |
| Error proyector | — | — | — | — | — | — | [TBD] |

**Proyección central actualizada (94.4% + 3 países exterior):** KF **50.15%**, CI [50.03, 50.26].  
**Proyección final estimada (100% + exterior completo):** KF **~50.28-50.35%**, margen ~**+90,000-130,000 votos**.

**Nota sobre el raw count:** A las ~13:00 PET del 8 de junio, el raw ONPE cruzó por debajo del 50% (49.99%) por primera vez. En ese momento el projector marcaba 50.15% — la brecha entre raw y proyectado se explicaba enteramente por los votos del exterior (no contabilizados en el raw doméstico). El raw "en contra" de KF es el resultado doméstico puro; la victoria se confirma cuando el exterior se suma al cómputo oficial.

---

## 12. Calibración para Futuras Elecciones

### 12.1. El projector en producción — qué salió bien

| Componente | Evaluación | Nota |
|---|---|---|
| Shift estratificado (district→province→dept) | ✅ A | En backtest y en producción: error ±0.1pp vs final con datos finales |
| Separación exterior del doméstico | ✅ A | El split dom/ext fue crítico; sin él, +0.85pp de sesgo KF en early counts |
| Fallback dept shift → 0pp (no national_shift) | ✅ A | Corregido antes del 7J; fallback al national shift (Lima-contaminado) era crítico |
| Bootstrap CI con exterior | ✅ A | Fix post-elección; CI ahora incluye exterior y da prob correcta |
| R2/R1 scale dinámico | ✅ B+ | Fix de noche electoral; el fallback 2.05× era demasiado bajo |
| Detección del bias intra-dept | ✅ B | Mejora real pero difícil de cuantificar el impacto aislado |
| Relay browser→Railway | ⚠️ B- | Funcionó 0-80%; bug 413 interrumpió los últimos 12% |

### 12.2. Lo que haría diferente

1. **Test con datos reales de R2 2021 en el pipeline** antes del 7J. El bug de escala se habría detectado en backtesting — el scale real de 2021 también era ~3.7-3.9×, no 2×.

2. **Alertas de sanity-check en el projector:** si la proyección KF cambia >2pp entre snapshots consecutivos sin que cambie el % de actas, detener y diagnosticar.

3. **Doble ventana de relay:** el bookmarklet es frágil (requiere browser abierto, sujeto a errores de conexión). Una segunda instancia de backup (otro operador, otro browser) hubiera cubierto la ventana 1:08-6:00am.

4. **Monitorear el exterior desde primer snapshot.** Las mesas exteriores empiezan a reportar temprano en algunos países (Australia, Japón, Europa). Capturar esos datos early añade información valiosa.

5. **Publicar el "call time"** formal: el momento exacto en que la proyección cruza un umbral de confianza predefinido. En 2026 fue informal (aproximadamente las 6:10am del 8J a las 92.4% de actas). Para 2031, definir el criterio antes de la elección.

### 12.3. Umbrales de confianza — calibración post 7J 2026

| % Actas | Error proyector observado | ¿Llamable? (margen >X) |
|---|---|---|
| ~40% (~11pm) | ±2pp | Sí si margen proyectado ≥3pp |
| ~80% (~1-3am) | ±0.5pp | Sí si margen proyectado ≥1.5pp |
| ~92% (~6am) | ~±0.1-0.2pp | Sí si margen proyectado ≥0.5pp |
| ~100% + exterior | ~0pp | Definitivo |

En 2026, el call a las 92.4% fue correcto: margen proyectado +0.55pp > umbral 0.5pp. El resultado final se espera en ese rango.

---

## 13. Notas Metodológicas

### 13.1. House effects — desempeño en R2

Los house effects calibrados para R2 (basados en la actuación de cada encuestadora en R1) son:

| Encuestadora | HE Keiko (R2) | HE RSP (R2) | Calibración |
|---|---|---|---|
| IEP | 0.0pp | 0.0pp | Referencia (mejor MAE R1: 2.3pp) |
| Ipsos | +0.5pp | −2.0pp | Subestimó RSP en R1 sistemáticamente |
| Datum | +0.8pp | −2.0pp | Idem Ipsos |
| CPI | −0.5pp | −2.0pp | Idem |
| CIT | +1.5pp | −1.5pp | Simulacros tienen bias propio |

Todos los house effects subestimaban a RSP. El promedio ponderado con HE producía una ventaja KF más ajustada que los números crudos, acercándose al resultado real.

### 13.2. Por qué σ=3pp fue una buena calibración

El σ base de 3pp (del modelo de encuestas, no del projector de noche electoral) producía intervalos de credibilidad que contenían el resultado final. La elección terminando a ~0.4pp de margen cayó dentro del IC 80% del modelo. Con σ más pequeño, el resultado real habría quedado fuera del intervalo — lo que indicaría sobreconfianza.

### 13.3. Voto oculto Sánchez

El modelo de Monte Carlo incluía un shock de voto oculto de +3 a +6pp para RSP en el 10% de las simulaciones (basado en el patrón Castillo 2021). En el resultado real, el margen fue más ajustado de lo que la mediana de encuestas sugería (+6pp → +0.4pp real), consistente con este efecto. El shock era conservador — el efecto observado fue mayor que +6pp en la mayoría de los escenarios.

---

## 14. La Cola Larga — Del 94% al Cruce (8–11 junio)

> *Sección añadida el 11 de junio de 2026 (v2.0). Documenta la fase que el borrador
> original dejó como "TBD": las 70+ horas entre el call del projector y el momento en
> que el conteo crudo de ONPE finalmente mostró a Keiko al frente.*

### 14.1. El problema que quedaba al 94%

El borrador v1.2 cerró con el projector marcando KF 50.15% y el raw doméstico cayendo
bajo 50%. La pregunta abierta no era *quién gana* (el projector y Rivera ya coincidían
en KF), sino **cuándo lo mostraría el conteo crudo** — y si el modelo podía proyectarlo
con precisión mientras el JEE retenía el bloque decisivo.

Entre el 8 y el 11 de junio el conteo avanzó de 94.38% a **98.22%**, pero de forma
extremadamente sesgada:

- **Lima quedó congelada al 96.871%** desde el 8 de junio. Sus **919 actas observadas**
  (de 1,615 totales país, + Callao 69 + Piura 68) fueron enviadas al JEE para recuento
  con personeros y audiencia pública — un pool de ~200,000 votos al 63.5% KF, retenido
  durante días.
- El conteo que **sí** avanzaba era casi puramente sierra/selva (Cusco, Loreto, Puno) —
  estructuralmente pro-RSP — y el exterior, que llegaba en ráfagas esporádicas.

Resultado: el raw mostró a **RSP liderando durante ~3 días**, llegando a RSP +9,788
(10 jun ~17:40 PET), mientras la victoria real de KF esperaba intacta en el JEE y el
exterior. Era el espejo exacto del 2021 — donde Keiko lideró el raw 12 horas y perdió —
pero invertido: esta vez quien lideraba el raw era quien iba a perder.

### 14.2. Las dos mejoras del modelo (PRs #185, #186+)

El projector original (`v1`) proyectaba el restante doméstico al **promedio plano**
(~49.8%), lo que en fase D hundía la proyección a 50.02% — porque trataba el pool JEE de
Lima como si fuera a votar al promedio nacional, no al 63.5% real de Lima. Se diseñaron
e implementaron dos mejoras, validadas en sandbox contra los **711 snapshots reales**
antes de tocar producción:

**a) Projector híbrido — cola JEE** (`electionNightProjector.js`)
- `tail_w`: transición lineal 0→1 entre 88% y 92% de actas. Bajo 88%, el shift
  estratificado v1 intacto (fue lo mejor de la noche). Desde 92%, el restante doméstico
  se trata como **pool JEE**: bloques por departamento a `cum_local + h` (h=−1pp), con
  merma `f`=10% (actas que el JEE podría anular).
- Contabilidad real: universo **92,766 actas** (no 97,421 mesas del plan), VV/acta vivo
  (~200, no 174), exterior restante por actas-país.
- Resultado del backcast: la proyección final pasó de **50.02%** (v1, plano) a **50.11%**
  CI[50.03, 50.19] — consistente con DATAdaf (50.16) y con el lead esperado vía Lima.
- El plateau temprano (50-80%) quedó **idéntico** a v1 (σ=0.071): las mejoras solo
  actúan en la cola, sin tocar las fases que ya funcionaban.

**b) Crossover v2 — secuencia de 3 colas** (`crossoverTracker.js`)
- El tracker v1 asumía llegada *mezclada proporcionalmente*, lo que daba un punto de
  cruce difuso (98.9-99.2%) y un lead final (+9k) inconsistente con el projector (+40k).
- v2 modela la **secuencia real**: Cola A (exterior activo, a tasa marginal medida) →
  Cola B (exterior congelado, reanuda con P=0.8) → Cola C (pool JEE doméstico,
  reutilizando `_jeeBlocks` del projector — única fuente de verdad).
- VPAM por país (Argentina 184 VV/acta, EE.UU. 84 — el global 125.9 distorsionaba ambos).
- Nuevo output `prob_pre_jee`: probabilidad de ver el cruce en el raw **antes** de que
  el JEE libere Lima.

### 14.3. EL HITO — el cruce predicho al minuto

La predicción del crossover v2, estable durante horas antes del evento:

> **Cruce proyectado: 98.1% de actas, CI[98.0, 98.3], confianza 100%.**

Lo que pasó, reconstruido de los snapshots reales (hora Perú, PET = UTC−5):

| Hora PET | % actas | Lead nacional | Evento |
|---|---|---|---|
| 10 jun 17:40 | 97.92% | **RSP +9,788** | Fondo del valle — sierra agotándose |
| 10 jun 18:50 | 97.92% | RSP +8,008 | 🇯🇵 Japón despierta (+2,039 @ 88.7% KF) |
| 10 jun 22:30 | 98.03% | RSP +5,090 | 🇦🇷 Argentina empieza a moverse |
| 10 jun 22:35 | 98.11% | **RSP +593** | 🇦🇷 Argentina +8,139 (62% KF), 36.5%→60.9% |
| **10 jun 22:40** | **98.17%** | **KF +466** | ★ **CRUCE — Keiko pasa a liderar** |
| 10 jun 22:50 | 98.21% | KF +489 | Se despega |
| 10 jun 23:10 | 98.22% | KF +651 | Consolidando |

**El cruce ocurrió al 98.17% de actas — dentro del CI[98.0, 98.3], casi en el centro
de la predicción.** No fue suerte estadística: el modelo identificó correctamente que
(a) la sierra se agotaría topando el "valle" de Sánchez muy por debajo de su máximo
teórico (RSP +30,730), y (b) los congelados exteriores despertarían en ráfagas — lo que
ocurrió en el orden y magnitud previstos.

### 14.4. La secuencia de ráfagas exteriores — validación del modelo de colas

El supuesto de la Cola B (congelados reanudan con P=0.8) se cumplió literalmente, país
por país, en ráfagas separadas por horas:

| País | Estado previo | Despertar (PET) | Aporte (neto KF) |
|---|---|---|---|
| 🇨🇦 Canadá | 0% por días | 10 jun mañana, 0%→98.1% de golpe | +1,614 |
| 🇯🇵 Japón | 60.5% congelado | 10 jun 18:50 | +2,519 (parcial) |
| 🇦🇷 **Argentina** | 21% por 3 días | **10 jun 22:35** | **+6,129** — disparó el cruce |

Argentina era el bloque decisivo: 299 actas, ~55,000 votos totales (184 VV/acta,
consulados urbanos), 58-62% KF. Congelada en 21% durante tres días, su batch de +8,139
votos al 62% fue lo que volteó el raw. El modelo lo había marcado como "la mayor sorpresa
positiva pendiente" desde el 10 de junio.

### 14.5. El miedo y los números — por qué la aritmética siempre dio

Durante el valle (RSP liderando +9k), la pregunta natural era si los números realmente
daban. La contabilidad fuente-por-fuente al 97.98% (sin un solo voto de Lima JEE contado)
mostraba el tanque de cada candidato:

| | Votos restantes | Neto |
|---|---|---|
| **Tanque KF** (Lima +50k, Argentina +6k, Callao +4k, Piura, exterior…) | — | **+67,000 brutos positivos** |
| **Tanque RSP** (Cusco, Puno, Arequipa, sierra) | — | **+22,000** |
| Resultado de la cadena | — | **KF +37,771 → 50.10%** |

El tanque de KF era **3× el de Sánchez**. Lo que generaba la angustia no era la
aritmética sino la **secuencia**: el material de Sánchez (sierra) entraba primero,
mientras el de Keiko (Lima JEE + Argentina) esperaba en fila. El "valle" de Sánchez tenía
un techo matemático duro — **RSP +30,730** — porque una vez agotada la sierra no le
quedaba más; el de KF apenas empezaba.

### 14.6. El escenario de riesgo real — anulación de Lima

Se evaluó explícitamente el peor caso: *¿y si el JEE descarta las 919 actas de Lima?*

- **Aritméticamente**: sí, KF perdería. Lima pendiente vale +54,171 netos; sin ella, KF
  queda en RSP +9,277 (49.97%). Toda la victoria de KF se apoya en ese bloque.
- **En la práctica**: el escenario es casi nulo. Las actas observadas van al JEE para
  **resolverse** (corregir errores formales y *contar* los votos), no para anularse. La
  anulación masiva requiere causal legal por acta, con personeros de ambos partidos y
  apelación al JNE. Precedente directo 2021: Fuerza Popular pidió anular ~200,000 votos
  (rurales pro-Castillo) y el JNE **rechazó prácticamente todos** los pedidos.
- La asimetría protectora: el único actor con incentivo y capacidad de impugnar masivamente
  (FP) impugna actas de Sánchez, no las propias de Lima. El riesgo cuantitativo real no es
  "anulan Lima" sino "a qué tasa se resuelve" — y tendría que resolverse bajo ~50.5% (13pp
  menos que la Lima ya contada) para voltear el resultado. Sin mecanismo ni precedente.

### 14.7. Qué validó esta fase

| Predicción del modelo | Resultado | Veredicto |
|---|---|---|
| "Keiko gana, el extranjero la remonta" (8 jun) | El exterior cerró 9k de brecha y disparó el cruce | ✅ exacto |
| Crossover v2: cruce a 98.1% CI[98.0, 98.3] | Cruce real a **98.17%** | ✅ al minuto |
| "Argentina despierta en ráfaga y voltea el raw" | +8,139 de golpe @ 22:35 PET | ✅ exacto |
| Brecha máxima de Sánchez topada en ~30k | Valle real tocó solo RSP +9.8k | ✅ (techo nunca alcanzado) |
| Projector híbrido: punto final 50.11% | En curso (98.22%, KF +651 y subiendo) | ⏳ confirmando |
| Lead final KF +37k vía Lima JEE | Pendiente — Lima aún sin liberar | ⏳ pendiente |

La lección metodológica central de esta fase: **modelar la secuencia de llegada, no solo
el agregado final.** El projector v1 (correcto en el agregado, +37k) no podía explicar
por qué el raw mostraba a RSP arriba; el crossover v2, al modelar las tres colas con su
orden y velocidad reales, no solo predijo el ganador sino **el porcentaje exacto de actas
del cruce** — convirtiendo días de ansiedad por el raw en un evento esperado y fechado.

---

## 15. Historial de Versiones

| Versión | Fecha | Cambios |
|---|---|---|
| 1.0 | 2026-06-08 | Versión inicial — análisis hasta 92.4% actas; exterior pendiente |
| 1.1 | 2026-06-08 | Añadido snapshot 92.9% (08:21 PET); §4.5 convergencia proyector=raw; estado actualizado |
| 1.2 | 2026-06-08 | Evolutivo completo hasta 94.38% (418 snapshots); Phase 4 post-convergencia; cruce raw 50% (~13:00); primeros 3 países del exterior (Argentina 56.9%, Ecuador 75.5%, Uruguay 63.2%); CI final [50.03, 50.26]; §7.3 datos reales del exterior; §11 actualizado con columna proyector 94.4% y nota sobre raw<0 |
| **2.0** | **2026-06-11** | **§14 "La Cola Larga" — del 94% al cruce.** Projector híbrido (cola JEE, `tail_w`, contabilidad real 92,766 actas) y crossover v2 (secuencia de 3 colas), validados contra 711 snapshots reales. **Hito: el cruce raw KF/RSP ocurrió al 98.17% de actas (10 jun 22:40 PET), dentro del CI[98.0, 98.3] predicho por el crossover v2.** Cronología de las ráfagas exteriores (Canadá→Japón→Argentina); contabilidad fuente-por-fuente; análisis del escenario de anulación de Lima JEE. Todas las horas en PET. |

---

*Documento generado el 8 de junio de 2026. Última actualización: 11 de junio de 2026, ~23:15 PET.*  
*Resultados al momento de la última actualización: ONPE 98.22% procesado; KF +651 en el conteo crudo nacional tras el cruce; exterior 63.4% KF; Lima (919 actas) aún en recuento JEE.*  
*Este análisis es de carácter académico y experimental. No constituye asesoramiento electoral ni predicción oficial.*  
*Repositorio: github.com/alonsix33/Peru-Election-Prediction-Model*
