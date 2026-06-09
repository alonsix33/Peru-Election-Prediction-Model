const express = require('express');
const crypto  = require('crypto');
const router  = express.Router();

const { nowPeru, electoralPhase, timeToElection } = require('../model/clock');
const { getPolymarketWeight, getPollWeight } = require('../model/weights');
const { HOUSE_EFFECTS } = require('../model/aggregator');
const { runFullPipeline } = require('../model/pipeline');
const { handleError } = require('../errors/errorHandler');
const { scrapePolymarket } = require('../scraper/polymarket');
const db = require('../db');

// ─── GET /api/status ────────────────────────────────────────
router.get('/status', async (req, res) => {
  const now = nowPeru();
  const phase = electoralPhase();
  const countdown = timeToElection();

  // Use the actual PM volume from the latest snapshot so α matches what the
  // pipeline uses — fallback to default only when there are no snapshots yet.
  let pmVolume;
  try {
    const { rows } = await db.query(
      `SELECT volume_usd FROM polymarket_snapshots
       ORDER BY captured_at_lima DESC LIMIT 1`
    );
    pmVolume = rows.length > 0 ? parseFloat(rows[0].volume_usd) : undefined;
  } catch (_) { /* fallback to default */ }

  const α = getPolymarketWeight(pmVolume);

  res.json({
    time_lima: now.toFormat('dd/MM/yyyy HH:mm:ss'),
    timezone: now.zoneName,
    electoral_phase: phase,
    polymarket_weight: α,
    polls_weight: α !== null ? 1 - α : null,
    days_to_election: countdown.days,
    hours_to_election: countdown.hours,
    total_hours: parseFloat(countdown.totalHours.toFixed(1)),
    is_election_day: countdown.isElectionDay,
    is_past_election: countdown.isPastElection
  });
});

// ─── GET /api/predictions ───────────────────────────────────
// Sirve la última predicción guardada en DB para el round especificado.
// ?round=1 → R1 frozen snapshot | ?round=2 (default) → R2 live model
router.get('/predictions', async (req, res) => {
  try {
    const round = parseInt(req.query.round) || 2;

    // R1 always serves the frozen final snapshot
    // R2 serves latest auto update, or final if frozen
    const { rows: finalCheck } = await db.query(
      "SELECT COUNT(*) FROM model_predictions WHERE trigger = 'final_election_day' AND election_round = $1",
      [round]
    );
    const isFrozen = parseInt(finalCheck[0].count) > 0;
    const triggerFilter = isFrozen ? 'final_election_day' : 'auto_polymarket_update';

    // Prefer predictions that include Polymarket (weight > 0).
    // Fallback to most recent run of any weight so the UI shows polls-only data
    // while waiting for the first Polymarket scrape to complete.
    const selectCols = `
      candidate, predicted_pct_mean, predicted_pct_p10, predicted_pct_p25,
      predicted_pct_p40, predicted_pct_p60, predicted_pct_p75, predicted_pct_p90,
      prob_first_round, prob_win_overall, electoral_phase,
      polymarket_weight, polls_weight, generated_at_lima, model_version,
      runoff_json, polls_pct, polymarket_pct, posterior_pct, risk_json, frozen_at`;

    let { rows } = await db.query(`
      SELECT ${selectCols}
      FROM model_predictions
      WHERE trigger = $1 AND election_round = $2 AND polymarket_weight > 0
        AND generated_at_lima = (
          SELECT MAX(generated_at_lima) FROM model_predictions
          WHERE trigger = $1 AND election_round = $2 AND polymarket_weight > 0
        )
      ORDER BY predicted_pct_mean DESC
    `, [triggerFilter, round]);

    if (rows.length === 0) {
      // Fallback: any run (polls-only counts while Polymarket hasn't scraped yet)
      const { rows: fallback } = await db.query(`
        SELECT ${selectCols}
        FROM model_predictions
        WHERE trigger = $1 AND election_round = $2
          AND generated_at_lima = (
            SELECT MAX(generated_at_lima) FROM model_predictions
            WHERE trigger = $1 AND election_round = $2
          )
        ORDER BY predicted_pct_mean DESC
      `, [triggerFilter, round]);
      rows = fallback;
    }

    if (rows.length === 0) {
      return res.json({ message: 'No predictions yet.', candidates: [], runoff_scenarios: [] });
    }

    // runoff_json es el mismo para todos los rows de la misma corrida
    let runoff_scenarios = [];
    let risk_scenarios = null;
    try {
      if (rows[0].runoff_json) runoff_scenarios = JSON.parse(rows[0].runoff_json);
      if (rows[0].risk_json) risk_scenarios = JSON.parse(rows[0].risk_json);
    } catch { /* ignore parse error */ }

    res.json({
      generated_at_lima: rows[0].generated_at_lima,
      electoral_phase: rows[0].electoral_phase,
      polymarket_weight: parseFloat(rows[0].polymarket_weight),
      polls_weight: parseFloat(rows[0].polls_weight),
      model_version: rows[0].model_version,
      is_frozen: isFrozen,
      frozen_at: rows[0].frozen_at || null,
      candidates: rows.map(r => ({
        candidate: r.candidate,
        predicted_pct_mean: parseFloat(r.predicted_pct_mean),
        predicted_pct_p10:  parseFloat(r.predicted_pct_p10),
        predicted_pct_p25:  r.predicted_pct_p25  != null ? parseFloat(r.predicted_pct_p25)  : null,
        predicted_pct_p40:  r.predicted_pct_p40  != null ? parseFloat(r.predicted_pct_p40)  : null,
        predicted_pct_p60:  r.predicted_pct_p60  != null ? parseFloat(r.predicted_pct_p60)  : null,
        predicted_pct_p75:  r.predicted_pct_p75  != null ? parseFloat(r.predicted_pct_p75)  : null,
        predicted_pct_p90:  parseFloat(r.predicted_pct_p90),
        prob_first_round:   parseFloat(r.prob_first_round),
        prob_win_overall:   parseFloat(r.prob_win_overall),
        polls_pct:          r.polls_pct       ? parseFloat(r.polls_pct)       : null,
        polymarket_pct:     r.polymarket_pct  ? parseFloat(r.polymarket_pct)  : null,
        posterior_pct:      r.posterior_pct   ? parseFloat(r.posterior_pct)   : null,
      })),
      runoff_scenarios,
      risk_scenarios
    });
  } catch (err) {
    await handleError('DB_CONNECTION_FAILED', { module: 'api/predictions' }, err);
    res.status(500).json({ error: 'Database error' });
  }
});

// ─── GET /api/polymarket ────────────────────────────────────
// ?round=2 (default) → R2 snapshots | ?round=1 → R1 historical
router.get('/polymarket', async (req, res) => {
  try {
    const round = parseInt(req.query.round) || 2;
    const { rows } = await db.query(`
      SELECT candidate, probability, price_yes, price_no,
             volume_usd, phase, captured_at_lima
      FROM polymarket_snapshots
      WHERE election_round = $1
        AND captured_at_lima = (
          SELECT MAX(captured_at_lima) FROM polymarket_snapshots WHERE election_round = $1
        )
      ORDER BY probability DESC
    `, [round]);

    if (rows.length === 0) {
      return res.json({ message: 'No Polymarket snapshots yet.', candidates: [] });
    }

    res.json({
      captured_at_lima: rows[0].captured_at_lima,
      phase: rows[0].phase,
      volume_usd: parseFloat(rows[0].volume_usd),
      candidates: rows.map(r => ({
        candidate: r.candidate,
        probability: parseFloat(r.probability),
        price_yes: parseFloat(r.price_yes),
        price_no: parseFloat(r.price_no)
      }))
    });
  } catch (err) {
    await handleError('DB_CONNECTION_FAILED', { module: 'api/polymarket' }, err);
    res.status(500).json({ error: 'Database error' });
  }
});

// ─── GET /api/polymarket/history ─────────────────────────────
// Snapshots agrupados por timestamp para gráfico de tendencia.
// ?round=2 (default) → R2 | ?round=1 → R1 histórico
router.get('/polymarket/history', async (req, res) => {
  try {
    const round = parseInt(req.query.round) || 2;
    const { rows } = await db.query(`
      SELECT captured_at_lima, candidate, probability
      FROM polymarket_snapshots
      WHERE election_round = $1
      ORDER BY captured_at_lima ASC
    `, [round]);

    // Agrupar por timestamp
    const byTime = {};
    for (const r of rows) {
      const key = r.captured_at_lima;
      if (!byTime[key]) byTime[key] = { time: key, candidates: {} };
      byTime[key].candidates[r.candidate] = parseFloat(r.probability);
    }

    res.json({ snapshots: Object.values(byTime) });
  } catch (err) {
    await handleError('DB_CONNECTION_FAILED', { module: 'api/polymarket/history' }, err);
    res.status(500).json({ error: 'Database error' });
  }
});

