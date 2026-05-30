const cron = require('node-cron');
const db = require('../db');
const { fetchOnpeLiveSnapshot } = require('../services/onpeLive');
const { project } = require('../model/electionNightProjector');

let cronJob = null;

async function saveProjection(snapshotId, snapshot) {
  try {
    const result = project({
      pct_actas:      snapshot.pct_actas     ?? 0,
      keiko_votos:    snapshot.keiko_votos   ?? 0,
      sanchez_votos:  snapshot.sanchez_votos ?? 0,
      dept_breakdown: Array.isArray(snapshot.dept_breakdown) ? snapshot.dept_breakdown : [],
      captured_at:    snapshot.captured_at,
    });

    if (result.status !== 'ok') return;

    await db.query(
      `INSERT INTO r2_election_projections
         (snapshot_id, pct_actas, phase,
          obs_kf_r2_share, obs_keiko_votos, obs_sanchez_votos,
          proj_kf_r2_share, proj_ci95_lo, proj_ci95_hi, proj_ci80_lo, proj_ci80_hi,
          proj_winner, proj_margin_pp, proj_sigma_pp,
          zda_correction_applied, zda_remaining_mesas, zda_proj_kf_r2_share, zda_effect_pp,
          national_shift_pp, dept_shifts, full_result)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)`,
      [
        snapshotId,
        result.pct_actas,
        result.phase,
        result.observed.kf_r2_share,
        result.observed.keiko_votos,
        result.observed.sanchez_votos,
        result.projected.kf_r2_share,
        result.projected.ci_95.lo,
        result.projected.ci_95.hi,
        result.projected.ci_80.lo,
        result.projected.ci_80.hi,
        result.projected.winner,
        result.projected.margin_pp,
        result.projected.sigma_pp,
        result.zda.correction_applied,
        result.zda.remaining_mesas,
        result.zda.proj_kf_r2_share,
        result.zda.effect_pp,
        result.national_shift_pp,
        JSON.stringify(result.dept_shifts),
        JSON.stringify(result),
      ]
    );
  } catch (err) {
    // Non-fatal: projection save failure must not block snapshot save
    console.error('📊 Error guardando proyección:', err.message);
  }
}

async function runPoll() {
  try {
    const snapshot = await fetchOnpeLiveSnapshot();
    const { rows: [{ id: snapshotId }] } = await db.query(
      `INSERT INTO onpe_live_snapshots
         (captured_at, has_data, actas_total, actas_processed, pct_actas,
          keiko_votos, keiko_pct, sanchez_votos, sanchez_pct,
          dept_breakdown, ext_breakdown, totales_raw)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       RETURNING id`,
      [
        snapshot.captured_at,
        snapshot.has_data,
        snapshot.actas_total,
        snapshot.actas_processed,
        snapshot.pct_actas,
        snapshot.keiko_votos,
        snapshot.keiko_pct,
        snapshot.sanchez_votos,
        snapshot.sanchez_pct,
        JSON.stringify(snapshot.dept_breakdown),
        JSON.stringify(snapshot.ext_breakdown),
        snapshot.totales_raw ? JSON.stringify(snapshot.totales_raw) : null,
      ]
    );

    if (snapshot.has_data) {
      console.log(
        `📊 ONPE R2 snapshot: K=${snapshot.keiko_pct}% S=${snapshot.sanchez_pct}%` +
        ` actas=${snapshot.pct_actas ?? '?'}%`
      );
      await saveProjection(snapshotId, snapshot);
    } else {
      console.log('📊 ONPE R2 polling: sin datos aún (204)');
    }
  } catch (err) {
    console.error('📊 Error polling ONPE:', err.message);
  }
}

function startOnpeCron() {
  if (!process.env.ONPE_POLLING_ENABLED) {
    console.log('📊 ONPE live polling deshabilitado (set ONPE_POLLING_ENABLED=true para activar)');
    return;
  }
  console.log('📊 ONPE live polling activado — cada 2 minutos');
  runPoll();
  cronJob = cron.schedule('*/2 * * * *', runPoll);
}

function stopOnpeCron() {
  if (cronJob) {
    cronJob.stop();
    cronJob = null;
  }
}

module.exports = { startOnpeCron, stopOnpeCron };
