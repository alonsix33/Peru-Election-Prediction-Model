#!/usr/bin/env python3
"""
Sandbox: Correcciones científicas al modelo R1 2026

Evalúa tres correcciones independientes y sus combinaciones:
  A. α dinámico por N_eff en lugar de α fijo 0.77 (PM inflation fix)
  B. Corrección de sesgo rural (candidatos subestimados por encuestas urbanas)
  C. IEP dominante en el aggregate (2.0× weight vs 1.25×)

Todos los datos base vienen de POST_MORTEM_2026.md y seed.sql.
Los porcentajes son siempre sobre votos válidos.

Uso: python3 scripts/sandbox_r1_corrections.py
"""

import math
from itertools import product

# ─────────────────────────────────────────────────────────────────────────────
# DATOS BASE
# ─────────────────────────────────────────────────────────────────────────────

# Resultado oficial ONPE 100% (votos válidos)
ONPE = {
    'Keiko':   17.2,
    'Sánchez': 12.0,
    'Aliaga':  11.9,
    'Nieto':   11.0,
    'Belmont': 10.2,
}

# ── Encuestas individuales (votos válidos, sin house effects) ─────────────────
# Fórmula: raw_pct / declared_pool × 100
# Declared pool = 100% − undecided% − blank/null%

# IEP (Mar 28-30): declared pool = 56.6% (suma total de candidatos listados)
IEP = {
    'Keiko':   10.0 / 56.6 * 100,  # 17.67%
    'Aliaga':   8.7 / 56.6 * 100,  # 15.37%
    'Sánchez':  6.7 / 56.6 * 100,  # 11.84%
    'Nieto':    5.4 / 56.6 * 100,  #  9.54%
    'Belmont':  5.2 / 56.6 * 100,  #  9.19%
}

# Ipsos tracking (Mar 29 - Apr 1): declared pool = 70% (100−14 undec−16 blank/null)
IPSOS = {
    'Keiko':   12.0 / 70.0 * 100,  # 17.14%
    'Aliaga':   8.0 / 70.0 * 100,  # 11.43%
    'Sánchez':  6.0 / 70.0 * 100,  #  8.57%
    'Nieto':    5.0 / 70.0 * 100,  #  7.14%
    'Belmont':  3.0 / 70.0 * 100,  #  4.29%
}

# Datum simulacro (Mar 25-27): declared pool = 71.1% (100−28.9 undec)
DATUM = {
    'Keiko':   13.2 / 71.1 * 100,  # 18.57%
    'Aliaga':   9.5 / 71.1 * 100,  # 13.36%
    'Sánchez':  5.3 / 71.1 * 100,  #  7.45%
    'Nieto':    4.9 / 71.1 * 100,  #  6.89%
    'Belmont':  1.9 / 71.1 * 100,  #  2.67%
}

# CPI (Mar 21-23): declared pool = 52.7% (100−23.1 undec−24.2 blank/null)
# Belmont no rastreado por CPI
CPI = {
    'Keiko':   10.1 / 52.7 * 100,  # 19.17%
    'Aliaga':  11.7 / 52.7 * 100,  # 22.19% — CPI house effect alto en Aliaga
    'Sánchez':  3.1 / 52.7 * 100,  #  5.88%
    'Nieto':    3.9 / 52.7 * 100,  #  7.40%
    'Belmont':  None,
}

# House effects del modelo (pp a sustraer de la lectura del pollster)
# Fuente: aggregator.js según análisis del Explore agent
# Positivo = pollster sobreestima al candidato → se resta
HOUSE_EFFECTS = {
    'IEP':   {'Aliaga': -1.5, 'Keiko': -0.5, 'Sánchez': 0.0, 'Nieto': 0.0, 'Belmont': 0.0},
    'Ipsos': {'Aliaga':  0.5, 'Keiko': +0.5, 'Sánchez': 0.0, 'Nieto': 0.0, 'Belmont': 0.0},
    'Datum': {'Aliaga':  0.8, 'Keiko': +0.8, 'Sánchez': 0.0, 'Nieto': 0.0, 'Belmont': 0.0},
    'CPI':   {'Aliaga':  1.2, 'Keiko': -0.5, 'Sánchez': 0.0, 'Nieto': 0.0, 'Belmont': 0.0},
}

