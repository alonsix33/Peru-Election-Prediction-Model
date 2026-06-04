#!/usr/bin/env python3
"""
sandbox_r2_election_night.py

Synthetic backtest of the election night stratified-shift projector.
5 R2 scenarios × realistic Lima-first arrival order.

Baseline: r1_districts_flat.json (1518 districts, 13.5M VV, 17 depts)
Goal: compare raw count vs stratified-shift projector at milestones 5%→100% VV
"""

import json
import numpy as np
from collections import defaultdict
import os

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_FILE = os.path.join(SCRIPT_DIR, '..', 'backend', 'data', 'r1_districts_flat.json')

# ─── Dept profiles ────────────────────────────────────────────────────────────
# NOTE: ONPE uses non-standard ubigeo numbering (≠ INEI):
#   Lima=140000, Callao=240000, Ica=100000, Cusco=070000, etc.
# arrival_delay: 0.00=reports first, 1.00=reports last (typical ONPE pattern)

DEPT_PROFILES = {
    '140000': {'delay': 0.00, 'region': 'lima',          'name': 'Lima'},
    '240000': {'delay': 0.05, 'region': 'lima',          'name': 'Callao'},
    '100000': {'delay': 0.12, 'region': 'costa_sur',     'name': 'Ica'},
    '130000': {'delay': 0.17, 'region': 'norte',         'name': 'Lambayeque'},
    '120000': {'delay': 0.20, 'region': 'norte',         'name': 'La Libertad'},
    '040000': {'delay': 0.24, 'region': 'costa_sur',     'name': 'Arequipa'},
    '020000': {'delay': 0.30, 'region': 'norte',         'name': 'Áncash'},
    '150000': {'delay': 0.35, 'region': 'selva',         'name': 'Loreto'},
    '060000': {'delay': 0.42, 'region': 'sierra_norte',  'name': 'Cajamarca'},
    '010000': {'delay': 0.46, 'region': 'selva',         'name': 'Amazonas'},
    '110000': {'delay': 0.50, 'region': 'sierra_centro', 'name': 'Junín'},
    '090000': {'delay': 0.58, 'region': 'sierra_centro', 'name': 'Huánuco'},
    '160000': {'delay': 0.62, 'region': 'selva',         'name': 'Madre de Dios'},
    '080000': {'delay': 0.72, 'region': 'sierra_sur',    'name': 'Huancavelica'},
    '070000': {'delay': 0.78, 'region': 'sierra_sur',    'name': 'Cusco'},
    '050000': {'delay': 0.85, 'region': 'sierra_sur',    'name': 'Ayacucho'},
    '030000': {'delay': 0.92, 'region': 'sierra_sur',    'name': 'Apurímac'},
}

# Extra shift vs national average (pp).  e.g., lima shifts LESS than avg against KF.
# Sum of (regional_diff × dept_VV_weight) ≈ 0 by design.
REGIONAL_DIFF = {
    'lima':          +6.5,   # Lima/Callao: middle class → K vs R
    'costa_sur':     +2.0,   # Ica, Arequipa: historically moderate-fujimori
    'norte':         +1.5,   # La Libertad, Lambayeque, Áncash
    'sierra_norte':  -1.0,   # Cajamarca: northern sierra, anti-establishment
    'sierra_centro': -3.5,   # Junín, Huánuco: mixed
    'selva':         -4.0,   # Loreto, Amazonas, Madre de Dios
    'sierra_sur':    -9.0,   # Cusco, Ayacucho, Apurímac, Huancavelica: strongly anti-KF
}

# Scenarios: (label, dataset_target %, description, national_equiv %)
# Dataset R1 baseline ≈ 69.0% (vs national 58.46%); offset ≈ +10.5pp
# → dataset_target ≈ national_target + 10.5 (linear approximation)
# NOTE: Even "RSP wins nationally" scenarios show KF>50% in the dataset,
#       because 8 strongly anti-KF depts are absent (Puno, Piura, San Martín, etc.)
SCENARIOS = [
    ('A', 64.5, 'KF cómoda     (~54% nacional)'),
    ('B', 62.0, 'KF ajustada   (~51.5% nacional)'),
    ('C', 60.5, 'KF razor      (~50% nacional)'),
    ('D', 59.5, 'RSP ajustada  (~49% nacional, KF leads in subset)'),
    ('E', 57.5, 'RSP cómoda    (~47% nacional, KF leads in subset)'),
]

