"""
analyze_sigma_arrival.py

Analiza el impacto del parámetro sigma de llegada en el error del proyector.
Clave: 0.15pp puede ser la diferencia entre los dos candidatos.

Pregunta: ¿cuál es el PEOR CASO realista para el primer snapshot (~40% actas)?
  - σ → 0:   Lima llega como bloque perfecto antes de cualquier sierra (worst-case bias)
  - σ = 0.07: distribución actual (demasiado suave)
  - σ grande: mezcla artificial que ayuda al proyector (no realista)

También prueba un modelo de llegada "bloc" (Lima 100% antes que empiece sierra)
como upper bound del sesgo.

Datos: jmcastagnetto (GitHub)
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
R2_PART_URL = (
    "https://raw.githubusercontent.com/jmcastagnetto/"
    "2021-segunda-vuelta-eleccion-presidencial-peru/main/"
    "datos/distritos/votacion-distrito-participacion.csv"
)

DEPT_PROFILES = {
    'LIMA':0.00,'CALLAO':0.05,'ICA':0.12,'LAMBAYEQUE':0.17,'LA LIBERTAD':0.20,
    'PIURA':0.22,'AREQUIPA':0.24,'TUMBES':0.28,'MOQUEGUA':0.30,'ANCASH':0.32,
    'TACNA':0.34,'LORETO':0.37,'CAJAMARCA':0.42,'AMAZONAS':0.46,'JUNIN':0.50,
    'SAN MARTIN':0.52,'UCAYALI':0.55,'HUANUCO':0.58,'PASCO':0.60,
    'MADRE DE DIOS':0.62,'PUNO':0.68,'HUANCAVELICA':0.73,'CUSCO':0.79,
    'AYACUCHO':0.85,'APURIMAC':0.93,
}

BG = '#1C1917'; FG = '#F7F4EF'; MUTED = '#A8A29E'; GRID = '#3F3832'


def fetch_csv(url):
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read().decode('utf-8')


def load_r1(data):
    reader = csv.DictReader(io.StringIO(data))
    kf, cas = defaultdict(int), defaultdict(int)
    for row in reader:
        key = (row['departamento'], row['provincia'], row['distrito'])
        votes = int(row.get('total_votos', 0) or 0)
        if row['cod_partido'] == '00000007': kf[key] += votes
        elif row['cod_partido'] == '00000014': cas[key] += votes
    return kf, cas


def load_r2(data):
    reader = csv.DictReader(io.StringIO(data))
    kf, cas = defaultdict(int), defaultdict(int)
    for row in reader:
        key = (row['departamento'], row['provincia'], row['distrito'])
        votes = int(float(row.get('TOTAL_VOTOS', 0) or 0))
        name = row.get('NOMBREe_CANDIDATO', '')
        if 'FUJIMORI' in name: kf[key] += votes
        elif 'CASTILLO' in name: cas[key] += votes
    return kf, cas


def build_districts(r1_kf, r1_cas, r2_kf, r2_cas):
    districts = []
    for key in set(r1_kf) & set(r1_cas) & set(r2_kf) & set(r2_cas):
        dept = key[0]
        tr1 = r1_kf[key] + r1_cas[key]
        tr2 = r2_kf[key] + r2_cas[key]
        if tr1 < 10 or tr2 < 10: continue
        districts.append({
            'dept': dept,
            'r1': r1_kf[key] / tr1 * 100,
            'r2': r2_kf[key] / tr2 * 100,
            'vv': tr2,
            'delay': DEPT_PROFILES.get(dept, 0.50),
        })
    return districts


def projector(districts, reported):
    rep = [d for d, r in zip(districts, reported) if r]
    unr = [d for d, r in zip(districts, reported) if not r]
    if not rep: return None
    rep_vv = sum(d['vv'] for d in rep)
    rep_kf = sum(d['r2'] * d['vv'] / 100 for d in rep)
    rep_r1 = sum(d['r1'] * d['vv'] / 100 for d in rep)
    nat_shift = (rep_kf - rep_r1) / rep_vv * 100

    dept_stats = defaultdict(lambda: {'kf': 0., 'r1': 0., 'vv': 0., 'n': 0})
    for d in rep:
        dept_stats[d['dept']]['kf'] += d['r2'] * d['vv'] / 100
        dept_stats[d['dept']]['r1'] += d['r1'] * d['vv'] / 100
        dept_stats[d['dept']]['vv'] += d['vv']
        dept_stats[d['dept']]['n']  += 1
    dept_shift = {dept: (s['kf'] - s['r1']) / s['vv'] * 100
                  for dept, s in dept_stats.items() if s['n'] >= 2}

    total_kf = rep_kf; total_vv = rep_vv
    for d in unr:
        shift = dept_shift.get(d['dept'], nat_shift)
        total_kf += max(0, min(100, d['r1'] + shift)) * d['vv'] / 100
        total_vv += d['vv']
    return total_kf / total_vv * 100


def assign_arrival(districts, rng, sigma):
    times = []
    for d in districts:
        noise = rng.normal(0, sigma)
        t = max(0.0, min(1.0, d['delay'] + noise))
        times.append(t)
    return times


def assign_arrival_bloc(districts):
    """Lima=0..0.05 bloc, rest follow dept delay strictly."""
    times = []
    for d in districts:
        if d['dept'] in ('LIMA', 'CALLAO'):
            # Lima arrives uniformly in first 5% of time
            times.append(np.random.uniform(0.00, 0.05))
        else:
            times.append(d['delay'])
    return times


def run_backtest(districts, arrival_times, r2_truth, milestones):
    total_vv = sum(d['vv'] for d in districts)
    order = sorted(range(len(districts)), key=lambda i: arrival_times[i])
    reported = [False] * len(districts)
    cum_vv = 0.0
    results = {}
    m_idx = 0
    ms_sorted = sorted(milestones)
    for i in order:
        reported[i] = True
        cum_vv += districts[i]['vv']
        vv_pct = cum_vv / total_vv
        while m_idx < len(ms_sorted) and vv_pct >= ms_sorted[m_idx]:
            m = ms_sorted[m_idx]
            proj = projector(districts, reported)
            if proj is not None:
                results[m] = proj - r2_truth
            m_idx += 1
        if m_idx >= len(ms_sorted):
            break
    return results


# ─── Fetch data ───────────────────────────────────────────────────────────────
print("Descargando datos 2021...")
r1_kf, r1_cas = load_r1(fetch_csv(R1_URL))
r2_kf, r2_cas = load_r2(fetch_csv(R2_URL))
districts = build_districts(r1_kf, r1_cas, r2_kf, r2_cas)
r2_truth = sum(d['r2'] * d['vv'] for d in districts) / sum(d['vv'] for d in districts)
print(f"{len(districts)} distritos, R2 truth = {r2_truth:.3f}%\n")

# ─── Monte Carlo por sigma ─────────────────────────────────────────────────────
SIGMAS     = [0.001, 0.02, 0.05, 0.07, 0.10, 0.15, 0.20]
MILESTONES = [0.20, 0.40, 0.60, 0.80]
N_RUNS     = 40
SEED       = 42

print("══ Error del proyector por sigma y milestone (40 corridas MC) ══════════")
print(f"  {'sigma':>6}  {'@20%':>10}  {'@40%':>10}  {'@60%':>10}  {'@80%':>10}")

sigma_results = {}  # sigma → {milestone → [errors]}
for sigma in SIGMAS:
    rng = np.random.RandomState(SEED)
    milestone_errors = defaultdict(list)
    for _ in range(N_RUNS):
        arr = assign_arrival(districts, rng, sigma)
        res = run_backtest(districts, arr, r2_truth, MILESTONES)
        for m, err in res.items():
            milestone_errors[m].append(err)
    sigma_results[sigma] = {m: np.array(v) for m, v in milestone_errors.items()}
    means = {m: np.mean(np.abs(v)) for m, v in sigma_results[sigma].items()}
    print(f"  {sigma:>6.3f}  "
          + "  ".join(f"{means.get(m, float('nan')):>+10.3f}pp" for m in MILESTONES))

# ─── Bloc arrival (worst case) ────────────────────────────────────────────────
print("\n══ Bloc arrival (Lima como bloque puro, worst-case bias) ═══════════════")
np.random.seed(SEED)
bloc_errors = defaultdict(list)
for _ in range(N_RUNS):
    arr = assign_arrival_bloc(districts)
    res = run_backtest(districts, arr, r2_truth, MILESTONES)
    for m, err in res.items():
        bloc_errors[m].append(err)
bloc_mae = {m: np.mean(np.abs(v)) for m, v in bloc_errors.items()}
print(f"  {'bloc':>6}  "
      + "  ".join(f"{bloc_mae.get(m, float('nan')):>+10.3f}pp" for m in MILESTONES))

# ─── Percentiles @ 40% ────────────────────────────────────────────────────────
print("\n══ Distribución del error al 40% actas (percentiles) ══════════════════")
print(f"  {'sigma':>6}  {'p5':>8}  {'p25':>8}  {'median':>8}  {'p75':>8}  {'p95':>8}  {'MAE':>8}")
for sigma in SIGMAS:
    errs = sigma_results[sigma].get(0.40, np.array([]))
    if len(errs) == 0: continue
    p = np.percentile(errs, [5, 25, 50, 75, 95])
    print(f"  {sigma:>6.3f}  "
          + "  ".join(f"{x:>+8.3f}" for x in p)
          + f"  {np.mean(np.abs(errs)):>+8.3f}pp")
errs_bloc = np.array(list(bloc_errors.get(0.40, [])))
if len(errs_bloc) > 0:
    p = np.percentile(errs_bloc, [5, 25, 50, 75, 95])
    print(f"  {'bloc':>6}  "
          + "  ".join(f"{x:>+8.3f}" for x in p)
          + f"  {np.mean(np.abs(errs_bloc)):>+8.3f}pp")

# ─── Implicaciones para 2026 ──────────────────────────────────────────────────
print("\n══ Implicación para el 7J 2026 ══════════════════════════════════════════")
for sigma, label in [(0.001, 'Lima-bloc (worst)'), (0.07, 'σ=0.07 (actual)')]:
    errs_40 = sigma_results[sigma].get(0.40, np.array([]))
    if len(errs_40) == 0: continue
    mae = np.mean(np.abs(errs_40))
    p95 = np.percentile(np.abs(errs_40), 95)
    print(f"  {label:<22}: MAE {mae:.2f}pp  P95 {p95:.2f}pp al primer snapshot (~40%)")

print("""
  Si el margen real es ~1pp (carrera muy ajustada como en 2021):
    - σ=0.07 (actual): proyector podría estar equivocado sobre el ganador
      en ~X% de simulaciones al primer snapshot
    - Bloc: peor caso — error sistemático hasta que entren depts de sierra

  El dept-shift upgrade (Priority 2) reduce el sesgo residual del proyector
  una vez que los primeros depts de sierra empiezan a reportar (60-80%).
