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
 * See ELECTION_NIGHT_PLAN.md §3 for full methodology.
 */

'use strict';

const path = require('path');
const fs   = require('fs');

// ─── Verified constants (ONPE R1 2026 official + RPP) ────────────────────────
const R1_NATIONAL_KF_R2_SHARE_REGULAR = 58.81; // regular mesas only, ONPE official
const ZDA_KF_R2_SHARE_R1              = 28.2;  // ZDAs, ONPE via RPP (99088/351378)
const TOTAL_MESAS_REGULAR             = 92718;
const TOTAL_MESAS_ZDA                 = 4703;
const TOTAL_MESAS                     = TOTAL_MESAS_REGULAR + TOTAL_MESAS_ZDA; // 97421
const VV_PER_MESA                     = 174;   // valid votes/mesa, calibrated from 6 depts
const SIGMA_BASE                      = 3.0;   // pp, from CLAUDE.md calibration
const T_DF                            = 4;     // t-Student degrees of freedom
const N_SIMS                          = 10000;

// Phase thresholds (% actas reported)
const PHASE_B_THRESHOLD = 30;
const PHASE_C_THRESHOLD = 80;
const PHASE_D_THRESHOLD = 95;

// ─── Static baselines (loaded once from disk) ─────────────────────────────────
let _r1ByDept = null;
let _zdaByDept = null;

function _loadBaselines() {
  if (_r1ByDept) return;

  const DATA = path.join(__dirname, '..', 'data');

  const flat = JSON.parse(
    fs.readFileSync(path.join(DATA, 'r1_districts_flat.json'), 'utf8')
  );
  const zdaModel = JSON.parse(
    fs.readFileSync(path.join(DATA, 'r1_zda_dept_model.json'), 'utf8')
  );

  // Aggregate R1 district data by department
  _r1ByDept = {};
  for (const dist of Object.values(flat)) {
    const du = dist.deptUbigeo;
    if (!_r1ByDept[du]) {
      _r1ByDept[du] = { nombre: dist.deptNombre, kfV: 0, rspV: 0 };
    }
    _r1ByDept[du].kfV  += dist.kfV  || 0;
    _r1ByDept[du].rspV += dist.rspV || 0;
  }
  for (const d of Object.values(_r1ByDept)) {
    d.kf_r2_share = (d.kfV + d.rspV) > 0
      ? 100 * d.kfV / (d.kfV + d.rspV)
      : R1_NATIONAL_KF_R2_SHARE_REGULAR;
  }

  // ZDA model keyed by dept nombre (normalize to uppercase)
  _zdaByDept = {};
  for (const [nombre, info] of Object.entries(zdaModel.byDept)) {
    _zdaByDept[nombre.toUpperCase()] = info;
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

function _bootstrapCI(obs_kf, obs_rsp, regular_remaining, zda_remaining, national_shift, sigma) {
  const obs_kf_r2_share = 100 * obs_kf / (obs_kf + obs_rsp);
  const obs_pair = obs_kf + obs_rsp;
  const rem_reg_vv = regular_remaining * VV_PER_MESA;
  const rem_zda_vv = zda_remaining * VV_PER_MESA;

  const sims = new Float64Array(N_SIMS);

  for (let i = 0; i < N_SIMS; i++) {
    const noise = sigma * _tSample(T_DF);

    const reg_proj = _clamp(obs_kf_r2_share + noise, 0, 100);
    const zda_proj = _clamp(ZDA_KF_R2_SHARE_R1 + national_shift + noise, 0, 100);

    const final_kf    = obs_kf + rem_reg_vv * reg_proj / 100 + rem_zda_vv * zda_proj / 100;
    const final_total = obs_pair + rem_reg_vv + rem_zda_vv;

    sims[i] = 100 * final_kf / final_total;
  }

  sims.sort();
  return {
    p2_5:  sims[Math.floor(N_SIMS * 0.025)],
    p97_5: sims[Math.floor(N_SIMS * 0.975)],
    p10:   sims[Math.floor(N_SIMS * 0.10)],
    p90:   sims[Math.floor(N_SIMS * 0.90)],
  };
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
      const r1_kf_r2 = r1 ? r1.kf_r2_share : R1_NATIONAL_KF_R2_SHARE_REGULAR;
      const shift = current_kf_r2 - r1_kf_r2;

      // ZDA expected swing for this dept
      const zdaInfo = _zdaByDept[(d.nombre || '').toUpperCase()];
      const zda_expected_swing = zdaInfo?.expectedSwingPP ?? null;

      return {
        nombre:              d.nombre,
        ubigeo:              d.ubigeo,
        current_kf_r2_share: _round2(current_kf_r2),
        r1_kf_r2_share:      _round2(r1_kf_r2),
        shift_pp:            _round2(shift),
        zda_expected_swing_pp: zda_expected_swing,
      };
    })
    .sort((a, b) => Math.abs(b.shift_pp) - Math.abs(a.shift_pp));
}

// ─── Main projection function ─────────────────────────────────────────────────

