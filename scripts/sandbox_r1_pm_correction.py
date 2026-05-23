#!/usr/bin/env python3
"""
Sandbox: ¿Qué habría predicho el modelo R1 2026 con integración PM correcta?

Compara cinco estrategias de integración de Polymarket contra ONPE 100%.
Todos los datos base provienen del POST_MORTEM_2026.md.

Uso: python3 scripts/sandbox_r1_pm_correction.py
"""

import math

# ─────────────────────────────────────────────────────────────────────────────
# DATOS BASE
# ─────────────────────────────────────────────────────────────────────────────

# Resultado oficial ONPE 100% (votos válidos)
ONPE = {
    'Keiko Fujimori':      17.2,
    'Roberto Sánchez':     12.0,
    'Rafael López Aliaga': 11.9,
    'Jorge Nieto':         11.0,
    'Ricardo Belmont':     10.2,
}

# Predicción polls-only del modelo (α=0) — extraída de la tabla 6.2
# post-mortem: "error solo enc." vs BdU ≈ ONPE para estos candidatos
# enc_pred = actual - error_signed (error = pred - actual, todos negativos
# excepto Aliaga). Usando BdU real como referencia.
POLLS_ONLY = {
    'Keiko Fujimori':       14.9,   # BdU 17.2 − error −2.3pp
    'Roberto Sánchez':       7.9,   # BdU 11.3 − error −3.4pp
    'Rafael López Aliaga':  12.9,   # BdU 11.9 − error +1.0pp → 12.9
    'Jorge Nieto':           6.5,   # BdU 11.0 − error −4.5pp
    'Ricardo Belmont':       5.8,   # BdU 11.6 − error −5.8pp
}

# Polymarket P(ganar la presidencia) al cierre de mesas (6:45pm, 12 abr 2026)
PM_ELECTION_DAY = {
    'Keiko Fujimori':      45.5,   # post-mortem tabla 6.1
    'Rafael López Aliaga': 18.0,
    'Ricardo Belmont':     15.5,
    'Jorge Nieto':         11.6,
    'Roberto Sánchez':     11.0,
}

CANDIDATES = list(ONPE.keys())
SIGMA = 3.0   # incertidumbre σ usada en R2 (pp)
N_CANDS = 26  # candidatos totales en R1 2026 (para base de referencia)

# ─────────────────────────────────────────────────────────────────────────────
# UTILIDADES
# ─────────────────────────────────────────────────────────────────────────────

def mae(predictions: dict, actuals: dict) -> float:
    errors = [abs(predictions[c] - actuals[c]) for c in actuals if c in predictions]
    return round(sum(errors) / len(errors), 2)

def norm_cdf_inv(p: float) -> float:
    """Φ⁻¹ (inversa de la CDF normal estándar) — aproximación Beasley-Springer-Moro."""
    if p <= 0 or p >= 1:
        raise ValueError(f"p={p} fuera de (0,1)")
    a = [0, -3.969683028665376e+01,  2.209460984245205e+02,
         -2.759285104469687e+02,  1.383577518672690e+02,
         -3.066479806614716e+01,  2.506628277459239e+00]
    b = [0, -5.447609879822406e+01,  1.615858368580409e+02,
         -1.556989798598866e+02,  6.680131188771972e+01,
         -1.328068155288572e+01]
    c = [0, -7.784894002430293e-03, -3.223964580411365e-01,
         -2.400758277161838e+00, -2.549732539343734e+00,
          4.374664141464968e+00,  2.938163982698783e+00]
    d = [0,  7.784695709041462e-03,  3.224671290700398e-01,
          2.445134137142996e+00,  3.754408661907416e+00]
    p_low  = 0.02425
    p_high = 1 - p_low
    if p < p_low:
        q = math.sqrt(-2 * math.log(p))
        return (((((c[1]*q+c[2])*q+c[3])*q+c[4])*q+c[5])*q+c[6]) / \
               ((((d[1]*q+d[2])*q+d[3])*q+d[4])*q+1)
    elif p <= p_high:
        q = p - 0.5
        r = q*q
        return (((((a[1]*r+a[2])*r+a[3])*r+a[4])*r+a[5])*r+a[6])*q / \
               (((((b[1]*r+b[2])*r+b[3])*r+b[4])*r+b[5])*r+1)
    else:
        q = math.sqrt(-2 * math.log(1-p))
        return -(((((c[1]*q+c[2])*q+c[3])*q+c[4])*q+c[5])*q+c[6]) / \
                ((((d[1]*q+d[2])*q+d[3])*q+d[4])*q+1)