# ── Polimarket día de la elección (P(ganar la presidencia)) ───────────────────
# Fuente: POST_MORTEM_2026.md tabla 3.2 — columna "PM post-BdU"
# (números al momento de la FOTO FINAL 6:45pm)
PM = {
    'Keiko':   45.5,
    'Aliaga':  18.0,
    'Belmont': 15.5,
    'Nieto':   11.6,
    'Sánchez': 11.0,
}

# ── Parámetros ────────────────────────────────────────────────────────────────
CANDIDATES = list(ONPE.keys())

# Perfil rural (0=ninguno, 1=máximo): guía cuánto del sesgo histórico aplica
# Basado en: plataforma económica, base geográfica, similitud con Castillo 2021
RURAL_INDEX = {
    'Keiko':   0.0,   # derecha, base Lima y costa norte
    'Aliaga':  0.0,   # derecha radical, Lima-céntrico
    'Sánchez': 1.0,   # Juntos por el Perú, base rural-izquierda (= Castillo)
    'Nieto':   0.4,   # centro, base mixta provincial
    'Belmont': 0.6,   # populista, base provincial significativa
}

# Bias histórico de encuestas urbanas vs candidatos rurales (2021 Castillo: −6.2pp)
HISTORICAL_RURAL_BIAS = 6.2   # pp subestimados en 2021

# Decay y pesos del agregador — días antes de elección (12 abr)
POLLS_CONFIG = {
    'IEP':   {'days': 13, 'n': 1200, 'lambda': 0.08},
    'Ipsos': {'days': 11, 'n': 1212, 'lambda': 0.08},
    'Datum': {'days': 17, 'n': 2000, 'lambda': 0.08},
    'CPI':   {'days': 21, 'n': 1300, 'lambda': 0.08},
}

POLLS_DATA = {'IEP': IEP, 'Ipsos': IPSOS, 'Datum': DATUM, 'CPI': CPI}

# ─────────────────────────────────────────────────────────────────────────────
# UTILIDADES
# ─────────────────────────────────────────────────────────────────────────────

def mae(predictions, actuals=ONPE):
    errs = [abs(predictions[c] - actuals[c]) for c in actuals if c in predictions]
    return round(sum(errs) / len(errs), 2)

def errors_table(predictions):
    rows = {}
    for c in CANDIDATES:
        rows[c] = round(predictions[c] - ONPE[c], 1)
    return rows

def poll_weighted_avg(quality_multipliers):
    """
    Calcula el promedio ponderado de encuestas (votos válidos corregidos).
    W = exp(−λ×days) × √(n/2000) × quality × (house_effect aplicado)
    """
    totals = {c: 0.0 for c in CANDIDATES}
    weights = {c: 0.0 for c in CANDIDATES}

    for pollster, cfg in POLLS_CONFIG.items():
        decay = math.exp(-cfg['lambda'] * cfg['days'])
        sample = math.sqrt(cfg['n'] / 2000)
        q = quality_multipliers[pollster]
        w = decay * sample * q

        data = POLLS_DATA[pollster]
        he   = HOUSE_EFFECTS[pollster]

        for c in CANDIDATES:
            if data[c] is None:
                continue
            corrected = data[c] - he.get(c, 0.0)
            totals[c]  += corrected * w
            weights[c] += w

    return {c: totals[c] / weights[c] for c in CANDIDATES}

def apply_rural_correction(polls, correction_pp):
    """
    Aplica un boost rural escalonado por RURAL_INDEX de cada candidato.
    Los pp adicionales vienen de 'otros candidatos' (no del top-5),
    coherente con un escenario de 26 candidatos donde el voto oculto
    migra desde candidatos menores.
    """
    result = {}
    for c in CANDIDATES:
        boost = correction_pp * RURAL_INDEX[c]
        result[c] = polls[c] + boost
    return result