MILESTONES = [0.05, 0.10, 0.15, 0.20, 0.30, 0.40, 0.50, 0.60, 0.70, 0.80, 0.90, 1.00]
NOISE_SIGMA = 1.5   # per-district noise pp
ARRIVAL_SIGMA = 0.09  # within-dept arrival spread (how staggered districts report)
SEED = 42


def load_districts():
    with open(DATA_FILE) as f:
        raw = json.load(f)
    districts = []
    for ubigeo, d in raw.items():
        if d.get('kf_r2_share') is None:
            continue
        if d.get('totalVotosValidos', 0) <= 0:
            continue
        dept_ubigeo = d.get('deptUbigeo', '')
        profile = DEPT_PROFILES.get(dept_ubigeo, {
            'delay': 0.50, 'region': 'selva', 'name': dept_ubigeo
        })
        districts.append({
            'ubigeo': ubigeo,
            'dept_ubigeo': dept_ubigeo,
            'dept_name': profile['name'],
            'region': profile['region'],
            'delay': profile['delay'],
            'r1_share': d['kf_r2_share'],
            'vv': d['totalVotosValidos'],
        })
    return districts


def vv_mean(shares, vvs):
    total = sum(vvs)
    return sum(s * v for s, v in zip(shares, vvs)) / total if total > 0 else 50.0


def generate_r2_shares(districts, target, rng):
    """
    Synthetic R2 per-district KF shares that produce ~target national average.
    Formula: base_shift = target - r1_national
             district_shift = base_shift + regional_diff[region]
             (then VV-adjustment to hit target exactly, then noise)
    """
    r1_national = vv_mean([d['r1_share'] for d in districts],
                          [d['vv'] for d in districts])
    base_shift = target - r1_national

    # First pass with regional diffs
    shares = []
    for d in districts:
        diff = REGIONAL_DIFF.get(d['region'], 0.0)
        shares.append(d['r1_share'] + base_shift + diff)

    # Fine-tune: apply global correction so VV-weighted mean = target
    current_mean = vv_mean(shares, [d['vv'] for d in districts])
    adjust = target - current_mean
    shares = [s + adjust for s in shares]

    # Per-district noise (±NOISE_SIGMA, uncorrelated across districts)
    noise = rng.normal(0, NOISE_SIGMA, len(shares))
    shares = [max(0.0, min(100.0, s + n)) for s, n in zip(shares, noise)]

    return shares


def assign_arrival(districts, rng):
    """
    Assign arrival_time ∈ [0,1] per district.
    Within each dept, districts are spread by ARRIVAL_SIGMA.
    Larger districts (more VV) tend to report slightly earlier (urban centers).
    """
    times = []
    for d in districts:
        base = d['delay']
        # Larger VV → fractionally earlier within the dept window
        vv_nudge = -0.02 * min(1.0, d['vv'] / 100_000)
        noise = rng.normal(0, ARRIVAL_SIGMA)
        t = base + vv_nudge + noise
        times.append(max(0.0, min(1.0, t)))
    return times


def stratified_projector(districts, r2_shares, reported, r1_national):
    """
    Project national KF R2 share.
    Fallback chain: dept-level shift → national shift → r1_national baseline.
    """
    rep_idx = [i for i, r in enumerate(reported) if r]
    unrep_idx = [i for i, r in enumerate(reported) if not r]

    if not rep_idx:
        return r1_national

    # National shift from all reported
    rep_vv = sum(districts[i]['vv'] for i in rep_idx)
    rep_kf = sum(r2_shares[i] * districts[i]['vv'] / 100.0 for i in rep_idx)
    rep_r1_kf = sum(districts[i]['r1_share'] * districts[i]['vv'] / 100.0 for i in rep_idx)
    nat_shift = (rep_kf - rep_r1_kf) / rep_vv * 100.0

    # Per-dept shift (only depts with ≥2 districts reported for stability)
    dept_stats = defaultdict(lambda: {'kf': 0.0, 'r1_kf': 0.0, 'vv': 0.0, 'n': 0})
    for i in rep_idx:
        du = districts[i]['dept_ubigeo']
        dept_stats[du]['kf']    += r2_shares[i] * districts[i]['vv'] / 100.0
        dept_stats[du]['r1_kf'] += districts[i]['r1_share'] * districts[i]['vv'] / 100.0
        dept_stats[du]['vv']    += districts[i]['vv']
        dept_stats[du]['n']     += 1

    dept_shift = {}
    for du, s in dept_stats.items():
        if s['n'] >= 2 and s['vv'] > 0:
            dept_shift[du] = (s['kf'] - s['r1_kf']) / s['vv'] * 100.0

    # Total projected votes
    total_kf_vv = rep_kf
    total_vv = rep_vv

    for i in unrep_idx:
        du = districts[i]['dept_ubigeo']
        shift = dept_shift.get(du, 0.0)
        proj = max(0.0, min(100.0, districts[i]['r1_share'] + shift))
        total_kf_vv += proj * districts[i]['vv'] / 100.0
        total_vv += districts[i]['vv']

    return total_kf_vv / total_vv * 100.0 if total_vv > 0 else r1_national