// ─── GET /api/polls ─────────────────────────────────────────
// Default: R1 (backward compat for TrendChart). ?round=2 for R2 polls.
router.get('/polls', async (req, res) => {
  try {
    const round = req.query.round ? parseInt(req.query.round) : 1;
    const { rows: polls } = await db.query(`
      SELECT p.*, ps.name as pollster_name, ps.weight_multiplier
      FROM polls p JOIN pollsters ps ON p.pollster_id = ps.id
      WHERE p.election_round = $1
      ORDER BY p.field_end DESC
    `, [round]);

    const { rows: results } = await db.query(
      'SELECT * FROM poll_results ORDER BY poll_id, pct_raw DESC'
    );

    const resultsByPoll = {};
    for (const r of results) {
      if (!resultsByPoll[r.poll_id]) resultsByPoll[r.poll_id] = [];
      resultsByPoll[r.poll_id].push(r);
    }

    const pollsWithWeights = polls.map(p => {
      const weight = getPollWeight(p, parseFloat(p.weight_multiplier));
      return {
        id: p.id, pollster: p.pollster_name,
        field_start: p.field_start, field_end: p.field_end,
        published_date: p.published_date || null,
        sample_n: p.sample_n, margin_error: parseFloat(p.margin_error),
        poll_type: p.poll_type,
        pct_undecided: p.pct_undecided ? parseFloat(p.pct_undecided) : null,
        pct_blank_null: p.pct_blank_null ? parseFloat(p.pct_blank_null) : null,
        notes: p.notes || null,
        effective_weight: parseFloat(weight.toFixed(4)),
        house_effects: HOUSE_EFFECTS[p.pollster_name] || {},
        results: (resultsByPoll[p.id] || []).map(r => ({
          candidate: r.candidate, party: r.party, pct_raw: parseFloat(r.pct_raw)
        }))
      };
    });

    res.json({ total_polls: pollsWithWeights.length, polls: pollsWithWeights });
  } catch (err) {
    await handleError('DB_CONNECTION_FAILED', { module: 'api/polls' }, err);
    res.status(500).json({ error: 'Database error' });
  }
});

// ─── GET /api/antivoto ──────────────────────────────────────
// Historial de rechazo definitivo por candidato.
// ?round=2 (default) → solo R2 | ?round=1 → solo R1 | ?round=all → todos los rounds
// El historial completo (round=all) se usa para el trend chart R1→R2.
router.get('/antivoto', async (req, res) => {
  try {
    const roundParam = req.query.round;
    const allRounds = roundParam === 'all';
    const round = allRounds ? null : (parseInt(roundParam) || 2);

    const { rows } = allRounds
      ? await db.query(`
          SELECT a.candidate, a.pct_no, a.field_end, a.published_date, a.notes,
                 a.election_round, a.segments, ps.name as pollster
          FROM antivoto_snapshots a
          LEFT JOIN pollsters ps ON a.pollster_id = ps.id
          ORDER BY a.field_end ASC, a.candidate ASC
        `)
      : await db.query(`
          SELECT a.candidate, a.pct_no, a.field_end, a.published_date, a.notes,
                 a.election_round, a.segments, ps.name as pollster
          FROM antivoto_snapshots a
          LEFT JOIN pollsters ps ON a.pollster_id = ps.id
          WHERE a.election_round = $1
          ORDER BY a.field_end ASC, a.candidate ASC
        `, [round]);

    // Agrupa por candidato: historial completo + latest
    const byCandidate = {};
    for (const r of rows) {
      if (!byCandidate[r.candidate]) byCandidate[r.candidate] = [];
      byCandidate[r.candidate].push({
        pct_no:         parseFloat(r.pct_no),
        field_end:      r.field_end,
        published_date: r.published_date,
        pollster:       r.pollster,
        notes:          r.notes,
        election_round: r.election_round,
        segments:       r.segments ?? null,
      });
    }

    const candidates = Object.entries(byCandidate).map(([candidate, snapshots]) => {
      // "latest" = most recent R2 measurement if available; else overall most recent
      const r2snaps = snapshots.filter(s => s.election_round === 2);
      const latest = r2snaps.length > 0
        ? r2snaps[r2snaps.length - 1]
        : snapshots[snapshots.length - 1];
      return {
        candidate,
        latest_pct_no:    latest.pct_no,
        latest_field_end: latest.field_end,
        pollster:         latest.pollster,
        latest_segments:  latest.segments ?? null,
        history:          snapshots,
      };
    });

    res.json({ election_round: allRounds ? 'all' : round, candidates });
  } catch (err) {
    await handleError('DB_CONNECTION_FAILED', { module: 'api/antivoto' }, err);
    res.status(500).json({ error: 'Database error' });
  }
});

// ─── GET /api/run-model ─────────────────────────────────────
// Simulación personal del usuario. NO guarda en DB.
router.get('/run-model', async (req, res) => {
  try {
    const result = await runFullPipeline({ saveToDB: false, trigger: 'user_simulation' });
    res.json({
      source: 'user_simulation',
      note: 'Simulación personal. El dashboard oficial se actualiza automáticamente cada 30 minutos.',
      ...result
    });
  } catch (err) {
    console.error('Error en simulación:', err);
    await handleError('MONTE_CARLO_NO_CONVERGENCE', { module: 'api/run-model' }, err);
    res.status(500).json({ error: 'Simulation failed', message: err.message });
  }
});