def apply_pm_blend(polls, alpha):
    """
    Mezcla encuestas + PM usando PM raw como vote share (igual que R1 original).
    Refleja el modelo real: pm_pct se usa directamente, sin conversión Φ⁻¹.
    """
    result = {}
    for c in CANDIDATES:
        result[c] = alpha * PM[c] + (1 - alpha) * polls[c]
    return result

def print_scenario(title, predictions, note=None, width=60):
    errs = errors_table(predictions)
    m    = mae(predictions)
    star = "✅" if m < 2.0 else ("🟡" if m < 3.0 else ("⚠️ " if m < 4.0 else "❌"))
    print(f"\n{'═'*width}")
    print(f"  {title}")
    if note:
        print(f"  {note}")
    print(f"{'─'*width}")
    print(f"  {'Candidato':<18} {'Pred':>5}  {'ONPE':>5}  {'Error':>7}")
    print(f"{'─'*width}")
    for c in CANDIDATES:
        pred = predictions[c]
        err  = errs[c]
        sign = '+' if err >= 0 else ''
        print(f"  {c:<18} {pred:>5.1f}%  {ONPE[c]:>5.1f}%  {sign}{err:>5.1f}pp")
    print(f"{'─'*width}")
    print(f"  MAE: {star}  {m} pp")

# ─────────────────────────────────────────────────────────────────────────────
# BASELINE: Modelo real R1 2026 (α=0.77, PM raw, pesos actuales)
# ─────────────────────────────────────────────────────────────────────────────
MODEL_REAL = {
    'Keiko':   30.0,
    'Sánchez':  8.9,
    'Aliaga':  13.0,
    'Nieto':    9.1,
    'Belmont': 11.3,
}

# ── Aggregate actual del modelo (poll-only, α=0) ─────────────────────────────
# Inferido de POST_MORTEM_2026.md sección 6.2: error solo enc. vs BdU
CURRENT_POLLS_ONLY = {
    'Keiko':   14.9,  # BdU 17.2 − error −2.3
    'Aliaga':  12.9,  # BdU 11.9 − error +1.0  → 12.9
    'Sánchez':  7.9,  # BdU 11.3 − error −3.4
    'Nieto':    6.5,  # BdU 11.0 − error −4.5
    'Belmont':  5.8,  # BdU 11.6 − error −5.8
}

# ─────────────────────────────────────────────────────────────────────────────
# CORRECCIÓN C — Aggregate mejorado con IEP dominante (2.0× vs 1.25×)
# ─────────────────────────────────────────────────────────────────────────────
QUALITY_CURRENT  = {'IEP': 1.25, 'Ipsos': 1.00, 'Datum': 1.10, 'CPI': 0.95}
QUALITY_IEP_2X   = {'IEP': 2.00, 'Ipsos': 1.00, 'Datum': 1.10, 'CPI': 0.95}

POLLS_CURRENT  = poll_weighted_avg(QUALITY_CURRENT)
POLLS_IEP_2X   = poll_weighted_avg(QUALITY_IEP_2X)

# ─────────────────────────────────────────────────────────────────────────────
# ESCENARIOS
# ─────────────────────────────────────────────────────────────────────────────

print("=" * 60)
print("  BENCHMARK — Modelo real R1 (α=0.77, PM raw)")
print("=" * 60)
print_scenario("BENCHMARK — Modelo real R1 2026", MODEL_REAL,
               note="α=0.77 | PM raw | Pesos actuales")

# ── Nivel 1: Solo corrección de aggregate (IEP 2.0×) ─────────────────────────
print_scenario(
    "CORRECCIÓN C — IEP 2.0× (polls only, sin rural, sin PM)",
    POLLS_IEP_2X,
    note="Encuestas ponderadas con IEP dominante | α=0 | Sin ajuste rural"
)