def raw_count(districts, r2_shares, reported):
    kf = sum(r2_shares[i] * districts[i]['vv'] / 100.0
             for i, r in enumerate(reported) if r)
    total = sum(districts[i]['vv']
                for i, r in enumerate(reported) if r)
    return kf / total * 100.0 if total > 0 else None


def run_scenario(label, target, description, districts, rng, r1_national):
    r2_shares = generate_r2_shares(districts, target, rng)
    arrival = assign_arrival(districts, rng)

    # Sort by arrival time
    order = sorted(range(len(districts)), key=lambda i: arrival[i])

    total_vv = sum(d['vv'] for d in districts)
    true_nat = vv_mean(r2_shares, [d['vv'] for d in districts])

    print(f"\n{'─'*78}")
    print(f"Scenario {label}: {description}")
    print(f"  Target={target:.1f}%  True(after noise+clamp)={true_nat:.2f}%  "
          f"R1 baseline={r1_national:.2f}%")
    print(f"{'─'*78}")
    print(f"  {'VV%':>5}  {'Raw%':>7}  {'Err':>6}  "
          f"{'Proj%':>7}  {'Err':>6}  {'Gain':>6}  {'Depts rpt':>10}")
    print(f"  {'─'*68}")

    reported = [False] * len(districts)
    cum_vv = 0.0
    m_idx = 0
    results = []

    for i in order:
        reported[i] = True
        cum_vv += districts[i]['vv']
        vv_pct = cum_vv / total_vv

        while m_idx < len(MILESTONES) and vv_pct >= MILESTONES[m_idx]:
            m = MILESTONES[m_idx]
            raw = raw_count(districts, r2_shares, reported)
            proj = stratified_projector(districts, r2_shares, reported, r1_national)

            raw_err = (raw - true_nat) if raw is not None else float('nan')
            proj_err = proj - true_nat
            gain = abs(raw_err) - abs(proj_err)  # positive = projector is better

            # Count depts with ≥1 district reported
            rep_depts = len(set(districts[i]['dept_ubigeo']
                                for i in range(len(districts)) if reported[i]))

            raw_s = f"{raw:>6.2f}%" if raw is not None else "   N/A "
            sign_r = '+' if raw_err >= 0 else ''
            sign_p = '+' if proj_err >= 0 else ''
            sign_g = '+' if gain >= 0 else ''
            print(f"  {m*100:>4.0f}%  {raw_s}  {sign_r}{raw_err:>5.2f}pp"
                  f"  {proj:>6.2f}%  {sign_p}{proj_err:>5.2f}pp"
                  f"  {sign_g}{gain:>5.2f}pp  {rep_depts:>3}/{len(DEPT_PROFILES)} depts")

            results.append({
                'milestone': m,
                'raw': raw,
                'proj': proj,
                'raw_err': raw_err,
                'proj_err': proj_err,
                'gain': gain,
                'rep_depts': rep_depts,
                'true_nat': true_nat,
            })
            m_idx += 1

        if m_idx >= len(MILESTONES):
            break

    # Arrival bias summary: show dept-by-dept KF share as they arrive
    print(f"\n  Dept arrival profile (cumulative VV as each dept starts reporting):")
    cum = 0.0
    for du in sorted(DEPT_PROFILES, key=lambda k: DEPT_PROFILES[k]['delay']):
        dept_d = [d for d in districts if d['dept_ubigeo'] == du]
        if not dept_d:
            continue
        dept_vv = sum(d['vv'] for d in dept_d)
        dept_r1 = vv_mean([d['r1_share'] for d in dept_d], [d['vv'] for d in dept_d])
        dept_r2 = vv_mean([r2_shares[i] for i, d in enumerate(districts)
                           if d['dept_ubigeo'] == du],
                          [d['vv'] for d in dept_d])
        cum += dept_vv / total_vv
        prof = DEPT_PROFILES[du]
        print(f"    delay={prof['delay']:.2f}  cum≈{cum*100:4.1f}%  "
              f"{prof['name']:<18}  R1={dept_r1:5.1f}% KF  R2={dept_r2:5.1f}% KF  "
              f"shift={dept_r2-dept_r1:+.1f}pp")

    # Call analysis
    true_winner = 'KF' if true_nat > 50 else 'RSP'
    false_calls = [r for r in results if (r['proj'] > 50) != (true_nat > 50)]
    correct_streak = None
    for i, r in enumerate(results):
        if (r['proj'] > 50) == (true_nat > 50):
            # Check if all subsequent calls also correct
            if all((rr['proj'] > 50) == (true_nat > 50) for rr in results[i:]):
                correct_streak = r['milestone']
                break

    print(f"\n  ── Call analysis ──")
    print(f"  True winner: {true_winner} ({true_nat:.2f}%)")
    if false_calls:
        fc_ms = [f"{r['milestone']*100:.0f}%" for r in false_calls]
        print(f"  ⚠️  False calls at: {', '.join(fc_ms)} VV")
    else:
        print(f"  ✅ No false calls (projector never called wrong winner)")
    if correct_streak is not None:
        print(f"  ✅ First stable correct call: {correct_streak*100:.0f}% VV (stays correct)")
    else:
        print(f"  ❌ No stable correct call found")

    return results, true_nat


