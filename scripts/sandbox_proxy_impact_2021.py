"""
sandbox_proxy_impact_2021.py

Tests whether adding 2021 R2 proxy baselines for 368 missing districts
improves the election night projector vs province/dept fallback.

Two versions compared:
  A) Without proxy — 1,518 districts with R1 2026 baseline (80.2%)
     Missing 374 districts: skipped in shift calc, use dept/prov fallback
  B) With proxy   — 1,886 districts (99.7%)
     368 districts use 2021 R2 KF% as R1 baseline

Both use actual 2021 R2 district data as incoming "live" election night data.
Truth = 2021 R2 final result (KF 49.70%).

NOTE on circularity: for proxy districts, baseline = 2021 R2 data AND
incoming data = 2021 R2 data → shift ≈ 0 for those. This makes Version B
look slightly better than it would be in 2026. We flag this in the output.
"""

import json, csv, io, urllib.request, unicodedata
from pathlib import Path
from collections import defaultdict

ROOT = Path(__file__).parent.parent
FLAT = ROOT / 'backend' / 'data' / 'r1_districts_flat.json'

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
    'LIMA':           {'delay': 0.00, 'region': 'lima'},
    'CALLAO':         {'delay': 0.05, 'region': 'lima'},
    'ICA':            {'delay': 0.12, 'region': 'costa_sur'},
    'LAMBAYEQUE':     {'delay': 0.17, 'region': 'norte'},
    'LA LIBERTAD':    {'delay': 0.20, 'region': 'norte'},
    'PIURA':          {'delay': 0.22, 'region': 'norte'},
    'AREQUIPA':       {'delay': 0.24, 'region': 'costa_sur'},
    'TUMBES':         {'delay': 0.28, 'region': 'norte'},
    'MOQUEGUA':       {'delay': 0.30, 'region': 'costa_sur'},
    'ANCASH':         {'delay': 0.32, 'region': 'sierra_norte'},
    'TACNA':          {'delay': 0.34, 'region': 'costa_sur'},
    'LORETO':         {'delay': 0.37, 'region': 'selva'},
    'CAJAMARCA':      {'delay': 0.42, 'region': 'sierra_norte'},
    'AMAZONAS':       {'delay': 0.46, 'region': 'selva'},
    'JUNIN':          {'delay': 0.50, 'region': 'sierra_centro'},
    'SAN MARTIN':     {'delay': 0.52, 'region': 'selva'},
    'UCAYALI':        {'delay': 0.55, 'region': 'selva'},
    'HUANUCO':        {'delay': 0.58, 'region': 'sierra_centro'},
    'PASCO':          {'delay': 0.60, 'region': 'sierra_centro'},
    'MADRE DE DIOS':  {'delay': 0.62, 'region': 'selva'},
    'PUNO':           {'delay': 0.68, 'region': 'sierra_sur'},
    'HUANCAVELICA':   {'delay': 0.73, 'region': 'sierra_sur'},
    'CUSCO':          {'delay': 0.79, 'region': 'sierra_sur'},
    'AYACUCHO':       {'delay': 0.85, 'region': 'sierra_sur'},
    'APURIMAC':       {'delay': 0.93, 'region': 'sierra_sur'},
}

MILESTONES = [5, 10, 15, 20, 30, 40, 50, 60, 70, 80, 90]
ARRIVAL_SIGMA = 0.07

def normalize(s):
    if not s: return ''
    nfkd = unicodedata.normalize('NFKD', s.upper())
    return ' '.join(''.join(c for c in nfkd if not unicodedata.combining(c)).split())

# ── load r1_districts_flat.json ───────────────────────────────────────────────

print("Loading r1_districts_flat.json...")
with open(FLAT) as f:
    flat_raw = json.load(f)

# Build baseline dicts: WITH and WITHOUT proxy
baseline_with    = {}   # ubigeo → {kf_r2_share, kfV, rspV}
baseline_without = {}   # same but excluding proxy entries

for ubigeo, d in flat_raw.items():
    if d.get('kf_r2_share') is None:
        continue
    entry = {
        'kf_r2_share': d['kf_r2_share'],
        'kfV':  d.get('kfV', 0) or 0,
        'rspV': d.get('rspV', 0) or 0,
        'nombre': d.get('nombre', ubigeo),
        'deptNombre': d.get('deptNombre', ''),
        'provNombre': d.get('provNombre', ''),
        'deptUbigeo': d.get('deptUbigeo', ubigeo[:2]+'0000'),
        'provUbigeo': d.get('provUbigeo', ubigeo[:4]+'00'),
    }
    baseline_with[ubigeo] = entry
    if d.get('source') != '2021_r2_proxy':
        baseline_without[ubigeo] = entry

