"""
analyze_shift_2021.py

Valida la suposición del proyector estratificado:
  ¿El bilateral KF de R1 predice bien el bilateral KF de R2 a nivel distrital?

Datos: jmcastagnetto (público GitHub)
  R1 bilateral = kfV / (kfV + castilloV) por distrito
  R2 bilateral = kfV / (kfV + castilloV) por distrito
  Shift        = R2 - R1

Output: scripts/shift_analysis_2021.png
"""

import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import matplotlib.gridspec as gridspec
import numpy as np
import urllib.request, csv, io, unicodedata
from collections import defaultdict

# ─── URLs ─────────────────────────────────────────────────────────────────────
R1_URL = (
    "https://raw.githubusercontent.com/jmcastagnetto/"
    "2021-elecciones-generales-peru-datos-de-onpe/main/"
    "presidencial-resultados-partidos.csv"
)
R2_URL = (
    "https://raw.githubusercontent.com/jmcastagnetto/"
    "2021-segunda-vuelta-eleccion-presidencial-peru/main/"
    "datos/distritos/votacion-distrito-resultados.csv"
)

# ─── Perfiles regionales ───────────────────────────────────────────────────────
DEPT_REGION = {
    'LIMA': 'Lima / Callao',
    'CALLAO': 'Lima / Callao',
    'ICA': 'Costa Sur',
    'MOQUEGUA': 'Costa Sur',
    'TACNA': 'Costa Sur',
    'AREQUIPA': 'Costa Sur',
    'LAMBAYEQUE': 'Costa Norte',
    'LA LIBERTAD': 'Costa Norte',
    'PIURA': 'Costa Norte',
    'TUMBES': 'Costa Norte',
    'ANCASH': 'Costa Norte',
    'CAJAMARCA': 'Sierra Norte',
    'AMAZONAS': 'Selva',
    'LORETO': 'Selva',
    'SAN MARTIN': 'Selva',
    'UCAYALI': 'Selva',
    'MADRE DE DIOS': 'Selva',
    'JUNIN': 'Sierra Centro',
    'HUANUCO': 'Sierra Centro',
    'PASCO': 'Sierra Centro',
    'PUNO': 'Sierra Sur',
    'HUANCAVELICA': 'Sierra Sur',
    'CUSCO': 'Sierra Sur',
    'AYACUCHO': 'Sierra Sur',
    'APURIMAC': 'Sierra Sur',
}

REGION_COLORS = {
    'Lima / Callao':  '#F97316',
    'Costa Sur':      '#FB923C',
    'Costa Norte':    '#FBBF24',
    'Sierra Norte':   '#34D399',
    'Selva':          '#22D3EE',
    'Sierra Centro':  '#818CF8',
    'Sierra Sur':     '#C084FC',
}

BG = '#1C1917'
FG = '#F7F4EF'
MUTED = '#A8A29E'
GRID = '#3F3832'


def fetch_csv(url):
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read().decode('utf-8')


def load_r1(data):
    """KF (cod 00000007) y Castillo (00000014) por distrito."""
    reader = csv.DictReader(io.StringIO(data))
    kf = defaultdict(int)
    cas = defaultdict(int)
    for row in reader:
        key = (row['departamento'], row['provincia'], row['distrito'])
        votes = int(row.get('total_votos', 0) or 0)
        if row['cod_partido'] == '00000007':
            kf[key] += votes
        elif row['cod_partido'] == '00000014':
            cas[key] += votes
    return kf, cas


def load_r2(data):
    reader = csv.DictReader(io.StringIO(data))
    kf = defaultdict(int)
    cas = defaultdict(int)
    for row in reader:
        key = (row['departamento'], row['provincia'], row['distrito'])
        votes = int(float(row.get('TOTAL_VOTOS', 0) or 0))
        name = row.get('NOMBREe_CANDIDATO', '')
        if 'FUJIMORI' in name:
            kf[key] += votes
        elif 'CASTILLO' in name:
            cas[key] += votes
    return kf, cas


# ─── Fetch ────────────────────────────────────────────────────────────────────
print("Descargando R1 2021...")
r1_kf, r1_cas = load_r1(fetch_csv(R1_URL))
print("Descargando R2 2021...")
r2_kf, r2_cas = load_r2(fetch_csv(R2_URL))

