/**
 * electionNightProjector.js
 *
 * Pure function engine for election night R2 projection.
 * Zero API calls, zero DB writes, zero side effects.
 *
 * Algorithm: shift-from-baseline (Edison/NYT/DDHQ standard)
 *   1. Observed kf_r2_share from current ONPE counts
 *   2. Estimate remaining actas (regular vs ZDA strata)
 *   3. Project remaining using R1 baseline + R2 national shift
 *   4. ZDA correction: mesas 900001-904703 score 28.2% KF (RSP strongholds)
 *   5. Bootstrap CI with t-Student df=4
 *
 * Granularity hierarchy for stratified shift (most precise wins):
 *   district  (≥50 units with R1 data) → 1518/1892 distritos
 *   province  (≥15 units with R1 data) → 196/196 provincias
 *   dept      (≥3  units with R1 data) → 25/25 departamentos
 *   naive     (fallback, no spatial structure)
 *
 * See ELECTION_NIGHT_PLAN.md §3 for full methodology.
 */

'use strict';

const path = require('path');
const fs   = require('fs');

// ─── Verified constants (ONPE R1 2026 official + RPP) ────────────────────────
const R1_KF_R2_SHARE_DOMESTIC = 58.46; // domestic-only (regular + ZDA, excludes exterior)
const R1_KF_R2_SHARE_NATIONAL = 58.81; // national total (domestic + exterior); ONPE published
const ZDA_KF_R2_SHARE_R1      = 28.2;  // ZDAs kf_r2_share, ONPE via RPP (99088/351378)
const TOTAL_MESAS_REGULAR     = 92718;
const TOTAL_MESAS_ZDA         = 4703;
const TOTAL_MESAS             = TOTAL_MESAS_REGULAR + TOTAL_MESAS_ZDA; // 97421
const VV_PER_MESA             = 174;   // valid votes/mesa, calibrated from 6 depts
const TOTAL_MESAS_EXT         = 2543;  // exterior mesas R2 (ONPE)
const VV_PER_MESA_EXT         = 120.8; // exterior valid votes/mesa (calibrated with crossoverTracker)
const NATIONAL_R1_BILATERAL   = 4892792; // KF(2,877,678) + RSP(2,015,114) in R1
const SIGMA_BASE              = 3.0;   // pp, from CLAUDE.md calibration
const T_DF                    = 4;     // t-Student degrees of freedom
const N_SIMS                  = 10000;

// Phase thresholds (% actas reported)
const PHASE_B_THRESHOLD = 30;
const PHASE_C_THRESHOLD = 80;
const PHASE_D_THRESHOLD = 95;

// Minimum R1 vote-mass (bilateral KF+RSP) needed at each granularity level
// to trust the stratified shift. Higher granularity = lower mass needed per unit.
const MIN_VV_DIST = 2000;   // ~10+ small districts reporting
const MIN_VV_PROV = 5000;   // ~2+ medium provinces reporting
const MIN_VV_DEPT = 5000;   // existing threshold

// Minimum unit count at each level to switch granularity
const MIN_UNITS_DIST = 50;
const MIN_UNITS_PROV = 15;
const MIN_UNITS_DEPT = 3;

// ─── Static baselines (loaded once from disk) ─────────────────────────────────
let _r1ByDept    = null;  // keyed by dept ubigeo  e.g. '140000'
let _r1ByProv    = null;  // keyed by prov ubigeo  e.g. '140100'
let _r1ByDist    = null;  // keyed by dist ubigeo  e.g. '140102'  (only ~1518 with R1 data)
let _zdaByDept   = null;
let _r1Exterior  = null;

