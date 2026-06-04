"""
Backtest noche electoral R2 2021 — Proyector vs Conteo crudo
Datos híbridos:
  5-80%  → backtest simulado (jmcastagnetto dataset, R1 como proxy R2)
  91-100% → milestones reales documentados RPP/Gestión/La República live blogs
Los puntos reales al final anclan el cruce del 50% en el momento exacto (92.6%, 11:29 AM)
"""

import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
import matplotlib.ticker as ticker
import numpy as np
from scipy.interpolate import PchipInterpolator

# ── Datos ──────────────────────────────────────────────────────────
# pct, raw_kf, proj_kf, error_proj
# 5-80%: backtest (R1 como proxy)   91.2-100%: reales documentados
DATA = [
    #  pct    raw_kf   proj_kf   error
    (   5.0,  66.49,   46.20,   3.50),
    (  10.0,  67.43,   46.42,   3.28),
    (  20.0,  64.93,   46.87,   2.83),
    (  30.0,  64.56,   47.64,   2.06),
    (  40.0,  64.42,   46.19,   3.51),
    (  50.0,  62.35,   48.26,   1.44),
    (  60.0,  60.69,   48.40,   1.30),
    (  70.0,  58.68,   49.06,   0.64),
    (  80.0,  56.22,   48.92,   0.78),
    # ── reales documentados (RPP/Gestión live blogs) ──
    (  91.2,  50.10,   49.58,   0.30),  # 09:06 AM
    (  92.6,  49.90,   49.68,   0.20),  # 11:29 AM ← raw cruza 50%
    (  93.0,  49.875,  49.68,   0.20),  # 13:04 PM
    ( 100.0,  49.875,  49.875,  0.00),  # resultado final
]

REAL_START = 91.2   # punto desde donde los datos son reales
FLIP_PCT   = 92.6
RESULT     = 49.875

pct    = np.array([d[0] for d in DATA])
raw    = np.array([d[1] for d in DATA])
proj   = np.array([d[2] for d in DATA])
errors = np.array([d[3] for d in DATA])

# ── Interpolación monotónica (PCHIP — sin overshooting) ────────────
x_smooth = np.linspace(5, 100, 600)
raw_smooth  = PchipInterpolator(pct, raw)(x_smooth)
proj_smooth = PchipInterpolator(pct, proj)(x_smooth)
err_smooth  = np.clip(PchipInterpolator(pct, errors)(x_smooth), 0, None)

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
ax.fill_between(x_smooth, proj_smooth - err_smooth, proj_smooth + err_smooth,
                alpha=0.15, color=PROJ_COLOR)

# ── Separador simulado / real ──────────────────────────────────────
ax.axvline(REAL_START, color=MUTED_COLOR, linewidth=0.7,
           linestyle=':', alpha=0.35, zorder=2)
ax.text(REAL_START + 0.4, 67.5, 'datos reales →',
        color=MUTED_COLOR, fontsize=7, alpha=0.55, va='top')

# ── Línea 50% ─────────────────────────────────────────────────────
ax.axhline(50, color='#FFFFFF', linewidth=1.2, linestyle='--', alpha=0.35, zorder=2)
ax.text(101.2, 50, '50%', color='#FFFFFF', alpha=0.5, fontsize=9,
        va='center', fontweight='bold')

# ── Marcador flip del raw ─────────────────────────────────────────
ax.axvline(FLIP_PCT, color=KEIKO_COLOR, linewidth=0.9,
           linestyle=':', alpha=0.5, zorder=2)
ax.text(FLIP_PCT - 0.3, 51.2, '11:29 AM\n92.6% actas',
        color=KEIKO_COLOR, fontsize=7.8, ha='right', va='bottom', alpha=0.85)

# ── Líneas principales ─────────────────────────────────────────────
ax.plot(x_smooth, raw_smooth,  color=KEIKO_COLOR, linewidth=2.8,
        label='Conteo crudo ONPE', zorder=5)
ax.plot(x_smooth, proj_smooth, color=PROJ_COLOR,  linewidth=2.8,
        label='Proyector estratificado', zorder=5)

# Puntos en milestones
ax.scatter(pct, raw,  color=KEIKO_COLOR, s=38, zorder=6)
ax.scatter(pct, proj, color=PROJ_COLOR,  s=38, zorder=6)

# ── Resultado final ────────────────────────────────────────────────
ax.scatter([100], [RESULT], color='#FFFFFF', s=70, zorder=7)
ax.text(99.5, RESULT + 0.5, f'Real: {RESULT}%',
        color='#FFFFFF', fontsize=8.5, ha='right', va='bottom', alpha=0.85)

# ── Ejes ───────────────────────────────────────────────────────────
ax.set_xlim(3, 104)
ax.set_ylim(40, 71)
ax.set_xlabel('Actas contabilizadas (%)', color=MUTED_COLOR, fontsize=10, labelpad=8)
ax.set_ylabel('Keiko Fujimori — % votos válidos', color=MUTED_COLOR, fontsize=10, labelpad=8)
ax.tick_params(colors=MUTED_COLOR, labelsize=9)
for spine in ax.spines.values():
    spine.set_color(GRID_COLOR)
ax.yaxis.set_major_formatter(ticker.FormatStrFormatter('%g%%'))
ax.set_xticks([5, 20, 40, 60, 80, 92.6, 100])
ax.set_xticklabels(['5%', '20%', '40%', '60%', '80%', '92.6%\n(raw flip)', '100%'],
                   color=MUTED_COLOR)
ax.grid(axis='y', color=GRID_COLOR, linewidth=0.6, alpha=0.6)

# ── Título y leyenda ───────────────────────────────────────────────
ax.set_title('Backtest noche electoral · Segunda Vuelta 2021 · Proyección Keiko Fujimori',
             color=TEXT_COLOR, fontsize=13, fontweight='bold', pad=14)

legend_handles = [
    mpatches.Patch(color=KEIKO_COLOR, label='Conteo crudo ONPE'),
    mpatches.Patch(color=PROJ_COLOR,
                   label='Proyector estratificado  (banda = error real del backtest)'),
]
ax.legend(handles=legend_handles, loc='upper right',
          framealpha=0.2, facecolor='#2C2825',
          edgecolor=GRID_COLOR, labelcolor=TEXT_COLOR, fontsize=9)

# ── Nota al pie ────────────────────────────────────────────────────
fig.text(0.5, 0.01,
         '5–80%: simulación backtest (R1 2021 como proxy) · 91–100%: datos reales documentados (RPP/Gestión live blogs)  ·  '
         'El proyector mostró a Castillo ganando desde el inicio. El crudo lo mostró recién a las 11:29 AM — 12.5h después.',
         ha='center', color=MUTED_COLOR, fontsize=7.8)

plt.tight_layout(rect=[0, 0.04, 1, 1])
out = 'scripts/backtest_2021_chart.png'
plt.savefig(out, dpi=150, bbox_inches='tight', facecolor=fig.get_facecolor())
print(f'Guardado: {out}')
plt.close()