# ─── Build district records ───────────────────────────────────────────────────
districts = []
all_keys = set(r1_kf) & set(r1_cas) & set(r2_kf) & set(r2_cas)

for key in all_keys:
    dept, prov, dist = key
    total_r1 = r1_kf[key] + r1_cas[key]
    total_r2 = r2_kf[key] + r2_cas[key]
    if total_r1 < 10 or total_r2 < 10:
        continue
    r1_share = r1_kf[key] / total_r1 * 100
    r2_share = r2_kf[key] / total_r2 * 100
    shift = r2_share - r1_share
    region = DEPT_REGION.get(dept, 'Selva')
    districts.append({
        'dept': dept, 'prov': prov, 'dist': dist,
        'r1': r1_share, 'r2': r2_share,
        'shift': shift,
        'vv': total_r2,
        'region': region,
    })

print(f"\n{len(districts)} distritos con datos completos R1+R2\n")

# ─── Stats globales ───────────────────────────────────────────────────────────
shifts    = np.array([d['shift'] for d in districts])
vv_arr    = np.array([d['vv']    for d in districts])
r1_arr    = np.array([d['r1']    for d in districts])
r2_arr    = np.array([d['r2']    for d in districts])

vv_w_shift = np.average(shifts, weights=vv_arr)   # VV-weighted mean shift
vv_w_mae   = np.average(np.abs(shifts), weights=vv_arr)
vv_w_rmse  = np.sqrt(np.average(shifts**2, weights=vv_arr))
corr       = np.corrcoef(r1_arr, r2_arr)[0, 1]

# R-squared of R1 predicting R2
ss_res = np.sum(vv_arr * (r2_arr - r1_arr)**2)
ss_tot = np.sum(vv_arr * (r2_arr - np.average(r2_arr, weights=vv_arr))**2)
r_squared = 1 - ss_res / ss_tot

print("══ Stats globales (ponderado por VV) ══════════════════════")
print(f"  Distritos:         {len(districts)}")
print(f"  Shift medio:       {vv_w_shift:+.2f}pp  (cuánto sube/baja KF de R1→R2)")
print(f"  MAE shift:         {vv_w_mae:.2f}pp  (error medio si asumes shift=0)")
print(f"  RMSE shift:        {vv_w_rmse:.2f}pp")
print(f"  Correlación R1→R2: {corr:.4f}")
print(f"  R² (R1 predice R2):{r_squared:.4f}")
print()

# ─── Stats por región ─────────────────────────────────────────────────────────
print("══ Por región ═══════════════════════════════════════════════")
regions = sorted(set(d['region'] for d in districts))
region_stats = {}
for reg in regions:
    ds = [d for d in districts if d['region'] == reg]
    vvs = np.array([d['vv'] for d in ds])
    shs = np.array([d['shift'] for d in ds])
    r1s = np.array([d['r1'] for d in ds])
    r2s = np.array([d['r2'] for d in ds])
    wmean = np.average(shs, weights=vvs)
    wmae  = np.average(np.abs(shs), weights=vvs)
    wr2   = np.average(r2s, weights=vvs)
    wr1   = np.average(r1s, weights=vvs)
    region_stats[reg] = {'mean': wmean, 'mae': wmae, 'r1': wr1, 'r2': wr2, 'n': len(ds), 'vvs': vvs, 'shs': shs}
    print(f"  {reg:<18}  n={len(ds):4d}  R1={wr1:5.1f}%  R2={wr2:5.1f}%  shift={wmean:+.2f}pp  MAE={wmae:.2f}pp")
print()

# ─── Stats por dept ───────────────────────────────────────────────────────────
print("══ Por departamento ══════════════════════════════════════════")
depts = sorted(set(d['dept'] for d in districts))
dept_stats = {}
for dept in depts:
    ds = [d for d in districts if d['dept'] == dept]
    vvs = np.array([d['vv'] for d in ds])
    shs = np.array([d['shift'] for d in ds])
    r1s = np.array([d['r1'] for d in ds])
    r2s = np.array([d['r2'] for d in ds])
    wmean = np.average(shs, weights=vvs)
    wmae  = np.average(np.abs(shs), weights=vvs)
    wr2   = np.average(r2s, weights=vvs)
    wr1   = np.average(r1s, weights=vvs)
    dept_stats[dept] = {'mean': wmean, 'mae': wmae, 'r1': wr1, 'r2': wr2, 'n': len(ds)}
    print(f"  {dept:<18}  n={len(ds):4d}  R1={wr1:5.1f}%  R2={wr2:5.1f}%  shift={wmean:+.2f}pp  MAE={wmae:.2f}pp")