function _loadBaselines() {
  if (_r1ByDept) return;

  const DATA = path.join(__dirname, '..', 'data');

  const flatDist   = JSON.parse(fs.readFileSync(path.join(DATA, 'r1_districts_flat.json'),    'utf8'));
  const zdaModel   = JSON.parse(fs.readFileSync(path.join(DATA, 'r1_zda_dept_model.json'),    'utf8'));
  const provBaseline = JSON.parse(fs.readFileSync(path.join(DATA, 'r1_province_baseline.json'), 'utf8'));

  // ── Department baseline — aggregate district flat file per dept ───────────
  _r1ByDept = {};
  for (const dist of Object.values(flatDist)) {
    const du = dist.deptUbigeo;
    if (!_r1ByDept[du]) {
      _r1ByDept[du] = { nombre: dist.deptNombre, kfV: 0, rspV: 0, source: 'district' };
    }
    _r1ByDept[du].kfV  += dist.kfV  || 0;
    _r1ByDept[du].rspV += dist.rspV || 0;
  }
  // Fill missing depts from province baseline (full 25-dept coverage)
  for (const [ubigeo, dept] of Object.entries(provBaseline)) {
    const provs = dept.provincias || [];
    const kfV  = provs.reduce((s, p) => s + (p.kfV  || 0), 0);
    const rspV = provs.reduce((s, p) => s + (p.rspV || 0), 0);
    if (kfV + rspV === 0) continue;
    if (!_r1ByDept[ubigeo] || (_r1ByDept[ubigeo].kfV + _r1ByDept[ubigeo].rspV) === 0) {
      _r1ByDept[ubigeo] = { nombre: dept.nombre, kfV, rspV, source: 'province' };
    }
  }
  for (const d of Object.values(_r1ByDept)) {
    d.kf_r2_share = (d.kfV + d.rspV) > 0
      ? 100 * d.kfV / (d.kfV + d.rspV)
      : R1_KF_R2_SHARE_DOMESTIC;
  }

  // ── Province baseline — 196 provincias, 100% coverage ────────────────────
  _r1ByProv = {};
  for (const [deptUbigeo, dept] of Object.entries(provBaseline)) {
    for (const prov of (dept.provincias || [])) {
      if ((prov.kfV || 0) + (prov.rspV || 0) === 0) continue;
      _r1ByProv[prov.ubigeo] = {
        nombre:      prov.nombre,
        deptUbigeo,
        kfV:         prov.kfV  || 0,
        rspV:        prov.rspV || 0,
        kf_r2_share: prov.kf_r2_share,
      };
    }
  }

  // ── District baseline — 1518/1892 with actual R1 vote data ───────────────
  // Excludes the 374 districts (remote Loreto/MDD/etc) that had 0 R1 bilateral votes.
  // Those will fall back to province baseline when encountered live on election night.
  _r1ByDist = {};
  for (const [ubigeo, dist] of Object.entries(flatDist)) {
    if ((dist.kfV || 0) + (dist.rspV || 0) === 0) continue;
    _r1ByDist[ubigeo] = {
      nombre:      dist.nombre,
      provUbigeo:  dist.provUbigeo,
      deptUbigeo:  dist.deptUbigeo,
      kfV:         dist.kfV  || 0,
      rspV:        dist.rspV || 0,
      kf_r2_share: dist.kf_r2_share,
    };
  }

  // ── ZDA model keyed by dept nombre (normalize to uppercase) ──────────────
  _zdaByDept = {};
  for (const [nombre, info] of Object.entries(zdaModel.byDept)) {
    _zdaByDept[nombre.toUpperCase()] = info;
  }

  // ── Exterior R1 baseline — optional ──────────────────────────────────────
  const extPath = path.join(DATA, 'r1_exterior.json');
  if (fs.existsSync(extPath)) {
    const ext = JSON.parse(fs.readFileSync(extPath, 'utf8'));
    _r1Exterior = {
      kf_r2_share:  ext.meta?.total_kf_r2_share ?? null,
      kfV:          ext.meta?.total_kfV          ?? 0,
      rspV:         ext.meta?.total_rspV         ?? 0,
      byContinente: ext.continentes              ?? {},
      byPais:       ext.paises                   ?? {},
    };
    console.log(`[projector] Baselines loaded — ${Object.keys(_r1ByProv).length} provs, ${Object.keys(_r1ByDist).length} dists`);
  } else {
    console.log(`[projector] Baselines loaded — ${Object.keys(_r1ByProv).length} provs, ${Object.keys(_r1ByDist).length} dists (no exterior file)`);
  }
}

// ─── Math helpers ─────────────────────────────────────────────────────────────

function _normalSample() {
  const u1 = Math.random();
  const u2 = Math.random();
  return Math.sqrt(-2 * Math.log(u1 || 1e-10)) * Math.cos(2 * Math.PI * u2);
}

function _tSample(df) {
  const z = _normalSample();
  let chi2 = 0;
  for (let i = 0; i < df; i++) chi2 += _normalSample() ** 2;
  return z / Math.sqrt(chi2 / df);
}

function _clamp(v, lo, hi) {
  return Math.min(hi, Math.max(lo, v));
}

function _round2(v) {
  return Math.round(v * 100) / 100;
}

// ─── Bootstrap CI ─────────────────────────────────────────────────────────────