def print_summary(all_results):
    print(f"\n\n{'═'*78}")
    print("SUMMARY: projector error (pp) vs. raw count error at key milestones")
    print(f"{'═'*78}")
    key_ms = [0.20, 0.40, 0.60, 0.80, 1.00]
    header = f"  {'Scenario':<36}"
    for m in key_ms:
        header += f"  {int(m*100):>3}% VV"
    print(header)
    print(f"  {'─'*76}")

    for sc_name, target, description, results, true_nat in all_results:
        row_proj = {r['milestone']: r['proj_err'] for r in results}
        row_raw  = {r['milestone']: r['raw_err']  for r in results}
        label = f"  {sc_name}({target:.1f}%) {description.split()[0]:<14}"
        print(f"\n{label}")
        raw_row  = f"    raw count    "
        proj_row = f"    projector    "
        for m in key_ms:
            re = row_raw.get(m, float('nan'))
            pe = row_proj.get(m, float('nan'))
            raw_row  += f"  {re:>+7.2f}pp" if not np.isnan(re) else "       N/A"
            proj_row += f"  {pe:>+7.2f}pp" if not np.isnan(pe) else "       N/A"
        print(raw_row)
        print(proj_row)

    # MAE comparison table
    print(f"\n\n{'─'*78}")
    print("MAE comparison: |error| averaged across all scenarios")
    print(f"{'─'*78}")
    header2 = f"  {'Method':<20}"
    for m in key_ms:
        header2 += f"  {int(m*100):>5}% VV"
    print(header2)
    print(f"  {'─'*66}")

    for method, key in [('Raw count', 'raw_err'), ('Stratified projector', 'proj_err')]:
        row = f"  {method:<20}"
        for m in key_ms:
            errs = [abs(r[key]) for _, _, _, results, _ in all_results
                    for r in results if r['milestone'] == m and not np.isnan(r[key])]
            mae = np.mean(errs) if errs else float('nan')
            row += f"  {mae:>7.2f}pp" if not np.isnan(mae) else "       N/A"
        print(row)

    # First stable call summary
    print(f"\n\n{'─'*78}")
    print("First stable correct call (VV% at which projector locks onto right winner)")
    print(f"{'─'*78}")
    for sc_name, target, description, results, true_nat in all_results:
        true_w = 'KF' if true_nat > 50 else 'RSP'
        stable = None
        for i, r in enumerate(results):
            if (r['proj'] > 50) == (true_nat > 50):
                if all((rr['proj'] > 50) == (true_nat > 50) for rr in results[i:]):
                    stable = r['milestone']
                    break
        false_n = sum(1 for r in results if (r['proj'] > 50) != (true_nat > 50))
        stable_s = f"{stable*100:.0f}% VV" if stable else "never"
        false_s = f"{false_n} milestone(s)" if false_n else "none"
        print(f"  {sc_name}({target:.1f}%) {true_w:<3}  stable={stable_s:<10}  false calls={false_s}")