print()

# ─── Validación clave: ¿qué % del error se captura con shift dept? ────────────
# Si aplicamos el shift medio de cada dept a los distritos de ese dept,
# ¿cuánto mejoramos vs asumir shift=0?
residuals_zero  = []
residuals_dept  = []
residuals_reg   = []
vv_list         = []

for d in districts:
    pred_zero = d['r1']
    pred_dept = d['r1'] + dept_stats[d['dept']]['mean']
    pred_reg  = d['r1'] + region_stats[d['region']]['mean']
    err_zero  = abs(d['r2'] - pred_zero)
    err_dept  = abs(d['r2'] - pred_dept)
    err_reg   = abs(d['r2'] - pred_reg)
    residuals_zero.append(err_zero)
    residuals_dept.append(err_dept)
    residuals_reg.append(err_reg)
    vv_list.append(d['vv'])

vv_np = np.array(vv_list)
mae_zero = np.average(residuals_zero, weights=vv_np)
mae_dept = np.average(residuals_dept, weights=vv_np)
mae_reg  = np.average(residuals_reg,  weights=vv_np)

print("══ Mejora según nivel de corrección ═════════════════════════")
print(f"  Sin corrección (shift=0):         MAE = {mae_zero:.2f}pp  (baseline)")
print(f"  Shift regional uniforme:          MAE = {mae_reg:.2f}pp  ({(1-mae_reg/mae_zero)*100:.0f}% mejora)")
print(f"  Shift departamental uniforme:     MAE = {mae_dept:.2f}pp  ({(1-mae_dept/mae_zero)*100:.0f}% mejora)")
print()

# ─── Gráficos ─────────────────────────────────────────────────────────────────
fig = plt.figure(figsize=(16, 10))
fig.patch.set_facecolor(BG)
gs = gridspec.GridSpec(2, 3, figure=fig, hspace=0.42, wspace=0.35)

# Panel 1: Scatter R1 vs R2 por región (main chart)
ax1 = fig.add_subplot(gs[:, :2])
ax1.set_facecolor(BG)

for reg in regions:
    ds = [d for d in districts if d['region'] == reg]
    x = [d['r1'] for d in ds]
    y = [d['r2'] for d in ds]
    s = [max(8, d['vv'] / 2000) for d in ds]
    ax1.scatter(x, y, s=s, alpha=0.45, color=REGION_COLORS[reg], label=reg, zorder=3)

# Línea y=x (shift=0 perfecto)
lo, hi = 5, 95
ax1.plot([lo, hi], [lo, hi], color='#FFFFFF', linewidth=1.5,
         linestyle='--', alpha=0.4, zorder=2, label='R2 = R1 (shift=0)')

# Stats text box
stats_txt = (
    f"R² = {r_squared:.3f}\n"
    f"Corr = {corr:.3f}\n"
    f"Shift medio: {vv_w_shift:+.2f}pp\n"
    f"MAE shift: {vv_w_mae:.2f}pp"
)
ax1.text(0.03, 0.97, stats_txt, transform=ax1.transAxes,
         color=FG, fontsize=9.5, va='top', ha='left',
         bbox=dict(facecolor='#2C2825', alpha=0.75, edgecolor=GRID, boxstyle='round,pad=0.5'))

ax1.set_xlabel('Bilateral KF — Primera Vuelta 2021 (%)', color=MUTED, fontsize=10, labelpad=8)
ax1.set_ylabel('Bilateral KF — Segunda Vuelta 2021 (%)', color=MUTED, fontsize=10, labelpad=8)
ax1.set_title('R1 bilateral vs R2 bilateral por distrito (2021)\nTamaño de punto ∝ votos válidos R2',
              color=FG, fontsize=12, fontweight='bold', pad=10)