proxy_count = len(baseline_with) - len(baseline_without)
print(f"  Baseline WITH proxy:    {len(baseline_with):,} districts")
print(f"  Baseline WITHOUT proxy: {len(baseline_without):,} districts")
print(f"  Proxy districts:        {proxy_count:,}")

# ── download 2021 R2 data ─────────────────────────────────────────────────────

print("\nDownloading 2021 R2 data...")
with urllib.request.urlopen(R2_URL, timeout=30) as r:
    r2_rows = list(csv.DictReader(io.StringIO(r.read().decode('utf-8'))))
with urllib.request.urlopen(R2_PART_URL, timeout=30) as r:
    part_rows = list(csv.DictReader(io.StringIO(r.read().decode('utf-8'))))

# Build R2 per (dept, prov, dist) → {kf_votos, cas_votos}
kf_r2 = {}; cas_r2 = {}
for row in r2_rows:
    key = (normalize(row['departamento']), normalize(row['provincia']), normalize(row['distrito']))
    v = int(row['TOTAL_VOTOS'] or 0)
    if 'KEIKO' in row['NOMBREe_CANDIDATO']: kf_r2[key] = v
    else: cas_r2[key] = v

# Build participation (pct_actas) per district
pct_actas = {}
for row in part_rows:
    key = (normalize(row['departamento']), normalize(row['provincia']), normalize(row['distrito']))
    pct_actas[key] = float(row.get('POR_ACTAS_CONTABILIZADAS') or 0)

print(f"  R2 districts: {len(kf_r2):,}")

# ── match 2021 R2 data to ubigeos ─────────────────────────────────────────────

print("\nMatching 2021 districts to ONPE ubigeos...")

# Build reverse lookup: (norm_dept, norm_prov, norm_dist) → ubigeo
name_to_ubigeo = {}
for ubigeo, d in flat_raw.items():
    k = (normalize(d['deptNombre']), normalize(d['provNombre']), normalize(d['nombre']))
    name_to_ubigeo[k] = ubigeo

districts = []
for key in kf_r2:
    ubigeo = name_to_ubigeo.get(key)
    if not ubigeo:
        # Try fuzzy: same dept+dist, different prov
        dept_n, _, dist_n = key
        for k2, ub in name_to_ubigeo.items():
            if k2[0] == dept_n and k2[2] == dist_n:
                ubigeo = ub; break
    if not ubigeo:
        continue

    d = flat_raw[ubigeo]
    kf  = kf_r2.get(key, 0)
    cas = cas_r2.get(key, 0)
    total = kf + cas
    if total == 0:
        continue

    pct = pct_actas.get(key, 100.0)
    dept_name = normalize(d.get('deptNombre', ''))
    profile = DEPT_PROFILES.get(dept_name, {'delay': 0.5})

    # VRAEM penalty: districts where pct_actas=0 at final count → arrive last
    base_delay = profile['delay']
    if pct == 0.0:
        base_delay = max(base_delay, 0.95)

    districts.append({
        'ubigeo':    ubigeo,
        'dept_name': dept_name,
        'kf_r2':     kf,
        'cas_r2':    cas,
        'total_r2':  total,
        'kf_r2_share': kf / total * 100,
        'pct_actas': pct,
        'base_delay': base_delay,
        'has_r1_2026':  ubigeo in baseline_without,   # actual R1 2026 data
        'has_proxy':    ubigeo in baseline_with and ubigeo not in baseline_without,
    })

print(f"  Matched: {len(districts):,} districts")

# National true result
total_kf  = sum(d['kf_r2']  for d in districts)
total_cas = sum(d['cas_r2'] for d in districts)
TRUTH_KF  = total_kf / (total_kf + total_cas) * 100
print(f"  Truth KF%: {TRUTH_KF:.3f}%  (ONPE official: 49.875%)")

# ── assign arrival order ──────────────────────────────────────────────────────

import random
rng = random.Random(42)

for d in districts:
    noise = rng.gauss(0, ARRIVAL_SIGMA)
    d['arrival'] = max(0.0, min(1.0, d['base_delay'] + noise))

districts.sort(key=lambda d: d['arrival'])