# ── Nivel 2: Corrección C + sesgo rural ───────────────────────────────────────
print("\n\n══ SENSIBILIDAD CORRECCIÓN B — Magnitud del ajuste rural ══")
rural_mae_results = {}
for rpp in [2, 3, 4, 5]:
    preds = apply_rural_correction(POLLS_IEP_2X, rpp)
    m = mae(preds)
    rural_mae_results[rpp] = (preds, m)
    print_scenario(
        f"  C + B({rpp}pp) — IEP 2× + rural +{rpp}pp (Sánchez×1.0, Belmont×0.6, Nieto×0.4)",
        preds,
        note=f"α=0 | IEP 2× | Rural boost +{rpp}pp escalado por perfil"
    )

# Elegir la mejor corrección rural
best_rpp = min(rural_mae_results, key=lambda k: rural_mae_results[k][1])
POLLS_BEST_RURAL = rural_mae_results[best_rpp][0]
print(f"\n  ★ Mejor corrección rural: +{best_rpp}pp (MAE {rural_mae_results[best_rpp][1]} pp)")

# ── Nivel 3: C + B + Corrección A (α dinámico) ───────────────────────────────
print("\n\n══ CORRECCIÓN A — α dinámico por N_eff ══")
print("   Fórmula: α_r1_max = α_r2_max / √N_eff, N_eff=5 → 0.60/√5 ≈ 0.27")

alpha_scenarios = [
    (0.00, "α=0.00  — solo encuestas"),
    (0.08, "α=0.08  — óptimo empírico (post-mortem)"),
    (0.15, "α=0.15  — conservador (mitad del cap R1)"),
    (0.27, "α=0.27  — cap N-scaling (0.60/√5)"),
    (0.60, "α=0.60  — cap actual R2"),
    (0.77, "α=0.77  — R1 real"),
]

print(f"\n  {'Escenario':<40} {'MAE':>6}")
print(f"  {'─'*48}")
for alpha, label in alpha_scenarios:
    blended = apply_pm_blend(POLLS_BEST_RURAL, alpha)
    m = mae(blended)
    bar = "█" * int(m * 8)
    print(f"  C+B({best_rpp}pp)+{label:<34} {m:>5.2f}pp  {bar}")

# ── Escenarios combinados finales ─────────────────────────────────────────────
print()
ALPHA_NSCALING = round(0.60 / math.sqrt(5), 2)
ALPHA_OPTIMAL  = 0.08
ALPHA_R1_REAL  = 0.77

best_rural_preds = POLLS_BEST_RURAL  # IEP 2× + rural optimal

print_scenario(
    f"ÓPTIMO TEÓRICO — C + B({best_rpp}pp) + A(α=0.00)",
    apply_rural_correction(POLLS_IEP_2X, best_rpp),
    note="IEP 2× | Rural escalado | Sin PM (mejor resultado puro)"
)
print_scenario(
    f"ÓPTIMO PRÁCTICO — C + B({best_rpp}pp) + A(α={ALPHA_NSCALING})",
    apply_pm_blend(best_rural_preds, ALPHA_NSCALING),
    note=f"IEP 2× | Rural escalado | α={ALPHA_NSCALING} (cap N-scaling 0.60/√5)"
)
print_scenario(
    f"ÓPTIMO EMPÍRICO — C + B({best_rpp}pp) + A(α={ALPHA_OPTIMAL})",
    apply_pm_blend(best_rural_preds, ALPHA_OPTIMAL),
    note=f"IEP 2× | Rural escalado | α={ALPHA_OPTIMAL} (óptimo retrospectivo)"
)

# ─────────────────────────────────────────────────────────────────────────────
# TABLA RESUMEN FINAL
# ─────────────────────────────────────────────────────────────────────────────
print(f"\n\n{'═'*65}")
print("  RESUMEN FINAL — Comparación completa de escenarios (MAE vs ONPE)")
print(f"{'─'*65}")

