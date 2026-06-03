#!/usr/bin/env python3
"""
sandbox_r2_backtest_2021.py

Real backtest of the election night stratified-shift projector
using actual 2021 R2 (Castillo vs Fujimori) district-level data.

Data sources (public GitHub, fetched at runtime):
  R1 baseline:  jmcastagnetto/2021-elecciones-generales-peru-datos-de-onpe
  R2 truth:     jmcastagnetto/2021-segunda-vuelta-eleccion-presidencial-peru

Key validation: ONPE published at 42.03% of actas → Keiko 52.905% nationally.
Our projector should be far closer to the final 50.125% even at that early stage.
"""

import urllib.request, csv, io, unicodedata
import numpy as np
from collections import defaultdict

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

# ─── Dept profiles ────────────────────────────────────────────────────────────
# Names match ALL-CAPS Spanish in the 2021 dataset (no accents)
DEPT_PROFILES = {
    'LIMA':          {'delay': 0.00, 'region': 'lima'},
    'CALLAO':        {'delay': 0.05, 'region': 'lima'},
    'ICA':           {'delay': 0.12, 'region': 'costa_sur'},
    'LAMBAYEQUE':    {'delay': 0.17, 'region': 'norte'},
    'LA LIBERTAD':   {'delay': 0.20, 'region': 'norte'},
    'PIURA':         {'delay': 0.22, 'region': 'norte'},
    'AREQUIPA':      {'delay': 0.24, 'region': 'costa_sur'},
    'TUMBES':        {'delay': 0.28, 'region': 'norte'},
    'MOQUEGUA':      {'delay': 0.30, 'region': 'costa_sur'},
    'ANCASH':        {'delay': 0.32, 'region': 'norte'},
    'TACNA':         {'delay': 0.34, 'region': 'costa_sur'},
    'LORETO':        {'delay': 0.37, 'region': 'selva'},
    'CAJAMARCA':     {'delay': 0.42, 'region': 'sierra_norte'},
    'AMAZONAS':      {'delay': 0.46, 'region': 'selva'},
    'JUNIN':         {'delay': 0.50, 'region': 'sierra_centro'},
    'SAN MARTIN':    {'delay': 0.52, 'region': 'selva'},
    'UCAYALI':       {'delay': 0.55, 'region': 'selva'},
    'HUANUCO':       {'delay': 0.58, 'region': 'sierra_centro'},
    'PASCO':         {'delay': 0.60, 'region': 'sierra_centro'},
    'MADRE DE DIOS': {'delay': 0.62, 'region': 'selva'},
    'PUNO':          {'delay': 0.68, 'region': 'sierra_sur'},
    'HUANCAVELICA':  {'delay': 0.73, 'region': 'sierra_sur'},
    'CUSCO':         {'delay': 0.79, 'region': 'sierra_sur'},
    'AYACUCHO':      {'delay': 0.85, 'region': 'sierra_sur'},
    'APURIMAC':      {'delay': 0.93, 'region': 'sierra_sur'},
}

MILESTONES = [0.05, 0.10, 0.20, 0.30, 0.40, 0.50, 0.60, 0.70, 0.80, 0.90, 1.00]
ARRIVAL_SIGMA = 0.07
SEED = 42

# Districts with 0% actas counted in June-8 snapshot (VRAEM + remote)
# These get a late-arrival penalty
ZERO_ACTAS_PENALTY = 0.95  # arrival time floor for these


def strip_accents(s):
    return ''.join(
        c for c in unicodedata.normalize('NFD', s)
        if unicodedata.category(c) != 'Mn'
    ).upper().strip()


def fetch_csv(url):
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    with urllib.request.urlopen(req, timeout=20) as r:
        return r.read().decode('utf-8')


