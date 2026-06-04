"""
Backtest noche electoral R2 2021 — Proyector vs Conteo crudo
Datos: milestones reales documentados por RPP/Gestión/La República live blogs
"""

import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
import matplotlib.ticker as ticker
import numpy as np
from scipy.interpolate import PchipInterpolator

# ── Datos reales documentados (fuente: RPP/Gestión live blogs Jun 6-7 2021) ──
# pct_actas, raw_kf%, proj_kf% (proyector = 49.875 + error_proy de CLAUDE.md)
# Proyector calculado como: resultado_real - error_proyector
#   42%  error -2.2pp → proj = 49.875 - 2.2  = 47.68
#   80.7% error -0.7pp → proj = 49.875 - 0.7  = 49.18
#   86.5% error -0.5pp → proj = 49.875 - 0.5  = 49.38
#   88.2% error -0.2pp → proj = 49.875 - 0.2  = 49.68
#   91.2% error -0.3pp → proj = 49.875 - 0.3  = 49.58
#   92.6% error -0.2pp → proj = 49.875 - 0.2  = 49.68
#   100%  error  0.0pp → proj = 49.875

MILESTONES = [
    # (pct_actas, raw_kf, proj_kf, hora)
    (42.0,  52.9,   47.68, "23:04"),
    (80.7,  51.5,   49.18, "02:38"),
    (86.5,  50.8,   49.38, "04:12"),
    (88.2,  50.4,   49.68, "05:30"),
    (91.2,  50.1,   49.58, "09:06"),
    (92.6,  49.9,   49.68, "11:29"),   # ← raw cruza 50%
    (93.0,  49.875, 49.68, "13:04"),
    (100.0, 49.875, 49.875, "final"),
]

RESULT = 49.875

pct   = np.array([m[0] for m in MILESTONES])
raw   = np.array([m[1] for m in MILESTONES])
proj  = np.array([m[2] for m in MILESTONES])
horas = [m[3] for m in MILESTONES]

# Error absoluto del proyector en cada punto (para banda dinámica)
errors = np.array([2.2, 0.7, 0.5, 0.2, 0.3, 0.2, 0.2, 0.0])

# ── Interpolación monotónica (PCHIP — sin overshooting) ───────────
x_smooth = np.linspace(42, 100, 500)
raw_smooth  = PchipInterpolator(pct, raw)(x_smooth)
proj_smooth = PchipInterpolator(pct, proj)(x_smooth)
err_smooth  = PchipInterpolator(pct, errors)(x_smooth)
err_smooth  = np.clip(err_smooth, 0, None)

# ── Colores ────────────────────────────────────────────────────────
KEIKO_COLOR = '#F97316'
PROJ_COLOR  = '#22C55E'
GRID_COLOR  = '#3F3832'
TEXT_COLOR  = '#F7F4EF'
MUTED_COLOR = '#A8A29E'

# ── Canvas ─────────────────────────────────────────────────────────
fig, ax = plt.subplots(figsize=(12, 6.75))
fig.patch.set_facecolor('#1C1917')
ax.set_facecolor('#1C1917')

# ── Banda de error dinámica ────────────────────────────────────────
ax.fill_between(x_smooth,
                proj_smooth - err_smooth,
                proj_smooth + err_smooth,
                alpha=0.15, color=PROJ_COLOR)

# ── Línea 50% ─────────────────────────────────────────────────────
ax.axhline(50, color='#FFFFFF', linewidth=1.2, linestyle='--', alpha=0.35, zorder=2)
ax.text(100.5, 50, '50%', color='#FFFFFF', alpha=0.5, fontsize=9,
        va='center', fontweight='bold')

# ── Marcador flip del raw (alineado exactamente con cruce 50%) ─────
FLIP_PCT = 92.6
ax.axvline(FLIP_PCT, color=KEIKO_COLOR, linewidth=0.9, linestyle=':', alpha=0.5, zorder=2)
ax.text(FLIP_PCT - 0.4, 50.35, '11:29 AM\n(raw cruza 50%)',
        color=KEIKO_COLOR, fontsize=7.8, ha='right', va='bottom', alpha=0.8)

# ── Líneas principales ─────────────────────────────────────────────
ax.plot(x_smooth, raw_smooth,  color=KEIKO_COLOR, linewidth=2.8,
        label='Conteo crudo ONPE', zorder=5)
ax.plot(x_smooth, proj_smooth, color=PROJ_COLOR,  linewidth=2.8,
        label='Proyector estratificado', zorder=5)

# Puntos en milestones reales
ax.scatter(pct, raw,  color=KEIKO_COLOR, s=40, zorder=6)
ax.scatter(pct, proj, color=PROJ_COLOR,  s=40, zorder=6)

# ── Labels de hora en eje X ────────────────────────────────────────
for m in MILESTONES[:-1]:  # skip "final"
    ax.text(m[0], 47.0, m[3], color=MUTED_COLOR, fontsize=7.2,
            ha='center', va='top', rotation=0)

# ── Resultado final ────────────────────────────────────────────────
ax.scatter([100], [RESULT], color='#FFFFFF', s=70, zorder=7)
ax.text(99.5, RESULT + 0.25, f'Real: {RESULT}%',
        color='#FFFFFF', fontsize=8, ha='right', va='bottom', alpha=0.8)

# ── Ejes ───────────────────────────────────────────────────────────
ax.set_xlim(40, 102)
ax.set_ylim(46.5, 54.5)
ax.set_xlabel('Actas contabilizadas (%)', color=MUTED_COLOR, fontsize=10, labelpad=8)
ax.set_ylabel('Keiko Fujimori — % votos válidos', color=MUTED_COLOR, fontsize=10, labelpad=8)
ax.tick_params(colors=MUTED_COLOR, labelsize=9)
for spine in ax.spines.values():
    spine.set_color(GRID_COLOR)
ax.yaxis.set_major_formatter(ticker.FormatStrFormatter('%g%%'))
ax.set_xticks([42, 80.7, 86.5, 88.2, 91.2, 92.6, 100])
ax.set_xticklabels(['42%', '81%', '87%', '88%', '91%', '92.6%', '100%'],
                   color=MUTED_COLOR)
ax.grid(axis='y', color=GRID_COLOR, linewidth=0.6, alpha=0.6)

# ── Título y leyenda ───────────────────────────────────────────────
ax.set_title('Backtest noche electoral · Segunda Vuelta 2021 · Proyección Keiko Fujimori',
             color=TEXT_COLOR, fontsize=13, fontweight='bold', pad=14)

legend_handles = [
    mpatches.Patch(color=KEIKO_COLOR, label='Conteo crudo ONPE'),
    mpatches.Patch(color=PROJ_COLOR,
                   label='Proyector estratificado  (banda = margen de error real)'),
]
ax.legend(handles=legend_handles, loc='upper right',
          framealpha=0.2, facecolor='#2C2825',
          edgecolor=GRID_COLOR, labelcolor=TEXT_COLOR, fontsize=9)

# ── Nota al pie ────────────────────────────────────────────────────
fig.text(0.5, 0.01,
         'Primer snapshot: 23:04 PET (42% actas). '
         'El proyector mostró a Castillo ganando desde el inicio. '
         'El crudo lo mostró recién a las 11:29 AM — 12.5 horas después.',
         ha='center', color=MUTED_COLOR, fontsize=8.5)

plt.tight_layout(rect=[0, 0.04, 1, 1])
out = 'scripts/backtest_2021_chart.png'
plt.savefig(out, dpi=150, bbox_inches='tight', facecolor=fig.get_facecolor())
print(f'Guardado: {out}')
plt.close()
