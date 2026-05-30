const cron = require('node-cron');
const db = require('../db');
const { fetchOnpeLiveSnapshot } = require('../services/onpeLive');

let cronJob = null;

async function saveSnapshot(snapshot) {
  await db.query(
    `INSERT INTO onpe_live_snapshots
       (captured_at, has_data, actas_total, actas_processed, pct_actas,
        keiko_votos, keiko_pct, sanchez_votos, sanchez_pct,
        dept_breakdown, ext_breakdown, totales_raw)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
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
}

async function runPoll() {
  try {
    const snapshot = await fetchOnpeLiveSnapshot();
    await saveSnapshot(snapshot);
    if (snapshot.has_data) {
      console.log(
        `📊 ONPE R2 snapshot: K=${snapshot.keiko_pct}% S=${snapshot.sanchez_pct}%` +
        ` actas=${snapshot.pct_actas ?? '?'}%`
      );
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