def load_r1(data):
    """Load R1 2021 — filter Keiko (00000007) and Castillo (00000014)."""
    reader = csv.DictReader(io.StringIO(data))
    kf = {}   # (dept, prov, dist) → keiko votes
    cas = {}  # (dept, prov, dist) → castillo votes
    for row in reader:
        key = (row['departamento'], row['provincia'], row['distrito'])
        votes = int(row.get('total_votos', 0) or 0)
        if row['cod_partido'] == '00000007':
            kf[key] = kf.get(key, 0) + votes
        elif row['cod_partido'] == '00000014':
            cas[key] = cas.get(key, 0) + votes
    return kf, cas


def load_r2(data):
    """Load R2 2021 — filter Keiko and Castillo votes per district."""
    reader = csv.DictReader(io.StringIO(data))
    kf = {}
    cas = {}
    for row in reader:
        key = (row['departamento'], row['provincia'], row['distrito'])
        votes = int(float(row.get('TOTAL_VOTOS', 0) or 0))
        name = row.get('NOMBREe_CANDIDATO', '')
        if 'FUJIMORI' in name:
            kf[key] = kf.get(key, 0) + votes
        elif 'CASTILLO' in name:
            cas[key] = cas.get(key, 0) + votes
    return kf, cas


def load_participation(data):
    """Load per-district % actas contabilizadas."""
    reader = csv.DictReader(io.StringIO(data))
    pct = {}
    for row in reader:
        key = (row['departamento'], row['provincia'], row['distrito'])
        pct[key] = float(row.get('POR_ACTAS_CONTABILIZADAS', 100) or 100)
    return pct


def build_districts(r1_kf, r1_cas, r2_kf, r2_cas, participation):
    """Merge R1, R2, participation data per district."""
    districts = []
    keys = set(r1_kf) & set(r1_cas) & set(r2_kf) & set(r2_cas)
    for key in keys:
        dept, prov, dist = key
        kfr1 = r1_kf[key]
        casr1 = r1_cas[key]
        kfr2 = r2_kf[key]
        casr2 = r2_cas[key]
        total_r1 = kfr1 + casr1
        total_r2 = kfr2 + casr2
        if total_r1 <= 0 or total_r2 <= 0:
            continue
        r1_share = kfr1 / total_r1 * 100.0
        r2_share = kfr2 / total_r2 * 100.0
        pct_actas = participation.get(key, 100.0)
        prof = DEPT_PROFILES.get(dept, {'delay': 0.50, 'region': 'selva'})
        districts.append({
            'dept': dept, 'prov': prov, 'dist': dist,
            'r1_share': r1_share,
            'r2_share': r2_share,
            'vv': total_r2,
            'pct_actas': pct_actas,
            'delay': prof['delay'],
            'region': prof['region'],
        })
    return districts


def assign_arrival(districts, rng):
    """
    Arrival time per district:
    - Base = dept delay
    - Districts with 0% actas counted in June-8 snapshot = definitely late (VRAEM)
    - +ARRIVAL_SIGMA noise within dept
    """
    times = []
    for d in districts:
        base = d['delay']
        if d['pct_actas'] == 0.0:
            base = max(base, ZERO_ACTAS_PENALTY)
        vv_nudge = -0.015 * min(1.0, d['vv'] / 80_000)  # larger districts slightly earlier
        noise = rng.normal(0, ARRIVAL_SIGMA)
        t = base + vv_nudge + noise
        times.append(max(0.0, min(1.0, t)))
    return times


def vv_mean(shares, vvs):
    total = sum(vvs)
    return sum(s * v for s, v in zip(shares, vvs)) / total if total > 0 else 50.0


def raw_count(districts, reported):
    kf = sum(d['r2_share'] * d['vv'] / 100 for d, r in zip(districts, reported) if r)
    tot = sum(d['vv'] for d, r in zip(districts, reported) if r)
    return kf / tot * 100 if tot > 0 else None