function _bootstrapCI(obs_kf, obs_rsp, regular_remaining, zda_remaining, reg_proj_kf_r2, national_shift, sigma, ext_remaining_vv, ext_proj_kf_r2, ext_obs_frac = 0) {
  const obs_pair   = obs_kf + obs_rsp;
  const rem_reg_vv = regular_remaining * VV_PER_MESA;
  const rem_zda_vv = zda_remaining * VV_PER_MESA;
  const ext_vv     = ext_remaining_vv || 0;
  const ext_proj   = ext_proj_kf_r2   || 50;
  // Only the unobserved fraction of remaining exterior carries domestic-correlated
  // shift uncertainty. Countries with observed R2 votes anchor their remaining
  // contribution — their noise is independent of Peru's domestic shift.
  const ext_noise_scale = 0.5 * (1 - ext_obs_frac);

  const sims   = new Float64Array(N_SIMS);
  let   wins   = 0;

  for (let i = 0; i < N_SIMS; i++) {
    const noise = sigma * _tSample(T_DF);

    const reg_proj   = _clamp(reg_proj_kf_r2 + noise, 0, 100);
    const zda_proj   = _clamp(ZDA_KF_R2_SHARE_R1 + national_shift + noise, 0, 100);
    // Exterior: domestic-correlated noise scaled by the unobserved fraction.
    // At ext_obs_frac=0.86: noise_scale = 0.5×0.14 = 0.07 (vs 0.5 before).
    const ext_proj_s = _clamp(ext_proj + noise * ext_noise_scale, 0, 100);

    const final_kf    = obs_kf
      + rem_reg_vv * reg_proj    / 100
      + rem_zda_vv * zda_proj    / 100
      + ext_vv     * ext_proj_s  / 100;
    const final_total = obs_pair + rem_reg_vv + rem_zda_vv + ext_vv;

    sims[i] = 100 * final_kf / final_total;
    if (sims[i] > 50) wins++;
  }

  sims.sort();
  return {
    p2_5:        sims[Math.floor(N_SIMS * 0.025)],
    p97_5:       sims[Math.floor(N_SIMS * 0.975)],
    p10:         sims[Math.floor(N_SIMS * 0.10)],
    p90:         sims[Math.floor(N_SIMS * 0.90)],
    prob_kf_win: Math.round(100 * wins / N_SIMS),
  };
}

// ─── Generic shift from any breakdown level ──────────────────────────────────
// Shared by dept, province, and district shift calculations.
// baseline: the appropriate _r1ByDept / _r1ByProv / _r1ByDist map.
// minVV: minimum total R1 bilateral vote mass to trust the result.

function _shiftFromBreakdown(breakdown, baseline, minVV) {
  if (!baseline || !Array.isArray(breakdown) || !breakdown.length) return null;

  let sum_vv = 0, sum_kf_actual = 0, sum_kf_r1_expected = 0, unit_count = 0;

  for (const d of breakdown) {
    const pair = (d.keiko_votos || 0) + (d.sanchez_votos || 0);
    if (pair < 200) continue;

    const r1 = baseline[d.ubigeo];
    if (!r1) continue;

    const r1_vv = (r1.kfV || 0) + (r1.rspV || 0);
    if (r1_vv === 0) continue;

    const kf_r2_actual = 100 * (d.keiko_votos || 0) / pair;

    sum_vv             += r1_vv;
    sum_kf_actual      += r1_vv * kf_r2_actual;
    sum_kf_r1_expected += r1_vv * r1.kf_r2_share;
    unit_count++;
  }

  if (sum_vv < minVV) return null;
  return { shift: (sum_kf_actual - sum_kf_r1_expected) / sum_vv, unit_count, sum_vv };
}

// ─── Stratified shift — picks most granular level available ──────────────────
// Returns { shift, level, unit_count, sum_vv }

function _computeStratifiedShift(dept_breakdown, province_breakdown, district_breakdown) {
  // District level (highest precision — 1518 baselines)
  if (Array.isArray(district_breakdown) && district_breakdown.length >= MIN_UNITS_DIST) {
    const res = _shiftFromBreakdown(district_breakdown, _r1ByDist, MIN_VV_DIST);
    if (res) return { ...res, level: 'district' };
  }

  // Province level (high precision — 196 baselines, 100% coverage)
  if (Array.isArray(province_breakdown) && province_breakdown.length >= MIN_UNITS_PROV) {
    const res = _shiftFromBreakdown(province_breakdown, _r1ByProv, MIN_VV_PROV);
    if (res) return { ...res, level: 'province' };
  }

  // Department level (current — 25 baselines)
  if (Array.isArray(dept_breakdown) && dept_breakdown.length >= MIN_UNITS_DEPT) {
    const res = _shiftFromBreakdown(dept_breakdown, _r1ByDept, MIN_VV_DEPT);
    if (res) return { ...res, level: 'dept' };
  }

  return null;
}

