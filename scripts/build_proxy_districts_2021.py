"""
build_proxy_districts_2021.py
Fill the 374 missing district baselines in r1_districts_flat.json
using 2021 R2 (Castillo vs Fujimori) data as proxy.

Why: the projector's _shiftFromBreakdown skips districts with kf_r2_share=null
AND kfV+rspV=0, so those districts never contribute to the shift calculation.
With this proxy, all 1,892 districts can participate.

Proxy fields set:
  kf_r2_share : keiko_R2_2021 / (keiko_R2_2021 + castillo_R2_2021) * 100
  kfV         : keiko_R2_2021 votes (proxy for bilateral weight)
  rspV        : castillo_R2_2021 votes (proxy for bilateral weight)
  source      : '2021_r2_proxy'
"""

import json, csv, io, unicodedata, urllib.request, sys
from pathlib import Path

ROOT = Path(__file__).parent.parent
FLAT = ROOT / 'backend' / 'data' / 'r1_districts_flat.json'

R2_URL = (
    "https://raw.githubusercontent.com/jmcastagnetto/"
    "2021-segunda-vuelta-eleccion-presidencial-peru/main/"
    "datos/distritos/votacion-distrito-resultados.csv"
)

# ── helpers ──────────────────────────────────────────────────────────────────

def normalize(s):
    """Uppercase, remove accents, collapse spaces."""
    if not s:
        return ''
    nfkd = unicodedata.normalize('NFKD', s.upper())
    ascii_ = ''.join(c for c in nfkd if not unicodedata.combining(c))
    return ' '.join(ascii_.split())

# Bidirectional spelling equivalences between ONPE 2026 flat file and 2021 CSV.
# Each entry is a pair of (dept_norm, prov_norm) + two spellings that are equivalent.
# The matcher tries BOTH spellings regardless of which side the source file uses.
DIST_SPELLING_PAIRS = [
    # PUNO/EL COLLAO: "CAPASO" ↔ "CAPAZO"
    ('PUNO',    'EL COLLAO', 'CAPASO',       'CAPAZO'),
    # TACNA/TARATA: "ESTIQUE PAMPA" ↔ "ESTIQUE-PAMPA"
    ('TACNA',   'TARATA',    'ESTIQUE PAMPA', 'ESTIQUE-PAMPA'),
    # UCAYALI/ATALAYA: "RAIMONDI" ↔ "RAYMONDI"
    ('UCAYALI', 'ATALAYA',   'RAIMONDI',     'RAYMONDI'),
]

# Build a flat lookup: (dept, prov, either_spelling) → canonical_2021_name
DIST_ALIASES: dict = {}
for dept, prov, a, b in DIST_SPELLING_PAIRS:
    # a is the "our file" spelling, b is the 2021 CSV spelling — but accept both
    DIST_ALIASES[(dept, prov, normalize(a))] = b   # our file → 2021
    DIST_ALIASES[(dept, prov, normalize(b))] = a   # 2021 → our file (reverse)

# Districts with NO 2021 data (new districts created post-2021, or zero votes):
# 170107 MOQUEGUA/MARISCAL NIETO/SAN ANTONIO  — not in 2021, new district
# 210806 SAN MARTIN/TOCACHE/SANTA LUCIA        — not in 2021, new district
# 220205 TACNA/TARATA/HEROES ALBARRACIN        — not in 2021, new district
# 250206 UCAYALI/PADRE ABAD/BOQUERON           — not in 2021, new district
# 250207 UCAYALI/PADRE ABAD/HUIPOCA            — not in 2021, new district
# 150411 LORETO/REQUENA/YAQUERANA              — zero votes in 2021 (tiny jungle dist)
# These 6 use province/dept fallback in the projector.

# ── load data ─────────────────────────────────────────────────────────────────

print("Loading r1_districts_flat.json...")
with open(FLAT) as f:
    flat = json.load(f)

missing = {k: v for k, v in flat.items() if v.get('kf_r2_share') is None}
print(f"  Missing districts: {len(missing)}")

print("Downloading 2021 R2 district data...")
with urllib.request.urlopen(R2_URL, timeout=30) as r:
    rows_2021 = list(csv.DictReader(io.StringIO(r.read().decode('utf-8'))))
print(f"  Rows: {len(rows_2021)}")

# Build 2021 lookup: (norm_dept, norm_prov, norm_dist) -> {kf, cas}
kf_2021  = {}
cas_2021 = {}
for row in rows_2021:
    dept = normalize(row['departamento'])
    prov = normalize(row['provincia'])
    dist = normalize(row['distrito'])
    key  = (dept, prov, dist)
    v    = int(row['TOTAL_VOTOS'] or 0)
    if 'KEIKO' in row['NOMBREe_CANDIDATO']:
        kf_2021[key]  = v
    else:
        cas_2021[key] = v

