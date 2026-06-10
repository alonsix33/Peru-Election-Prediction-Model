'use strict';
/**
 * crossoverTracker.js — v2 "secuencia de 3 colas"
 *
 * Proyecta en qué % de actas el conteo crudo de KF cruza al de RSP,
 * modelando la SECUENCIA real de llegada (no mezcla proporcional):
 *
 *   Cola A — exterior ACTIVO: países cuyo pct avanzó vs el snapshot de ~3h
 *            atrás. Fluyen primero, a su tasa MARGINAL medida.
 *   Cola B — exterior CONGELADO (p.ej. Argentina parada en 21%, Canadá/Francia
 *            en 0%): reanudan antes del JEE con prob P_RESUME_PRE_JEE por país.
 *   Cola C — pool JEE doméstico: actas observadas, bloques por dept a
 *            cum local + h (misma lógica `_jeeBlocks` del projector híbrido).
 *
 * VPAM por país: votos/(actas×pct) medido cuando pct>10%; prior R1 escalado
 * si no. (El vpam global distorsionaba: Argentina 184 VV/acta, EE.UU. 84.)
 *
 * Input: live-projection data + dept_breakdown + prev_pais_breakdown (~3h).
 */
const path = require('path');
const { _jeeBlocks } = require('./electionNightProjector');

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

const H_JEE            = -1.0;  // haircut pool JEE (idem projector)
const F_JEE            = 0.10;  // merma pool JEE
const PEN_EXT_LATE     = -2.0;  // deriva tardía intra-país
const P_RESUME_PRE_JEE = 0.8;   // prob de que un país congelado cuente antes del JEE
const R1_TO_R2_EXT_SCALE = 5.1; // VV bilateral R2 ext ≈ 5.1× R1 (307k/60.4k)

function _randn() {
  const u1 = Math.max(1e-10, Math.random());
  const u2 = Math.random();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}
function _clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function _round1(v) { return Math.round(v * 10) / 10; }