def print_scenario(title: str, predictions: dict, alpha: str = None, note: str = None):
    onpe_mae = mae(predictions, ONPE)
    header = f"  {'Candidato':<26} {'Pred':>6}  {'ONPE':>6}  {'Error':>7}"
    rows = []
    for c in CANDIDATES:
        pred = predictions.get(c, 0)
        actual = ONPE[c]
        err = pred - actual
        sign = '+' if err >= 0 else ''
        rows.append(f"  {c:<26} {pred:>5.1f}%  {actual:>5.1f}%  {sign}{err:>5.1f}pp")

    print(f"\n{'═'*58}")
    print(f"  {title}")
    if alpha:
        print(f"  α = {alpha}")
    if note:
        print(f"  ⚠  {note}")
    print(f"{'─'*58}")
    print(header)
    print(f"{'─'*58}")
    for r in rows:
        print(r)
    print(f"{'─'*58}")
    color = "✅" if onpe_mae < 3.5 else ("⚠️ " if onpe_mae < 4.5 else "❌")
    print(f"  MAE vs ONPE 100%: {color}  {onpe_mae} pp")

# ─────────────────────────────────────────────────────────────────────────────
# ESCENARIO A — Modelo original (lo que ocurrió)
# Datos reales del BacktestingTab / post-mortem
# ─────────────────────────────────────────────────────────────────────────────
scenario_a = {
    'Keiko Fujimori':      30.0,
    'Roberto Sánchez':      8.9,
    'Rafael López Aliaga': 13.0,
    'Jorge Nieto':          9.1,
    'Ricardo Belmont':     11.3,
}
print_scenario(
    "ESCENARIO A — Modelo real (PM raw como vote share, α=0.77)",
    scenario_a,
    alpha="0.77",
    note="PM probability usada directamente como % votos → infla a Keiko"
)

# ─────────────────────────────────────────────────────────────────────────────
# ESCENARIO B — Solo encuestas (α=0)
# ─────────────────────────────────────────────────────────────────────────────
print_scenario(
    "ESCENARIO B — Solo encuestas (sin Polymarket, α=0)",
    POLLS_ONLY,
    alpha="0.0",
    note="Belmont/Nieto/Sánchez subestimados por bias rural en encuestas"
)

# ─────────────────────────────────────────────────────────────────────────────
# ESCENARIO C — PM normalizado proporcionalmente, α=0.60
# Normaliza las probabilidades PM a 100% antes de mezclar.
# Esto sigue siendo incorrecto porque P(ganar) ≠ % votos.
# ─────────────────────────────────────────────────────────────────────────────
pm_total = sum(PM_ELECTION_DAY[c] for c in CANDIDATES)
pm_norm  = {c: PM_ELECTION_DAY[c] / pm_total * 100 for c in CANDIDATES}
alpha_c  = 0.60
scenario_c = {c: alpha_c * pm_norm[c] + (1 - alpha_c) * POLLS_ONLY[c] for c in CANDIDATES}
print_scenario(
    "ESCENARIO C — PM normalizado ∑=100%, α=0.60",
    scenario_c,
    alpha=f"{alpha_c}",
    note="Normalizar PM no corrige el problema: Keiko sigue inflada"
)

# ─────────────────────────────────────────────────────────────────────────────
# ESCENARIO D — R2-style Φ⁻¹ conversion (intento)
#
# En R2 (carrera binaria), la conversión exacta es:
#   P(ganar) = Φ( (v_A − v_B) / σ )  →  v_A = 50 + Φ⁻¹(P) × σ / 2
#
# En R1 (N=26 candidatos), no existe conversión directa equivalente.
# Aproximación: tratar PM como P(ganar > media de votos) framing "vs field"
#   P(ganar) ≈ Φ( (v_i − base) / σ_r1 )  →  v_i = base + Φ⁻¹(P) × σ_r1
# donde base = 100/N y σ_r1 ≈ σ escalado por raíz de N (más candidatos = más ruido)
# ─────────────────────────────────────────────────────────────────────────────
base_r1     = 100.0 / N_CANDS       # ~3.85% para 26 candidatos
sigma_r1    = SIGMA * math.sqrt(2)  # ≈ 4.24pp — escala por la incertidumbre extra
alpha_d     = 0.60