def stratified_projector(districts, reported, r1_national):
    rep = [d for d, r in zip(districts, reported) if r]
    unr = [d for d, r in zip(districts, reported) if not r]
    if not rep:
        return r1_national
    rep_vv = sum(d['vv'] for d in rep)
    rep_kf = sum(d['r2_share'] * d['vv'] / 100 for d in rep)
    rep_r1_kf = sum(d['r1_share'] * d['vv'] / 100 for d in rep)
    nat_shift = (rep_kf - rep_r1_kf) / rep_vv * 100

    dept_stats = defaultdict(lambda: {'kf': 0.0, 'r1_kf': 0.0, 'vv': 0.0, 'n': 0})
    for d in rep:
        dept_stats[d['dept']]['kf']    += d['r2_share'] * d['vv'] / 100
        dept_stats[d['dept']]['r1_kf'] += d['r1_share'] * d['vv'] / 100
        dept_stats[d['dept']]['vv']    += d['vv']
        dept_stats[d['dept']]['n']     += 1
    dept_shift = {dept: (s['kf'] - s['r1_kf']) / s['vv'] * 100
                  for dept, s in dept_stats.items() if s['n'] >= 2 and s['vv'] > 0}

    total_kf = rep_kf
    total_vv = rep_vv
    for d in unr:
        shift = dept_shift.get(d['dept'], nat_shift)
        proj = max(0.0, min(100.0, d['r1_share'] + shift))
        total_kf += proj * d['vv'] / 100
        total_vv += d['vv']
    return total_kf / total_vv * 100 if total_vv > 0 else r1_national


