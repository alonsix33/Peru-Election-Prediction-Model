"""
Genera gráfico: Proyector vs Conteo crudo — R2 2021 noche electoral
Datos del backtest real (sandbox_r2_backtest_2021.py) + timestamps RPP/Gestión
"""

import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
import matplotlib.ticker as ticker
import numpy as np
from scipy.interpolate import make_interp_spline

# ── Datos del backtest real ──────────────────────────────────────
# Fuente: sandbox_r2_backtest_2021.py (jmcastagnetto dataset, 1835 distritos)
pct_actas = [5, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100]
raw_kf    = [66.49, 67.43, 64.93, 64.56, 64.42, 62.35, 60.69, 58.68, 56.22, 53.39, 49.70]
proj_kf   = [46.20, 46.42, 46.87, 47.64, 46.19, 48.26, 48.40, 49.06, 48.92, 49.43, 49.70]

# Error absoluto real del proyector en cada punto → define el ancho de la banda
# (proj - 49.875 ONPE oficial, valores del backtest)
proj_errors = [3.50, 3.28, 2.83, 2.06, 3.51, 1.44, 1.30, 0.64, 0.78, 0.27, 0.00]

RESULT = 49.875  # KF% ONPE oficial

# ── Interpolación suave ──────────────────────────────────────────
x = np.array(pct_actas)
x_smooth = np.linspace(5, 100, 400)

raw_smooth   = make_interp_spline(x, raw_kf,      k=3)(x_smooth)
proj_smooth  = make_interp_spline(x, proj_kf,     k=3)(x_smooth)
error_smooth = make_interp_spline(x, proj_errors, k=3)(x_smooth)
error_smooth = np.clip(error_smooth, 0, None)  # no negativos

# ── Colores ───────────────────────────────────────────────────────
KEIKO_COLOR = '#F97316'
PROJ_COLOR  = '#22C55E'
GRID_COLOR  = '#3F3832'
TEXT_COLOR  = '#F7F4EF'
MUTED_COLOR = '#A8A29E'

# ── Canvas ───────────────────────────────────────────────────────
fig, ax = plt.subplots(figsize=(12, 6.75))
fig.patch.set_facecolor('#1C1917')
ax.set_facecolor('#1C1917')

# ── Banda de error dinámica (se angosta conforme entran más actas) ─
ax.fill_between(x_smooth,
                proj_smooth - error_smooth,
                proj_smooth + error_smooth,
                alpha=0.15, color=PROJ_COLOR)

# ── Línea 50% ────────────────────────────────────────────────────
ax.axhline(50, color='#FFFFFF', linewidth=1.2, linestyle='--', alpha=0.35, zorder=2)
ax.text(101.2, 50, '50%', color='#FFFFFF', alpha=0.45, fontsize=9,
        va='center', fontweight='bold')

# ── Flip del raw ─────────────────────────────────────────────────
ax.axvline(92.6, color=KEIKO_COLOR, linewidth=0.9, linestyle=':', alpha=0.4, zorder=2)
ax.text(92.6, 51.2, '11:29 AM', color=KEIKO_COLOR,
        fontsize=8, ha='center', va='bottom', alpha=0.65)

# ── Líneas principales ───────────────────────────────────────────
ax.plot(x_smooth, raw_smooth,  color=KEIKO_COLOR, linewidth=2.8,
        label='Conteo crudo ONPE', zorder=5)
ax.plot(x_smooth, proj_smooth, color=PROJ_COLOR,  linewidth=2.8,
        label='Proyector estratificado', zorder=5)

# Puntos en cada milestone
ax.scatter(pct_actas, raw_kf,  color=KEIKO_COLOR, s=38, zorder=6)
ax.scatter(pct_actas, proj_kf, color=PROJ_COLOR,  s=38, zorder=6)

# ── Resultado final ──────────────────────────────────────────────
ax.scatter([100], [RESULT], color='#FFFFFF', s=70, zorder=7)
ax.text(98.5, RESULT + 0.6, f'Real: {RESULT}%',
        color='#FFFFFF', fontsize=8.5, ha='right', va='bottom', alpha=0.8)

# ── Ejes ─────────────────────────────────────────────────────────
ax.set_xlim(3, 106)
ax.set_ylim(40, 72)
ax.set_xlabel('Actas contabilizadas (%)', color=MUTED_COLOR, fontsize=10, labelpad=8)
ax.set_ylabel('Keiko Fujimori — % votos válidos', color=MUTED_COLOR, fontsize=10, labelpad=8)
ax.tick_params(colors=MUTED_COLOR, labelsize=9)
for spine in ax.spines.values():
    spine.set_color(GRID_COLOR)
ax.yaxis.set_major_formatter(ticker.FormatStrFormatter('%g%%'))
ax.set_xticks([5, 20, 40, 60, 80, 92.6, 100])
ax.set_xticklabels(['5%', '20%', '40%', '60%', '80%', '92.6%\n(raw flip)', '100%'],
                   color=MUTED_COLOR)
ax.grid(axis='y', color=GRID_COLOR, linewidth=0.6, alpha=0.7)

# ── Título y leyenda ─────────────────────────────────────────────
ax.set_title('Backtest noche electoral · R2 2021 (Castillo vs Fujimori)',
             color=TEXT_COLOR, fontsize=13, fontweight='bold', pad=14)

legend_handles = [
    mpatches.Patch(color=KEIKO_COLOR, label='Conteo crudo ONPE'),
    mpatches.Patch(color=PROJ_COLOR,  label='Proyector estratificado  (banda = error real del backtest)'),
]
leg = ax.legend(handles=legend_handles, loc='upper right',
                framealpha=0.2, facecolor='#2C2825',
                edgecolor=GRID_COLOR, labelcolor=TEXT_COLOR, fontsize=9)

# ── Nota al pie ──────────────────────────────────────────────────
fig.text(0.5, 0.01,
         'El proyector mostró a Castillo ganando desde el 5% de actas. '
         'El conteo crudo lo mostró ganando recién a las 11:29 AM — 12.5 horas después.',
         ha='center', color=MUTED_COLOR, fontsize=8.5)

plt.tight_layout(rect=[0, 0.04, 1, 1])
out = 'scripts/backtest_2021_chart.png'
plt.savefig(out, dpi=150, bbox_inches='tight', facecolor=fig.get_facecolor())
print(f'Guardado: {out}')
plt.close()