/**
 * project(snapshot) → ProjectionResult
 *
 * @param {Object} snapshot
 *   @param {number}   snapshot.pct_actas       — % actas procesadas (0-100)
 *   @param {number}   snapshot.keiko_votos      — KF votos nacionales acumulados
 *   @param {number}   snapshot.sanchez_votos    — RSP votos nacionales acumulados
 *   @param {Array}    [snapshot.dept_breakdown] — por dept [{nombre,ubigeo,keiko_votos,sanchez_votos}]
 *   @param {string}   [snapshot.captured_at]   — ISO timestamp del snapshot
 *
 * @returns {ProjectionResult}
 */
function project(snapshot) {
  _loadBaselines();

  const {
    pct_actas,
    keiko_votos,
    sanchez_votos,
    dept_breakdown = [],
    captured_at,
  } = snapshot;

  // Guard: need meaningful data to project
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

  // ── Observed ──────────────────────────────────────────────────────────────
  const obs_kf_r2_share = 100 * obs_kf / (obs_kf + obs_rsp);
  const obs_pair        = obs_kf + obs_rsp;

  // ── Estimate mesas contadas ───────────────────────────────────────────────
  // ONPE's pct_actas denominator may or may not include ZDAs.
  // We assume it is out of TOTAL_MESAS (97421) — conservative, since ZDAs
  // are unlikely to change pct reporting until >92%.
  const obs_mesas = (pct / 100) * TOTAL_MESAS;

  // ZDA cliff: ZDAs start arriving after regular mesas are ~exhausted
  const reported_zda_approx = Math.max(0, obs_mesas - TOTAL_MESAS_REGULAR);
  const zda_remaining       = Math.max(0, TOTAL_MESAS_ZDA - reported_zda_approx);
  const regular_remaining   = Math.max(0, TOTAL_MESAS - obs_mesas - zda_remaining);

  // ── R2 vs R1 national shift ───────────────────────────────────────────────
  const national_shift = obs_kf_r2_share - R1_NATIONAL_KF_R2_SHARE_REGULAR;

  // ── Projected kf_r2_share for remaining strata ───────────────────────────
  const reg_proj_kf_r2 = _clamp(R1_NATIONAL_KF_R2_SHARE_REGULAR + national_shift, 0, 100);
  const zda_proj_kf_r2 = _clamp(ZDA_KF_R2_SHARE_R1 + national_shift, 0, 100);

  // ── Point estimate ────────────────────────────────────────────────────────
  const rem_reg_vv = regular_remaining * VV_PER_MESA;
  const rem_zda_vv = zda_remaining     * VV_PER_MESA;

  const final_kf    = obs_kf  + rem_reg_vv * reg_proj_kf_r2 / 100 + rem_zda_vv * zda_proj_kf_r2 / 100;
  const final_rsp   = obs_rsp + rem_reg_vv * (1 - reg_proj_kf_r2 / 100) + rem_zda_vv * (1 - zda_proj_kf_r2 / 100);
  const projected_kf_r2_share = 100 * final_kf / (final_kf + final_rsp);

  // ZDA effect on final estimate (in pp)
  const zda_effect_pp = zda_remaining > 0
    ? rem_zda_vv * (zda_proj_kf_r2 - reg_proj_kf_r2) / 100 / (obs_pair + rem_reg_vv + rem_zda_vv) * 100
    : 0;

  // ── Bootstrap CI ──────────────────────────────────────────────────────────
  const pct_remaining = 1 - pct / 100;
  const sigma = Math.max(0.3, SIGMA_BASE * Math.sqrt(pct_remaining));
  const ci = _bootstrapCI(obs_kf, obs_rsp, regular_remaining, zda_remaining, national_shift, sigma);

  // ── Phase determination ───────────────────────────────────────────────────
  let phase, phaseLabel;
  if (pct < PHASE_B_THRESHOLD) {
    phase = 'A'; phaseLabel = 'Conteo inicial — alta incertidumbre';
  } else if (pct < PHASE_C_THRESHOLD) {
    phase = 'B'; phaseLabel = 'Conteo parcial — tendencia emergente';
  } else if (pct < PHASE_D_THRESHOLD) {
    phase = 'C'; phaseLabel = 'Conteo avanzado — ZDAs pendientes';
  } else {
    phase = 'D'; phaseLabel = 'Resultados casi definitivos';
  }

  // ── Department shifts ─────────────────────────────────────────────────────
  const dept_shifts = _computeDeptShifts(dept_breakdown);

  return {
    status:    'ok',
    captured_at: captured_at || null,
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
      winner:    projected_kf_r2_share > 50 ? 'KF' : 'RSP',
      margin_pp: _round2(Math.abs(projected_kf_r2_share - 50)),
      sigma_pp:  _round2(sigma),
    },

    zda: {
      correction_applied:    zda_remaining > 0,
      remaining_mesas:       Math.round(zda_remaining),
      proj_kf_r2_share:      _round2(zda_proj_kf_r2),
      effect_pp:             _round2(zda_effect_pp),
    },

    national_shift_pp: _round2(national_shift),
    dept_shifts,

    debug: {
      obs_mesas:         Math.round(obs_mesas),
      regular_remaining: Math.round(regular_remaining),
      zda_remaining:     Math.round(zda_remaining),
      rem_reg_vv:        Math.round(rem_reg_vv),
      rem_zda_vv:        Math.round(rem_zda_vv),
    },
  };
}

module.exports = { project };