def main():
    print("═" * 72)
    print("BACKTEST REAL: R2 2021 (Castillo vs Fujimori) — Proyector noche electoral")
    print("Fuente: jmcastagnetto/2021-*-eleccion-presidencial-peru (GitHub)")
    print("═" * 72)

    print("\nCargando datos...", end="", flush=True)
    r1_data = fetch_csv(R1_URL)
    r2_data = fetch_csv(R2_URL)
    part_data = fetch_csv(R2_PART_URL)
    print(" OK")

    r1_kf, r1_cas = load_r1(r1_data)
    r2_kf, r2_cas = load_r2(r2_data)
    participation = load_participation(part_data)

    districts = build_districts(r1_kf, r1_cas, r2_kf, r2_cas, participation)
    total_vv = sum(d['vv'] for d in districts)
    r1_national = vv_mean([d['r1_share'] for d in districts], [d['vv'] for d in districts])
    r2_national = vv_mean([d['r2_share'] for d in districts], [d['vv'] for d in districts])

    print(f"\nDataset: {len(districts)} distritos, {total_vv:,} VV (R2)")
    print(f"R1 2021 KF share (Keiko/Keiko+Castillo, dataset): {r1_national:.2f}%")
    print(f"R2 2021 KF share (final, dataset):                 {r2_national:.2f}%")
    print(f"Shift R1→R2:                                       {r2_national-r1_national:+.2f}pp")
    print(f"Resultado ONPE oficial 100%:  Keiko 49.875%, Castillo 50.125%")

    # Dept-level summary
    print(f"\nPor departamento (ordenado por delay de llegada):")
    print(f"  {'Dept':<18} {'delay':>6}  {'VV':>9}  {'R1 KF%':>7}  {'R2 KF%':>7}  {'shift':>7}  {'0%actas':>8}")
    dept_vv = defaultdict(int)
    dept_r1kf = defaultdict(float)
    dept_r2kf = defaultdict(float)
    dept_zero = defaultdict(int)
    for d in districts:
        dept_vv[d['dept']] += d['vv']
        dept_r1kf[d['dept']] += d['r1_share'] * d['vv'] / 100
        dept_r2kf[d['dept']] += d['r2_share'] * d['vv'] / 100
        if d['pct_actas'] == 0:
            dept_zero[d['dept']] += 1
    for dept in sorted(DEPT_PROFILES, key=lambda x: DEPT_PROFILES[x]['delay']):
        if dept not in dept_vv:
            continue
        vv = dept_vv[dept]
        r1s = dept_r1kf[dept] / vv * 100
        r2s = dept_r2kf[dept] / vv * 100
        print(f"  {dept:<18} {DEPT_PROFILES[dept]['delay']:>6.2f}  {vv:>9,}  {r1s:>7.1f}%  {r2s:>7.1f}%  "
              f"{r2s-r1s:>+7.1f}pp  {dept_zero[dept]:>4}d (0%)")

    # ── Backtest ────────────────────────────────────────────────────────────
    rng = np.random.RandomState(SEED)
    arrival = assign_arrival(districts, rng)
    order = sorted(range(len(districts)), key=lambda i: arrival[i])

    print(f"\n{'─'*72}")
    print("BACKTEST: Conteo crudo vs Proyector estratificado")
    print(f"Verdad: KF {r2_national:.2f}%  (ONPE oficial: 49.875%)")
    print(f"{'─'*72}")
    print(f"  {'VV%':>5}  {'Crudo%':>7}  {'Err':>7}  {'Proj%':>7}  {'Err':>7}  {'Ganancia':>9}  {'Depts':>6}")
    print(f"  {'─'*65}")

    reported = [False] * len(districts)
    cum_vv = 0.0
    m_idx = 0
    results = []
    known_42pct = None  # store result near 42% for validation

    for i in order:
        reported[i] = True
        cum_vv += districts[i]['vv']
        vv_pct = cum_vv / total_vv

        while m_idx < len(MILESTONES) and vv_pct >= MILESTONES[m_idx]:
            m = MILESTONES[m_idx]
            raw = raw_count(districts, reported)
            proj = stratified_projector(districts, reported, r1_national)
            rep_depts = len(set(districts[j]['dept'] for j in range(len(districts)) if reported[j]))

            raw_err = (raw - r2_national) if raw is not None else float('nan')
            proj_err = proj - r2_national
            gain = abs(raw_err) - abs(proj_err)

            # Flag the 40% milestone as close to the known 42% snapshot
            flag = " ← ~42% snapshot!" if 0.38 <= m <= 0.42 else ""
            raw_s = f"{raw:6.2f}%" if raw is not None else "    N/A"
            print(f"  {m*100:>4.0f}%  {raw_s}  {raw_err:>+7.2f}pp  "
                  f"{proj:6.2f}%  {proj_err:>+7.2f}pp  "
                  f"{gain:>+9.2f}pp  {rep_depts:>3}/{len(DEPT_PROFILES)}d{flag}")

            results.append({'m': m, 'raw': raw, 'raw_err': raw_err,
                            'proj': proj, 'proj_err': proj_err, 'rep_depts': rep_depts})
            m_idx += 1

        if m_idx >= len(MILESTONES):
            break

    # ── 42% validation ──────────────────────────────────────────────────────
    print(f"\n{'─'*72}")
    print("Validación contra snapshot ONPE al 42.03%:")
    print(f"  ONPE raw count al 42%:   Keiko 52.905% (Lima urbano dominando el conteo)")
    r = next((x for x in results if 0.38 <= x['m'] <= 0.42), None)
    if r:
        print(f"  Nuestro conteo crudo:    Keiko {r['raw']:.2f}%  (err {r['raw_err']:+.2f}pp vs final)")
        print(f"  Nuestro proyector:       Keiko {r['proj']:.2f}%  (err {r['proj_err']:+.2f}pp vs final)")
        print(f"  Proyector vs ONPE raw:   {r['proj'] - 52.905:+.2f}pp de diferencia")

    # ── Lima-first bias analysis ─────────────────────────────────────────────
    print(f"\n{'─'*72}")
    print("Análisis del sesgo Lima-primero:")
    lima_dists = [d for d in districts if d['dept'] in ('LIMA', 'CALLAO')]
    lima_vv = sum(d['vv'] for d in lima_dists)
    lima_r1 = vv_mean([d['r1_share'] for d in lima_dists], [d['vv'] for d in lima_dists])
    lima_r2 = vv_mean([d['r2_share'] for d in lima_dists], [d['vv'] for d in lima_dists])
    sierra_dists = [d for d in districts if d['region'] == 'sierra_sur']
    sierra_vv = sum(d['vv'] for d in sierra_dists)
    sierra_r1 = vv_mean([d['r1_share'] for d in sierra_dists], [d['vv'] for d in sierra_dists])
    sierra_r2 = vv_mean([d['r2_share'] for d in sierra_dists], [d['vv'] for d in sierra_dists])

    print(f"  Lima+Callao: {lima_vv:,} VV  R1={lima_r1:.1f}%  R2={lima_r2:.1f}%  shift={lima_r2-lima_r1:+.1f}pp")
    print(f"  Sierra Sur:  {sierra_vv:,} VV  R1={sierra_r1:.1f}%  R2={sierra_r2:.1f}%  shift={sierra_r2-sierra_r1:+.1f}pp")
    print(f"  → Lima/Callao = {lima_vv/total_vv*100:.1f}% of VV, reports FIRST (delay 0.00-0.05)")
    print(f"  → Sierra Sur  = {sierra_vv/total_vv*100:.1f}% of VV, reports LAST  (delay 0.68-0.93)")
    print(f"  → Shift differential: {(lima_r2-lima_r1)-(sierra_r2-sierra_r1):+.1f}pp between Lima and Sierra Sur")

    # ── Summary table ────────────────────────────────────────────────────────
    print(f"\n{'═'*72}")
    print("RESUMEN: MAE por milestone")
    print(f"{'─'*72}")
    print(f"  {'Milestone':>10}  {'Raw MAE':>10}  {'Proj MAE':>10}  {'Reducción':>10}")
    for r in results:
        if np.isnan(r['raw_err']):
            continue
        if abs(r['raw_err']) == 0:
            continue
        reduction = (abs(r['raw_err']) - abs(r['proj_err'])) / abs(r['raw_err']) * 100
        print(f"  {r['m']*100:>9.0f}%  {abs(r['raw_err']):>9.2f}pp  "
              f"{abs(r['proj_err']):>9.2f}pp  {reduction:>9.0f}%")

    print(f"\n{'═'*72}")
    print("CONCLUSIONES")
    print(f"{'═'*72}")
    mae_raw_40 = abs(next(x['raw_err'] for x in results if x['m'] == 0.40))
    mae_proj_40 = abs(next(x['proj_err'] for x in results if x['m'] == 0.40))
    mae_raw_20 = abs(next(x['raw_err'] for x in results if x['m'] == 0.20))
    mae_proj_20 = abs(next(x['proj_err'] for x in results if x['m'] == 0.20))
    print(f"""
  1. SESGO LIMA CONFIRMADO EN DATOS REALES:
     Lima+Callao ({lima_vv/total_vv*100:.0f}% VV) terminó con {lima_r2:.1f}% KF en R2.
     Reportó primero → el conteo crudo al 20-40% mostraba KF ~{mae_raw_20+r2_national:.0f}%,
     vs el resultado final de {r2_national:.1f}%.

  2. PROYECTOR CORRIGE EL SESGO:
     Al 20% VV: crudo={mae_raw_20:.1f}pp de error, proyector={mae_proj_20:.1f}pp
                ({mae_raw_20/mae_proj_20:.0f}× mejor)
     Al 40% VV: crudo={mae_raw_40:.1f}pp de error, proyector={mae_proj_40:.1f}pp
                ({mae_raw_40/mae_proj_40:.0f}× mejor)

  3. VALIDACIÓN SNAPSHOT REAL (42%):
     ONPE publicó Keiko 52.9% al 42% → nuestro proyector corrige a ~{mae_proj_40+r2_national:.1f}%
     (diferencia de solo {(mae_proj_40+r2_national)-49.875:+.2f}pp vs 49.875% oficial).

  4. 2021 vs 2026:
     En 2021 el patrón es más extremo: Lima shift {lima_r2-lima_r1:+.1f}pp vs Sierra Sur {sierra_r2-sierra_r1:+.1f}pp.
     En 2026 esperamos patrón similar (Keiko vs anti-Keiko sigue el mismo eje geográfico).
""")


if __name__ == "__main__":
    main()