""")

# ─── Chart ────────────────────────────────────────────────────────────────────
fig, axes = plt.subplots(1, 2, figsize=(14, 6))
fig.patch.set_facecolor(BG)

# Left: MAE vs sigma por milestone
ax1 = axes[0]; ax1.set_facecolor(BG)
colors = ['#F97316', '#22C55E', '#818CF8', '#22D3EE']
for mi, (m, col) in enumerate(zip(MILESTONES, colors)):
    maes = [np.mean(np.abs(sigma_results[s].get(m, [0]))) for s in SIGMAS]
    ax1.plot([s * 100 for s in SIGMAS], maes, 'o-', color=col,
             linewidth=2, markersize=7, label=f'@{int(m*100)}% actas')
    # Bloc value
    ax1.axhline(bloc_mae.get(m, 0), color=col, linewidth=0.8,
                linestyle=':', alpha=0.6)
ax1.set_xlabel('σ llegada (× 100)', color=MUTED, fontsize=10)
ax1.set_ylabel('MAE proyector (pp)', color=MUTED, fontsize=10)
ax1.set_title('MAE del proyector vs sigma de llegada\n(línea punteada = bloc arrival worst-case)',
              color=FG, fontsize=10, fontweight='bold')
ax1.tick_params(colors=MUTED, labelsize=9)
for sp in ax1.spines.values(): sp.set_color(GRID)
ax1.grid(color=GRID, linewidth=0.4, alpha=0.5)
ax1.legend(framealpha=0.2, facecolor='#2C2825', edgecolor=GRID, labelcolor=FG, fontsize=8)

# Right: distribución del error @40% para σ=0.001 y σ=0.07
ax2 = axes[1]; ax2.set_facecolor(BG)
for sigma, col, label in [(0.001, '#F97316', 'σ=0.001 (Lima-bloc)'),
                           (0.07,  '#22C55E', 'σ=0.07 (actual)'),
                           (0.20,  '#818CF8', 'σ=0.20 (mezcla)')]:
    errs = sigma_results[sigma].get(0.40, np.array([]))
    if len(errs): ax2.hist(errs, bins=15, alpha=0.65, color=col, label=label, density=True)
ax2.axvline(0, color='#FFFFFF', linewidth=1.2, linestyle='--', alpha=0.4)
ax2.set_xlabel('Error proyector al 40% actas (pp)', color=MUTED, fontsize=10)
ax2.set_ylabel('Densidad', color=MUTED, fontsize=10)
ax2.set_title('Distribución del error @40% actas\npor modelo de llegada',
              color=FG, fontsize=10, fontweight='bold')
ax2.tick_params(colors=MUTED, labelsize=9)
for sp in ax2.spines.values(): sp.set_color(GRID)
ax2.grid(color=GRID, linewidth=0.4, alpha=0.5)
ax2.legend(framealpha=0.2, facecolor='#2C2825', edgecolor=GRID, labelcolor=FG, fontsize=8)

fig.text(0.5, 0.01,
         'Datos: jmcastagnetto 2021 · 1835 distritos · 40 corridas MC por sigma · '
         'Línea punteada = 0pp error · bloc = Lima completo antes de cualquier sierra',
         ha='center', color=MUTED, fontsize=7.5)
plt.tight_layout(rect=[0, 0.04, 1, 1])
out = 'scripts/sigma_arrival_analysis.png'
plt.savefig(out, dpi=150, bbox_inches='tight', facecolor=BG)
print(f'Guardado: {out}')
plt.close()
