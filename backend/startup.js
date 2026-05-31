const fs = require('fs');
const path = require('path');
const { nowPeru, electoralPhase } = require('./model/clock');
const { getPolymarketWeight } = require('./model/weights');
const { handleError } = require('./errors/errorHandler');
const { runFullPipeline } = require('./model/pipeline');
const db = require('./db');

/**
 * Auto-migración: ejecuta schema.sql y seed.sql si las tablas no existen.
 * Si existen, agrega columnas nuevas (trigger, runoff_json) si faltan.
 */
async function autoMigrate() {
  const { rows } = await db.query(`
    SELECT COUNT(*) FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'polls'
  `);

  if (parseInt(rows[0].count) === 0) {
    console.log('📦 Tablas no encontradas — ejecutando auto-migración...');
    const schemaSql = fs.readFileSync(path.join(__dirname, 'db', 'schema.sql'), 'utf8');
    await db.query(schemaSql);
    console.log('   ✅ schema.sql ejecutado');
    const seedSql = fs.readFileSync(path.join(__dirname, 'db', 'seed.sql'), 'utf8');
    await db.query(seedSql);
    console.log('   ✅ seed.sql ejecutado');
    return true;
  }

  // Migrar columnas nuevas si faltan
  const { rows: cols } = await db.query(`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'model_predictions' AND column_name IN (
      'trigger', 'runoff_json', 'polls_pct', 'polymarket_pct', 'posterior_pct',
      'risk_json', 'is_final_snapshot', 'frozen_at',
      'predicted_pct_p25', 'predicted_pct_p40', 'predicted_pct_p60', 'predicted_pct_p75'
    )
  `);
  const existing = cols.map(c => c.column_name);

  const migrations = [
    ['trigger', `ALTER TABLE model_predictions ADD COLUMN trigger VARCHAR(30) DEFAULT 'auto_polymarket_update'`],
    ['runoff_json', `ALTER TABLE model_predictions ADD COLUMN runoff_json TEXT`],
    ['polls_pct', `ALTER TABLE model_predictions ADD COLUMN polls_pct DECIMAL(5,2)`],
    ['polymarket_pct', `ALTER TABLE model_predictions ADD COLUMN polymarket_pct DECIMAL(5,2)`],
    ['posterior_pct', `ALTER TABLE model_predictions ADD COLUMN posterior_pct DECIMAL(5,2)`],
    ['risk_json', `ALTER TABLE model_predictions ADD COLUMN risk_json TEXT`],
    ['is_final_snapshot', `ALTER TABLE model_predictions ADD COLUMN is_final_snapshot BOOLEAN DEFAULT FALSE`],
    ['frozen_at', `ALTER TABLE model_predictions ADD COLUMN frozen_at TIMESTAMPTZ`],
    ['predicted_pct_p25', `ALTER TABLE model_predictions ADD COLUMN predicted_pct_p25 DECIMAL(5,2)`],
    ['predicted_pct_p40', `ALTER TABLE model_predictions ADD COLUMN predicted_pct_p40 DECIMAL(5,2)`],
    ['predicted_pct_p60', `ALTER TABLE model_predictions ADD COLUMN predicted_pct_p60 DECIMAL(5,2)`],
    ['predicted_pct_p75', `ALTER TABLE model_predictions ADD COLUMN predicted_pct_p75 DECIMAL(5,2)`],
  ];
  for (const [col, sql] of migrations) {
    if (!existing.includes(col)) {
      await db.query(sql);
      console.log(`   ✅ Columna ${col} agregada a model_predictions`);
    }
  }

  // Migración R2: election_round column (idempotent — IF NOT EXISTS)
  const { rows: r2Check } = await db.query(`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'polls' AND column_name = 'election_round'
  `);
  if (r2Check.length === 0) {
    const migration2 = fs.readFileSync(path.join(__dirname, 'db', 'migration_r2.sql'), 'utf8');
    await db.query(migration2);
    console.log('   ✅ migration_r2.sql ejecutado (columna election_round agregada)');
  }

  // Migration antivoto_snapshots: crear tabla + columna segments (idempotent)
  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS antivoto_snapshots (
        id             SERIAL PRIMARY KEY,
        election_round INT          DEFAULT 2,
        candidate      VARCHAR(100) NOT NULL,
        pct_no         NUMERIC(5,2) NOT NULL,
        pollster_id    INT          REFERENCES pollsters(id),
        field_end      DATE         NOT NULL,
        published_date DATE,
        notes          TEXT,
        created_at     TIMESTAMPTZ  DEFAULT NOW()
      )
    `);
    // Agregar columna segments si no existe (almacena breakdown por ámbito/macrozona/NSE)
    await db.query(`
      ALTER TABLE antivoto_snapshots
      ADD COLUMN IF NOT EXISTS segments JSONB
    `);
    console.log('   ✅ antivoto_snapshots: tabla y columna segments verificadas');
  } catch (e) {
    console.warn('⚠️  antivoto_snapshots migration falló:', e.message);
  }

  // Performance indexes (idempotent — IF NOT EXISTS)
  try {
    await db.query(`CREATE INDEX IF NOT EXISTS idx_polymarket_snapshots_lima  ON polymarket_snapshots(captured_at_lima DESC)`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_model_predictions_lima     ON model_predictions(generated_at_lima DESC)`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_model_predictions_round    ON model_predictions(election_round, trigger, generated_at_lima DESC)`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_polymarket_snapshots_round ON polymarket_snapshots(election_round, captured_at_lima DESC)`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_onpe_snapshots_at          ON onpe_live_snapshots(captured_at DESC)`).catch(() => {});
    console.log('   ✅ Indexes: verificados');
  } catch (e) {
    console.warn('⚠️  Index migration falló:', e.message);
  }

  // Seed antivoto data — insertar si no existe (queries individuales)
  try {
    const { rows: [ipsos] } = await db.query(`SELECT id FROM pollsters WHERE name = 'Ipsos'`);
    const { rows: [cit] }   = await db.query(`SELECT id FROM pollsters WHERE name = 'CIT'`);
    const antivotos = [
      { round: 1, candidate: 'Keiko Fujimori',           pct_no: 59.0, pid: ipsos?.id, fe: '2026-03-22', pub: '2026-03-24', notes: 'Ipsos 21-22 mar 2026. Campaña R1.' },
      { round: 1, candidate: 'Roberto Sánchez Palomino',  pct_no: 41.0, pid: ipsos?.id, fe: '2026-03-22', pub: '2026-03-24', notes: 'Ipsos 21-22 mar 2026. Campaña R1.' },
      { round: 1, candidate: 'Keiko Fujimori',           pct_no: 62.7, pid: cit?.id,   fe: '2026-03-23', pub: '2026-03-25', notes: 'CIT 20-23 mar 2026. Pico campaña R1.' },
      { round: 1, candidate: 'Roberto Sánchez Palomino',  pct_no: 48.0, pid: cit?.id,   fe: '2026-03-23', pub: '2026-03-25', notes: 'CIT 20-23 mar 2026.' },
      { round: 2, candidate: 'Keiko Fujimori',           pct_no: 59.0, pid: ipsos?.id, fe: '2026-04-02', pub: '2026-04-02', notes: 'Ipsos 2 abr 2026. Pre-primera vuelta.' },
      { round: 2, candidate: 'Roberto Sánchez Palomino',  pct_no: 39.0, pid: ipsos?.id, fe: '2026-04-02', pub: '2026-04-02', notes: 'Ipsos 2 abr 2026. Pre-primera vuelta.' },
      { round: 2, candidate: 'Keiko Fujimori',           pct_no: 48.0, pid: ipsos?.id, fe: '2026-04-24', pub: '2026-04-26', notes: 'Ipsos 23-24 abr 2026. Post-primera vuelta.' },
      { round: 2, candidate: 'Roberto Sánchez Palomino',  pct_no: 43.0, pid: ipsos?.id, fe: '2026-04-24', pub: '2026-04-26', notes: 'Ipsos 23-24 abr 2026. Post-primera vuelta.' },
    ];
    let seeded = 0;
    for (const a of antivotos) {
      const { rows: ex } = await db.query(
        `SELECT 1 FROM antivoto_snapshots WHERE candidate = $1 AND field_end = $2 AND election_round = $3`,
        [a.candidate, a.fe, a.round]
      );
      if (ex.length === 0) {
        await db.query(
          `INSERT INTO antivoto_snapshots (election_round, candidate, pct_no, pollster_id, field_end, published_date, notes)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [a.round, a.candidate, a.pct_no, a.pid || null, a.fe, a.pub, a.notes]
        );
        seeded++;
      }
    }
    if (seeded > 0) console.log(`   ✅ Antivoto: ${seeded} snapshots insertados`);
    else console.log('   ✅ Antivoto: datos ya existentes');
  } catch (e) {
    console.warn('⚠️  Antivoto seed falló:', e.message);
  }

  // Seed R2: actualizar pesos de encuestadoras e insertar encuestas R2 (idempotent)
  try {
    const seed2 = fs.readFileSync(path.join(__dirname, 'db', 'seed_r2.sql'), 'utf8');
    await db.query(seed2);
    console.log('   ✅ seed_r2.sql ejecutado (pesos R2 + encuestas segunda vuelta)');
  } catch (e) {
    console.warn('⚠️  seed_r2.sql falló (no fatal):', e.message);
  }

  // Tablas de noche electoral (idempotent — IF NOT EXISTS)
  try {
    const onpeSql = fs.readFileSync(path.join(__dirname, 'db', 'onpe_snapshots.sql'), 'utf8');
    await db.query(onpeSql);
    const projSql = fs.readFileSync(path.join(__dirname, 'db', 'r2_projections.sql'), 'utf8');
    await db.query(projSql);
    console.log('   ✅ Tablas ONPE noche electoral: verificadas');
  } catch (e) {
    console.warn('⚠️  ONPE tables migration falló (no fatal):', e.message);
  }

  // Migración province/district granularity (idempotent — ADD COLUMN IF NOT EXISTS)
  try {
    await db.query(`ALTER TABLE onpe_live_snapshots ADD COLUMN IF NOT EXISTS province_breakdown JSONB`);
    await db.query(`ALTER TABLE onpe_live_snapshots ADD COLUMN IF NOT EXISTS district_breakdown JSONB`);
    await db.query(`ALTER TABLE r2_election_projections ADD COLUMN IF NOT EXISTS shift_granularity VARCHAR(20)`);
    await db.query(`ALTER TABLE r2_election_projections ADD COLUMN IF NOT EXISTS province_shifts JSONB`);
    await db.query(`ALTER TABLE r2_election_projections ADD COLUMN IF NOT EXISTS district_shifts JSONB`);
    console.log('   ✅ Columnas province/district granularity: verificadas');
  } catch (e) {
    console.warn('⚠️  Province/district granularity migration falló (no fatal):', e.message);
  }

  return false;
}

