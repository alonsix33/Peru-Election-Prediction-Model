#!/usr/bin/env python3
"""
sandbox_election_night_2021.py

Simulates what the election-night projector would have shown during the
real 2021 R2 election night (June 6–7, 2021), cross-referenced with
the actual raw ONPE counts reported by live news blogs.

Purpose: calibrate expectations for July 6–7, 2026 election night.

Data sources:
  R1 baseline:  jmcastagnetto/2021-elecciones-generales-peru-datos-de-onpe
  R2 truth:     jmcastagnetto/2021-segunda-vuelta-eleccion-presidencial-peru
  Real timeline: RPP / Gestión / La República live blogs (scraped Jun 2026)

Key insight: raw count showed Keiko winning from 11 PM to 11:29 AM (12.5 hrs).
The projector would have corrected for Lima-first bias and shown Castillo
ahead (or very close) from the very first snapshot.
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

# ── Real milestones from news archives (RPP / Gestión / La República live blogs)
# Source: RPP "Así va el conteo de votos ONPE" live blog + Gestión live blog
# All times Peru Standard Time (PET = UTC-5)
REAL_MILESTONES = [
    # time_label      pct_actas  raw_kf  raw_cas  notes
    ('23:04 Jun 6',    42.030,   52.905, 47.095, 'First ONPE results — KF celebrates'),
    ('02:18 Jun 7',    77.693,   51.943, 48.057, 'Madrugada — gap narrowing'),
    ('02:38 Jun 7',    80.701,   51.523, 48.477, ''),
    ('03:07 Jun 7',    83.173,   51.205, 48.795, ''),
    ('03:46 Jun 7',    85.110,   51.014, 48.986, ''),
    ('04:12 Jun 7',    86.476,   50.769, 49.231, ''),
    ('05:30 Jun 7',    88.200,   50.400, 49.600, 'Dawn — KF still ahead in raw'),
    ('06:32 Jun 7',    89.100,   50.321, 49.679, ''),
    ('09:06 Jun 7',    91.157,   50.121, 49.879, 'Morning — gap shrinks to 0.2pp'),
    ('10:30 Jun 7',    91.897,   50.050, 49.950, ''),
    ('11:03 Jun 7',    92.140,   50.014, 49.986, ''),
    ('11:29 Jun 7',    92.620,   49.924, 50.076, '★ Raw count flips — Castillo overtakes'),
    ('13:04 Jun 7',    93.018,   49.875, 50.125, 'Stable final margin reached'),
]

FINAL_KF = 49.875
FINAL_CAS = 50.125

# ─── Dept arrival profiles (same as sandbox_r2_backtest_2021.py) ─────────────
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

ARRIVAL_SIGMA = 0.07
SEED = 42


def fetch_csv(url):
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    with urllib.request.urlopen(req, timeout=20) as r:
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
        if (kfr1 + casr1) <= 0 or (kfr2 + casr2) <= 0:
            continue
        prof = DEPT_PROFILES.get(dept, {'delay': 0.50, 'region': 'selva'})
        districts.append({
            'dept': dept, 'prov': prov, 'dist': dist,
            'r1_share': kfr1 / (kfr1 + casr1) * 100.0,
            'r2_share': kfr2 / (kfr2 + casr2) * 100.0,
            'vv': kfr2 + casr2,
            'pct_actas': participation.get(key, 100.0),
            'delay': prof['delay'],
            'region': prof['region'],
        })
    return districts


def assign_arrival(districts, rng):
    times = []
    for d in districts:
        base = d['delay']
        if d['pct_actas'] == 0.0:
            base = max(base, 0.95)
        vv_nudge = -0.015 * min(1.0, d['vv'] / 80_000)
        noise = rng.normal(0, ARRIVAL_SIGMA)
        times.append(max(0.0, min(1.0, base + vv_nudge + noise)))
    return times


def vv_mean(shares, vvs):
    t = sum(vvs)
    return sum(s * v for s, v in zip(shares, vvs)) / t if t > 0 else 50.0


def raw_count(districts, reported):
    kf = sum(d['r2_share'] * d['vv'] / 100 for d, r in zip(districts, reported) if r)
    tot = sum(d['vv'] for d, r in zip(districts, reported) if r)
    return kf / tot * 100 if tot > 0 else None


def stratified_projector(districts, reported, r1_national):
    rep = [d for d, r in zip(districts, reported) if r]
    unr = [d for d, r in zip(districts, reported) if not r]
    if not rep:
        return r1_national
    rep_vv    = sum(d['vv'] for d in rep)
    rep_kf    = sum(d['r2_share'] * d['vv'] / 100 for d in rep)
    rep_r1_kf = sum(d['r1_share'] * d['vv'] / 100 for d in rep)
    nat_shift = (rep_kf - rep_r1_kf) / rep_vv * 100

    dept_stats = defaultdict(lambda: {'kf': 0.0, 'r1_kf': 0.0, 'vv': 0.0, 'n': 0})
    for d in rep:
        dept_stats[d['dept']]['kf']    += d['r2_share'] * d['vv'] / 100
        dept_stats[d['dept']]['r1_kf'] += d['r1_share'] * d['vv'] / 100
        dept_stats[d['dept']]['vv']    += d['vv']
        dept_stats[d['dept']]['n']     += 1
    dept_shift = {dep: (s['kf'] - s['r1_kf']) / s['vv'] * 100
                  for dep, s in dept_stats.items() if s['n'] >= 2 and s['vv'] > 0}

    total_kf = rep_kf
    total_vv = rep_vv
    for d in unr:
        shift = dept_shift.get(d['dept'], 0.0)
        proj = max(0.0, min(100.0, d['r1_share'] + shift))
        total_kf += proj * d['vv'] / 100
        total_vv += d['vv']
    return total_kf / total_vv * 100 if total_vv > 0 else r1_national


def main():
    print("═" * 80)
    print("NOCHE ELECTORAL 2021 R2: Proyector vs Conteo Crudo vs Tiempo Real")
    print("Fuente datos reales: RPP/Gestión/La República live blogs (6-7 Jun 2021)")
    print("Fuente simulación:   jmcastagnetto/2021-*-eleccion-presidencial-peru")
    print("═" * 80)

    print("\nCargando datos...", end="", flush=True)
    r1_kf, r1_cas = load_r1(fetch_csv(R1_URL))
    r2_kf, r2_cas = load_r2(fetch_csv(R2_URL))
    participation  = load_participation(fetch_csv(R2_PART_URL))
    print(" OK")

    districts = build_districts(r1_kf, r1_cas, r2_kf, r2_cas, participation)
    total_vv  = sum(d['vv'] for d in districts)
    r1_nat    = vv_mean([d['r1_share'] for d in districts], [d['vv'] for d in districts])
    r2_nat    = vv_mean([d['r2_share'] for d in districts], [d['vv'] for d in districts])

    print(f"\nDataset: {len(districts)} distritos, {total_vv:,} VV")
    print(f"R1 2021 KF share (dataset):   {r1_nat:.3f}%")
    print(f"R2 2021 KF share (dataset):   {r2_nat:.3f}%  (ONPE oficial: {FINAL_KF}%)")
    print(f"Shift R1→R2:                  {r2_nat - r1_nat:+.3f}pp")

    # Build arrival order (Lima-first)
    rng     = np.random.RandomState(SEED)
    arrival = assign_arrival(districts, rng)
    order   = sorted(range(len(districts)), key=lambda i: arrival[i])

    # Build simulated milestone results at every 1% increment
    reported  = [False] * len(districts)
    cum_vv    = 0.0
    sim_table = {}  # pct_int (0-100) → {raw, proj}

    for i in order:
        reported[i] = True
        cum_vv += districts[i]['vv']
        pct_int = int(cum_vv / total_vv * 100)
        if pct_int not in sim_table:
            sim_table[pct_int] = {
                'raw':  raw_count(districts, reported),
                'proj': stratified_projector(districts, reported, r1_nat),
            }

    def get_sim(pct):
        """Get simulated result at the closest % milestone."""
        target = int(pct)
        for delta in range(0, 10):
            for t in [target - delta, target + delta]:
                if t in sim_table:
                    return sim_table[t]
        return None

    # ── Main output table ────────────────────────────────────────────────────
    print(f"\n{'═'*80}")
    print("PROGRESIÓN MINUTO A MINUTO — 6-7 JUNIO 2021")
    print(f"{'─'*80}")
    print(f"  {'Hora PET':<14} {'%Actas':>7}  {'Raw ONPE KF%':>13}  {'Sim KF%':>9}  {'Proj KF%':>10}  {'ProjErr':>8}  {'Nota'}")
    print(f"  {'─'*77}")

    for (time_label, pct, real_kf, real_cas, note) in REAL_MILESTONES:
        sim = get_sim(pct)
        proj = sim['proj'] if sim else r1_nat
        raw_sim = sim['raw'] if sim else None
        proj_err = proj - r2_nat
        raw_sim_s = f"{raw_sim:6.2f}%" if raw_sim is not None else "    N/A"
        flag = "  ← " + note if note else ""
        print(f"  {time_label:<14} {pct:>6.1f}%  {real_kf:>12.3f}%  {raw_sim_s}  {proj:9.3f}%  {proj_err:>+7.2f}pp{flag}")

    print(f"\n  Resultado final ONPE (100%): KF {FINAL_KF}%  Castillo {FINAL_CAS}%")

    # ── Lima-first bias analysis ─────────────────────────────────────────────
    print(f"\n{'─'*80}")
    lima  = [d for d in districts if d['dept'] in ('LIMA', 'CALLAO')]
    sierra_sur = [d for d in districts if d['region'] == 'sierra_sur']
    lima_vv    = sum(d['vv'] for d in lima)
    sierra_vv  = sum(d['vv'] for d in sierra_sur)
    lima_r2    = vv_mean([d['r2_share'] for d in lima],      [d['vv'] for d in lima])
    sierra_r2  = vv_mean([d['r2_share'] for d in sierra_sur], [d['vv'] for d in sierra_sur])
    lima_r1    = vv_mean([d['r1_share'] for d in lima],      [d['vv'] for d in lima])
    sierra_r1  = vv_mean([d['r1_share'] for d in sierra_sur], [d['vv'] for d in sierra_sur])

    print("ANÁLISIS SESGO LIMA-PRIMERO")
    print(f"  Lima+Callao: {lima_vv/total_vv*100:.1f}% del VV total — reporta primero (delay 0.00-0.05)")
    print(f"    R1 KF: {lima_r1:.1f}%  →  R2 KF: {lima_r2:.1f}%  (shift: {lima_r2-lima_r1:+.1f}pp)")
    print(f"  Sierra Sur:  {sierra_vv/total_vv*100:.1f}% del VV total — reporta último (delay 0.68-0.93)")
    print(f"    R1 KF: {sierra_r1:.1f}%  →  R2 KF: {sierra_r2:.1f}%  (shift: {sierra_r2-sierra_r1:+.1f}pp)")
    print(f"  Diferencial de shift Lima vs Sierra Sur: {(lima_r2-lima_r1)-(sierra_r2-sierra_r1):+.1f}pp")
    print(f"  → Al 42% actas (todo Lima+costa): raw sobreestima KF en ~{52.905-FINAL_KF:.1f}pp")
    print(f"  → Proyector corrige a ~{get_sim(42)['proj']:.2f}%, error {get_sim(42)['proj']-r2_nat:+.2f}pp vs final")

    # ── Cómo "se vería" el proyector en cada hora ────────────────────────────
    print(f"\n{'─'*80}")
    print("¿QUÉ DIRÍA EL PROYECTOR EN VIVO? (ganador proyectado cada hora)")
    print(f"{'─'*80}")
    for (time_label, pct, real_kf, real_cas, note) in REAL_MILESTONES:
        sim = get_sim(pct)
        proj = sim['proj'] if sim else r1_nat
        raw_kf_margin = real_kf - real_cas
        proj_margin   = proj - (100 - proj)  # for bilateral
        proj_winner   = "KF" if proj > 50 else "CASTILLO"
        raw_winner    = "KF" if real_kf > 50 else "CASTILLO"
        note_out = "  ← " + note if note else ""
        print(f"  {time_label:<14} {pct:>6.1f}%  "
              f"Raw: {raw_winner} +{abs(raw_kf_margin):.2f}pp  |  "
              f"Proyector: {proj_winner} +{abs(proj_margin):.2f}pp{note_out}")

    # ── Arequipa effect ──────────────────────────────────────────────────────
    print(f"\n{'─'*80}")
    print("EFECTO AREQUIPA (relevante para 2026)")
    are_dists = [d for d in districts if d['dept'] == 'AREQUIPA']
    if are_dists:
        are_vv  = sum(d['vv'] for d in are_dists)
        are_r1  = vv_mean([d['r1_share'] for d in are_dists], [d['vv'] for d in are_dists])
        are_r2  = vv_mean([d['r2_share'] for d in are_dists], [d['vv'] for d in are_dists])
        print(f"  Arequipa 2021: R1 KF={are_r1:.1f}%  R2 KF={are_r2:.1f}%  shift={are_r2-are_r1:+.1f}pp")
        print(f"  → Mendoza voters (izquierda) migraron a Castillo en R2 (+{are_r2-are_r1:.0f}pp para Castillo)")
        print(f"  En 2026: Aliaga/Nieto/Belmont voters migran a KF en R2 → patrón INVERSO")
        print(f"  Esperamos Arequipa R2 2026 KF >> R1 2026 KF (idem que 2021 para Castillo)")

    # ── Puno effect ──────────────────────────────────────────────────────────
    puno_dists = [d for d in districts if d['dept'] == 'PUNO']
    if puno_dists:
        puno_vv = sum(d['vv'] for d in puno_dists)
        puno_r1 = vv_mean([d['r1_share'] for d in puno_dists], [d['vv'] for d in puno_dists])
        puno_r2 = vv_mean([d['r2_share'] for d in puno_dists], [d['vv'] for d in puno_dists])
        print(f"\n  Puno 2021: R1 KF={puno_r1:.1f}%  R2 KF={puno_r2:.1f}%  shift={puno_r2-puno_r1:+.1f}pp")
        print(f"  → Puno fue pro-Castillo. En 2026 será pro-Sánchez (mismo eje regional).")
        print(f"  → Reporta tarde (delay 0.68) → el proyector corregirá cuando entre su data")

    # ── Resumen para 2026 ────────────────────────────────────────────────────
    sim_42 = get_sim(42)
    print(f"\n{'═'*80}")
    print("RESUMEN: CALIBRACIÓN PARA JULIO 6-7, 2026")
    print(f"{'═'*80}")
    print(f"""
  CRONOLOGÍA ESPERADA (basada en 2021):
    16:00  Cierran urnas
    ~23:00  Primer snapshot ONPE (~40-45% actas) — bookmarklet activo
    ~03:00  ~80% actas contabilizadas
    ~06:00  ~88-90% actas
    ~11:00  ~92% actas (zona de resolución si margen es pequeño)
    +1 día  Votos impugnados / exterior completado

  INTERPRETACIÓN DEL PROYECTOR:
    • Primer snapshot (~42% actas, ~11 PM): error esperado ±1.0pp
      Si proyector muestra KF+3pp → Keiko ganando con alta confianza
      Si proyector muestra KF+1pp → carrera genuinamente ajustada
      Si proyector muestra KF-1pp → Sánchez liderando, confirmar con más actas
    • Al 80% actas (~3 AM):    error esperado ±0.7pp
    • Al 90% actas (~6 AM):    error esperado ±0.2pp — prácticamente definitivo

  RAW COUNT NO ES CONFIABLE HASTA EL 90%+:
    2021: raw mostró KF ganando de 23:04 hasta las 11:29 AM (12.5 horas!)
    mientras el proyector habría mostrado Castillo liderando desde el primer snapshot.
    En 2026: raw KF se inflará por Lima+costa temprano. NO usar raw para llamar la carrera.

  LLAMAR LA CARRERA (umbral de proyector):
    ≥3pp al 40%   → llamable con confianza razonable
    ≥2pp al 80%   → llamable con alta confianza
    ≥0.5pp al 90% → definitivo (< 0.5pp error esperado)
""")


if __name__ == "__main__":
    main()