total_vv = sum(d['total_r2'] for d in districts)
cumulative_vv = 0
for d in districts:
    cumulative_vv += d['total_r2']
    d['vv_pct'] = cumulative_vv / total_vv * 100

# ── stratified shift projector (both versions) ───────────────────────────────

def _shiftFromBreakdown(reported_dists, baseline):
    """VV-weighted shift using only districts WITH R1 baseline."""
    sum_vv = 0; sum_kf_actual = 0; sum_kf_r1_expected = 0
    for d in reported_dists:
        r1 = baseline.get(d['ubigeo'])
        if not r1: continue
        r1_vv = (r1['kfV'] or 0) + (r1['rspV'] or 0)
        if r1_vv == 0: continue
        kf_r2_actual = d['kf_r2_share']
        sum_vv             += r1_vv
        sum_kf_actual      += r1_vv * kf_r2_actual
        sum_kf_r1_expected += r1_vv * r1['kf_r2_share']
    if sum_vv < 2000: return None
    return (sum_kf_actual - sum_kf_r1_expected) / sum_vv

def _deptShifts(reported_dists, baseline):
    """Per-dept VV-weighted shift."""
    by_dept = defaultdict(lambda: [0,0,0])
    for d in reported_dists:
        r1 = baseline.get(d['ubigeo'])
        if not r1: continue
        r1_vv = (r1['kfV'] or 0) + (r1['rspV'] or 0)
        if r1_vv == 0: continue
        by_dept[d['dept_name']][0] += r1_vv
        by_dept[d['dept_name']][1] += r1_vv * d['kf_r2_share']
        by_dept[d['dept_name']][2] += r1_vv * r1['kf_r2_share']
    shifts = {}
    for dept, (vv, actual, expected) in by_dept.items():
        if vv >= 2000:
            shifts[dept] = (actual - expected) / vv
    return shifts

# National R1 baseline KF share (from r1_districts_flat.json)
def _national_r1(baseline):
    vv = 0; kf_exp = 0
    for r1 in baseline.values():
        v = (r1['kfV'] or 0) + (r1['rspV'] or 0)
        vv += v; kf_exp += v * r1['kf_r2_share']
    return kf_exp / vv if vv > 0 else 58.46

def project(reported, baseline):
    if not reported:
        return None

    # National shift
    nat_shift = _shiftFromBreakdown(reported, baseline)
    r1_national = _national_r1(baseline)

    if nat_shift is None:
        # Use observed vs R1 national
        obs_kf  = sum(d['kf_r2'] for d in reported)
        obs_cas = sum(d['cas_r2'] for d in reported)
        if obs_kf + obs_cas == 0: return None
        nat_shift = (obs_kf/(obs_kf+obs_cas)*100) - r1_national

    dept_shifts = _deptShifts(reported, baseline)

    # Project unreported districts
    reported_set = {d['ubigeo'] for d in reported}
    proj_kf = sum(d['kf_r2'] for d in reported)
    proj_cas = sum(d['cas_r2'] for d in reported)

    for d in districts:
        if d['ubigeo'] in reported_set:
            continue
        total_r2 = d['total_r2']

        # Get best available shift for this district
        dept_shift = dept_shifts.get(d['dept_name'])
        shift = dept_shift if dept_shift is not None else nat_shift

        # Baseline share for this district
        r1 = baseline.get(d['ubigeo'])
        if r1:
            r1_share = r1['kf_r2_share']
        else:
            # No baseline: use dept/national R1 proxy
            dept_districts = [b for ub, b in baseline.items()
                              if b['deptNombre'].upper() == d['dept_name']]
            if dept_districts:
                dv = sum((b['kfV'] or 0)+(b['rspV'] or 0) for b in dept_districts)
                r1_share = sum(b['kf_r2_share']*(b['kfV'] or 0+b['rspV'] or 0) for b in dept_districts) / dv if dv>0 else r1_national
            else:
                r1_share = r1_national

        proj_share = max(0, min(100, r1_share + shift))
        proj_kf  += total_r2 * proj_share / 100
        proj_cas += total_r2 * (1 - proj_share / 100)

    total = proj_kf + proj_cas
    return proj_kf / total * 100 if total > 0 else None

# ── run both versions at each milestone ──────────────────────────────────────