function computeCrossover(liveData) {
  try {
    const r1 = _loadR1();
    const nac       = liveData.nacional   || {};
    const ext       = liveData.extranjero || {};
    const pctNow    = liveData.pct_actas  || 0;
    const paisBreak = liveData.pais_breakdown      || [];
    const prevPais  = liveData.prev_pais_breakdown || [];
    const deptBreak = liveData.dept_breakdown      || [];
    const actasTotal = liveData.actas_total > 0 ? Number(liveData.actas_total) : TOTAL_ACTAS;

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

    // ── lookups vivo y previo ───────────────────────────────────────────────
    const paisLive = {}, paisPrev = {};
    for (const p of paisBreak) {
      const tot = (p.keiko_votos || 0) + (p.sanchez_votos || 0);
      if (tot > 0) paisLive[String(p.ubigeo)] = p;
    }
    for (const p of prevPais) {
      const tot = (p.keiko_votos || 0) + (p.sanchez_votos || 0);
      if (tot > 0) paisPrev[String(p.ubigeo)] = p;
    }
    const hasPrev = prevPais.length > 0;

    // ── actas exteriores contadas + vpam global ─────────────────────────────
    let extDoneActas = 0;
    for (const [ub, r1c] of Object.entries(r1)) {
      const live = paisLive[ub];
      if (live) extDoneActas += (r1c.totalActas || 0) * (live.pct_actas || 0) / 100;
    }
    const extPct = extDoneActas > 0
      ? extDoneActas / EXT_ACTAS * 100
      : (ext.pct_actas || 0);
    const extTot = extKf + extRsp;
    if (extTot < 100 || extPct <= 0) {
      return { status: 'insufficient_data', confidence: 0 };
    }
    const extVpamGlobal = extTot / extDoneActas;

    // ── shift exterior observado (para países sin datos) ────────────────────
    let shNum = 0, shW = 0;
    const residW = [];
    for (const [ub, r1c] of Object.entries(r1)) {
      const live = paisLive[ub];
      const tot = live ? (live.keiko_votos || 0) + (live.sanchez_votos || 0) : 0;
      if (tot > 0 && r1c.kf_r2_share != null) {
        const sh = 100 * (live.keiko_votos || 0) / tot - r1c.kf_r2_share;
        shNum += sh * tot; shW += tot;
        residW.push([sh, tot]);
      }
    }
    const obsShift = shW > 0 ? shNum / shW : -21;
    const sigmaShift = shW > 0 && residW.length > 1
      ? Math.sqrt(residW.reduce((a, [s, w]) => a + (s - obsShift) ** 2 * w, 0) / shW)
      : 10;

    // ── items por país: vpam propio, actividad, tasa marginal ───────────────
    const active = [], frozen = [];
    for (const [ub, r1c] of Object.entries(r1)) {
      const act = r1c.totalActas || 0;
      if (act === 0 || r1c.kf_r2_share == null) continue;

      const live = paisLive[ub];
      const pctDone = live ? (live.pct_actas || 0) : 0;
      if (pctDone >= 100) continue;
      const tot = live ? (live.keiko_votos || 0) + (live.sanchez_votos || 0) : 0;
      const obs = tot > 0 ? 100 * (live.keiko_votos || 0) / tot : null;

      // VPAM del país: medido cuando hay masa; prior R1 escalado si no
      const r1Vpam = ((r1c.kfV || 0) + (r1c.rspV || 0)) / act * R1_TO_R2_EXT_SCALE;
      const vpam = (pctDone > 10 && tot > 200)
        ? tot / (act * pctDone / 100)
        : _clamp(r1Vpam, extVpamGlobal * 0.5, extVpamGlobal * 2.0);

      const remVv    = act * vpam * (1 - pctDone / 100);
      const remActas = act * (1 - pctDone / 100);
      if (remVv < 100) continue;

      // tasa marginal medida en la ventana prev→ahora
      let marg = null;
      const prev = paisPrev[ub];
      if (prev && tot > 0) {
        const dk = (live.keiko_votos || 0) - (prev.keiko_votos || 0);
        const dr = (live.sanchez_votos || 0) - (prev.sanchez_votos || 0);
        if (dk + dr > 300) marg = 100 * dk / (dk + dr);
      }
      // activo = avanzó en la ventana; sin historial previo, todo país con
      // votos observados se considera activo (fallback al comportamiento v1)
      const isActive = marg != null || (!hasPrev && obs != null);

      const rateMean = marg != null
        ? marg
        : (obs != null
            ? obs + PEN_EXT_LATE * (1 - pctDone / 100)
            : r1c.kf_r2_share + obsShift);
      const rateSd = marg != null
        ? 1.5 + 4.0 * (1 - pctDone / 100)
        : (obs != null ? 5.0 * Math.max(0.15, 1 - pctDone / 100) : 8.0);

      const item = {
        nombre: r1c.nombre, r1Kf: r1c.kf_r2_share,
        remVv, remActas, rateMean, rateSd,
        pctDone, obs,
      };
      (isActive ? active : frozen).push(item);
    }

    // ── Cola C: pool JEE doméstico (misma contabilidad que el projector) ────
    const domPair  = domKf + domRsp;
    const domDone  = Math.max(1, (pctNow / 100) * actasTotal - extDoneActas);
    const vvPerActa = domPair > 100000 ? domPair / domDone : 200;
    const domRemActas = Math.max(0, (actasTotal - EXT_ACTAS) - domDone);
    const jee = _jeeBlocks(deptBreak, domRemActas * vvPerActa);

    // ── Monte Carlo secuencial ──────────────────────────────────────────────
    const crossPcts = [];
    let crossedCount = 0, preJeeCount = 0;
    const finalLeads = [];

    // helper: corre una fase; devuelve [netKF, actas]
    const runPhase = (items, extraNoise) => {
      let net = 0, actas = 0;
      for (const x of items) {
        const rate = _clamp(x.rateMean + extraNoise + x.rateSd * _randn(), 0, 100);
        const vv = x.remVv * Math.max(0.3, 1 + 0.10 * _randn());
        net += vv * (2 * rate / 100 - 1);
        actas += x.remActas;
      }
      return [net, actas];
    };

    for (let i = 0; i < N_SIMS; i++) {
      let netTotal = 0;     // neto KF acumulado de todas las fases
      let actasUsed = 0;
      let crossAt = null;   // actas consumidas al momento del cruce
      let preJee = false;

      // ruido común exterior (correlación entre países)
      const extCommon = 1.5 * _randn();
      const gapAt = () => natRspLead - netTotal; // brecha pendiente

      // Fase A — exterior activo
      const [netA, actasA] = runPhase(active, extCommon);
      if (netA > 0 && gapAt() <= netA) {
        crossAt = actasUsed + actasA * (gapAt() / netA);
        preJee = true;
      }
      netTotal += netA; actasUsed += actasA;

      // Fase B — congelados: los que reanudan fluyen antes del JEE,
      // los demás cuentan después (junto al JEE, sin marca pre-JEE)
      const resumed = [], late = [];
      for (const x of frozen) (Math.random() < P_RESUME_PRE_JEE ? resumed : late).push(x);
      if (crossAt == null) {
        const [netB, actasB] = runPhase(resumed, extCommon);
        if (netB > 0 && gapAt() <= netB) {
          crossAt = actasUsed + actasB * (gapAt() / netB);
          preJee = true;
        }
        netTotal += netB; actasUsed += actasB;
      } else {
        const [netB, actasB] = runPhase(resumed, extCommon);
        netTotal += netB; actasUsed += actasB;
      }

      // Fase C — JEE doméstico + exterior no reanudado
      const h = H_JEE + 2.0 * _randn();
      const f = _clamp(F_JEE + 0.08 * _randn(), 0, 0.6);
      const jeeCommon = 0.5 * _randn();
      let netC = 0, actasC = 0;
      for (const b of jee) {
        const rate = _clamp(b.cum + h + jeeCommon + 2.0 * _randn(), 0, 100);
        netC += b.rem * (1 - f) * (2 * rate / 100 - 1);
        actasC += b.rem / vvPerActa;
      }
      const [netL, actasL] = runPhase(late, extCommon);
      netC += netL; actasC += actasL;
      if (crossAt == null && netC > 0 && gapAt() <= netC) {
        crossAt = actasUsed + actasC * (gapAt() / netC);
      }
      netTotal += netC; actasUsed += actasC;

      finalLeads.push(netTotal - natRspLead); // positivo = KF gana
      if (crossAt != null) {
        crossedCount++;
        if (preJee) preJeeCount++;
        crossPcts.push(pctNow + (crossAt / actasTotal) * 100);
      }
    }

    crossPcts.sort((a, b) => a - b);
    finalLeads.sort((a, b) => a - b);
    const confidence = Math.round(100 * crossedCount / N_SIMS);
    const probPreJee = Math.round(100 * preJeeCount / N_SIMS);
    const q = (arr, p) => arr.length ? arr[Math.floor(p * arr.length)] : null;

    const p10 = q(crossPcts, 0.10), p50 = q(crossPcts, 0.50), p90 = q(crossPcts, 0.90);
    const medianLead = q(finalLeads, 0.50) ?? 0;

    const topPending = [...active, ...frozen]
      .filter(x => x.remVv > 1000)
      .sort((a, b) => b.remVv - a.remVv)
      .slice(0, 6)
      .map(x => ({
        nombre:       x.nombre,
        pctDone:      x.pctDone,
        r2KfPct:      x.obs,
        r1Kf:         x.r1Kf,
        estRemaining: Math.round(x.remVv),
      }));

    const crossoverPct = p50 != null ? Math.max(pctNow, _round1(Math.min(100, p50))) : null;

    return {
      status:          crossoverPct != null ? 'projected' : 'no_crossover',
      crossover_pct:   crossoverPct,
      ci_lo:           p10 != null ? Math.max(pctNow, _round1(p10)) : null,
      ci_hi:           p90 != null ? _round1(Math.min(100, p90)) : null,
      confidence,
      prob_pre_jee:    probPreJee,
      n_sims:          N_SIMS,
      obs_shift:       _round1(obsShift),
      sigma_shift:     _round1(sigmaShift),
      nat_rsp_lead:    Math.round(natRspLead),
      proj_final_lead: -Math.round(medianLead),  // negative = KF wins (convención v1)
      ext_pct:         _round1(extPct),
      ext_kf_r2_share: extTot > 0 ? _round1(100 * extKf / extTot) : null,
      active_countries: active.length,
      frozen_countries: frozen.length,
      top_pending:     topPending,
    };
  } catch (err) {
    return { status: 'error', error: err.message, confidence: 0 };
  }
}

module.exports = { computeCrossover };