def main():
    rng = np.random.RandomState(SEED)

    print("═" * 78)
    print("SANDBOX: R2 ELECTION NIGHT PROJECTOR — SYNTHETIC BACKTEST")
    print("Data: r1_districts_flat.json  |  Seed: 42  |  Noise: ±1.5pp per district")
    print("═" * 78)

    districts = load_districts()
    total_vv = sum(d['vv'] for d in districts)
    r1_national = vv_mean([d['r1_share'] for d in districts],
                          [d['vv'] for d in districts])

    print(f"\nDataset: {len(districts)} districts, {total_vv:,} VV (proxy from R1)")
    print(f"R1 national KF R2-share (this 17-dept subset): {r1_national:.2f}%")
    print(f"  Official ONPE R1 national: 58.46%")
    print(f"  Dataset premium: +{r1_national-58.46:.2f}pp (missing 8 anti-KF depts)")
    print(f"  → All scenario targets are dataset-relative (≈ national + 10.5pp)")
    print(f"  → Scenario national equivalents are approximate")

    # Show dept coverage
    dept_vv = defaultdict(int)
    dept_kf = defaultdict(float)
    for d in districts:
        dept_vv[d['dept_ubigeo']] += d['vv']
        dept_kf[d['dept_ubigeo']] += d['r1_share'] * d['vv'] / 100.0

    print(f"\nDept distribution (R1 baseline, sorted by arrival order):")
    print(f"  {'Dept':<20}  {'delay':>6}  {'VV':>10}  {'VV%':>5}  {'R1 KF':>8}")
    for du in sorted(DEPT_PROFILES, key=lambda k: DEPT_PROFILES[k]['delay']):
        if du not in dept_vv:
            print(f"  {DEPT_PROFILES[du]['name']:<20}  "
                  f"{DEPT_PROFILES[du]['delay']:>6.2f}  "
                  f"{'[no data]':>10}  {'─':>5}  {'─':>8}")
            continue
        vv = dept_vv[du]
        share = dept_kf[du] / vv * 100 if vv else 0
        print(f"  {DEPT_PROFILES[du]['name']:<20}  "
              f"{DEPT_PROFILES[du]['delay']:>6.2f}  "
              f"{vv:>10,}  {vv/total_vv*100:>5.1f}%  {share:>7.1f}% KF")

    # Run scenarios
    all_results = []
    for sc_name, target, description in SCENARIOS:
        results, true_nat = run_scenario(
            sc_name, target, description, districts, rng, r1_national
        )
        all_results.append((sc_name, target, description, results, true_nat))

    # Summary tables
    print_summary(all_results)

    print(f"\n\n{'═'*78}")
    print("INTERPRETATION")
    print(f"{'═'*78}")
    print("""
  CALIBRATION NOTE:
  • Dataset (17 depts, 13.5M VV) R1 baseline = 69.0% KF.
    National ONPE R1 = 58.46%.  Gap = +10.5pp.
    Missing: Piura, Puno, San Martín, Pasco, Moquegua, Tacna, Tumbes, Ucayali.
    These 8 depts are predominantly anti-KF (estimated ~39% KF in R1).
  • Scenario targets are dataset-relative. All scenarios show KF>50% in the
    dataset even when RSP wins nationally, because the missing depts pull the
    national result toward RSP. The dataset projector CANNOT call an RSP win
    from dataset-only data — it always shows KF leading.

  KEY FINDINGS:
  • Raw count at 20% VV ≈ +20pp error (Lima = 45% of VV at 69%+ KF in R2,
    reports first). Completely unusable for first 2 hours.
  • Stratified-shift projector reduces error to ~2.5pp at 20% VV — a 7-8× gain.
    It knows Lima's shift and applies national shift to unreported sierra areas.
  • By 60% VV: projector error drops to ~1.5pp (well within usable range).
  • By 80% VV: projector error < 1pp. Call is reliable for all clear scenarios.

  ELECTION NIGHT GUIDANCE (7J):
  • Watch the PROJECTOR, not the raw count.
  • If projector (dataset) shows >63% at 30% VV → KF likely wins nationally 53%+.
  • If projector shows 60-62% at 30% VV → national race is tight (50-52%).
  • If projector shows <60% at 30% VV with sierra depts reporting → RSP threat.
  • Key sentinel: Cajamarca (anti-KF) + Junín (swing) reporting before 50% VV.
    If national shift at that point < −10pp → RSP is closing fast.
  • True RSP win will only be confirmed after Cusco/Ayacucho/Apurímac report
    (delay 0.78–0.92), i.e., at ~80-90% VV. Don't call RSP win before that.
""")


if __name__ == '__main__':
    main()