print("\n" + "═"*80)
print("BACKTEST: Impacto del proxy 2021 en la proyección de noche electoral")
print(f"Verdad final: KF {TRUTH_KF:.3f}% (ONPE oficial 49.875%)")
print("─"*80)
print(f"Nota: Para los {proxy_count} distritos proxy, baseline = 2021 R2 data =")
print("      incoming data → shift ≈ 0 → proyección circulamente perfecta.")
print("      El beneficio real en 2026 será menor (baseline ≠ outcome).")
print("═"*80)
print(f"\n{'VV%':>5}  {'Raw%':>7}  {'Sin proxy':>10}  {'Con proxy':>10}  {'Diff':>6}  "
      f"{'Depts (con R1)':>14}  {'Depts (proxy)':>14}")
print("─"*85)

results = []
for milestone in MILESTONES:
    reported = [d for d in districts if d['vv_pct'] <= milestone]
    if not reported: continue

    obs_kf  = sum(d['kf_r2'] for d in reported)
    obs_cas = sum(d['cas_r2'] for d in reported)
    raw_share = obs_kf / (obs_kf + obs_cas) * 100 if obs_kf+obs_cas>0 else 0

    proj_without = project(reported, baseline_without)
    proj_with    = project(reported, baseline_with)

    err_raw  = raw_share - TRUTH_KF
    err_without = (proj_without - TRUTH_KF) if proj_without else None
    err_with    = (proj_with    - TRUTH_KF) if proj_with    else None

    # How many depts have reported in this snapshot (with vs without baseline)
    depts_r = set(d['dept_name'] for d in reported)
    depts_with_r1_2026 = sum(1 for d in reported if d['has_r1_2026'])
    depts_with_proxy   = sum(1 for d in reported if d['has_proxy'])

    diff = (err_with - err_without) if err_without and err_with else None

    print(f"{milestone:>4}%  {raw_share:>6.2f}%  "
          f"{proj_without:>8.2f}% ({err_without:+.2f}pp)  "
          f"{proj_with:>8.2f}% ({err_with:+.2f}pp)  "
          f"{diff:>+.2f}pp  "
          f"{depts_with_r1_2026:>8} dists  {depts_with_proxy:>8} dists", flush=True)

    results.append({
        'milestone': milestone, 'raw': raw_share,
        'proj_without': proj_without, 'proj_with': proj_with,
        'err_without': err_without, 'err_with': err_with,
        'diff': diff,
    })

print("\n" + "═"*80)
print("RESUMEN: MAE promedio")
print("─"*80)
mae_raw     = sum(abs(r['raw'] - TRUTH_KF) for r in results) / len(results)
mae_without = sum(abs(r['err_without']) for r in results if r['err_without']) / len(results)
mae_with    = sum(abs(r['err_with'])    for r in results if r['err_with'])    / len(results)
print(f"  Conteo crudo (sin proyector): {mae_raw:.2f}pp")
print(f"  Proyector SIN proxy (1,518):  {mae_without:.2f}pp")
print(f"  Proyector CON proxy (1,886):  {mae_with:.2f}pp")
print(f"  Mejora del proxy:             {mae_without - mae_with:+.2f}pp")
print()
print("── Desglose por dept con proxy (cuánto aportan vs fallback) ─────────")
proxy_depts = set()
for d in districts:
    if d['has_proxy']:
        proxy_depts.add(d['dept_name'])

by_dept_share = {}
for dept in sorted(proxy_depts):
    dept_dists = [d for d in districts if d['dept_name'] == dept]
    if not dept_dists: continue
    vv = sum(d['total_r2'] for d in dept_dists)
    kf_avg = sum(d['kf_r2_share'] for d in dept_dists) / len(dept_dists)
    proxy_cnt = sum(1 for d in dept_dists if d['has_proxy'])
    r1_cnt    = sum(1 for d in dept_dists if d['has_r1_2026'])
    print(f"  {dept:<22} {proxy_cnt:>4}p+{r1_cnt:<3}r dists  VV={vv:>9,}  KF_avg={kf_avg:.1f}%")

print("\n═"*80)
print("CONCLUSIÓN")
print("─"*80)
print("La mejora del proxy en el backtest 2021 es PRINCIPALMENTE circular")
print("(baseline = outcome → shift ≈ 0). El beneficio REAL en 7J 2026 viene de:")
print("  1. Mayor granularidad geográfica (distritos dentro del dept)")
print("  2. Fallback más preciso para zonas que no reportan hasta tarde (Puno)")
print("  3. Captura de outliers distritales que el fallback a dept/prov perdería")