// ─── Department-level shift tracking ─────────────────────────────────────────

function _computeDeptShifts(dept_breakdown) {
  if (!Array.isArray(dept_breakdown) || !dept_breakdown.length) return [];

  return dept_breakdown
    .filter(d => d && (d.keiko_votos || 0) + (d.sanchez_votos || 0) > 0)
    .map(d => {
      const kf  = d.keiko_votos  || 0;
      const rsp = d.sanchez_votos || 0;
      const current_kf_r2 = 100 * kf / (kf + rsp);

      const r1 = _r1ByDept[d.ubigeo];
      const r1_kf_r2 = r1 ? r1.kf_r2_share : R1_KF_R2_SHARE_DOMESTIC;
      const shift = current_kf_r2 - r1_kf_r2;

      const zdaInfo = _zdaByDept[(d.nombre || '').toUpperCase()];
      const zda_expected_swing = zdaInfo?.expectedSwingPP ?? null;

      return {
        nombre:                d.nombre,
        ubigeo:                d.ubigeo,
        keiko_votos:           kf,
        sanchez_votos:         rsp,
        current_kf_r2_share:   _round2(current_kf_r2),
        r1_kf_r2_share:        _round2(r1_kf_r2),
        shift_pp:              _round2(shift),
        zda_expected_swing_pp: zda_expected_swing,
      };
    })
    .sort((a, b) => Math.abs(b.shift_pp) - Math.abs(a.shift_pp));
}

// ─── Province-level shift tracking ───────────────────────────────────────────

function _computeProvShifts(province_breakdown) {
  if (!Array.isArray(province_breakdown) || !province_breakdown.length) return [];

  return province_breakdown
    .filter(p => p && (p.keiko_votos || 0) + (p.sanchez_votos || 0) > 0)
    .map(p => {
      const kf  = p.keiko_votos  || 0;
      const rsp = p.sanchez_votos || 0;
      const current_kf_r2 = 100 * kf / (kf + rsp);

      const r1 = _r1ByProv[p.ubigeo];
      // Fallback: if province has no R1 data, use its dept baseline
      const r1_kf_r2 = r1
        ? r1.kf_r2_share
        : (_r1ByDept[p.deptUbigeo]?.kf_r2_share ?? R1_KF_R2_SHARE_DOMESTIC);

      return {
        ubigeo:              p.ubigeo,
        nombre:              p.nombre || r1?.nombre || p.ubigeo,
        deptUbigeo:          p.deptUbigeo || r1?.deptUbigeo || null,
        keiko_votos:         kf,
        sanchez_votos:       rsp,
        current_kf_r2_share: _round2(current_kf_r2),
        r1_kf_r2_share:      _round2(r1_kf_r2),
        shift_pp:            _round2(current_kf_r2 - r1_kf_r2),
        has_r1_baseline:     !!r1,
      };
    })
    .sort((a, b) => Math.abs(b.shift_pp) - Math.abs(a.shift_pp));
}

// ─── District-level shift tracking ───────────────────────────────────────────

function _computeDistShifts(district_breakdown) {
  if (!Array.isArray(district_breakdown) || !district_breakdown.length) return [];

  return district_breakdown
    .filter(d => d && (d.keiko_votos || 0) + (d.sanchez_votos || 0) > 0)
    .map(d => {
      const kf  = d.keiko_votos  || 0;
      const rsp = d.sanchez_votos || 0;
      const current_kf_r2 = 100 * kf / (kf + rsp);

      const r1 = _r1ByDist[d.ubigeo];
      // Fallback chain: province → dept → national
      const r1_kf_r2 = r1
        ? r1.kf_r2_share
        : (_r1ByProv[d.provUbigeo]?.kf_r2_share
            ?? _r1ByDept[d.deptUbigeo]?.kf_r2_share
            ?? R1_KF_R2_SHARE_DOMESTIC);

      return {
        ubigeo:              d.ubigeo,
        nombre:              d.nombre || r1?.nombre || d.ubigeo,
        provUbigeo:          d.provUbigeo || r1?.provUbigeo || null,
        deptUbigeo:          d.deptUbigeo || r1?.deptUbigeo || null,
        keiko_votos:         kf,
        sanchez_votos:       rsp,
        current_kf_r2_share: _round2(current_kf_r2),
        r1_kf_r2_share:      _round2(r1_kf_r2),
        shift_pp:            _round2(current_kf_r2 - r1_kf_r2),
        has_r1_baseline:     !!r1,
      };
    })
    .sort((a, b) => Math.abs(b.shift_pp) - Math.abs(a.shift_pp));
}

// ─── Main projection function ─────────────────────────────────────────────────