summary_scenarios = [
    ("Benchmark — Modelo real (α=0.77, PM raw)",
     MODEL_REAL),
    ("Polls-only actual (α=0, pesos actuales)",
     CURRENT_POLLS_ONLY),
    ("Solo C — IEP 2× polls (α=0)",
     POLLS_IEP_2X),
    (f"C + B({best_rpp}pp) — IEP 2× + rural (α=0)",
     apply_rural_correction(POLLS_IEP_2X, best_rpp)),
    (f"C + B({best_rpp}pp) + A(α={ALPHA_NSCALING}) — N-scaling",
     apply_pm_blend(best_rural_preds, ALPHA_NSCALING)),
    (f"C + B({best_rpp}pp) + A(α={ALPHA_OPTIMAL}) — empírico",
     apply_pm_blend(best_rural_preds, ALPHA_OPTIMAL)),
    ("IEP sola (MAE real histórico)",
     {c: IEP[c] - HOUSE_EFFECTS['IEP'].get(c, 0) for c in CANDIDATES}),
]

for label, preds in summary_scenarios:
    m   = mae(preds)
    bar = "█" * int(m * 8)
    star = "✅" if m < 2.0 else ("🟡" if m < 3.0 else ("⚠️ " if m < 4.0 else "❌"))
    print(f"  {star} {label:<46}  {m:.2f}pp  {bar}")

print(f"{'─'*65}")
print()

# ─────────────────────────────────────────────────────────────────────────────
# ANÁLISIS DE CONTRIBUCIÓN POR CORRECCIÓN
# ─────────────────────────────────────────────────────────────────────────────
print(f"{'═'*65}")
print("  CONTRIBUCIÓN MARGINAL DE CADA CORRECCIÓN (sobre base anterior)")
print(f"{'─'*65}")

mae_real    = mae(MODEL_REAL)
mae_polonly = mae(CURRENT_POLLS_ONLY)
mae_iep2x   = mae(POLLS_IEP_2X)
mae_rural   = mae(apply_rural_correction(POLLS_IEP_2X, best_rpp))
mae_pm_opt  = mae(apply_pm_blend(best_rural_preds, ALPHA_NSCALING))

print(f"  Modelo real (PM raw α=0.77)           →  {mae_real:.2f} pp  (baseline)")
print(f"  + Bajar α a 0  (quitar PM)            →  {mae_polonly:.2f} pp  (−{mae_real-mae_polonly:.2f} pp)")
print(f"  + IEP 2× (Corrección C)               →  {mae_iep2x:.2f} pp  (−{mae_polonly-mae_iep2x:.2f} pp)")
print(f"  + Rural +{best_rpp}pp (Corrección B)         →  {mae_rural:.2f} pp  (−{mae_iep2x-mae_rural:.2f} pp)")
print(f"  + α={ALPHA_NSCALING} N-scaling (Corrección A) →  {mae_pm_opt:.2f} pp  (±{abs(mae_rural-mae_pm_opt):.2f} pp)")
print()
print(f"  Mejora total: {mae_real:.2f} → {min(mae_rural, mae_pm_opt):.2f} pp")
print(f"  vs IEP mejor encuestadora individual: 1.31 pp")
print(f"{'═'*65}")
print()

# ─────────────────────────────────────────────────────────────────────────────
# NOTA METODOLÓGICA
# ─────────────────────────────────────────────────────────────────────────────
print("NOTAS METODOLÓGICAS")
print("─" * 65)
print(f"  Poll aggregate: {len(POLLS_CONFIG)} encuestadoras, votos válidos normalizados")
print(f"  House effects: sustraídos de la lectura de cada pollster")
print(f"  Decay: exp(−λ×días) con λ={POLLS_CONFIG['IEP']['lambda']}")
print(f"  Rural index: Sánchez 1.0, Belmont 0.6, Nieto 0.4 (otros 0.0)")
print(f"  Base histórica sesgo rural: {HISTORICAL_RURAL_BIAS}pp (Castillo 2021)")
print(f"  PM blend: raw PM% sin conversión Φ⁻¹ (igual que modelo R1 original)")
print(f"  α N-scaling: α_max = α_r2_max/√N_eff = 0.60/√5 = {ALPHA_NSCALING}")
print()