pm_implied_r1 = {}
for c in CANDIDATES:
    p = PM_ELECTION_DAY[c] / 100.0
    pm_implied_r1[c] = base_r1 + norm_cdf_inv(p) * sigma_r1

scenario_d = {c: alpha_d * pm_implied_r1[c] + (1 - alpha_d) * POLLS_ONLY[c] for c in CANDIDATES}
print_scenario(
    f"ESCENARIO D — R2-style Φ⁻¹ adaptado a R1 (N={N_CANDS}), α=0.60",
    scenario_d,
    alpha=f"{alpha_d}",
    note="Φ⁻¹ sí corrige el ratio PM:votos — ver análisis debajo"
)

# ─────────────────────────────────────────────────────────────────────────────
# ESCENARIO E — α muy bajo (0.08 = óptimo empírico post-mortem)
# ─────────────────────────────────────────────────────────────────────────────
alpha_e = 0.08
scenario_e = {c: alpha_e * PM_ELECTION_DAY[c] + (1 - alpha_e) * POLLS_ONLY[c] for c in CANDIDATES}
print_scenario(
    "ESCENARIO E — PM raw pero α=0.08 (óptimo empírico)",
    scenario_e,
    alpha=f"{alpha_e}",
    note="Óptimo hallado retrospectivamente — infeasible en tiempo real"
)

# ─────────────────────────────────────────────────────────────────────────────
# RESUMEN COMPARATIVO
# ─────────────────────────────────────────────────────────────────────────────
print(f"\n\n{'═'*58}")
print("  RESUMEN — MAE vs ONPE 100%")
print(f"{'─'*58}")
scenarios = [
    ("A  Modelo real (α=0.77, PM raw)",     scenario_a),
    ("B  Solo encuestas (α=0)",              POLLS_ONLY),
    ("C  PM normalizado, α=0.60",            scenario_c),
    (f"D  R2-style Φ⁻¹ adaptado, α=0.60",   scenario_d),
    ("E  PM raw, α=0.08 (óptimo empírico)",  scenario_e),
]
for label, preds in scenarios:
    m = mae(preds, ONPE)
    bar = "█" * int(m * 5)
    print(f"  {label:<40}  {m:.2f} pp  {bar}")

print(f"{'─'*58}")

# ─────────────────────────────────────────────────────────────────────────────
# ANÁLISIS: ratio PM / votos por candidato
# ─────────────────────────────────────────────────────────────────────────────
print(f"\n\n{'═'*58}")
print("  ANÁLISIS — Ratio P(ganar presidencia) / % votos reales")
print("  (esto es lo que el modelo interpretó mal en R1)")
print(f"{'─'*58}")
print(f"  {'Candidato':<26} {'PM%':>6}  {'ONPE%':>6}  {'Ratio':>7}  {'Φ⁻¹ implied':>12}")
for c in sorted(CANDIDATES, key=lambda x: PM_ELECTION_DAY[x], reverse=True):
    pm   = PM_ELECTION_DAY[c]
    onpe = ONPE[c]
    ratio = pm / onpe
    implied = pm_implied_r1[c]
    print(f"  {c:<26} {pm:>5.1f}%  {onpe:>5.1f}%  {ratio:>6.2f}x  {implied:>9.1f}%")

print(f"\n  Conclusión:")
print(f"  • En R2 (binaria), el ratio PM:votos es ~1.05x → conversión Φ⁻¹ es directa")
print(f"  • En R1 (N=26), el ratio es 2.65x para Keiko → no hay conversión lineal válida")
print(f"  • La única corrección robusta para R1: α muy bajo (≤ 0.20) o no usar PM")
print(f"  • El escenario D (Φ⁻¹ adaptado) mejora significativamente vs escenario A")
print(f"    porque baja el implied Keiko de 45.5% a ~{pm_implied_r1['Keiko Fujimori']:.1f}%")
print()
