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

# ── Datos del backtest real ──────────────────────────────────────
# Fuente: sandbox_r2_backtest_2021.py (jmcastagnetto dataset, 1835 distritos)
# KF% en cada milestone de actas
pct_actas = [0, 5, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100]

raw_kf    = [None, 66.49, 67.43, 64.93, 64.56, 64.42, 62.35, 60.69, 58.68, 56.22, 53.39, 49.70]
proj_kf   = [None, 46.20, 46.42, 46.87, 47.64, 46.19, 48.26, 48.40, 49.06, 48.92, 49.43, 49.70]

# Resultado final ONPE oficial
RESULT = 49.875  # KF%

# Timestamps reales (fuente: RPP/Gestión live blogs, hora PET)
MILESTONES = {
    42: "23:04\n(42%)",
    80.7: "02:38\n(81%)",
    86.5: "04:12\n(87%)",
    88.2: "05:30\n(88%)",
    91.2: "09:06\n(91%)",
    92.6: "11:29\n(93%)\n← Raw se voltea",
}

# Interpolación para curva suave
from scipy.interpolate import make_interp_spline
pct_num   = [p for p, r in zip(pct_actas, raw_kf)  if r is not None]
raw_num   = [r for p, r in zip(pct_actas, raw_kf)  if r is not None]
proj_num  = [p for p, r in zip(pct_actas, proj_kf) if r is not None]
proj_vals = [r for p, r in zip(pct_actas, proj_kf) if r is not None]

x_smooth = np.linspace(5, 100, 300)
try:
    from scipy.interpolate import make_interp_spline
    raw_smooth  = make_interp_spline(pct_num,  raw_num,  k=3)(x_smooth)
    proj_smooth = make_interp_spline(proj_num, proj_vals, k=3)(x_smooth)
except ImportError:
    raw_smooth  = np.interp(x_smooth, pct_num,  raw_num)
    proj_smooth = np.interp(x_smooth, proj_num, proj_vals)

# ── Layout ───────────────────────────────────────────────────────
fig, ax = plt.subplots(figsize=(12, 6.75))  # 1200×675 → Twitter ratio
fig.patch.set_facecolor('#1C1917')
ax.set_facecolor('#1C1917')

KEIKO_COLOR   = '#F97316'
PROJ_COLOR    = '#22C55E'
GRID_COLOR    = '#3F3832'
TEXT_COLOR    = '#F7F4EF'
MUTED_COLOR   = '#A8A29E'

# ── Zona de error del proyector (banda ±3pp) ─────────────────────
ax.fill_between(x_smooth, proj_smooth - 3.5, proj_smooth + 3.5,
                alpha=0.12, color=PROJ_COLOR, label='_nolegend_')

# ── Línea 50% ────────────────────────────────────────────────────
ax.axhline(50, color='#FFFFFF', linewidth=1.2, linestyle='--', alpha=0.4, zorder=2)
ax.text(101.5, 50, '50%', color='#FFFFFF', alpha=0.5, fontsize=9,
        va='center', fontweight='bold')

# ── Zona "Keiko arriba" (raw la mostraba ganando) ────────────────
ax.fill_between([5, 92.6], [50, 50], [70, 70],
                alpha=0.06, color=KEIKO_COLOR)
ax.text(48, 68.5, '← Keiko "ganando" según conteo crudo', color=KEIKO_COLOR,
        alpha=0.55, fontsize=8.5, ha='center')

# ── Líneas principales ───────────────────────────────────────────
ax.plot(x_smooth, raw_smooth, color=KEIKO_COLOR, linewidth=2.5,
        label='Conteo crudo ONPE', zorder=5)
ax.plot(x_smooth, proj_smooth, color=PROJ_COLOR, linewidth=2.5,
        label='Proyector estratificado', zorder=5)

# Puntos en los milestones reales
ax.scatter(pct_num,  raw_num,  color=KEIKO_COLOR, s=40, zorder=6)
ax.scatter(proj_num, proj_vals, color=PROJ_COLOR,  s=40, zorder=6)

# ── Resultado final ──────────────────────────────────────────────
ax.axvline(100, color=MUTED_COLOR, linewidth=0.8, linestyle=':', alpha=0.5)
ax.scatter([100], [RESULT], color='#FFFFFF', s=80, zorder=7)
ax.text(99, RESULT - 1.4, f'Real: {RESULT}%', color='#FFFFFF',
        fontsize=8.5, ha='right', va='top')

# ── Flip del crudo ───────────────────────────────────────────────
ax.axvline(92.6, color=KEIKO_COLOR, linewidth=1, linestyle=':', alpha=0.45)
ax.text(92.6, 51.5, '11:29 AM\n12.5h después', color=KEIKO_COLOR,
        fontsize=7.5, ha='center', va='bottom', alpha=0.8)

# ── Anotaciones timestamp principales ────────────────────────────
ann_pts = [(42, 'raw', '23:04\n(~42%)'), (42, 'proj', None)]
ax.annotate('23:04\nPrimer dato\n(42% actas)',
            xy=(42, 66.49), xytext=(30, 63),
            color=MUTED_COLOR, fontsize=7.5,
            arrowprops=dict(arrowstyle='->', color=MUTED_COLOR, lw=0.8))
ax.annotate('',
            xy=(42, 46.19), xytext=(30, 49),
            arrowprops=dict(arrowstyle='->', color=MUTED_COLOR, lw=0.8))

# ── Ejes ─────────────────────────────────────────────────────────
ax.set_xlim(3, 105)
ax.set_ylim(40, 72)
ax.set_xlabel('Actas contabilizadas (%)', color=MUTED_COLOR, fontsize=10)
ax.set_ylabel('% votos válidos KF', color=MUTED_COLOR, fontsize=10)
ax.tick_params(colors=MUTED_COLOR, labelsize=9)
for spine in ax.spines.values():
    spine.set_color(GRID_COLOR)
ax.yaxis.set_major_formatter(ticker.FormatStrFormatter('%g%%'))
ax.set_xticks([5, 20, 40, 60, 80, 92.6, 100])
ax.set_xticklabels(['5%', '20%', '40%', '60%', '80%', '92.6%', '100%'])
ax.grid(axis='y', color=GRID_COLOR, linewidth=0.6, alpha=0.7)

# ── Título y leyenda ─────────────────────────────────────────────
ax.set_title('Backtest noche electoral R2 2021 · Proyector vs Conteo crudo',
             color=TEXT_COLOR, fontsize=13, fontweight='bold', pad=14)

legend_handles = [
    mpatches.Patch(color=KEIKO_COLOR, label='Conteo crudo ONPE'),
    mpatches.Patch(color=PROJ_COLOR,  label='Proyector estratificado'),
]
leg = ax.legend(handles=legend_handles, loc='upper right',
                framealpha=0.15, facecolor='#2C2825',
                edgecolor=GRID_COLOR, labelcolor=TEXT_COLOR, fontsize=9)

# ── Subtítulo / nota ─────────────────────────────────────────────
fig.text(0.5, 0.01,
         'Proyector corrigió el sesgo Lima-primero desde el primer snapshot. '
         'El crudo estuvo equivocado 12.5 horas.',
         ha='center', color=MUTED_COLOR, fontsize=8.5)

plt.tight_layout(rect=[0, 0.03, 1, 1])

out = 'scripts/backtest_2021_chart.png'
plt.savefig(out, dpi=150, bbox_inches='tight', facecolor=fig.get_facecolor())
print(f'Guardado: {out}')
plt.close()
