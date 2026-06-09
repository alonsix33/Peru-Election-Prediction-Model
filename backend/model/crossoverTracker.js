'use strict';
const path = require('path');

let _r1Paises = null;
function _loadR1() {
  if (_r1Paises) return _r1Paises;
  try {
    _r1Paises = require(path.join(__dirname, '../data/r1_exterior.json')).paises || {};
  } catch (_) { _r1Paises = {}; }
  return _r1Paises;
}

const EXT_ACTAS   = 2543;
const DOM_ACTAS   = 90223;
const TOTAL_ACTAS = 92766;
const N_SIMS      = 2000;

function _randn() {
  const u1 = Math.max(1e-10, Math.random());
  const u2 = Math.random();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}
function _clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function _round1(v) { return Math.round(v * 10) / 10; }

/**
 * Projects at what % of total actas KF's raw vote count will cross RSP's.
 * Returns null if already crossed or insufficient exterior data.
 *
 * Input: live-projection response with nacional, extranjero, pais_breakdown, pct_actas.
 */
function computeCrossover(liveData) {
  try {
    const r1 = _loadR1();
    const nac  = liveData.nacional   || {};
    const ext  = liveData.extranjero || {};
    const pctNow  = liveData.pct_actas || 0;
    const paisBreak = liveData.pais_breakdown || [];

    const domKf  = nac.kf_votos  || 0;
    const domRsp = nac.rsp_votos || 0;
    const extKf  = ext.kf_votos  || 0;
    const extRsp = ext.rsp_votos || 0;

    const natRspLead = (domRsp + extRsp) - (domKf + extKf);

    if (natRspLead <= 0) {
      return {
        status: 'crossed',
        crossover_pct: null,
        kf_lead: Math.round(Math.abs(natRspLead)),
        ci_lo: null, ci_hi: null,
        confidence: 100,
        obs_shift: null,
        top_pending: [],
      };
    }

    // Ext % done — weight by R1 actas per country
    let extDoneActas = 0;
    const paisLive = {};
    for (const p of paisBreak) {
      const tot = (p.keiko_votos || 0) + (p.sanchez_votos || 0);
      if (tot > 0) paisLive[String(p.ubigeo)] = p;
    }
    for (const [ub, r1c] of Object.entries(r1)) {
      const act = r1c.totalActas || 0;
      const live = paisLive[ub];
      if (live) extDoneActas += act * (live.pct_actas || 0) / 100;
    }
    const extPct = extDoneActas > 0
      ? extDoneActas / EXT_ACTAS * 100
      : (ext.pct_actas || 0);

    if (extKf + extRsp < 100 || extPct <= 0) {
      return { status: 'insufficient_data', confidence: 0 };
    }

    // VPMs
    const extTot      = extKf + extRsp;
    const extVpam     = extDoneActas > 0 ? extTot / extDoneActas : 103.6;
    const domTot      = domKf + domRsp;
    const domDoneAct  = (pctNow / 100 * TOTAL_ACTAS) - extDoneActas;
    const domVpam     = domDoneAct > 0 ? domTot / domDoneAct : 200.0;
    const domRspPct   = domTot > 0 ? domRsp / domTot : 0.502;

    // Build country pools
    const arrived = [], partial = [], pending = [];
    for (const [ub, r1c] of Object.entries(r1)) {
      const r1Kf  = r1c.kf_r2_share;
      const r1Act = r1c.totalActas || 0;
      if (r1Kf == null || r1Act === 0) continue;

      const live = paisLive[ub];
      if (live) {
        const kf  = live.keiko_votos   || 0;
        const rsp = live.sanchez_votos || 0;
        const tot = kf + rsp;
        const pct = live.pct_actas     || 0;
        const e = { nombre: r1c.nombre, r1Kf, r1Act, kf, rsp, tot,
                    r2KfPct: tot > 0 ? 100 * kf / tot : 0, pctActas: pct };
        if (pct >= 95) {
          arrived.push(e);
        } else {
          e.estTotal     = pct > 0 ? tot / (pct / 100) : r1Act * extVpam;
          e.estRemaining = Math.max(0, e.estTotal - tot);
          partial.push(e);
        }
      } else {
        pending.push({ nombre: r1c.nombre, r1Kf, r1Act,
                       estRemaining: r1Act * extVpam });
      }
    }

    // Observed shift (weighted by R2 votes)
    const shiftData = [...arrived, ...partial]
      .filter(d => d.tot > 0)
      .map(d => [d.r2KfPct - d.r1Kf, d.tot]);
    const totalW   = shiftData.reduce((s, [, w]) => s + w, 0);
    const obsShift = totalW > 0
      ? shiftData.reduce((s, [sh, w]) => s + sh * w, 0) / totalW : -21;
    const residuals  = shiftData.map(([sh]) => sh - obsShift);
    const sigmaShift = totalW > 0 && shiftData.length > 1
      ? Math.sqrt(shiftData.reduce((acc, [, w], i) => acc + residuals[i] ** 2 * w, 0) / totalW)
      : 10;

    // KF net from remaining ext (deterministic)
    function extNetDet(shift) {
      let net = 0;
      for (const d of partial) {
        if (d.estRemaining > 0)
          net += d.estRemaining * (2 * _clamp(d.r2KfPct / 100, 0, 1) - 1);
      }
      for (const d of pending) {
        if (d.estRemaining > 0)
          net += d.estRemaining * (2 * _clamp((d.r1Kf + shift) / 100, 0, 1) - 1);
      }
      return net;
    }

    const domRemAct   = Math.max(0, DOM_ACTAS - domDoneAct);
    const extRemAct   = Math.max(0, EXT_ACTAS - extDoneActas);
    const domRemVotes = domRemAct * domVpam;
    const domRemRsp   = domRemVotes * (domRspPct - (1 - domRspPct));
    const totalRemAct = domRemAct + extRemAct;

    // Monte Carlo
    const results = [];
    for (let i = 0; i < N_SIMS; i++) {
      const sShift   = obsShift + _randn() * sigmaShift * 0.5;
      const sDomRsp  = domRspPct + _randn() * 0.002;
      const sRemRsp  = domRemVotes * (sDomRsp - (1 - sDomRsp));

      let sExtNet = 0;
      for (const d of partial) {
        const rem  = d.estRemaining * _clamp(1 + _randn() * 0.05, 0.85, 1.15);
        const kfP  = _clamp((d.r2KfPct + _randn() * sigmaShift * 0.3) / 100, 0, 1);
        sExtNet   += rem * (2 * kfP - 1);
      }
      for (const d of pending) {
        const rem  = d.estRemaining * _clamp(1 + _randn() * 0.05, 0.85, 1.15);
        const kfP  = _clamp((d.r1Kf + sShift) / 100, 0, 1);
        sExtNet   += rem * (2 * kfP - 1);
      }

      const rate = sExtNet - sRemRsp;
      if (rate > 0) {
        const t = _clamp(natRspLead / rate, 0, 1.05);
        if (t <= 1) {
          const pct = (pctNow / 100 * TOTAL_ACTAS + t * totalRemAct) / TOTAL_ACTAS * 100;
          results.push(pct);
        }
      }
    }

    results.sort((a, b) => a - b);
    const confidence = Math.round(100 * results.length / N_SIMS);
    const p10 = results.length ? results[Math.floor(0.10 * results.length)] : null;
    const p50 = results.length ? results[Math.floor(0.50 * results.length)] : null;
    const p90 = results.length ? results[Math.floor(0.90 * results.length)] : null;

    const topPending = [...partial, ...pending]
      .filter(d => (d.estRemaining || 0) > 1000)
      .sort((a, b) => (b.estRemaining || 0) - (a.estRemaining || 0))
      .slice(0, 6)
      .map(d => ({
        nombre:       d.nombre,
        pctDone:      d.pctActas    ?? 0,
        r2KfPct:      d.r2KfPct    ?? null,
        r1Kf:         d.r1Kf,
        estRemaining: Math.round(d.estRemaining || 0),
      }));

    const crossoverPct = p50 != null ? Math.max(pctNow, _round1(p50)) : null;
    const ciLo = p10 != null ? Math.max(pctNow, _round1(p10)) : null;
    const ciHi = p90 != null ? _round1(p90) : null;

    const kfNetDet  = extNetDet(obsShift);
    const finalLead = natRspLead + domRemRsp - kfNetDet;

    return {
      status:       crossoverPct != null ? 'projected' : 'no_crossover',
      crossover_pct:  crossoverPct,
      ci_lo:          ciLo,
      ci_hi:          ciHi,
      confidence,
      obs_shift:      _round1(obsShift),
      sigma_shift:    _round1(sigmaShift),
      nat_rsp_lead:   Math.round(natRspLead),
      proj_final_lead: Math.round(finalLead),  // negative = KF wins
      ext_pct:        _round1(extPct),
      top_pending:    topPending,
    };
  } catch (err) {
    return { status: 'error', error: err.message, confidence: 0 };
  }
}

module.exports = { computeCrossover };