all_2021_keys = set(kf_2021.keys()) | set(cas_2021.keys())
print(f"  Distinct 2021 districts: {len(all_2021_keys)}")

# Build lookup for the existing flat: (norm_dept, norm_prov, norm_dist) -> ubigeo
existing_lookup = {}
for ubigeo, d in flat.items():
    key = (normalize(d['deptNombre']), normalize(d['provNombre']), normalize(d['nombre']))
    existing_lookup[key] = ubigeo

# ── match missing districts ───────────────────────────────────────────────────

matched   = {}
unmatched = []

for ubigeo, d in missing.items():
    dept_n = normalize(d['deptNombre'])
    prov_n = normalize(d['provNombre'])
    dist_n = normalize(d['nombre'])
    key    = (dept_n, prov_n, dist_n)

    # Direct match
    kf  = kf_2021.get(key)
    cas = cas_2021.get(key)

    # Try alias if direct failed
    if kf is None and cas is None:
        alias_dist = DIST_ALIASES.get(key)
        if alias_dist:
            alt_key = (dept_n, prov_n, normalize(alias_dist))
            kf  = kf_2021.get(alt_key)
            cas = cas_2021.get(alt_key)

    # Try with normalized dept (drop tilde) in case province name differs
    if kf is None and cas is None:
        for k2 in all_2021_keys:
            if k2[0] == dept_n and normalize(k2[2]) == dist_n:
                kf  = kf_2021.get(k2)
                cas = cas_2021.get(k2)
                break

    if kf is not None or cas is not None:
        kf  = kf  or 0
        cas = cas or 0
        total = kf + cas
        if total > 0:
            matched[ubigeo] = {
                'kf_r2_share': round(kf / total * 100, 2),
                'kfV':  kf,
                'rspV': cas,
            }
        else:
            unmatched.append((ubigeo, d['deptNombre'], d['provNombre'], d['nombre'], 'zero_votes'))
    else:
        unmatched.append((ubigeo, d['deptNombre'], d['provNombre'], d['nombre'], 'no_match'))

print(f"\nMatching results:")
print(f"  Matched:   {len(matched)}")
print(f"  Unmatched: {len(unmatched)}")

if unmatched:
    print("\nUnmatched districts:")
    for ubigeo, dept, prov, dist, reason in sorted(unmatched):
        print(f"  {ubigeo}  [{reason}]  {dept} / {prov} / {dist}")

# ── per-dept summary ──────────────────────────────────────────────────────────

from collections import defaultdict
by_dept = defaultdict(lambda: {'matched': 0, 'total': 0, 'shares': []})
for ubigeo, d in missing.items():
    dept = d['deptNombre']
    by_dept[dept]['total'] += 1
    if ubigeo in matched:
        by_dept[dept]['matched'] += 1
        by_dept[dept]['shares'].append(matched[ubigeo]['kf_r2_share'])

print(f"\n{'Dept':<20} {'Matched':>8} {'Total':>7} {'KF%avg':>8} {'KF%min':>8} {'KF%max':>8}")
print("-" * 67)
for dept, s in sorted(by_dept.items()):
    if s['shares']:
        avg = sum(s['shares']) / len(s['shares'])
        mn  = min(s['shares'])
        mx  = max(s['shares'])
        print(f"  {dept:<20} {s['matched']:>6}  {s['total']:>6}  {avg:>7.1f}%  {mn:>7.1f}%  {mx:>7.1f}%")
    else:
        print(f"  {dept:<20} {s['matched']:>6}  {s['total']:>6}  (no matches)")

# ── apply updates ─────────────────────────────────────────────────────────────

answer = input(f"\nApply {len(matched)} proxy entries to r1_districts_flat.json? [y/N] ")
if answer.strip().lower() != 'y':
    print("Aborted.")
    sys.exit(0)

updated = 0
for ubigeo, proxy in matched.items():
    flat[ubigeo]['kf_r2_share']  = proxy['kf_r2_share']
    flat[ubigeo]['kfV']          = proxy['kfV']
    flat[ubigeo]['rspV']         = proxy['rspV']
    flat[ubigeo]['source']       = '2021_r2_proxy'
    updated += 1

with open(FLAT, 'w') as f:
    json.dump(flat, f, ensure_ascii=False, separators=(',', ':'))

print(f"Updated {updated} districts in {FLAT}")

# ── output new ubigeos for DIST_CATALOG ──────────────────────────────────────

print(f"\nNew ubigeos to add to DIST_CATALOG ({len(matched)}):")
for ubigeo in sorted(matched.keys()):
    print(f'  "{ubigeo}"', end='')
print()
print("\nDone. Remember to add these to DIST_CATALOG in scripts/onpe_bookmarklet.js")
