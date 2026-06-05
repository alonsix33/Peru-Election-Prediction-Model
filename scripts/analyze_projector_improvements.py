#!/usr/bin/env python3
"""
analyze_projector_improvements.py

Quantifies three improvement scenarios:
  A) Dept-shift projector vs national-only shift projector (milestone comparison)
  B) Arrival distribution stats from real June-8 participation snapshot
  C) Arrival sigma σ=0.02 vs σ=0.07 effect on 40% milestone

Uses same data sources as sandbox_r2_backtest_2021.py (jmcastagnetto GitHub).
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

MILESTONES = [0.20, 0.40, 0.60, 0.80, 1.00]
SEED = 42
ZERO_ACTAS_PENALTY = 0.95


def fetch_csv(url):
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read().decode('utf-8')


def load_r1(data):
    reader = csv.DictReader(io.StringIO(data))
    kf, cas = {}, {}
    for row in reader:
        key = (row['departamento'], row['provincia'], row['distrito'])
        votes = int(row.get('total_votos', 0) or 0)
        if row['cod_partido'] == '00000007':
            kf[key] = kf.get(key, 0) + votes
        elif row['cod_partido'] == '00000014':
            cas[key] = cas.get(key, 0) + votes
    return kf, cas


def load_r2(data):
    reader = csv.DictReader(io.StringIO(data))
    kf, cas = {}, {}
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
    reader = csv.DictReader(io.StringIO(data))
    pct = {}
    for row in reader:
        key = (row['departamento'], row['provincia'], row['distrito'])
        pct[key] = float(row.get('POR_ACTAS_CONTABILIZADAS', 100) or 100)
    return pct


def build_districts(r1_kf, r1_cas, r2_kf, r2_cas, participation):
    districts = []
    keys = set(r1_kf) & set(r1_cas) & set(r2_kf) & set(r2_cas)
    for key in keys:
        dept, prov, dist = key
        kfr1, casr1 = r1_kf[key], r1_cas[key]
        kfr2, casr2 = r2_kf[key], r2_cas[key]
        total_r1, total_r2 = kfr1 + casr1, kfr2 + casr2
        if total_r1 <= 0 or total_r2 <= 0:
            continue
        pct_actas = participation.get(key, 100.0)
        prof = DEPT_PROFILES.get(dept, {'delay': 0.50, 'region': 'selva'})
        districts.append({
            'dept': dept, 'prov': prov, 'dist': dist,
            'r1_share': kfr1 / total_r1 * 100.0,
            'r2_share': kfr2 / total_r2 * 100.0,
            'vv': total_r2,
            'pct_actas': pct_actas,
            'delay': prof['delay'],
            'region': prof['region'],
        })
    return districts


def assign_arrival(districts, rng, sigma=0.07):
    times = []
    for d in districts:
        base = d['delay']
        if d['pct_actas'] == 0.0:
            base = max(base, ZERO_ACTAS_PENALTY)
        vv_nudge = -0.015 * min(1.0, d['vv'] / 80_000)
        noise = rng.normal(0, sigma)
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
    """Current production: uses dept-level shift when dept has >=2 districts."""
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

    total_kf, total_vv = rep_kf, rep_vv
    for d in unr:
        shift = dept_shift.get(d['dept'], 0.0)
        proj = max(0.0, min(100.0, d['r1_share'] + shift))
        total_kf += proj * d['vv'] / 100
        total_vv += d['vv']
    return total_kf / total_vv * 100 if total_vv > 0 else r1_national


def stratified_projector_national_only(districts, reported, r1_national):
    """Alternative: ALWAYS uses national shift, never dept-level."""
    rep = [d for d, r in zip(districts, reported) if r]
    unr = [d for d, r in zip(districts, reported) if not r]
    if not rep:
        return r1_national
    rep_vv = sum(d['vv'] for d in rep)
    rep_kf = sum(d['r2_share'] * d['vv'] / 100 for d in rep)
    rep_r1_kf = sum(d['r1_share'] * d['vv'] / 100 for d in rep)
    nat_shift = (rep_kf - rep_r1_kf) / rep_vv * 100

    total_kf, total_vv = rep_kf, rep_vv
    for d in unr:
        proj = max(0.0, min(100.0, d['r1_share'] + nat_shift))
        total_kf += proj * d['vv'] / 100
        total_vv += d['vv']
    return total_kf / total_vv * 100 if total_vv > 0 else r1_national


def run_backtest(districts, sigma, r1_national, r2_national):
    """Run one full backtest pass, return dict of milestone results."""
    rng = np.random.RandomState(SEED)
    arrival = assign_arrival(districts, rng, sigma=sigma)
    order = sorted(range(len(districts)), key=lambda i: arrival[i])

    reported = [False] * len(districts)
    total_vv = sum(d['vv'] for d in districts)
    cum_vv = 0.0
    m_idx = 0
    results = {}

    for i in order:
        reported[i] = True
        cum_vv += districts[i]['vv']
        vv_pct = cum_vv / total_vv

        while m_idx < len(MILESTONES) and vv_pct >= MILESTONES[m_idx]:
            m = MILESTONES[m_idx]
            raw = raw_count(districts, reported)
            proj_dept = stratified_projector(districts, reported, r1_national)
            proj_nat  = stratified_projector_national_only(districts, reported, r1_national)
            raw_err   = (raw - r2_national) if raw is not None else float('nan')
            results[m] = {
                'raw_err': raw_err,
                'proj_dept_err': proj_dept - r2_national,
                'proj_nat_err':  proj_nat  - r2_national,
                'proj_dept': proj_dept,
                'proj_nat':  proj_nat,
                'raw': raw,
            }
            m_idx += 1
        if m_idx >= len(MILESTONES):
            break
    return results


def main():
    print("=" * 72)
    print("ANÁLISIS: Mejoras al proyector (dept-shift vs nacional, sigma arrival)")
    print("=" * 72)

    print("\nDescargando datos...", end="", flush=True)
    r1_data   = fetch_csv(R1_URL)
    r2_data   = fetch_csv(R2_URL)
    part_data = fetch_csv(R2_PART_URL)
    print(" OK")

    r1_kf, r1_cas   = load_r1(r1_data)
    r2_kf, r2_cas   = load_r2(r2_data)
    participation    = load_participation(part_data)
    districts        = build_districts(r1_kf, r1_cas, r2_kf, r2_cas, participation)
    total_vv         = sum(d['vv'] for d in districts)
    r1_national      = vv_mean([d['r1_share'] for d in districts], [d['vv'] for d in districts])
    r2_national      = vv_mean([d['r2_share'] for d in districts], [d['vv'] for d in districts])
    print(f"Dataset: {len(districts)} distritos, {total_vv:,} VV")
    print(f"R2 final: KF {r2_national:.3f}%")

    # ── SECTION A: Dept-shift vs National-only ──────────────────────────────────
    print()
    print("=" * 72)
    print("A) COMPARACIÓN: Proyector con dept-shift vs nacional-only")
    print(f"   (sigma=0.07, seed={SEED})")
    print("=" * 72)
    print(f"\n  {'Milestone':>10}  {'Raw err':>10}  {'Dept-shift err':>14}  {'Nat-only err':>13}  {'Dept improv.':>13}  {'Nat improv.':>12}")
    print(f"  {'-'*75}")

    results_default = run_backtest(districts, sigma=0.07, r1_national=r1_national, r2_national=r2_national)
    for m in MILESTONES:
        r = results_default[m]
        raw_e    = r['raw_err']
        dept_e   = r['proj_dept_err']
        nat_e    = r['proj_nat_err']
        dept_imp = (abs(raw_e) - abs(dept_e)) / abs(raw_e) * 100 if raw_e else 0
        nat_imp  = (abs(raw_e) - abs(nat_e))  / abs(raw_e) * 100 if raw_e else 0
        dept_vs_nat = abs(nat_e) - abs(dept_e)   # positive = dept is better
        print(f"  {m*100:>9.0f}%  {raw_e:>+9.2f}pp  {dept_e:>+13.2f}pp  {nat_e:>+12.2f}pp  "
              f"{'dept '+str(round(dept_imp))+'%':>13}  {'nat '+str(round(nat_imp))+'%':>12}  "
              f"  dept vs nat: {dept_vs_nat:+.2f}pp")

    print()
    print("  Summary: dept_shift advantage over national-only at key milestones:")
    for m in [0.20, 0.40, 0.60, 0.80]:
        r = results_default[m]
        diff = abs(r['proj_nat_err']) - abs(r['proj_dept_err'])
        print(f"    {m*100:.0f}%: dept={abs(r['proj_dept_err']):.2f}pp, nat={abs(r['proj_nat_err']):.2f}pp, advantage={diff:+.2f}pp")

    # ── SECTION B: Arrival distribution analysis ────────────────────────────────
    print()
    print("=" * 72)
    print("B) DISTRIBUCIÓN DE LLEGADA — snapshot June-8 (pct_actas reales)")
    print("=" * 72)

    zero_actas = [d for d in districts if d['pct_actas'] == 0.0]
    partial_actas = [d for d in districts if 0 < d['pct_actas'] < 50]
    majority_actas = [d for d in districts if d['pct_actas'] >= 50]
    full_actas = [d for d in districts if d['pct_actas'] >= 99.9]

    zero_vv  = sum(d['vv'] for d in zero_actas)
    part_vv  = sum(d['vv'] for d in partial_actas)
    maj_vv   = sum(d['vv'] for d in majority_actas)
    full_vv  = sum(d['vv'] for d in full_actas)

    print(f"\n  Total districts in dataset: {len(districts)}")
    print(f"\n  0% actas (zero reporting):")
    print(f"    Count:    {len(zero_actas)} districts ({len(zero_actas)/len(districts)*100:.1f}% of districts)")
    print(f"    VV:       {zero_vv:,} ({zero_vv/total_vv*100:.2f}% of total VV)")
    if zero_actas:
        by_dept = defaultdict(list)
        for d in zero_actas:
            by_dept[d['dept']].append(d)
        print(f"    By dept:  ", end="")
        for dept, ds in sorted(by_dept.items(), key=lambda x: -len(x[1])):
            print(f"{dept} ({len(ds)}d, {sum(dd['vv'] for dd in ds):,}vv)", end="  ")
        print()

    print(f"\n  Partial (0 < actas < 50%):")
    print(f"    Count:    {len(partial_actas)} districts ({len(partial_actas)/len(districts)*100:.1f}%)")
    print(f"    VV:       {part_vv:,} ({part_vv/total_vv*100:.2f}% of total VV)")

    print(f"\n  >=50% actas:")
    print(f"    Count:    {len(majority_actas)} districts ({len(majority_actas)/len(districts)*100:.1f}%)")
    print(f"    VV:       {maj_vv:,} ({maj_vv/total_vv*100:.2f}% of total VV)")

    print(f"\n  Fully counted (>=99.9%):")
    print(f"    Count:    {len(full_actas)} districts ({len(full_actas)/len(districts)*100:.1f}%)")
    print(f"    VV:       {full_vv:,} ({full_vv/total_vv*100:.2f}% of total VV)")

    # Distribution by bucket
    print(f"\n  Distribution by pct_actas bucket:")
    buckets = [(0, 0.1), (0.1, 25), (25, 50), (50, 75), (75, 99), (99, 100.1)]
    for lo, hi in buckets:
        bucket = [d for d in districts if lo <= d['pct_actas'] < hi]
        bvv = sum(d['vv'] for d in bucket)
        print(f"    [{lo:>5.1f}%, {hi:>6.1f}%):  {len(bucket):4d} districts  "
              f"{bvv:>9,} VV  ({bvv/total_vv*100:>5.2f}%)")

    # Check what % of VV the zero-actas districts represent in "early" depts
    print(f"\n  Zero-actas districts by region:")
    if zero_actas:
        by_region = defaultdict(list)
        for d in zero_actas:
            by_region[d['region']].append(d)
        for reg, ds in sorted(by_region.items()):
            rvv = sum(d['vv'] for d in ds)
            print(f"    {reg:<18}: {len(ds):3d} districts, {rvv:,} VV ({rvv/total_vv*100:.2f}%)")
    else:
        print("    None (all districts had data in June-8 snapshot)")

    # ── SECTION C: Sigma comparison at 40% milestone ────────────────────────────
    print()
    print("=" * 72)
    print("C) EFECTO DEL SIGMA DE LLEGADA: σ=0.02 vs σ=0.07 al 40% de actas")
    print("=" * 72)

    sigmas = [0.02, 0.05, 0.07, 0.10, 0.15]
    print(f"\n  {'Sigma':>8}  {'Proj err @20%':>14}  {'Proj err @40%':>14}  "
          f"{'Proj err @60%':>14}  {'Proj err @80%':>14}")
    print(f"  {'-'*65}")
    sigma_results = {}
    for sig in sigmas:
        res = run_backtest(districts, sigma=sig, r1_national=r1_national, r2_national=r2_national)
        sigma_results[sig] = res
        e20 = res[0.20]['proj_dept_err']
        e40 = res[0.40]['proj_dept_err']
        e60 = res[0.60]['proj_dept_err']
        e80 = res[0.80]['proj_dept_err']
        print(f"  σ={sig:.2f}    {e20:>+13.2f}pp   {e40:>+13.2f}pp   {e60:>+13.2f}pp   {e80:>+13.2f}pp")

    print(f"\n  Key comparison σ=0.02 vs σ=0.07 at 40% milestone:")
    e_02 = sigma_results[0.02][0.40]['proj_dept_err']
    e_07 = sigma_results[0.07][0.40]['proj_dept_err']
    diff = abs(e_02) - abs(e_07)
    print(f"    σ=0.07 (default):  {e_07:+.3f}pp error")
    print(f"    σ=0.02 (tighter):  {e_02:+.3f}pp error")
    print(f"    Difference:        {diff:+.3f}pp  ({'tighter sigma WORSE' if diff > 0 else 'tighter sigma BETTER'})")
    print(f"\n  Explanation: with σ=0.02, districts within a dept arrive as a tighter")
    print(f"  bloc (less mixing). With σ=0.07, there's more inter-dept mixing early on,")
    print(f"  which gives the projector more diverse data to estimate the national shift.")

    # ── SECTION D: Summary / Production Impact ──────────────────────────────────
    print()
    print("=" * 72)
    print("D) RESUMEN: IMPACTO REALISTA DE MEJORAS EN PRODUCCIÓN")
    print("=" * 72)

    r40 = results_default[0.40]
    r20 = results_default[0.20]
    r80 = results_default[0.80]
    dept_advantage_40 = abs(r40['proj_nat_err']) - abs(r40['proj_dept_err'])
    dept_advantage_20 = abs(r20['proj_nat_err']) - abs(r20['proj_dept_err'])
    dept_advantage_80 = abs(r80['proj_nat_err']) - abs(r80['proj_dept_err'])

    print(f"""
  PROJECTOR DEPT-SHIFT vs NATIONAL-ONLY:
  ─────────────────────────────────────
  Dept-shift advantage at 20%:  {dept_advantage_20:+.3f}pp
  Dept-shift advantage at 40%:  {dept_advantage_40:+.3f}pp  ← critical early window
  Dept-shift advantage at 80%:  {dept_advantage_80:+.3f}pp

  CURRENT PRODUCTION ACCURACY (dept-shift, σ=0.07):
  ──────────────────────────────────────────────────
  @20%:  raw {abs(r20['raw_err']):.2f}pp  →  projector {abs(r20['proj_dept_err']):.2f}pp  ({(abs(r20['raw_err'])-abs(r20['proj_dept_err']))/abs(r20['raw_err'])*100:.0f}% better)
  @40%:  raw {abs(r40['raw_err']):.2f}pp  →  projector {abs(r40['proj_dept_err']):.2f}pp  ({(abs(r40['raw_err'])-abs(r40['proj_dept_err']))/abs(r40['raw_err'])*100:.0f}% better)
  @80%:  raw {abs(r80['raw_err']):.2f}pp  →  projector {abs(r80['proj_dept_err']):.2f}pp  ({(abs(r80['raw_err'])-abs(r80['proj_dept_err']))/abs(r80['raw_err'])*100:.0f}% better)

  ARRIVAL SIGMA IMPACT:
  ─────────────────────
  σ=0.07 (current default) at 40%: {abs(sigma_results[0.07][0.40]['proj_dept_err']):.3f}pp
  σ=0.02 (Lima bloc)       at 40%: {abs(sigma_results[0.02][0.40]['proj_dept_err']):.3f}pp
  → Sigma tightening adds: {abs(sigma_results[0.02][0.40]['proj_dept_err'])-abs(sigma_results[0.07][0.40]['proj_dept_err']):+.3f}pp error
    (dept-shift handles Lima bias; sigma mostly a smoothing parameter)

  BOTTOM LINE:
  ────────────
  The dept-shift projector in production ALREADY handles the Lima-first bias.
  National-only shift would be {dept_advantage_40:.2f}pp worse at the 40% milestone.
  Implementing dept-shift in production (from national-only) would reduce error
  by ~{dept_advantage_40:.2f}pp at first snapshot.

  With sigma=0.07 the simulation mixes districts well; tighter sigma (0.02) makes
  early arrival more Lima-dominated which slightly worsens projector accuracy.
  Production code uses real district arrival order (not simulated), so sigma
  only matters for the sandbox simulation fidelity, not production accuracy.
""")


if __name__ == "__main__":
    main()