ax1.set_xlim(lo, hi)
ax1.set_ylim(lo, hi)
ax1.tick_params(colors=MUTED, labelsize=9)
for sp in ax1.spines.values(): sp.set_color(GRID)
ax1.grid(color=GRID, linewidth=0.5, alpha=0.5)
ax1.legend(loc='upper left', framealpha=0.2, facecolor='#2C2825',
           edgecolor=GRID, labelcolor=FG, fontsize=8, markerscale=1.5)

# Panel 2: Shift medio por dept (barras)
ax2 = fig.add_subplot(gs[0, 2])
ax2.set_facecolor(BG)

sorted_depts = sorted(dept_stats.items(), key=lambda x: x[1]['mean'])
dept_names   = [d[0].title() for d in sorted_depts]
dept_shifts  = [d[1]['mean'] for d in sorted_depts]
dept_maes    = [d[1]['mae']  for d in sorted_depts]
colors_bar   = ['#22C55E' if s < 0 else '#F97316' for s in dept_shifts]

bars = ax2.barh(range(len(dept_names)), dept_shifts, color=colors_bar, alpha=0.8, height=0.7)
ax2.axvline(0, color=MUTED, linewidth=0.8, alpha=0.6)
ax2.set_yticks(range(len(dept_names)))
ax2.set_yticklabels(dept_names, color=MUTED, fontsize=7)
ax2.set_xlabel('Shift medio (pp)', color=MUTED, fontsize=8)
ax2.set_title('Shift R1→R2 por dept\n(ponderado por VV)', color=FG, fontsize=9, fontweight='bold', pad=6)
ax2.tick_params(colors=MUTED, labelsize=8)
for sp in ax2.spines.values(): sp.set_color(GRID)
ax2.grid(axis='x', color=GRID, linewidth=0.4, alpha=0.5)
ax2.xaxis.set_major_formatter(plt.FuncFormatter(lambda x, _: f'{x:+.0f}pp'))

# Panel 3: Distribución de shifts por región (box plot)
ax3 = fig.add_subplot(gs[1, 2])
ax3.set_facecolor(BG)

box_data   = []
box_labels = []
box_colors = []
for reg in sorted(regions, key=lambda r: region_stats[r]['mean']):
    ds = [d for d in districts if d['region'] == reg]
    if len(ds) < 5:
        continue
    box_data.append([d['shift'] for d in ds])
    box_labels.append(reg.replace(' / ', '/').replace(' ', '\n'))
    box_colors.append(REGION_COLORS[reg])

bp = ax3.boxplot(box_data, vert=True, patch_artist=True,
                 medianprops={'color': '#FFFFFF', 'linewidth': 1.5},
                 whiskerprops={'color': MUTED},
                 capprops={'color': MUTED},
                 flierprops={'marker': 'o', 'markersize': 2, 'color': MUTED, 'alpha': 0.5})
for patch, color in zip(bp['boxes'], box_colors):
    patch.set_facecolor(color)
    patch.set_alpha(0.6)

ax3.axhline(0, color='#FFFFFF', linewidth=0.9, linestyle='--', alpha=0.3)
ax3.set_xticklabels(box_labels, color=MUTED, fontsize=7)
ax3.set_ylabel('Shift R1→R2 (pp)', color=MUTED, fontsize=8)
ax3.set_title('Distribución de shifts por región', color=FG, fontsize=9, fontweight='bold', pad=6)
ax3.tick_params(colors=MUTED, labelsize=8)
for sp in ax3.spines.values(): sp.set_color(GRID)
ax3.grid(axis='y', color=GRID, linewidth=0.4, alpha=0.5)

# ─── Nota al pie ──────────────────────────────────────────────────────────────
fig.text(0.5, 0.01,
         f'Datos: jmcastagnetto (GitHub) · {len(districts)} distritos · '
         f'Bilateral = KF / (KF + Castillo) · '
         f'Shift = R2 − R1 · Línea blanca punteada = shift=0 perfecto',
         ha='center', color=MUTED, fontsize=7.5)

out = 'scripts/shift_analysis_2021.png'
plt.savefig(out, dpi=150, bbox_inches='tight', facecolor=BG)
print(f'Guardado: {out}')
plt.close()