/**
 * project(snapshot) → ProjectionResult
 *
 * @param {Object} snapshot
 *   @param {number}   snapshot.pct_actas           — % actas procesadas (0-100)
 *   @param {number}   snapshot.keiko_votos          — KF votos nacionales acumulados
 *   @param {number}   snapshot.sanchez_votos        — RSP votos nacionales acumulados
 *   @param {Array}    [snapshot.dept_breakdown]     — [{ubigeo,nombre,keiko_votos,sanchez_votos}]
 *   @param {Array}    [snapshot.province_breakdown] — [{ubigeo,nombre,deptUbigeo,keiko_votos,sanchez_votos}]
 *   @param {Array}    [snapshot.district_breakdown] — [{ubigeo,nombre,provUbigeo,deptUbigeo,keiko_votos,sanchez_votos}]
 *   @param {Array}    [snapshot.ext_breakdown]      — [{ubigeo,nombre,keiko_votos,sanchez_votos}]
 *   @param {string}   [snapshot.captured_at]        — ISO timestamp del snapshot
 */
function project(snapshot) {
  _loadBaselines();

  const {
    pct_actas,
    keiko_votos,
    sanchez_votos,
    dept_breakdown     = [],
    province_breakdown = [],
    district_breakdown = [],
    ext_breakdown      = [],
    pais_breakdown     = [],
    captured_at,
  } = snapshot;

  const obs_kf  = keiko_votos  || 0;
  const obs_rsp = sanchez_votos || 0;
  const pct     = pct_actas    || 0;

  if (pct < 0.1 || obs_kf + obs_rsp === 0) {
    return {
      status:    'insufficient_data',
      pct_actas: pct,
      message:   'Esperando primeras actas ONPE',
    };
  }

  // ── Exterior adjustment ───────────────────────────────────────────────────
  let dom_kf = obs_kf, dom_rsp = obs_rsp;
  let ext_kf = 0, ext_rsp = 0;

  if (Array.isArray(ext_breakdown) && ext_breakdown.length > 0) {
    ext_kf  = ext_breakdown.reduce((s, c) => s + (c.keiko_votos  || 0), 0);
    ext_rsp = ext_breakdown.reduce((s, c) => s + (c.sanchez_votos || 0), 0);
    dom_kf  = Math.max(0, obs_kf  - ext_kf);
    dom_rsp = Math.max(0, obs_rsp - ext_rsp);
  }

  const dom_pair        = dom_kf + dom_rsp;
  const obs_kf_r2_share = 100 * obs_kf / (obs_kf + obs_rsp);
  const dom_kf_r2_share = dom_pair > 0 ? 100 * dom_kf / dom_pair : obs_kf_r2_share;
  const obs_pair        = obs_kf + obs_rsp;

  // ── Mesa estimates ────────────────────────────────────────────────────────
  // pct_actas from ONPE nacional embeds exterior mesas in the percentage.
  // ZDAs are domestic-only — subtract exterior already counted to get true
  // domestic obs_mesas, which drives ZDA remaining estimation.
  const ext_mesas_done = (ext_kf + ext_rsp) / VV_PER_MESA_EXT;
  const obs_mesas_all  = (pct / 100) * (TOTAL_MESAS + TOTAL_MESAS_EXT);
  const obs_mesas      = Math.min(TOTAL_MESAS, Math.max(0, obs_mesas_all - ext_mesas_done));

  const zda_reported_proportional = Math.round((obs_mesas / TOTAL_MESAS) * TOTAL_MESAS_ZDA);
  const zda_reported_cliff        = Math.max(0, obs_mesas - TOTAL_MESAS_REGULAR);
  const reported_zda_approx       = Math.max(zda_reported_proportional, zda_reported_cliff);
  // At ≥94% coverage ZDAs have fully reported (election-night plan: ~94% threshold).
  // Their votes are already in obs_kf/obs_rsp — projecting any remaining ZDAs at
  // 19.54% KF would add phantom RSP votes on top of votes already counted.
  const zda_done      = pct >= 94 ? TOTAL_MESAS_ZDA : reported_zda_approx;
  const zda_remaining = Math.max(0, TOTAL_MESAS_ZDA - zda_done);
  const regular_remaining = Math.max(0, TOTAL_MESAS_REGULAR - (obs_mesas - zda_done));

  // ── Stratified shift — uses most granular level available ─────────────────
  const shiftResult = _computeStratifiedShift(dept_breakdown, province_breakdown, district_breakdown);
  const national_shift = shiftResult !== null
    ? shiftResult.shift
    : dom_kf_r2_share - R1_KF_R2_SHARE_DOMESTIC;
  const shift_level = shiftResult?.level ?? 'naive';

  // ── Dept-adjusted projection for remaining regular mesas ─────────────────
  // Each unreported dept uses its own observed shift; depts without enough
  // data fall back to national_shift. Remaining VV per dept is estimated as
  // R1 bilateral minus reported R2 bilateral (reasonable proxy).
  const deptBreakdownMap = new Map();
  for (const d of (dept_breakdown || [])) {
    if (d?.ubigeo) deptBreakdownMap.set(d.ubigeo, d);
  }

  const deptShiftMap = new Map();
  for (const [ubigeo, r1] of Object.entries(_r1ByDept)) {
    const d = deptBreakdownMap.get(ubigeo);
    if (!d) continue;
    const pair = (d.keiko_votos || 0) + (d.sanchez_votos || 0);
    if (pair < 200) continue;
    deptShiftMap.set(ubigeo, 100 * (d.keiko_votos || 0) / pair - r1.kf_r2_share);
  }

  // R2 bilateral ≈ 2× R1 bilateral because R2 is binary (all valid votes count).
  // Old formula (r1_vv - reported_pair) hits 0 for Lima by mid-count, so Lima's
  // remaining ~43% of votes get projected at the sierra-dominated average instead
  // of Lima's own 63.6% KF rate.  This alone causes ~4pp RSP overcorrection.
  // Fix: estimate remaining VV as r1_vv × R2/R1_scale × (1 - dept_pct/100).
  const r2r1_scale = pct > 0 && dom_pair > 0
    ? (dom_pair / (pct / 100)) / NATIONAL_R1_BILATERAL
    : 2.05;

  let _da_sum_vv = 0, _da_sum_kf = 0;
  for (const [ubigeo, r1] of Object.entries(_r1ByDept)) {
    const r1_vv = (r1.kfV || 0) + (r1.rspV || 0);
    if (r1_vv === 0) continue;
    const d = deptBreakdownMap.get(ubigeo);
    const dept_pct_frac = (d?.pct_actas != null && d.pct_actas > 0) ? d.pct_actas / 100 : 0;
    const remaining_vv = r1_vv * r2r1_scale * (1 - dept_pct_frac);
    if (remaining_vv < 50) continue;
    // Dampen within-dept shift: pro-RSP districts report first within sierra depts,
    // so the observed dept shift is more negative than the true final shift.
    // Ramp trust 0→1 as dept goes 0%→50% counted.
    const dept_pct = dept_pct_frac * 100;
    const raw_shift = deptShiftMap.get(ubigeo) ?? 0;
    const trust = Math.min(1.0, dept_pct / 50);
    const effective_shift = raw_shift * trust;
    _da_sum_vv += remaining_vv;
    _da_sum_kf += remaining_vv * _clamp(r1.kf_r2_share + effective_shift, 0, 100);
  }

  // ── Projected kf_r2_share for remaining strata ───────────────────────────
  const reg_proj_kf_r2 = _da_sum_vv > 0
    ? _clamp(_da_sum_kf / _da_sum_vv, 0, 100)
    : _clamp(R1_KF_R2_SHARE_DOMESTIC + national_shift, 0, 100);
  const zda_proj_kf_r2 = _clamp(ZDA_KF_R2_SHARE_R1 + national_shift, 0, 100);

  // ── Exterior projection ───────────────────────────────────────────────────
  const r1_ext_kf_r2_global = _r1Exterior?.kf_r2_share ?? null;
  let ext_proj_kf_r2 = r1_ext_kf_r2_global != null
    ? _clamp(r1_ext_kf_r2_global + national_shift, 0, 100)
    : obs_kf_r2_share;

  // Country-level (most precise) → continent-level fallback
  // ext_obs_frac: fraction of remaining exterior weight backed by observed R2 votes.
  // Initialized to 0 (fully uncertain); updated in the country-level path below.
  let ext_obs_frac = 0;

  if (_r1Exterior?.byPais && Array.isArray(pais_breakdown) && pais_breakdown.length > 0) {
    // Build live lookup: ubigeo → {kf, rsp, pct_done}
    const livePais = new Map();
    for (const p of pais_breakdown) {
      const ub = String(p.ubigeo);
      const prev = livePais.get(ub) || { kf: 0, rsp: 0, pct: 0 };
      livePais.set(ub, {
        kf:  prev.kf  + (p.keiko_votos  || 0),
        rsp: prev.rsp + (p.sanchez_votos || 0),
        pct: Math.max(prev.pct, p.pct_actas || 0),
      });
    }

    let sum_vv = 0, sum_kf_proj = 0, obs_vv = 0;
    for (const [ubigeo, pais] of Object.entries(_r1Exterior.byPais)) {
      const r1_bilateral = (pais.kfV || 0) + (pais.rspV || 0);
      if (r1_bilateral === 0) continue;

      const live      = livePais.get(ubigeo);
      const pct_done  = live?.pct ?? 0;
      if (pct_done >= 100) continue; // fully counted — already in obs_kf, skip

      const remaining_frac = 1 - pct_done / 100;

      // Use observed R2 KF% when the country has reported votes; otherwise R1 prior + domestic shift
      const live_total = (live?.kf || 0) + (live?.rsp || 0);
      const kf_pct = live_total > 0
        ? 100 * (live.kf || 0) / live_total
        : _clamp((pais.kf_r2_share ?? r1_ext_kf_r2_global) + national_shift, 0, 100);

      // Weight proportional to R1 bilateral × remaining fraction
      const weight = r1_bilateral * remaining_frac;
      sum_vv      += weight;
      sum_kf_proj += weight * kf_pct;
      // Track weight of countries with observed R2 data — these drive ext_proj
      // and need far less domestic-correlated noise in the bootstrap.
      if (live_total > 0) obs_vv += weight;
    }
    if (sum_vv > 0) ext_proj_kf_r2 = sum_kf_proj / sum_vv;
    // Fraction of remaining ext weight backed by observed R2 votes (not just R1 prior).
    // Only the unobserved fraction has genuine domestic-correlated shift uncertainty.
    ext_obs_frac = sum_vv > 0 ? obs_vv / sum_vv : 0;
  } else if (_r1Exterior?.byContinente && Array.isArray(ext_breakdown) && ext_breakdown.length > 0) {
    const reportedCont = new Set(
      ext_breakdown
        .filter(c => (c.keiko_votos || 0) + (c.sanchez_votos || 0) > 0)
        .map(c => String(c.ubigeo))
    );
    let sum_vv = 0, sum_kf_proj = 0;
    for (const [ubigeo, cont] of Object.entries(_r1Exterior.byContinente)) {
      if (reportedCont.has(ubigeo)) continue;
      const r1_bilateral = (cont.kfV || 0) + (cont.rspV || 0);
      if (r1_bilateral === 0) continue;
      const cont_kf_r2 = cont.kf_r2_share ?? r1_ext_kf_r2_global;
      sum_vv      += r1_bilateral;
      sum_kf_proj += r1_bilateral * _clamp(cont_kf_r2 + national_shift, 0, 100);
    }
    if (sum_vv > 0) ext_proj_kf_r2 = sum_kf_proj / sum_vv;
  }

  const R2_EXT_BILATERAL_EST = Math.round(TOTAL_MESAS_EXT * VV_PER_MESA_EXT); // 307,194
  const ext_reported_pair  = ext_kf + ext_rsp;
  const ext_remaining_vv   = Math.max(0, R2_EXT_BILATERAL_EST - ext_reported_pair);

  // ── Point estimate ────────────────────────────────────────────────────────
  const rem_reg_vv = regular_remaining * VV_PER_MESA;
  const rem_zda_vv = zda_remaining     * VV_PER_MESA;

  const final_kf  = obs_kf
    + rem_reg_vv * reg_proj_kf_r2 / 100
    + rem_zda_vv * zda_proj_kf_r2 / 100
    + ext_remaining_vv * ext_proj_kf_r2 / 100;
  const final_rsp = obs_rsp
    + rem_reg_vv * (1 - reg_proj_kf_r2 / 100)
    + rem_zda_vv * (1 - zda_proj_kf_r2 / 100)
    + ext_remaining_vv * (1 - ext_proj_kf_r2 / 100);
  const projected_kf_r2_share = 100 * final_kf / (final_kf + final_rsp);

  const zda_effect_pp = zda_remaining > 0
    ? rem_zda_vv * (zda_proj_kf_r2 - reg_proj_kf_r2) / 100 / (obs_pair + rem_reg_vv + rem_zda_vv + ext_remaining_vv) * 100
    : 0;

  // ── Bootstrap CI ─────────────────────────────────────────────────────────
  const pct_remaining = 1 - pct / 100;
  const sigma = Math.max(0.3, SIGMA_BASE * Math.sqrt(pct_remaining));
  const ci = _bootstrapCI(obs_kf, obs_rsp, regular_remaining, zda_remaining, reg_proj_kf_r2, national_shift, sigma, ext_remaining_vv, ext_proj_kf_r2, ext_obs_frac);

  // ── Phase ─────────────────────────────────────────────────────────────────
  let phase, phaseLabel;
  if (pct < PHASE_B_THRESHOLD) {
    phase = 'A'; phaseLabel = 'Conteo inicial — alta incertidumbre';
  } else if (pct < PHASE_C_THRESHOLD) {
    phase = 'B'; phaseLabel = 'Conteo parcial — tendencia emergente';
  } else if (pct < PHASE_D_THRESHOLD) {
    phase = 'C'; phaseLabel = 'Conteo avanzado — ZDAs por confirmar';
  } else {
    phase = 'D'; phaseLabel = 'Resultados casi definitivos';
  }

  // ── Granular shift outputs ────────────────────────────────────────────────
  const dept_shifts     = _computeDeptShifts(dept_breakdown);
  const province_shifts = _computeProvShifts(province_breakdown);
  const district_shifts = _computeDistShifts(district_breakdown);

  return {
    status:       'ok',
    captured_at:  captured_at || null,
    projected_at: new Date().toISOString(),

    pct_actas: _round2(pct),
    phase,
    phaseLabel,

    observed: {
      kf_r2_share:   _round2(obs_kf_r2_share),
      keiko_votos:   obs_kf,
      sanchez_votos: obs_rsp,
    },

    projected: {
      kf_r2_share: _round2(projected_kf_r2_share),
      ci_95: { lo: _round2(ci.p2_5), hi: _round2(ci.p97_5) },
      ci_80: { lo: _round2(ci.p10),  hi: _round2(ci.p90)  },
      winner:      projected_kf_r2_share > 50 ? 'KF' : 'RSP',
      margin_pp:   _round2(Math.abs(projected_kf_r2_share - 50)),
      sigma_pp:    _round2(sigma),
      prob_kf_win: ci.prob_kf_win,
    },

    zda: {
      always_projected:  true,
      remaining_mesas:   Math.round(zda_remaining),
      reported_mesas:    Math.round(TOTAL_MESAS_ZDA - zda_remaining),
      r1_kf_r2_share:    ZDA_KF_R2_SHARE_R1,
      proj_kf_r2_share:  _round2(zda_proj_kf_r2),
      effect_pp:         _round2(zda_effect_pp),
    },

    exterior: {
      r1_baseline_available: _r1Exterior !== null,
      r1_kf_r2_share:        _r1Exterior ? _round2(_r1Exterior.kf_r2_share) : null,
      obs_kf_votos:          ext_kf,
      obs_rsp_votos:         ext_rsp,
      obs_kf_r2_share:       ext_kf + ext_rsp > 0 ? _round2(100 * ext_kf / (ext_kf + ext_rsp)) : null,
      remaining_vv_est:      Math.round(ext_remaining_vv),
      proj_kf_r2_share:      _round2(ext_proj_kf_r2),
      ext_obs_frac:          _round2(ext_obs_frac * 100),  // % of remaining ext weight with observed R2 data
      ext_noise_scale:       _round2(0.5 * (1 - ext_obs_frac)),
    },

    national_shift_pp: _round2(national_shift),
    shift_granularity: shift_level,

    dept_shifts,
    province_shifts,
    district_shifts,

    debug: {
      r1_domestic_baseline:    R1_KF_R2_SHARE_DOMESTIC,
      r1_national_baseline:    R1_KF_R2_SHARE_NATIONAL,
      dom_kf_r2_share:         _round2(dom_kf_r2_share),
      shift_granularity:       shift_level,
      shift_unit_count:        shiftResult?.unit_count ?? 0,
      shift_r1_vv_mass:        Math.round(shiftResult?.sum_vv ?? 0),
      naive_shift_pp:          _round2(dom_kf_r2_share - R1_KF_R2_SHARE_DOMESTIC),
      obs_mesas:               Math.round(obs_mesas),
      regular_remaining:       Math.round(regular_remaining),
      zda_remaining:           Math.round(zda_remaining),
      ext_remaining_vv:        Math.round(ext_remaining_vv),
      r2_ext_bilateral_est:    Math.round(TOTAL_MESAS_EXT * VV_PER_MESA_EXT),
      rem_reg_vv:              Math.round(rem_reg_vv),
      rem_zda_vv:              Math.round(rem_zda_vv),
      dept_count:              dept_breakdown.filter(d => (d.keiko_votos||0)+(d.sanchez_votos||0) > 0).length,
      prov_count:              province_breakdown.filter(p => (p.keiko_votos||0)+(p.sanchez_votos||0) > 0).length,
      dist_count:              district_breakdown.filter(d => (d.keiko_votos||0)+(d.sanchez_votos||0) > 0).length,
    },
  };
}

module.exports = { project };