/**
 * Verifica si hay al menos una predicción automática.
 * Si no, corre el pipeline para poblar la DB antes del primer usuario.
 */
async function ensureFirstPrediction() {
  try {
    const { rows } = await db.query(`
      SELECT COUNT(*) FROM model_predictions
      WHERE trigger = 'auto_polymarket_update' AND election_round = 2
    `);
    if (parseInt(rows[0].count) === 0) {
      console.log('🧮 Sin predicciones R2 — corriendo pipeline inicial segunda vuelta...');
      await runFullPipeline({ saveToDB: true, trigger: 'auto_polymarket_update', electionRound: 2 });
      console.log('✅ Primera predicción R2 guardada en DB');
    } else {
      console.log(`✅ Predicciones R2 en DB: ${rows[0].count} registros automáticos`);
    }
  } catch (e) {
    console.error('⚠️  No se pudo generar predicción R2 inicial:', e.message);
  }
}

async function validateSystemIntegrity() {
  console.log('\n🗳️  PERU ELECTION MODEL 2026 — Iniciando...\n');

  // 1. Reloj de Lima
  try {
    const now = nowPeru();
    console.log(`✅ Reloj Lima: ${now.toFormat('dd/MM/yyyy HH:mm:ss')} (${now.zoneName})`);
    console.log(`   Fase electoral: ${electoralPhase()}`);
    const α = getPolymarketWeight();
    console.log(`   Peso Polymarket actual: ${α !== null ? (α * 100).toFixed(1) + '%' : 'N/A (post-elección)'}`);
  } catch (e) {
    await handleError('TIMEZONE_FAILURE', { module: 'startup' }, e);
  }

  // 2. Variables de entorno
  const missingVars = [];
  for (const v of ['DATABASE_URL', 'PORT', 'NODE_ENV']) {
    if (!process.env[v]) missingVars.push(v);
  }
  if (missingVars.length > 0) {
    console.warn(`⚠️  Variables faltantes: ${missingVars.join(', ')}`);
    for (const v of missingVars) {
      await handleError('ENV_VAR_MISSING', { variable: v, module: 'startup' });
    }
    if (missingVars.includes('DATABASE_URL')) {
      throw new Error('DATABASE_URL no configurada — DB no disponible');
    }
  } else {
    console.log('✅ Variables de entorno: OK');
  }

  // 3. Base de datos
  try {
    await db.query('SELECT 1');
    console.log('✅ PostgreSQL: conexión OK');
  } catch (e) {
    await handleError('DB_CONNECTION_FAILED', { module: 'startup' }, e);
    throw new Error('No se pudo conectar a PostgreSQL');
  }

  // 4. Auto-migración
  try {
    await autoMigrate();
  } catch (e) {
    console.error('❌ Auto-migración falló:', e.message);
    await handleError('SEED_DATA_CORRUPT', { module: 'startup' }, e);
  }

  // 4b. Reconstrucción FOTO FINAL post-BdU
  // Si el final_election_day usa un PM snapshot incorrecto (timestamp fuera de 18:30-19:00),
  // reconstruir usando el snapshot correcto de la ventana post-BdU.
  try {
    const { rows: finalCheck } = await db.query(`
      SELECT generated_at_lima FROM model_predictions
      WHERE trigger = 'final_election_day' AND election_round = 1
      LIMIT 1
    `);

    if (finalCheck.length > 0) {
      const fotoTs = new Date(finalCheck[0].generated_at_lima);
      // Ventana correcta: 18:30-19:00 Lima del 12 de abril (23:30-00:00 UTC)
      const windowStart = new Date('2026-04-12T23:30:00Z'); // 18:30 Lima
      const windowEnd = new Date('2026-04-13T00:00:00Z');   // 19:00 Lima
      const needsReconstruction = fotoTs < windowStart || fotoTs >= windowEnd;

      if (needsReconstruction) {
        // FOTO FINAL tiene timestamp fuera de ventana — buscar PM snapshot correcto
        // Narrow window: 18:30–19:00 Lima para excluir artifacts post-freeze
        const { rows: pmSnap } = await db.query(`
          SELECT DISTINCT captured_at_lima
          FROM polymarket_snapshots
          WHERE captured_at_lima >= '2026-04-12T18:30:00-05:00'
            AND captured_at_lima < '2026-04-12T19:00:00-05:00'
          ORDER BY captured_at_lima DESC
          LIMIT 1
        `);

        if (pmSnap.length > 0) {
          const pmTs = pmSnap[0].captured_at_lima;
          console.log(`🔄 FOTO FINAL incorrecta (ts=${fotoTs.toISOString()}) — reconstruyendo con PM snapshot de ${pmTs}...`);

          // Borrar final_election_day R1 incorrecto
          await db.query("DELETE FROM model_predictions WHERE trigger = 'final_election_day' AND election_round = 1");

          // Reconstruir R1 con datos post-BdU, alpha=0.77 (el valor del día electoral R1)
          await runFullPipeline({
            saveToDB: true,
            trigger: 'final_election_day',
            pmTimestamp: pmTs,
            overrideTimestamp: pmTs,
            overrideAlpha: 0.77,
            electionRound: 1
          });
          console.log('✅ FOTO FINAL reconstruida con datos post-BdU');
        } else {
          console.warn('⚠️  No hay PM snapshots en ventana 18:30-19:00 para reconstruir');
        }
      } else {
        console.log(`✅ FOTO FINAL OK (ts=${fotoTs.toISOString()} — dentro de ventana post-BdU)`);
      }
    }

    // Dedup: borrar final_election_day duplicados (mantener solo el último)
    const { rows: fotoFinal } = await db.query(`
      SELECT MAX(generated_at_lima) as ts FROM model_predictions
      WHERE trigger = 'final_election_day' AND election_round = 1
    `);
    if (fotoFinal[0].ts) {
      const r1 = await db.query(`
        DELETE FROM model_predictions
        WHERE trigger = 'final_election_day'
          AND election_round = 1
          AND generated_at_lima < $1
      `, [fotoFinal[0].ts]);
      if (r1.rowCount > 0) {
        console.log(`   🧹 ${r1.rowCount} registros duplicados de final_election_day eliminados`);
      }
    }
  } catch (e) {
    console.warn('⚠️  Reconstrucción/limpieza FOTO FINAL falló:', e.message);
  }

  // 5. Verificar datos seed
  try {
    const { rows } = await db.query('SELECT COUNT(*) FROM polls');
    console.log(`✅ Encuestas en DB: ${rows[0].count}`);
  } catch (e) {
    console.warn('⚠️  Tabla polls no accesible');
  }

  // 6. Último snapshot Polymarket
  try {
    const snap = await db.query('SELECT MAX(captured_at) as last FROM polymarket_snapshots');
    if (snap.rows[0].last) {
      const hrs = (Date.now() - new Date(snap.rows[0].last)) / 3600000;
      console.log(`✅ Polymarket: último snapshot hace ${hrs.toFixed(1)} horas`);
    } else {
      console.warn('⚠️  Sin snapshots de Polymarket aún');
    }
  } catch (e) {
    console.warn('⚠️  Tabla polymarket_snapshots no accesible');
  }

  // 7. Asegurar primera predicción (solo si no estamos post-elección)
  const phase = electoralPhase();
  if (phase === 'post_election') {
    console.log('🗳️  Post-elección — no se corren predicciones nuevas.');
  } else {
    await ensureFirstPrediction();
  }

  console.log('\n✅ Sistema listo para operar.\n');
}

module.exports = { validateSystemIntegrity };