// ─── GET /api/force-run ──────────────────────────────────────
// Inserta encuestas pendientes y fuerza corrida del pipeline
router.get('/force-run', async (req, res) => {
  try {
    const inserted = [];

    // Crear tabla antivoto_snapshots si no existe
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

      // Seed antivoto data si no existe
      const { rows: [ipsos] } = await db.query(`SELECT id FROM pollsters WHERE name = 'Ipsos'`);
      const { rows: [cit] }   = await db.query(`SELECT id FROM pollsters WHERE name = 'CIT'`);

      const antivotos = [
        { round: 1, candidate: 'Keiko Fujimori',          pct_no: 59.0, pollster_id: ipsos?.id, field_end: '2026-03-22', published_date: '2026-03-24', notes: 'Ipsos 21-22 mar 2026. Campaña R1.' },
        { round: 1, candidate: 'Roberto Sánchez Palomino', pct_no: 41.0, pollster_id: ipsos?.id, field_end: '2026-03-22', published_date: '2026-03-24', notes: 'Ipsos 21-22 mar 2026. Campaña R1.' },
        { round: 1, candidate: 'Keiko Fujimori',          pct_no: 62.7, pollster_id: cit?.id,   field_end: '2026-03-23', published_date: '2026-03-25', notes: 'CIT 20-23 mar 2026. Pico de campaña R1.' },
        { round: 1, candidate: 'Roberto Sánchez Palomino', pct_no: 48.0, pollster_id: cit?.id,   field_end: '2026-03-23', published_date: '2026-03-25', notes: 'CIT 20-23 mar 2026.' },
        { round: 2, candidate: 'Keiko Fujimori',          pct_no: 59.0, pollster_id: ipsos?.id, field_end: '2026-04-02', published_date: '2026-04-02', notes: 'Ipsos 2 abr 2026. Pre-primera vuelta.' },
        { round: 2, candidate: 'Roberto Sánchez Palomino', pct_no: 39.0, pollster_id: ipsos?.id, field_end: '2026-04-02', published_date: '2026-04-02', notes: 'Ipsos 2 abr 2026. Pre-primera vuelta.' },
        { round: 2, candidate: 'Keiko Fujimori',          pct_no: 48.0, pollster_id: ipsos?.id, field_end: '2026-04-24', published_date: '2026-04-26', notes: 'Ipsos 23-24 abr 2026. Post-primera vuelta.' },
        { round: 2, candidate: 'Roberto Sánchez Palomino', pct_no: 43.0, pollster_id: ipsos?.id, field_end: '2026-04-24', published_date: '2026-04-26', notes: 'Ipsos 23-24 abr 2026. Post-primera vuelta.' },
      ];

      for (const a of antivotos) {
        const exists = await db.query(
          `SELECT 1 FROM antivoto_snapshots WHERE candidate = $1 AND field_end = $2 AND election_round = $3`,
          [a.candidate, a.field_end, a.round]
        );
        if (exists.rows.length === 0) {
          await db.query(
            `INSERT INTO antivoto_snapshots (election_round, candidate, pct_no, pollster_id, field_end, published_date, notes)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [a.round, a.candidate, a.pct_no, a.pollster_id, a.field_end, a.published_date, a.notes]
          );
          inserted.push(`Antivoto: ${a.candidate} ${a.field_end} R${a.round} = ${a.pct_no}%`);
        }
      }
    } catch (avErr) {
      console.warn('Antivoto seed falló:', avErr.message);
    }

    // Forzar scrape fresco de Polymarket antes del pipeline
    try {
      await scrapePolymarket();
    } catch (err) {
      console.warn('Scrape de Polymarket falló en force-run:', err.message);
    }

    // Fix sequences (seed used explicit IDs)
    await db.query(`SELECT setval('pollsters_id_seq', (SELECT COALESCE(MAX(id),0) FROM pollsters))`);
    await db.query(`SELECT setval('polls_id_seq', (SELECT COALESCE(MAX(id),0) FROM polls))`);
    await db.query(`SELECT setval('poll_results_id_seq', (SELECT COALESCE(MAX(id),0) FROM poll_results))`);

    // --- Ipsos tracking 29 mar - 1 abr ---
    const { rows: ex1 } = await db.query(
      `SELECT id FROM polls WHERE pollster_id = 3 AND field_end = '2026-04-01' AND published_date = '2026-04-03'`
    );
    if (ex1.length === 0) {
      const { rows: [p] } = await db.query(`
        INSERT INTO polls (pollster_id, field_start, field_end, published_date, sample_n, margin_error, confidence_lvl, scope, technique, poll_type, pct_undecided, pct_blank_null, notes)
        VALUES (3, '2026-03-29', '2026-04-01', '2026-04-03', 1203, 2.80, 95.0, 'nacional', 'presencial', 'intencion_voto', 14.00, 16.00,
          'Tracking diario Ipsos para Perú21. Campo 29 mar - 1 abr 2026. Post-debates ronda 1 y 2 JNE.')
        RETURNING id`);
      await db.query(`INSERT INTO poll_results (poll_id, candidate, party, pct_raw) VALUES
        ($1,'Keiko Fujimori','Fuerza Popular',12),($1,'Rafael López Aliaga','Renovación Popular',8),
        ($1,'Carlos Álvarez','País para Todos',8),($1,'Roberto Sánchez Palomino','Juntos por el Perú',6),
        ($1,'Jorge Nieto','Partido del Buen Gobierno',5),($1,'López Chau','Ahora Nación',4),
        ($1,'César Acuña','APP',4),($1,'Ricardo Belmont','Partido Cívico Obras',3),
        ($1,'Marisol Pérez Tello','Primero la Gente',2),($1,'George Forsyth','Somos Perú',2),
        ($1,'Yonhy Lescano','Cooperación Popular',2),($1,'Carlos Espá','SíCreo',2)`, [p.id]);
      inserted.push('Ipsos tracking 29mar-1abr');
    }

    // --- CID Latinoamérica (nueva encuestadora + encuesta) ---
    let cidId;
    const { rows: exCid } = await db.query(`SELECT id FROM pollsters WHERE name = 'CID'`);
    if (exCid.length === 0) {
      const { rows: [ps] } = await db.query(`
        INSERT INTO pollsters (name, historical_mae, weight_multiplier, notes)
        VALUES ('CID', NULL, 0.80, 'CID Latinoamérica. Sin data comparable 2021 en Perú. Penalización por incertidumbre histórica.')
        RETURNING id`);
      cidId = ps.id;
      inserted.push('Encuestadora CID creada');
    } else {
      cidId = exCid[0].id;
    }

    const { rows: ex2 } = await db.query(
      `SELECT id FROM polls WHERE pollster_id = $1 AND field_end = '2026-04-03' AND published_date = '2026-04-04'`, [cidId]
    );
    if (ex2.length === 0) {
      const { rows: [p] } = await db.query(`
        INSERT INTO polls (pollster_id, field_start, field_end, published_date, sample_n, margin_error, confidence_lvl, scope, technique, poll_type, pct_blank_null, pct_no_answer, notes)
        VALUES ($1, '2026-04-01', '2026-04-03', '2026-04-04', 2120, 2.80, 95.0, 'nacional', 'presencial', 'intencion_voto', 11.2, 13.8,
          'CID Latinoamérica Abril I 2026. Primera encuesta de esta casa en el modelo.')
        RETURNING id`, [cidId]);
      await db.query(`INSERT INTO poll_results (poll_id, candidate, party, pct_raw) VALUES
        ($1,'Keiko Fujimori','Fuerza Popular',9.7),($1,'Rafael López Aliaga','Renovación Popular',9.1),
        ($1,'Carlos Álvarez','País para Todos',6.8),($1,'Fernando Olivera','Frente Esperanza',5.6),
        ($1,'López Chau','Ahora Nación',5.3),($1,'Ricardo Belmont','Partido Cívico Obras',4.9),
        ($1,'Carlos Espá','SíCreo',4.4),($1,'Roberto Sánchez Palomino','Juntos por el Perú',4.3),
        ($1,'Charlie Carrasco','Demócrata Unido',3.6),($1,'José Luna','Podemos Perú',3.6),
        ($1,'Herbert Caller','PPP',3.5),($1,'Marisol Pérez Tello','Primero la Gente',2.9),
        ($1,'Jorge Nieto','Partido del Buen Gobierno',2.6),($1,'César Acuña','APP',2.2)`, [p.id]);
      inserted.push('CID Abril I 2026');
    }

    // --- CIT Abril 2026 ---
    const { rows: ex3 } = await db.query(
      `SELECT id FROM polls WHERE pollster_id = 5 AND field_end = '2026-04-03' AND published_date = '2026-04-04'`
    );
    if (ex3.length === 0) {
      const { rows: [p] } = await db.query(`
        INSERT INTO polls (pollster_id, field_start, field_end, published_date, sample_n, margin_error, confidence_lvl, scope, technique, poll_type, pct_blank_null, pct_no_answer, notes)
        VALUES (5, '2026-04-01', '2026-04-03', '2026-04-04', 1500, 2.80, 95.0, 'nacional', 'presencial', 'intencion_voto', 7.8, 8.5,
          'CIT Abril 2026. Más reciente que la CIT de marzo 20-23.')
        RETURNING id`);
      await db.query(`INSERT INTO poll_results (poll_id, candidate, party, pct_raw) VALUES
        ($1,'Rafael López Aliaga','Renovación Popular',13),($1,'Keiko Fujimori','Fuerza Popular',11),
        ($1,'López Chau','Ahora Nación',8),($1,'César Acuña','APP',6.5),
        ($1,'Carlos Álvarez','País para Todos',6.1),($1,'Jorge Nieto','Partido del Buen Gobierno',5.1),
        ($1,'Marisol Pérez Tello','Primero la Gente',4.5),($1,'Yonhy Lescano','Cooperación Popular',4),
        ($1,'Ricardo Belmont','Partido Cívico Obras',3.5),($1,'Roberto Sánchez Palomino','Juntos por el Perú',3.3),
        ($1,'Wolfgang Grozo','Integridad Democrática',3.1),($1,'Fernando Olivera','Frente Esperanza',2.2)`, [p.id]);
      inserted.push('CIT Abril 2026');
    }

    // --- Ipsos última antes de veda (intención, campo 1-2 abr) ---
    const { rows: ex4 } = await db.query(
      `SELECT id FROM polls WHERE pollster_id = 3 AND field_start = '2026-04-01' AND field_end = '2026-04-02' AND poll_type = 'intencion_voto'`
    );
    if (ex4.length === 0) {
      const { rows: [p] } = await db.query(`
        INSERT INTO polls (pollster_id, field_start, field_end, published_date, sample_n, margin_error, confidence_lvl, scope, technique, poll_type, pct_blank_null, pct_no_answer, notes)
        VALUES (3, '2026-04-01', '2026-04-02', '2026-04-04', 1217, 2.80, 95.0, 'nacional', 'presencial', 'intencion_voto', 16.0, 13.0,
          'Ipsos para Perú21. Último estudio antes de veda electoral. Campo 1-2 abril 2026. Álvarez supera a Aliaga por primera vez.')
        RETURNING id`, []);
      await db.query(`INSERT INTO poll_results (poll_id, candidate, party, pct_raw) VALUES
        ($1,'Keiko Fujimori','Fuerza Popular',13),($1,'Carlos Álvarez','País para Todos',9),
        ($1,'Rafael López Aliaga','Renovación Popular',8),($1,'Roberto Sánchez Palomino','Juntos por el Perú',6),
        ($1,'Jorge Nieto','Partido del Buen Gobierno',5),($1,'López Chau','Ahora Nación',4),
        ($1,'Ricardo Belmont','Partido Cívico Obras',3),($1,'César Acuña','APP',3),
        ($1,'Marisol Pérez Tello','Primero la Gente',2),($1,'Yonhy Lescano','Cooperación Popular',2),
        ($1,'George Forsyth','Somos Perú',2),($1,'José Luna','Podemos Perú',2)`, [p.id]);
      inserted.push('Ipsos última pre-veda intención 1-2 abr');
    }

    // --- Ipsos simulacro (campo 1-2 abr) ---
    const { rows: ex5 } = await db.query(
      `SELECT id FROM polls WHERE pollster_id = 3 AND field_start = '2026-04-01' AND field_end = '2026-04-02' AND poll_type = 'simulacro'`
    );
    if (ex5.length === 0) {
      const { rows: [p] } = await db.query(`
        INSERT INTO polls (pollster_id, field_start, field_end, published_date, sample_n, margin_error, confidence_lvl, scope, technique, poll_type, pct_blank_null, notes)
        VALUES (3, '2026-04-01', '2026-04-02', '2026-04-04', 1192, 2.80, 95.0, 'nacional', 'presencial', 'simulacro', 26.0,
          'Tercer simulacro nacional Ipsos/Perú21. Campo 1-2 abril 2026. Votos emitidos.')
        RETURNING id`, []);
      await db.query(`INSERT INTO poll_results (poll_id, candidate, party, pct_raw) VALUES
        ($1,'Keiko Fujimori','Fuerza Popular',13.7),($1,'Carlos Álvarez','País para Todos',9),
        ($1,'Rafael López Aliaga','Renovación Popular',8.1),($1,'Roberto Sánchez Palomino','Juntos por el Perú',6.7),
        ($1,'Jorge Nieto','Partido del Buen Gobierno',4.1),($1,'César Acuña','APP',3.8),
        ($1,'López Chau','Ahora Nación',3.3),($1,'Ricardo Belmont','Partido Cívico Obras',3.2),
        ($1,'Marisol Pérez Tello','Primero la Gente',2.8),($1,'Yonhy Lescano','Cooperación Popular',2.4),
        ($1,'Carlos Espá','SíCreo',2.1),($1,'Ronald Atencio','Alianza Venceremos',1.9)`, [p.id]);
      inserted.push('Ipsos simulacro 1-2 abr');
    }

    // --- Datum última pre-veda (intención, campo 1-4 abr) ---
    const { rows: ex6 } = await db.query(
      `SELECT id FROM polls WHERE pollster_id = 2 AND field_end = '2026-04-04' AND poll_type = 'intencion_voto'`
    );
    if (ex6.length === 0) {
      const { rows: [p] } = await db.query(`
        INSERT INTO polls (pollster_id, field_start, field_end, published_date, sample_n, margin_error, confidence_lvl, scope, technique, poll_type, pct_blank_null, pct_no_answer, notes)
        VALUES (2, '2026-04-01', '2026-04-04', '2026-04-05', 3000, 1.80, 95.0, 'nacional', 'presencial', 'intencion_voto', 8.1, 8.7,
          'Datum para El Comercio. Último estudio pre-veda. Campo 1-4 abril 2026. n=3000, ME ±1.8%. Keiko primera. Álvarez supera a Aliaga. Sánchez 15.2% en rural. Indecisos mínimo histórico 16.8%.')
        RETURNING id`, []);
      await db.query(`INSERT INTO poll_results (poll_id, candidate, party, pct_raw) VALUES
        ($1,'Keiko Fujimori','Fuerza Popular',14.5),($1,'Carlos Álvarez','País para Todos',10.9),
        ($1,'Rafael López Aliaga','Renovación Popular',9.9),($1,'Jorge Nieto','Partido del Buen Gobierno',6),
        ($1,'Ricardo Belmont','Partido Cívico Obras',5.5),($1,'Roberto Sánchez Palomino','Juntos por el Perú',4.9),
        ($1,'López Chau','Ahora Nación',4.7),($1,'Marisol Pérez Tello','Primero la Gente',4.5),
        ($1,'César Acuña','APP',3.2),($1,'Carlos Espá','SíCreo',2.6),
        ($1,'Yonhy Lescano','Cooperación Popular',2.4),($1,'Fernando Olivera','Frente de la Esperanza',1.8)`, [p.id]);
      inserted.push('Datum intención 1-4 abr');
    }

    // --- Datum simulacro (campo 1-4 abr) ---
    const { rows: ex7 } = await db.query(
      `SELECT id FROM polls WHERE pollster_id = 2 AND field_end = '2026-04-04' AND poll_type = 'simulacro'`
    );
    if (ex7.length === 0) {
      const { rows: [p] } = await db.query(`
        INSERT INTO polls (pollster_id, field_start, field_end, published_date, sample_n, margin_error, confidence_lvl, scope, technique, poll_type, pct_blank_null, notes)
        VALUES (2, '2026-04-01', '2026-04-04', '2026-04-05', 3000, 1.80, 95.0, 'nacional', 'presencial', 'simulacro', 21.8,
          'Simulacro Datum/El Comercio. Campo 1-4 abril 2026. Votos válidos. Sánchez rural 15.2%.')
        RETURNING id`, []);
      await db.query(`INSERT INTO poll_results (poll_id, candidate, party, pct_raw) VALUES
        ($1,'Keiko Fujimori','Fuerza Popular',18.1),($1,'Carlos Álvarez','País para Todos',10.8),
        ($1,'Rafael López Aliaga','Renovación Popular',10.3),($1,'Jorge Nieto','Partido del Buen Gobierno',7.2),
        ($1,'Roberto Sánchez Palomino','Juntos por el Perú',7),($1,'Ricardo Belmont','Partido Cívico Obras',6.5),
        ($1,'Marisol Pérez Tello','Primero la Gente',4.7),($1,'López Chau','Ahora Nación',4.6),
        ($1,'Carlos Espá','SíCreo',3),($1,'César Acuña','APP',3),
        ($1,'Fernando Olivera','Frente de la Esperanza',2.8),($1,'Yonhy Lescano','Cooperación Popular',2.7),
        ($1,'George Forsyth','Somos Perú',2.5)`, [p.id]);
      inserted.push('Datum simulacro 1-4 abr');
    }

    // --- CPI final pre-veda (campo 1-4 abr) ---
    const { rows: ex8 } = await db.query(
      `SELECT id FROM polls WHERE pollster_id = 4 AND field_end = '2026-04-04' AND published_date = '2026-04-05'`
    );
    if (ex8.length === 0) {
      const { rows: [p] } = await db.query(`
        INSERT INTO polls (pollster_id, field_start, field_end, published_date, sample_n, margin_error, confidence_lvl, scope, technique, poll_type, pct_blank_null, pct_no_answer, notes)
        VALUES (4, '2026-04-01', '2026-04-04', '2026-04-05', 2000, 2.70, 95.5, 'nacional', 'presencial', 'intencion_voto', 14.7, 13.9,
          'CPI para RPP. Última encuesta pre-veda. Campo 1-4 abril 2026. n=2000. Keiko primera 16.5% válidos. Aliaga segundo 12.8%. House effect CPI consistente con serie histórica.')
        RETURNING id`, []);
      await db.query(`INSERT INTO poll_results (poll_id, candidate, party, pct_raw) VALUES
        ($1,'Keiko Fujimori','Fuerza Popular',16.5),($1,'Rafael López Aliaga','Renovación Popular',12.8),
        ($1,'Carlos Álvarez','País para Todos',11.9),($1,'López Chau','Ahora Nación',8.4),
        ($1,'Jorge Nieto','Partido del Buen Gobierno',6.7),($1,'Ricardo Belmont','Partido Cívico Obras',6),
        ($1,'Roberto Sánchez Palomino','Juntos por el Perú',5.4),($1,'Marisol Pérez Tello','Primero la Gente',5.2),
        ($1,'César Acuña','APP',4.4),($1,'Fernando Olivera','Frente de la Esperanza',3.3),
        ($1,'José Luna','Podemos Perú',2.4),($1,'George Forsyth','Somos Perú',2.2),
        ($1,'Carlos Espá','SíCreo',2.1),($1,'Yonhy Lescano','Cooperación Popular',2),
        ($1,'Mesías Guevara','Partido Morado',1.3),($1,'Wolfgang Grozo','Integridad Democrática',1.2),
        ($1,'Enrique Valderrama','Partido Aprista Peruano',1.1)`, [p.id]);
      inserted.push('CPI final pre-veda 1-4 abr');
    }

    // --- CPI simulacro (campo 1-4 abr) ---
    const { rows: ex9 } = await db.query(
      `SELECT id FROM polls WHERE pollster_id = 4 AND field_end = '2026-04-04' AND poll_type = 'simulacro'`
    );
    if (ex9.length === 0) {
      const { rows: [p] } = await db.query(`
        INSERT INTO polls (pollster_id, field_start, field_end, published_date, sample_n, margin_error, confidence_lvl, scope, technique, poll_type, pct_blank_null, notes)
        VALUES (4, '2026-04-01', '2026-04-04', '2026-04-05', 1733, 2.70, 95.5, 'nacional', 'presencial', 'simulacro', 17.8,
          'Simulacro CPI réplica cédula ONPE. Campo 1-4 abril 2026. Perú urbano y rural. Votos válidos.')
        RETURNING id`, []);
      await db.query(`INSERT INTO poll_results (poll_id, candidate, party, pct_raw) VALUES
        ($1,'Keiko Fujimori','Fuerza Popular',16.2),($1,'Rafael López Aliaga','Renovación Popular',13),
        ($1,'Carlos Álvarez','País para Todos',11.8),($1,'López Chau','Ahora Nación',8.3),
        ($1,'Jorge Nieto','Partido del Buen Gobierno',6.4),($1,'Ricardo Belmont','Partido Cívico Obras',5.9),
        ($1,'Marisol Pérez Tello','Primero la Gente',5.4),($1,'Roberto Sánchez Palomino','Juntos por el Perú',5.2),
        ($1,'César Acuña','APP',4.5),($1,'Fernando Olivera','Frente de la Esperanza',3.4),
        ($1,'José Luna','Podemos Perú',2.6),($1,'George Forsyth','Somos Perú',2.4),
        ($1,'Carlos Espá','SíCreo',2),($1,'Yonhy Lescano','Cooperación Popular',2),
        ($1,'Wolfgang Grozo','Integridad Democrática',1.3),($1,'Mesías Guevara','Partido Morado',1.2),
        ($1,'Enrique Valderrama','Partido Aprista Peruano',1.3)`, [p.id]);
      inserted.push('CPI simulacro 1-4 abr');
    }

    // --- CIT simulacro abril I (campo 30 mar - 1 abr) ---
    const { rows: ex10 } = await db.query(
      `SELECT id FROM polls WHERE pollster_id = 5 AND field_start = '2026-03-30' AND field_end = '2026-04-01' AND poll_type = 'simulacro'`
    );
    if (ex10.length === 0) {
      const { rows: [p] } = await db.query(`
        INSERT INTO polls (pollster_id, field_start, field_end, published_date, sample_n, margin_error, confidence_lvl, scope, technique, poll_type, pct_blank_null, notes)
        VALUES (5, '2026-03-30', '2026-04-01', '2026-04-05', 1500, 2.50, 95.0, 'nacional', 'presencial', 'simulacro', 23.4,
          'CIT simulacro abril I 2026. Campo 30 mar - 1 abr. n=1500. Aliaga primero 17.8% — house effect CIT consistente. Sánchez 3.9% el más bajo del ciclo.')
        RETURNING id`, []);
      await db.query(`INSERT INTO poll_results (poll_id, candidate, party, pct_raw) VALUES
        ($1,'Rafael López Aliaga','Renovación Popular',17.8),($1,'Keiko Fujimori','Fuerza Popular',17.1),
        ($1,'Carlos Álvarez','País para Todos',10.5),($1,'César Acuña','APP',7.8),
        ($1,'López Chau','Ahora Nación',7.8),($1,'Jorge Nieto','Partido del Buen Gobierno',5.5),
        ($1,'Marisol Pérez Tello','Primero la Gente',4.5),($1,'Roberto Sánchez Palomino','Juntos por el Perú',3.9),
        ($1,'Ricardo Belmont','Partido Cívico Obras',3.4)`, [p.id]);
      inserted.push('CIT simulacro abril I');
    }

    // --- Ipsos intención 3-4 abr ---
    const { rows: ex11 } = await db.query(
      `SELECT id FROM polls WHERE pollster_id = 3 AND field_start = '2026-04-03' AND field_end = '2026-04-04' AND poll_type = 'intencion_voto'`
    );
    if (ex11.length === 0) {
      const { rows: [p] } = await db.query(`
        INSERT INTO polls (pollster_id, field_start, field_end, published_date, sample_n, margin_error, confidence_lvl, scope, technique, poll_type, pct_blank_null, pct_no_answer, notes)
        VALUES (3, '2026-04-03', '2026-04-04', '2026-04-05', 1205, 2.80, 95.0, 'nacional', 'presencial', 'intencion_voto', 11, 16,
          'Ipsos para Perú21. Campo 3-4 abril 2026. 24 departamentos + Callao. Keiko 15%, Aliaga cae a 7% (interior 4%). Sánchez rural 15% NSE E 11% — patrón Castillo confirmado.')
        RETURNING id`, []);
      await db.query(`INSERT INTO poll_results (poll_id, candidate, party, pct_raw) VALUES
        ($1,'Keiko Fujimori','Fuerza Popular',15),($1,'Carlos Álvarez','País para Todos',8),
        ($1,'Rafael López Aliaga','Renovación Popular',7),($1,'Ricardo Belmont','Partido Cívico Obras',6),
        ($1,'Roberto Sánchez Palomino','Juntos por el Perú',5),($1,'López Chau','Ahora Nación',5),
        ($1,'Jorge Nieto','Partido del Buen Gobierno',4),($1,'Marisol Pérez Tello','Primero la Gente',3),
        ($1,'César Acuña','APP',3),($1,'Fernando Olivera','Frente de la Esperanza',3),
        ($1,'José Luna','Podemos Perú',2)`, [p.id]);
      inserted.push('Ipsos intención 3-4 abr');
    }

    // --- CIT R2 — intención mayo 26-29 (publicada 30 may — última antes de veda 31 may) ---
    // Nota: CIT mayo 14-17 (simulacro, KF 40.5% RSP 36%) ya está en seed_r2.sql — no re-insertar.
    const { rows: exCitR2b } = await db.query(
      `SELECT id FROM polls WHERE pollster_id = 5 AND field_end = '2026-05-29' AND election_round = 2`
    );
    if (exCitR2b.length === 0) {
      const { rows: [p] } = await db.query(`
        INSERT INTO polls (pollster_id, field_start, field_end, published_date, sample_n, margin_error,
                           confidence_lvl, scope, technique, poll_type, pct_blank_null, pct_no_answer, notes, election_round)
        VALUES (5, '2026-05-26', '2026-05-29', '2026-05-30', 1220, 2.80, 95.0,
                'nacional', 'presencial', 'intencion_voto', 14.2, 12.3,
                'CIT segunda vuelta mayo 26-29. Keiko 41.1% Sánchez ~33.4% B/V 14.2% NS/NR 12.3%. Última encuesta CIT antes de veda electoral 31 may.',
                2)
        RETURNING id`);
      await db.query(`INSERT INTO poll_results (poll_id, candidate, party, pct_raw) VALUES
        ($1,'Keiko Fujimori','Fuerza Popular',41.1),
        ($1,'Roberto Sánchez Palomino','Juntos por el Perú',33.4)`, [p.id]);
      inserted.push('CIT R2 mayo 26-29 (KF 41.1% RSP 33.4%)');
    }

    console.log('Encuestas insertadas:', inserted.length > 0 ? inserted.join(', ') : 'ninguna nueva');

    // Forzar pipeline R2 — si es post-cierre del 7 junio, guardar como foto final R2
    const { nowPeru, ELECTION_DAY } = require('../model/clock');
    const now = nowPeru();
    const isPostClose = now.toISODate() === ELECTION_DAY && now.hour >= 17;

    // Guard: don't create duplicate final_election_day entries
    if (isPostClose) {
      const { rows: existingFinal } = await db.query(
        `SELECT id FROM model_predictions WHERE trigger = 'final_election_day' AND election_round = 2 LIMIT 1`
      );
      if (existingFinal.length > 0) {
        return res.json({ polls_inserted: inserted, message: 'final_election_day R2 ya existe — no se creó duplicado' });
      }
    }

    const trigger = isPostClose ? 'final_election_day' : 'auto_polymarket_update';
    const result = await runFullPipeline({ saveToDB: true, trigger, electionRound: 2 });

    res.json({ polls_inserted: inserted, ...result });
  } catch (err) {
    console.error('Error en force-run:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/model-history ─────────────────────────────────
// Últimas 20 corridas automáticas. ?round=2 (default) | ?round=1
router.get('/model-history', async (req, res) => {
  try {
    const round = parseInt(req.query.round) || 2;

    // Single query with window function — replaces N+1 pattern (was 1 + up to 20 queries)
    const { rows } = await db.query(`
      WITH recent_runs AS (
        SELECT DISTINCT generated_at_lima
        FROM model_predictions
        WHERE trigger IN ('auto_polymarket_update', 'final_election_day')
          AND election_round = $1
          AND polymarket_weight > 0
        ORDER BY generated_at_lima DESC
        LIMIT 20
      ),
      ranked AS (
        SELECT
          mp.candidate, mp.predicted_pct_mean, mp.prob_first_round,
          mp.prob_win_overall, mp.generated_at_lima,
          ROW_NUMBER() OVER (PARTITION BY mp.generated_at_lima ORDER BY mp.predicted_pct_mean DESC) AS rn
        FROM model_predictions mp
        JOIN recent_runs r ON r.generated_at_lima = mp.generated_at_lima
        WHERE mp.election_round = $1
          AND mp.trigger IN ('auto_polymarket_update', 'final_election_day')
      )
      SELECT candidate, predicted_pct_mean, prob_first_round, prob_win_overall, generated_at_lima
      FROM ranked
      WHERE rn <= 3
      ORDER BY generated_at_lima DESC, predicted_pct_mean DESC
    `, [round]);

    // Group by run
    const runMap = new Map();
    for (const row of rows) {
      // pg returns TIMESTAMPTZ as a Date object — use ISO string as Map key so that
      // two rows from the same run (same timestamp value, different object refs) are
      // grouped together instead of creating separate single-candidate entries.
      const ts = row.generated_at_lima instanceof Date
        ? row.generated_at_lima.toISOString()
        : String(row.generated_at_lima);
      if (!runMap.has(ts)) runMap.set(ts, []);
      runMap.get(ts).push({
        candidate:        row.candidate,
        pct_mean:         parseFloat(row.predicted_pct_mean),
        prob_first_round: parseFloat(row.prob_first_round),
        prob_win:         parseFloat(row.prob_win_overall),
      });
    }
    const history = [...runMap.entries()]
      .map(([ts, top3]) => ({ generated_at_lima: ts, top3 }));

    res.json({ count: history.length, history });
  } catch (err) {
    await handleError('DB_CONNECTION_FAILED', { module: 'api/model-history' }, err);
    res.status(500).json({ error: 'Database error' });
  }
});

// ─── GET /api/post-mortem ───────────────────────────────────
// Devuelve ambas corridas clave (6pm freeze + foto final) para análisis
router.get('/post-mortem', async (req, res) => {
  try {
    // Post-mortem R1: scoped explícitamente a election_round = 1
    // Corrida 1: auto run más cercana a 23:00 UTC del 12 de abril R1
    const { rows: run6pm } = await db.query(`
      SELECT candidate, predicted_pct_mean, predicted_pct_p10, predicted_pct_p90,
             prob_first_round, prob_win_overall, polls_pct, polymarket_pct,
             posterior_pct, generated_at_lima, trigger, polymarket_weight, polls_weight
      FROM model_predictions
      WHERE trigger = 'auto_polymarket_update'
        AND election_round = 1
        AND polymarket_weight > 0
        AND generated_at_lima = (
          SELECT MAX(generated_at_lima) FROM model_predictions
          WHERE trigger = 'auto_polymarket_update'
            AND election_round = 1
            AND polymarket_weight > 0
            AND generated_at_lima < '2026-04-12T23:30:00Z'
        )
      ORDER BY predicted_pct_mean DESC
    `);

    // Corrida 2: foto final R1 CON datos de Polymarket (alpha > 0)
    const { rows: runFinal } = await db.query(`
      SELECT candidate, predicted_pct_mean, predicted_pct_p10, predicted_pct_p90,
             prob_first_round, prob_win_overall, polls_pct, polymarket_pct,
             posterior_pct, generated_at_lima, trigger, polymarket_weight, polls_weight,
             frozen_at
      FROM model_predictions
      WHERE trigger = 'final_election_day'
        AND election_round = 1
        AND polymarket_weight > 0
        AND generated_at_lima = (
          SELECT MAX(generated_at_lima) FROM model_predictions
          WHERE trigger = 'final_election_day' AND election_round = 1 AND polymarket_weight > 0
        )
      ORDER BY predicted_pct_mean DESC
    `);

    const format = (rows) => rows.map(r => ({
      candidate: r.candidate,
      mean: parseFloat(r.predicted_pct_mean),
      p10: parseFloat(r.predicted_pct_p10),
      p90: parseFloat(r.predicted_pct_p90),
      prob_runoff: parseFloat(r.prob_first_round),
      prob_win: parseFloat(r.prob_win_overall),
      polls_pct: r.polls_pct ? parseFloat(r.polls_pct) : null,
      polymarket_pct: r.polymarket_pct ? parseFloat(r.polymarket_pct) : null,
      posterior_pct: r.posterior_pct ? parseFloat(r.posterior_pct) : null,
    }));

    res.json({
      run_6pm: {
        generated_at_lima: run6pm[0]?.generated_at_lima,
        trigger: run6pm[0]?.trigger,
        alpha: run6pm[0]?.polymarket_weight ? parseFloat(run6pm[0].polymarket_weight) : null,
        candidates: format(run6pm),
      },
      run_final: {
        generated_at_lima: runFinal[0]?.generated_at_lima,
        trigger: runFinal[0]?.trigger,
        alpha: runFinal[0]?.polymarket_weight ? parseFloat(runFinal[0].polymarket_weight) : null,
        frozen_at: runFinal[0]?.frozen_at,
        candidates: format(runFinal),
      }
    });
  } catch (err) {
    console.error('Error post-mortem:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/onpe/live ──────────────────────────────────────
// Último snapshot de resultados ONPE R2 en tiempo real + historial de tendencia
router.get('/onpe/live', async (req, res) => {
  try {
    // Don't surface snapshots before election day — prevents test data from leaking
    const phase = electoralPhase();
    if (phase === 'pre_veda' || phase === 'veda') {
      return res.json({ status: 'pre_election', has_data: false });
    }

    const { rows: [latest] } = await db.query(
      `SELECT * FROM onpe_live_snapshots WHERE has_data = true ORDER BY captured_at DESC LIMIT 1`
    );

    if (!latest) {
      return res.json({ status: 'no_snapshots', has_data: false });
    }

    const { rows: history } = await db.query(
      `SELECT captured_at, keiko_pct, sanchez_pct, pct_actas
       FROM onpe_live_snapshots
       WHERE has_data = true
       ORDER BY captured_at ASC`
    );

    res.json({
      status: latest.has_data ? 'live' : 'waiting',
      captured_at:     latest.captured_at,
      has_data:        latest.has_data,
      actas_total:     latest.actas_total,
      actas_processed: latest.actas_processed,
      pct_actas:       latest.pct_actas   != null ? parseFloat(latest.pct_actas)   : null,
      keiko_pct:       latest.keiko_pct   != null ? parseFloat(latest.keiko_pct)   : null,
      keiko_votos:     latest.keiko_votos  != null ? parseInt(latest.keiko_votos)   : null,
      sanchez_pct:     latest.sanchez_pct != null ? parseFloat(latest.sanchez_pct) : null,
      sanchez_votos:   latest.sanchez_votos != null ? parseInt(latest.sanchez_votos) : null,
      departamentos:   latest.dept_breakdown,
      extranjero:      latest.ext_breakdown,
      history: history.map(h => ({
        time:        h.captured_at,
        keiko_pct:   parseFloat(h.keiko_pct),
        sanchez_pct: parseFloat(h.sanchez_pct),
        pct_actas:   parseFloat(h.pct_actas),
      })),
    });
  } catch (err) {
    if (err.message?.includes('onpe_live_snapshots') && err.message?.includes('exist')) {
      return res.json({ status: 'table_missing', has_data: false,
        hint: 'Run: psql $DATABASE_URL -f db/onpe_snapshots.sql' });
    }
    await handleError('DB_CONNECTION_FAILED', { module: 'api/onpe/live' }, err);
    res.status(500).json({ error: 'Database error' });
  }
});

// ─── GET /api/onpe/projection ───────────────────────────────
// Proyección de resultado final R2 basada en el último snapshot ONPE.
// Lee de DB (no hace calls ONPE), aplica shift-from-baseline + corrección ZDA.
// Devuelve { status: 'pre_election' } si no hay snapshots con datos.
router.get('/onpe/projection', async (req, res) => {
  try {
    // Guard: don't serve projections before election day
    const phase = electoralPhase();
    if (phase === 'pre_veda' || phase === 'veda') {
      return res.json({ status: 'pre_election', message: 'Sin datos ONPE aún' });
    }

    const { rows: [latest] } = await db.query(
      `SELECT * FROM onpe_live_snapshots WHERE has_data = true ORDER BY captured_at DESC LIMIT 1`
    );

    if (!latest) {
      return res.json({ status: 'pre_election', message: 'Sin datos ONPE aún' });
    }

    const { project } = require('../model/electionNightProjector');

    const snapshot = {
      pct_actas:          latest.pct_actas         != null ? parseFloat(latest.pct_actas)  : 0,
      keiko_votos:        latest.keiko_votos        != null ? parseInt(latest.keiko_votos)   : 0,
      sanchez_votos:      latest.sanchez_votos      != null ? parseInt(latest.sanchez_votos) : 0,
      dept_breakdown:     Array.isArray(latest.dept_breakdown)     ? latest.dept_breakdown     : [],
      province_breakdown: Array.isArray(latest.province_breakdown) ? latest.province_breakdown : [],
      district_breakdown: Array.isArray(latest.district_breakdown) ? latest.district_breakdown : [],
      ext_breakdown:      Array.isArray(latest.ext_breakdown)      ? latest.ext_breakdown      : [],
      pais_breakdown:     Array.isArray(latest.pais_breakdown)     ? latest.pais_breakdown     : [],
      captured_at:        latest.captured_at,
    };

    const result = project(snapshot);

    // Also fetch projection history for trend line
    const { rows: history } = await db.query(
      `SELECT projected_at, proj_kf_r2_share, proj_ci95_lo, proj_ci95_hi, pct_actas, phase
       FROM r2_election_projections
       ORDER BY projected_at ASC`
    );

    const pf = v => (v != null ? parseFloat(v) : null);

    res.json({
      ...result,
      snapshot_id:  latest.id,
      history: history.map(h => ({
        time:             h.projected_at,
        pct_actas:        pf(h.pct_actas),
        phase:            h.phase,
        proj_kf_r2_share: pf(h.proj_kf_r2_share),
        ci95_lo:          pf(h.proj_ci95_lo),
        ci95_hi:          pf(h.proj_ci95_hi),
      })),
    });
  } catch (err) {
    // PostgreSQL error code 42P01 = undefined_table
    if (err.code === '42P01') {
      if (err.message?.includes('r2_election_projections')) {
        return res.json({ status: 'table_missing', has_data: false,
          hint: 'Run: psql $DATABASE_URL -f db/r2_projections.sql' });
      }
      return res.json({ status: 'pre_election', message: 'Sin datos ONPE aún' });
    }
    await handleError('DB_CONNECTION_FAILED', { module: 'api/onpe/projection' }, err);
    res.status(500).json({ error: 'Database error' });
  }
});

// ─── GET /api/live-projection ────────────────────────────────
// Frontend-facing adapter that transforms /api/onpe/projection output
// into the flat shape the LiveResultsTab expects.
// Returns { status: 'pre_election' } when no live data yet.
function _normalCDF(z) {
  const t = 1 / (1 + 0.3275911 * Math.abs(z));
  const poly = t * (0.254829592 + t * (-0.284496736 + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429))));
  const p = 1 - (1 / Math.sqrt(2 * Math.PI)) * Math.exp(-0.5 * z * z) * poly;
  return z >= 0 ? p : 1 - p;
}

router.get('/live-projection', async (req, res) => {
  try {
    // Guard: don't serve live results before election day — prevents test snapshots from leaking
    const phase = electoralPhase();
    if (phase === 'pre_veda' || phase === 'veda') {
      return res.json({ status: 'pre_election', pct_actas: 0 });
    }

    const { rows: [latest] } = await db.query(
      `SELECT * FROM onpe_live_snapshots WHERE has_data = true ORDER BY captured_at DESC LIMIT 1`
    );
    if (!latest) return res.json({ status: 'pre_election', pct_actas: 0 });

    const { project } = require('../model/electionNightProjector');

    // Fallback: calculate pct_actas from actas counts if the field is missing/zero
    let pct_actas_val = latest.pct_actas != null ? parseFloat(latest.pct_actas) : 0;
    if (pct_actas_val < 0.1 && latest.actas_processed > 0 && latest.actas_total > 0) {
      pct_actas_val = parseFloat((latest.actas_processed / latest.actas_total * 100).toFixed(2));
    }
    // Second fallback: sum from dept_breakdown
    if (pct_actas_val < 0.1 && Array.isArray(latest.dept_breakdown) && latest.dept_breakdown.length > 0) {
      const sumProc  = latest.dept_breakdown.reduce((s, d) => s + (d.actas_procesadas || 0), 0);
      const sumTotal = latest.dept_breakdown.reduce((s, d) => s + (d.actas_total      || 0), 0);
      if (sumTotal > 0) pct_actas_val = parseFloat((sumProc / sumTotal * 100).toFixed(2));
    }

    const snapshot = {
      pct_actas:          pct_actas_val,
      keiko_votos:        latest.keiko_votos        != null ? parseInt(latest.keiko_votos)   : 0,
      sanchez_votos:      latest.sanchez_votos      != null ? parseInt(latest.sanchez_votos) : 0,
      dept_breakdown:     Array.isArray(latest.dept_breakdown)     ? latest.dept_breakdown     : [],
      province_breakdown: Array.isArray(latest.province_breakdown) ? latest.province_breakdown : [],
      district_breakdown: Array.isArray(latest.district_breakdown) ? latest.district_breakdown : [],
      ext_breakdown:      Array.isArray(latest.ext_breakdown)      ? latest.ext_breakdown      : [],
      pais_breakdown:     Array.isArray(latest.pais_breakdown)     ? latest.pais_breakdown     : [],
      captured_at:        latest.captured_at,
    };

    const r = project(snapshot);
    if (r.status !== 'ok') return res.json({ status: r.status, pct_actas: 0 });

    const extKf    = r.exterior?.obs_kf_votos  || 0;
    const extRsp   = r.exterior?.obs_rsp_votos || 0;
    // obs_kf/obs_rsp come from AMBITO_NAC=1 (domestic only) — exterior is tracked separately
    const domKf    = r.observed.keiko_votos   || 0;
    const domRsp   = r.observed.sanchez_votos || 0;
    const domTotal = domKf + domRsp;
    const natKf    = domKf + extKf;
    const natRsp   = domRsp + extRsp;
    const natTotal = natKf + natRsp;
    const sigma     = r.projected.sigma_pp || 3.0;
    // Use bootstrap-derived probability (includes exterior, correctly scaled).
    // Fall back to normal CDF only if projector is old and doesn't expose prob_kf_win.
    const probWinKF = r.projected.prob_kf_win
      ?? Math.round(_normalCDF((r.projected.kf_r2_share - 50) / sigma) * 100);

    const deptPctMap = {};
    for (const d of snapshot.dept_breakdown) {
      if (d?.ubigeo && d.pct_actas != null) deptPctMap[d.ubigeo] = d.pct_actas;
    }

    const { rows: projHistory } = await db.query(
      `SELECT rp.projected_at, rp.pct_actas,
              CASE WHEN s.id IS NOT NULL AND (s.keiko_votos + s.sanchez_votos + ext.ext_kf + ext.ext_rsp) > 0
                THEN ROUND((s.keiko_votos + ext.ext_kf)::numeric /
                           (s.keiko_votos + s.sanchez_votos + ext.ext_kf + ext.ext_rsp) * 100, 2)
                ELSE rp.obs_kf_r2_share
              END AS obs_kf_r2_share,
              rp.proj_kf_r2_share, rp.proj_ci95_lo, rp.proj_ci95_hi
       FROM r2_election_projections rp
       LEFT JOIN onpe_live_snapshots s ON s.id = rp.snapshot_id
       LEFT JOIN LATERAL (
         SELECT COALESCE(SUM((e->>'keiko_votos')::numeric), 0)   AS ext_kf,
                COALESCE(SUM((e->>'sanchez_votos')::numeric), 0) AS ext_rsp
         FROM jsonb_array_elements(COALESCE(s.ext_breakdown, '[]'::jsonb)) e
       ) ext ON true
       ORDER BY rp.projected_at ASC`
    );
    const pf = v => (v != null ? parseFloat(v) : null);

    res.json({
      status:           'ok',
      pct_actas:        r.pct_actas,
      snapshot_ts:      r.captured_at,
      phase:            r.phase,
      phaseLabel:       r.phaseLabel,

      // Top-level national fields (for CandidateCards + StatusBar)
      kf_r2_share:      natTotal > 0 ? Math.round(natKf / natTotal * 10000) / 100 : r.observed.kf_r2_share,
      proj_kf_r2_share: r.projected.kf_r2_share,
      ci_low:           r.projected.ci_95.lo,
      ci_high:          r.projected.ci_95.hi,
      kf_votos:         natKf,
      rsp_votos:        natRsp,
      prob_win_kf:      probWinKF,

      // Nested objects for VoteBars
      national: {
        kf_r2_share: natTotal > 0 ? Math.round(natKf / natTotal * 10000) / 100 : r.observed.kf_r2_share,
        kf_votos:    natKf,
        rsp_votos:   natRsp,
      },
      nacional: {
        kf_r2_share: domTotal > 0 ? Math.round(domKf / domTotal * 10000) / 100 : null,
        kf_votos:    domKf,
        rsp_votos:   domRsp,
      },
      extranjero: (() => {
        const extReported  = extKf + extRsp;
        const extRemaining = r.exterior?.remaining_vv_est ?? 0;
        const extTotal     = extReported + extRemaining;
        const extPct       = extTotal > 0 && extReported > 0
          ? Math.round(extReported / extTotal * 1000) / 10   // one decimal
          : (extReported > 0 ? 100 : null);
        return {
          kf_r2_share: r.exterior?.obs_kf_r2_share ?? null,
          kf_votos:    extKf,
          rsp_votos:   extRsp,
          pct_actas:   extPct,
        };
      })(),

      // Department array for map + table (includes vote counts for sorting)
      departments: (r.dept_shifts || []).map(d => ({
        ubigeo:        d.ubigeo,
        nombre:        d.nombre,
        kf_r2_share:   d.current_kf_r2_share,
        shift_pp:      d.shift_pp,
        keiko_votos:   d.keiko_votos   ?? null,
        sanchez_votos: d.sanchez_votos ?? null,
        pct_actas:     deptPctMap[d.ubigeo] ?? null,
      })),

      // Province and district arrays — populated when bookmarklet sends them
      provinces: (r.province_shifts || []).map(p => ({
        ubigeo:        p.ubigeo,
        nombre:        p.nombre,
        deptUbigeo:    p.deptUbigeo,
        kf_r2_share:   p.current_kf_r2_share,
        r1_kf_r2_share: p.r1_kf_r2_share,
        shift_pp:      p.shift_pp,
        keiko_votos:   p.keiko_votos,
        sanchez_votos: p.sanchez_votos,
        has_r1_baseline: p.has_r1_baseline,
      })),

      districts: (r.district_shifts || []).map(d => ({
        ubigeo:        d.ubigeo,
        nombre:        d.nombre,
        provUbigeo:    d.provUbigeo,
        deptUbigeo:    d.deptUbigeo,
        kf_r2_share:   d.current_kf_r2_share,
        r1_kf_r2_share: d.r1_kf_r2_share,
        shift_pp:      d.shift_pp,
        keiko_votos:   d.keiko_votos,
        sanchez_votos: d.sanchez_votos,
        has_r1_baseline: d.has_r1_baseline,
      })),

      shift_granularity: r.shift_granularity,

      pais_breakdown: snapshot.pais_breakdown || [],

      history: projHistory.map(h => ({
        time:             h.projected_at,
        pct_actas:        pf(h.pct_actas),
        obs_kf_r2_share:  pf(h.obs_kf_r2_share),
        proj_kf_r2_share: pf(h.proj_kf_r2_share),
        ci95_lo:          pf(h.proj_ci95_lo),
        ci95_hi:          pf(h.proj_ci95_hi),
      })),
    });
  } catch (err) {
    if (err.code === '42P01') return res.json({ status: 'pre_election', pct_actas: 0 });
    await handleError('DB_CONNECTION_FAILED', { module: 'api/live-projection' }, err);
    res.status(500).json({ error: 'Database error' });
  }
});

// ─── POST /api/admin/inject-snapshot ────────────────────────
// Election night: browser bookmarklet fetches ONPE data from within
// the ONPE domain and POSTs it here. ONPE's API is only accessible
// same-origin (Nginx internal proxy), so external Railway polling
// always gets HTML. The bookmarklet is the relay.
// Requires Authorization: Bearer <ADMIN_SECRET> header.
router.post('/admin/inject-snapshot', async (req, res) => {
  const adminSecret = process.env.ADMIN_SECRET;
  if (!adminSecret) {
    return res.status(503).json({ error: 'ADMIN_SECRET not configured on Railway' });
  }
  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  let authorized = false;
  try {
    authorized = token.length > 0 &&
      token.length === adminSecret.length &&
      crypto.timingSafeEqual(Buffer.from(token), Buffer.from(adminSecret));
  } catch { authorized = false; }
  if (!authorized) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const snap = req.body;
    if (typeof snap !== 'object' || snap === null) {
      return res.status(400).json({ error: 'Body must be a JSON object' });
    }
    if (snap.pct_actas != null && snap.pct_actas > 100) {
      return res.status(400).json({ error: 'pct_actas must be a percentage (0-100), not an absolute count' });
    }

    const hasData = snap.has_data === true &&
      ((snap.keiko_votos > 0) || (snap.sanchez_votos > 0));

    const { rows: [{ id: snapshotId }] } = await db.query(
      `INSERT INTO onpe_live_snapshots
         (captured_at, has_data, actas_total, actas_processed, pct_actas,
          keiko_votos, keiko_pct, sanchez_votos, sanchez_pct,
          dept_breakdown, province_breakdown, district_breakdown, ext_breakdown, totales_raw,
          pais_breakdown)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
       RETURNING id`,
      [
        snap.captured_at || new Date().toISOString(),
        hasData,
        snap.actas_total     ?? null,
        snap.actas_processed ?? null,
        snap.pct_actas       ?? null,
        snap.keiko_votos     ?? null,
        snap.keiko_pct       ?? null,
        snap.sanchez_votos   ?? null,
        snap.sanchez_pct     ?? null,
        JSON.stringify(snap.dept_breakdown     || []),
        JSON.stringify(snap.province_breakdown || []),
        JSON.stringify(snap.district_breakdown || []),
        JSON.stringify(snap.ext_breakdown      || []),
        snap.totales_raw ? JSON.stringify(snap.totales_raw) : null,
        JSON.stringify(snap.pais_breakdown     || []),
      ]
    );

    if (hasData) {
      const pCnt = Array.isArray(snap.province_breakdown) ? snap.province_breakdown.length : 0;
      const dCnt = Array.isArray(snap.district_breakdown) ? snap.district_breakdown.length : 0;
      console.log(
        `📊 ONPE inject [bookmarklet]: K=${snap.keiko_pct}% S=${snap.sanchez_pct}%` +
        ` actas=${snap.pct_actas ?? '?'}% depts=${snap.dept_breakdown?.length ?? 0}` +
        ` provs=${pCnt} dists=${dCnt}`
      );
      const { project } = require('../model/electionNightProjector');
      try {
        const pr = project({
          pct_actas:          snap.pct_actas          ?? 0,
          keiko_votos:        snap.keiko_votos         ?? 0,
          sanchez_votos:      snap.sanchez_votos       ?? 0,
          dept_breakdown:     Array.isArray(snap.dept_breakdown)     ? snap.dept_breakdown     : [],
          province_breakdown: Array.isArray(snap.province_breakdown) ? snap.province_breakdown : [],
          district_breakdown: Array.isArray(snap.district_breakdown) ? snap.district_breakdown : [],
          ext_breakdown:      Array.isArray(snap.ext_breakdown)      ? snap.ext_breakdown      : [],
          pais_breakdown:     Array.isArray(snap.pais_breakdown)     ? snap.pais_breakdown     : [],
          captured_at:        snap.captured_at,
        });
        if (pr.status === 'ok') {
          await db.query(
            `INSERT INTO r2_election_projections
               (snapshot_id, pct_actas, phase,
                obs_kf_r2_share, obs_keiko_votos, obs_sanchez_votos,
                proj_kf_r2_share, proj_ci95_lo, proj_ci95_hi, proj_ci80_lo, proj_ci80_hi,
                proj_winner, proj_margin_pp, proj_sigma_pp,
                zda_correction_applied, zda_remaining_mesas, zda_proj_kf_r2_share, zda_effect_pp,
                national_shift_pp, shift_granularity, dept_shifts, province_shifts, district_shifts, full_result)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24)`,
            [
              snapshotId, pr.pct_actas, pr.phase,
              pr.observed.kf_r2_share, pr.observed.keiko_votos, pr.observed.sanchez_votos,
              pr.projected.kf_r2_share, pr.projected.ci_95.lo, pr.projected.ci_95.hi,
              pr.projected.ci_80.lo, pr.projected.ci_80.hi,
              pr.projected.winner, pr.projected.margin_pp, pr.projected.sigma_pp,
              pr.zda.always_projected, pr.zda.remaining_mesas,
              pr.zda.proj_kf_r2_share, pr.zda.effect_pp,
              pr.national_shift_pp, pr.shift_granularity,
              JSON.stringify(pr.dept_shifts),
              JSON.stringify(pr.province_shifts),
              JSON.stringify(pr.district_shifts),
              JSON.stringify(pr),
            ]
          );
        }
      } catch (projErr) {
        console.error('📊 Projection save failed:', projErr.message);
      }
    } else {
      console.log('📊 ONPE inject [bookmarklet]: sin datos (has_data=false)');
    }

    res.json({ ok: true, snapshot_id: snapshotId, has_data: hasData });
  } catch (err) {
    console.error('📊 Error en inject-snapshot:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/admin/re-project-all ─────────────────────────
// Re-runs the current projector on every stored snapshot to fix historical
// chart lines after a projector code change. Safe to call multiple times.
router.post('/admin/re-project-all', async (req, res) => {
  const adminSecret = process.env.ADMIN_SECRET;
  if (!adminSecret || req.headers.authorization !== `Bearer ${adminSecret}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { project } = require('../model/electionNightProjector');

  const { rows: snapshots } = await db.query(
    `SELECT * FROM onpe_live_snapshots WHERE has_data = true ORDER BY captured_at ASC`
  );

  let updated = 0, skipped = 0, failed = 0;
  for (const s of snapshots) {
    try {
      // Reconstruct pct_actas with same fallback used in live-projection
      let pct = s.pct_actas != null ? parseFloat(s.pct_actas) : 0;
      if (pct < 0.1 && s.actas_processed > 0 && s.actas_total > 0) {
        pct = parseFloat((s.actas_processed / s.actas_total * 100).toFixed(2));
      }
      if (pct < 0.1 && Array.isArray(s.dept_breakdown) && s.dept_breakdown.length > 0) {
        const sp = s.dept_breakdown.reduce((a, d) => a + (d.actas_procesadas || 0), 0);
        const st = s.dept_breakdown.reduce((a, d) => a + (d.actas_total || 0), 0);
        if (st > 0) pct = parseFloat((sp / st * 100).toFixed(2));
      }

      const snap = {
        pct_actas:          pct,
        keiko_votos:        s.keiko_votos   != null ? parseInt(s.keiko_votos)   : 0,
        sanchez_votos:      s.sanchez_votos != null ? parseInt(s.sanchez_votos) : 0,
        dept_breakdown:     Array.isArray(s.dept_breakdown)     ? s.dept_breakdown     : [],
        province_breakdown: Array.isArray(s.province_breakdown) ? s.province_breakdown : [],
        district_breakdown: Array.isArray(s.district_breakdown) ? s.district_breakdown : [],
        ext_breakdown:      Array.isArray(s.ext_breakdown)      ? s.ext_breakdown      : [],
        pais_breakdown:     Array.isArray(s.pais_breakdown)     ? s.pais_breakdown     : [],
        captured_at:        s.captured_at,
      };

      const pr = project(snap);
      if (pr.status !== 'ok') { skipped++; continue; }

      await db.query(`DELETE FROM r2_election_projections WHERE snapshot_id = $1`, [s.id]);
      await db.query(
        `INSERT INTO r2_election_projections
           (snapshot_id, pct_actas, phase,
            obs_kf_r2_share, obs_keiko_votos, obs_sanchez_votos,
            proj_kf_r2_share, proj_ci95_lo, proj_ci95_hi, proj_ci80_lo, proj_ci80_hi,
            proj_winner, proj_margin_pp, proj_sigma_pp,
            zda_correction_applied, zda_remaining_mesas, zda_proj_kf_r2_share, zda_effect_pp,
            national_shift_pp, shift_granularity, dept_shifts, province_shifts, district_shifts, full_result)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24)`,
        [
          s.id, pr.pct_actas, pr.phase,
          pr.observed.kf_r2_share, pr.observed.keiko_votos, pr.observed.sanchez_votos,
          pr.projected.kf_r2_share, pr.projected.ci_95.lo, pr.projected.ci_95.hi,
          pr.projected.ci_80.lo, pr.projected.ci_80.hi,
          pr.projected.winner, pr.projected.margin_pp, pr.projected.sigma_pp,
          pr.zda.always_projected, pr.zda.remaining_mesas,
          pr.zda.proj_kf_r2_share, pr.zda.effect_pp,
          pr.national_shift_pp, pr.shift_granularity,
          JSON.stringify(pr.dept_shifts),
          JSON.stringify(pr.province_shifts),
          JSON.stringify(pr.district_shifts),
          JSON.stringify(pr),
        ]
      );
      updated++;
    } catch (e) {
      failed++;
    }
  }

  res.json({ ok: true, total: snapshots.length, updated, skipped, failed });
});

// ─── DELETE /api/admin/snapshots ────────────────────────────
// Limpia snapshots de prueba antes del 7J. Requiere ADMIN_SECRET.
router.delete('/admin/snapshots', async (req, res) => {
  const adminSecret = process.env.ADMIN_SECRET;
  if (!adminSecret) {
    return res.status(503).json({ error: 'ADMIN_SECRET not configured on Railway' });
  }
  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  let authorized = false;
  try {
    authorized = token.length > 0 &&
      token.length === adminSecret.length &&
      crypto.timingSafeEqual(Buffer.from(token), Buffer.from(adminSecret));
  } catch { authorized = false; }
  if (!authorized) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const { rowCount: s } = await db.query(`DELETE FROM onpe_live_snapshots`);
    let p = 0;
    try {
      const r = await db.query(`DELETE FROM r2_election_projections`);
      p = r.rowCount;
    } catch { /* table may not exist yet */ }
    console.log(`🧹 Admin: deleted ${s} snapshots, ${p} projections`);
    res.json({ ok: true, snapshots_deleted: s, projections_deleted: p });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/results/onpe ─────────────────────────────────
// Insertar resultados oficiales ONPE para post-mortem — requiere ADMIN_SECRET
router.post('/results/onpe', async (req, res) => {
  const adminSecret = process.env.ADMIN_SECRET;
  if (!adminSecret) {
    return res.status(503).json({ error: 'ADMIN_SECRET not configured on Railway' });
  }
  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  let authorized = false;
  try {
    authorized = token.length > 0 &&
      token.length === adminSecret.length &&
      crypto.timingSafeEqual(Buffer.from(token), Buffer.from(adminSecret));
  } catch { authorized = false; }
  if (!authorized) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const { election_year, round, results } = req.body;
    if (!election_year || !round || !results || !Array.isArray(results)) {
      return res.status(400).json({ error: 'Faltan campos: election_year, round, results[]' });
    }

    let inserted = 0;
    for (const r of results) {
      await db.query(
        `INSERT INTO historical_results (election_year, round, candidate, party, pct_actual, pct_valid_actual)
         VALUES ($1, $2, $3, $4, $5, $5)`,
        [election_year, round, r.candidate, r.party || null, r.valid_vote_pct]
      );
      inserted++;
    }

    console.log(`✅ Resultados ONPE insertados: ${inserted} candidatos (${election_year} ronda ${round})`);
    res.json({ success: true, inserted });
  } catch (err) {
    console.error('Error insertando resultados ONPE:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
