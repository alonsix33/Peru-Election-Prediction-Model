-- Seed R2: Updated pollster weights (based on R1 accuracy) + second-round polls + antivoto.
-- Idempotent: safe to run multiple times.

-- Tabla antivoto_snapshots: historial de rechazo definitivo por candidato.
-- Se usa en el modelo y en el frontend. Agrega nuevas filas cuando salgan nuevas encuestas.
CREATE TABLE IF NOT EXISTS antivoto_snapshots (
  id             SERIAL PRIMARY KEY,
  election_round INT          DEFAULT 2,
  candidate      VARCHAR(100) NOT NULL,
  pct_no         NUMERIC(5,2) NOT NULL,  -- % que "definitivamente no votaría" por este candidato
  pollster_id    INT          REFERENCES pollsters(id),
  field_end      DATE         NOT NULL,
  published_date DATE,
  notes          TEXT,
  created_at     TIMESTAMPTZ  DEFAULT NOW()
);

-- Antivoto R1: datos históricos de rechazo durante la campaña de primera vuelta.
-- Fuente Ipsos 21-22 mar 2026 y CIT 20-23 mar 2026.
-- Permite mostrar la trayectoria completa: R1 → post-R1 → R2.
DO $$
DECLARE
  ipsos_id INT;
  cit_id INT;
BEGIN
  SELECT id INTO ipsos_id FROM pollsters WHERE name = 'Ipsos';
  SELECT id INTO cit_id FROM pollsters WHERE name = 'CIT';

  -- Ipsos 21-22 mar (durante campaña R1): Keiko 59%, Sánchez 41%
  IF NOT EXISTS (
    SELECT 1 FROM antivoto_snapshots
    WHERE candidate = 'Keiko Fujimori' AND field_end = '2026-03-22' AND election_round = 1
  ) THEN
    INSERT INTO antivoto_snapshots (election_round, candidate, pct_no, pollster_id, field_end, published_date, notes)
    VALUES (1, 'Keiko Fujimori', 59.0, ipsos_id, '2026-03-22', '2026-03-24',
            'Ipsos 21-22 mar 2026. Campaña primera vuelta. Usado como referencia en modelo undecided.js.');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM antivoto_snapshots
    WHERE candidate = 'Roberto Sánchez Palomino' AND field_end = '2026-03-22' AND election_round = 1
  ) THEN
    INSERT INTO antivoto_snapshots (election_round, candidate, pct_no, pollster_id, field_end, published_date, notes)
    VALUES (1, 'Roberto Sánchez Palomino', 41.0, ipsos_id, '2026-03-22', '2026-03-24',
            'Ipsos 21-22 mar 2026. Campaña primera vuelta. Alta NS/NP en ese momento (~30%).');
  END IF;

  -- CIT 20-23 mar (simulacro R1): Keiko 62.7%, Sánchez 48%
  IF NOT EXISTS (
    SELECT 1 FROM antivoto_snapshots
    WHERE candidate = 'Keiko Fujimori' AND field_end = '2026-03-23' AND election_round = 1
  ) THEN
    INSERT INTO antivoto_snapshots (election_round, candidate, pct_no, pollster_id, field_end, published_date, notes)
    VALUES (1, 'Keiko Fujimori', 62.7, cit_id, '2026-03-23', '2026-03-25',
            'CIT simulacro 20-23 mar 2026. Rechazo más alto medido — coincide con pico de campaña. Promedio CIT+Ipsos: 60.5%.');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM antivoto_snapshots
    WHERE candidate = 'Roberto Sánchez Palomino' AND field_end = '2026-03-23' AND election_round = 1
  ) THEN
    INSERT INTO antivoto_snapshots (election_round, candidate, pct_no, pollster_id, field_end, published_date, notes)
    VALUES (1, 'Roberto Sánchez Palomino', 48.0, cit_id, '2026-03-23', '2026-03-25',
            'CIT simulacro 20-23 mar 2026. Estimado — Sánchez tenía alta NS/NP en esa fecha. Promedio CIT+Ipsos: 44.2%.');
  END IF;
END $$;

-- Update pollster weights based on R1 2026 conteo rápido performance.
-- Ipsos: MAE 0.28pp (best), Datum: MAE 2.0pp (second best).
UPDATE pollsters SET
  weight_multiplier = 1.30,
  notes = 'Ipsos. MAE 0.28pp en conteo rápido R1 2026 — mejor cobertura geográfica nacional. Base de referencia para segunda vuelta.'
WHERE name = 'Ipsos';

UPDATE pollsters SET
  weight_multiplier = 1.05,
  notes = 'Datum. MAE 2.0pp en conteo rápido R1 2026. Muestra grande (n=3000). Penalizado por sesgo urbano en selección de mesas.'
WHERE name = 'Datum';

-- Ipsos April 23-24, 2026: first R2 head-to-head poll.
-- Keiko 38%, Sánchez 38% (empate técnico). Blanco/viciado real: 17%. NS/NP: 7%.
-- Fix pct_blank_null for any existing record inserted with the wrong value (24.0).
UPDATE polls SET
  pct_blank_null = 17.0,
  pct_undecided = 24.0,
  notes = 'Ipsos segunda vuelta abr 23-24 2026. Empate técnico 38-38. Voto blanco/viciado: 17%, NS/NP: 7% (total no comprometido 24%). Primera encuesta post-primera vuelta.'
WHERE pollster_id = (SELECT id FROM pollsters WHERE name = 'Ipsos')
  AND field_end = '2026-04-24'
  AND election_round = 2;

DO $$
DECLARE
  p_id INT;
  poll_id INT;
BEGIN
  SELECT id INTO p_id FROM pollsters WHERE name = 'Ipsos';

  IF NOT EXISTS (
    SELECT 1 FROM polls WHERE pollster_id = p_id AND field_end = '2026-04-24' AND election_round = 2
  ) THEN
    INSERT INTO polls (pollster_id, field_start, field_end, published_date, sample_n, margin_error,
                       confidence_lvl, scope, technique, poll_type,
                       pct_undecided, pct_blank_null, notes, election_round)
    VALUES (p_id, '2026-04-23', '2026-04-24', '2026-04-26', 1200, 2.80, 95.0,
            'nacional', 'presencial', 'intencion_voto',
            24.0, 17.0,
            'Ipsos segunda vuelta abr 23-24 2026. Empate técnico 38-38. Voto blanco/viciado: 17%, NS/NP: 7% (total no comprometido 24%). Primera encuesta post-primera vuelta.',
            2)
    RETURNING id INTO poll_id;

    INSERT INTO poll_results (poll_id, candidate, party, pct_raw) VALUES
      (poll_id, 'Keiko Fujimori', 'Fuerza Popular', 38.0),
      (poll_id, 'Roberto Sánchez Palomino', 'Juntos por el Perú', 38.0);
  END IF;
END $$;

-- IEP April 21-25, 2026: intención de voto segunda vuelta.
-- Keiko 31%, Sánchez 32% (intención bruta). Blanco/nulo 24%, NS/NP 13%.
-- En votos válidos (excl. B/N+NS/NP): Sánchez 50.8%, Keiko 49.2%.
-- Nota: IEP emitió comunicado el 16/05/2026 aclarando que no existía encuesta de mayo
-- en ese momento (respondía a una fake circulando). La encuesta real de mayo se realizó
-- el 22-26 mayo 2026 y fue publicada el 28 mayo 2026 (ver bloque siguiente).
-- Cleanup: borra registros IEP R2 con field_end entre 1-21 mayo (fake anteriores).
-- Se excluye '2026-05-22'..'2026-05-31' porque ahí cae la encuesta real de mayo 22-26.
DO $$
DECLARE
  p_id INT;
  bad_id INT;
  poll_id INT;
BEGIN
  SELECT id INTO p_id FROM pollsters WHERE name = 'IEP';
  IF p_id IS NULL THEN RETURN; END IF;

  -- Borrar registros IEP R2 con fechas falsas (1-21 mayo)
  FOR bad_id IN
    SELECT id FROM polls
    WHERE pollster_id = p_id AND election_round = 2
      AND field_end BETWEEN '2026-05-01' AND '2026-05-21'
  LOOP
    DELETE FROM poll_results WHERE poll_id = bad_id;
    DELETE FROM polls WHERE id = bad_id;
  END LOOP;

  -- Insertar el registro correcto si no existe
  IF NOT EXISTS (
    SELECT 1 FROM polls WHERE pollster_id = p_id AND field_end = '2026-04-25' AND election_round = 2
  ) THEN
    INSERT INTO polls (pollster_id, field_start, field_end, published_date, sample_n, margin_error,
                       confidence_lvl, scope, technique, poll_type,
                       pct_undecided, pct_blank_null, notes, election_round)
    VALUES (p_id, '2026-04-21', '2026-04-25', '2026-05-02', 1600, 2.80, 95.0,
            'nacional', 'telefonica', 'intencion_voto',
            13.0, 24.0,
            'IEP abr 21-25 2026 (Abril III-26). Intención de voto segunda vuelta: Sánchez 32%, Keiko 31%, B/N 24%, NS/NP 13%. Opciones Blanco/Nulo SÍ se leyeron. En votos válidos: Sánchez 50.8%, Keiko 49.2%.',
            2)
    RETURNING id INTO poll_id;

    INSERT INTO poll_results (poll_id, candidate, party, pct_raw) VALUES
      (poll_id, 'Keiko Fujimori', 'Fuerza Popular', 31.0),
      (poll_id, 'Roberto Sánchez Palomino', 'Juntos por el Perú', 32.0);
  END IF;
END $$;

-- Antivoto R2: snapshots de rechazo definitivo (Ipsos para segunda vuelta 2026).
-- Punto 1: 2 de abril (pre-confirmación de candidatos).
-- Punto 2: 23-24 de abril (post-primera vuelta, primera encuesta cabeza a cabeza).
DO $$
DECLARE
  ipsos_id INT;
BEGIN
  SELECT id INTO ipsos_id FROM pollsters WHERE name = 'Ipsos';

  -- 2 abril: Keiko 59%, Sánchez 39%
  IF NOT EXISTS (
    SELECT 1 FROM antivoto_snapshots
    WHERE candidate = 'Keiko Fujimori' AND field_end = '2026-04-02' AND election_round = 2
  ) THEN
    INSERT INTO antivoto_snapshots (election_round, candidate, pct_no, pollster_id, field_end, published_date, notes)
    VALUES (2, 'Keiko Fujimori', 59.0, ipsos_id, '2026-04-02', '2026-04-02',
            'Ipsos 2 abr 2026. Pre-primera vuelta. Rechazo definitivo previo a que Keiko confirmara segunda vuelta.');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM antivoto_snapshots
    WHERE candidate = 'Roberto Sánchez Palomino' AND field_end = '2026-04-02' AND election_round = 2
  ) THEN
    INSERT INTO antivoto_snapshots (election_round, candidate, pct_no, pollster_id, field_end, published_date, notes)
    VALUES (2, 'Roberto Sánchez Palomino', 39.0, ipsos_id, '2026-04-02', '2026-04-02',
            'Ipsos 2 abr 2026. Pre-primera vuelta. 30% adicional no lo conocía aún.');
  END IF;

  -- 23-24 abril: Keiko 48%, Sánchez 43%
  IF NOT EXISTS (
    SELECT 1 FROM antivoto_snapshots
    WHERE candidate = 'Keiko Fujimori' AND field_end = '2026-04-24' AND election_round = 2
  ) THEN
    INSERT INTO antivoto_snapshots (election_round, candidate, pct_no, pollster_id, field_end, published_date, notes)
    VALUES (2, 'Keiko Fujimori', 48.0, ipsos_id, '2026-04-24', '2026-04-26',
            'Ipsos 23-24 abr 2026. Bajó 11pp desde el 2 abr — mejor registro en segunda vuelta. Sigue siendo el más alto.');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM antivoto_snapshots
    WHERE candidate = 'Roberto Sánchez Palomino' AND field_end = '2026-04-24' AND election_round = 2
  ) THEN
    INSERT INTO antivoto_snapshots (election_round, candidate, pct_no, pollster_id, field_end, published_date, notes)
    VALUES (2, 'Roberto Sánchez Palomino', 43.0, ipsos_id, '2026-04-24', '2026-04-26',
            'Ipsos 23-24 abr 2026. Subió 4pp desde el 2 abr a medida que fue conociéndose (NS/NP bajó del 30% al 5%).');
  END IF;
END $$;

-- ── Ipsos segunda medición R2: mayo 2026 ────────────────────
-- "Segunda medición (May.2026)". Keiko 39%, Sánchez 35% (intención bruta).
-- Blanco/viciado 14%, NS/NP 12%. Muestra: 1,210. Publicado: 20 may 2026.
-- Geográfico: Keiko domina Lima (54 vs 23); Sánchez lidera interior (41 vs 32),
-- rural (49 vs 26) y sur (59 vs 14). Keiko lidera norte (39 vs 28) y oriente (40 vs 36).
DO $$
DECLARE
  p_id INT;
  poll_id INT;
BEGIN
  SELECT id INTO p_id FROM pollsters WHERE name = 'Ipsos';

  IF NOT EXISTS (
    SELECT 1 FROM polls WHERE pollster_id = p_id AND field_end = '2026-05-17' AND election_round = 2
  ) THEN
    INSERT INTO polls (pollster_id, field_start, field_end, published_date, sample_n, margin_error,
                       confidence_lvl, scope, technique, poll_type,
                       pct_undecided, pct_blank_null, notes, election_round)
    VALUES (p_id, '2026-05-15', '2026-05-17', '2026-05-20', 1210, 2.80, 95.0,
            'nacional', 'presencial', 'intencion_voto',
            26.0, 14.0,
            'Ipsos segunda medición R2 may 2026. Keiko 39%, Sánchez 35%, blanco/viciado 14%, NS/NP 12%. Keiko domina Lima (54 vs 23); Sánchez lidera interior (41 vs 32) y rural (49 vs 26). Sur: Sánchez 59 vs Keiko 14. Antivoto: KF B2B 48% (Def.no 44%), RSP B2B 47% (Def.no 40%).',
            2)
    RETURNING id INTO poll_id;

    INSERT INTO poll_results (poll_id, candidate, party, pct_raw) VALUES
      (poll_id, 'Keiko Fujimori',           'Fuerza Popular',     39.0),
      (poll_id, 'Roberto Sánchez Palomino', 'Juntos por el Perú', 35.0);
  END IF;
END $$;

-- ── Antivoto R2: historial completo Ipsos potencial electoral ─
-- pct_no = "Definitivamente no votaría" (hard rejection, no incluye "probablemente no").
-- B2B total (Def.no + Prob.no) se documenta en las notas de cada entrada.
-- 5 feb y 27 mar: hipotético escenario R2 durante campaña de primera vuelta.
DO $$
DECLARE
  ipsos_id INT;
BEGIN
  SELECT id INTO ipsos_id FROM pollsters WHERE name = 'Ipsos';

  -- 5 febrero: Sánchez aún muy desconocido (68% NS/NP). Keiko ya con alto rechazo.
  IF NOT EXISTS (
    SELECT 1 FROM antivoto_snapshots
    WHERE candidate = 'Keiko Fujimori' AND field_end = '2026-02-05' AND election_round = 2
  ) THEN
    INSERT INTO antivoto_snapshots (election_round, candidate, pct_no, pollster_id, field_end, published_date, notes)
    VALUES (2, 'Keiko Fujimori', 64.0, ipsos_id, '2026-02-05', '2026-02-07',
            'Ipsos 5 feb 2026. Hipotético R2. Def.no=64%, Prob.no=12% → B2B=76%. T2B=19%.');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM antivoto_snapshots
    WHERE candidate = 'Roberto Sánchez Palomino' AND field_end = '2026-02-05' AND election_round = 2
  ) THEN
    INSERT INTO antivoto_snapshots (election_round, candidate, pct_no, pollster_id, field_end, published_date, notes)
    VALUES (2, 'Roberto Sánchez Palomino', 7.0, ipsos_id, '2026-02-05', '2026-02-07',
            'Ipsos 5 feb 2026. Hipotético R2. 68% no lo conocía. Def.no≈7%, Prob.no≈17% → B2B=24%. T2B=7%.');
  END IF;

  -- 27 marzo
  IF NOT EXISTS (
    SELECT 1 FROM antivoto_snapshots
    WHERE candidate = 'Keiko Fujimori' AND field_end = '2026-03-27' AND election_round = 2
  ) THEN
    INSERT INTO antivoto_snapshots (election_round, candidate, pct_no, pollster_id, field_end, published_date, notes)
    VALUES (2, 'Keiko Fujimori', 58.0, ipsos_id, '2026-03-27', '2026-03-29',
            'Ipsos 27 mar 2026. Hipotético R2. Def.no=58%, Prob.no=9% → B2B=67%. T2B=23%.');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM antivoto_snapshots
    WHERE candidate = 'Roberto Sánchez Palomino' AND field_end = '2026-03-27' AND election_round = 2
  ) THEN
    INSERT INTO antivoto_snapshots (election_round, candidate, pct_no, pollster_id, field_end, published_date, notes)
    VALUES (2, 'Roberto Sánchez Palomino', 32.0, ipsos_id, '2026-03-27', '2026-03-29',
            'Ipsos 27 mar 2026. Hipotético R2. Def.no=32%, Prob.no=10% → B2B=42%. T2B=13%. NS/NP 39%.');
  END IF;

  -- 17 mayo: nueva medición con candidatos confirmados en segunda vuelta
  IF NOT EXISTS (
    SELECT 1 FROM antivoto_snapshots
    WHERE candidate = 'Keiko Fujimori' AND field_end = '2026-05-17' AND election_round = 2
  ) THEN
    INSERT INTO antivoto_snapshots (election_round, candidate, pct_no, pollster_id, field_end, published_date, notes)
    VALUES (2, 'Keiko Fujimori', 44.0, ipsos_id, '2026-05-17', '2026-05-20',
            'Ipsos 17 may 2026. Segunda medición R2. Def.no=44%, Prob.no=4% → B2B=48%. T2B=44% (Def.28%+Pod.16%). Mínimo histórico: bajó 20pp desde feb 2026.');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM antivoto_snapshots
    WHERE candidate = 'Roberto Sánchez Palomino' AND field_end = '2026-05-17' AND election_round = 2
  ) THEN
    INSERT INTO antivoto_snapshots (election_round, candidate, pct_no, pollster_id, field_end, published_date, notes)
    VALUES (2, 'Roberto Sánchez Palomino', 40.0, ipsos_id, '2026-05-17', '2026-05-20',
            'Ipsos 17 may 2026. Segunda medición R2. Def.no=40%, Prob.no=7% → B2B=47%. T2B=39% (Def.23%+Pod.16%). Bajó 3pp desde abr.');
  END IF;
END $$;

-- ── Datum segunda vuelta: mayo 2026 ────────────────────────
-- Datum / El Comercio. Intención de voto segunda vuelta.
-- Keiko 39.5%, Sánchez 36.1%, Blanco/viciado 15.9%, NS/NP 8.5%.
-- Campo: 17-20 mayo 2026. Publicado: 22 mayo 2026. n=1200, ±2.8%, nivel confianza 95%.
-- Geográfico: Lima/Callao (K 48.8 vs S 25.6), Norte (41.1 vs 36.4),
-- Centro (30.1 vs 47.3), Sur (27.9 vs 44.7), Oriente (33.0 vs 45.2).
DO $$
DECLARE
  p_id INT;
  poll_id INT;
BEGIN
  SELECT id INTO p_id FROM pollsters WHERE name = 'Datum';

  IF NOT EXISTS (
    SELECT 1 FROM polls WHERE pollster_id = p_id AND field_end = '2026-05-20' AND election_round = 2
  ) THEN
    INSERT INTO polls (pollster_id, field_start, field_end, published_date, sample_n, margin_error,
                       confidence_lvl, scope, technique, poll_type,
                       pct_undecided, pct_blank_null, notes, election_round)
    VALUES (p_id, '2026-05-17', '2026-05-20', '2026-05-22', 1200, 2.80, 95.0,
            'nacional', 'presencial', 'intencion_voto',
            8.5, 15.9,
            'Datum R2 may 2026. Keiko 39.5%, Sánchez 36.1%, B/V 15.9%, NS/NP 8.5%. Geográfico: Lima/Callao (K 48.8 vs S 25.6), Norte (K 41.1 vs S 36.4), Centro (K 30.1 vs S 47.3), Sur (K 27.9 vs S 44.7), Oriente (K 33.0 vs S 45.2).',
            2)
    RETURNING id INTO poll_id;

    INSERT INTO poll_results (poll_id, candidate, party, pct_raw) VALUES
      (poll_id, 'Keiko Fujimori',           'Fuerza Popular',     39.5),
      (poll_id, 'Roberto Sánchez Palomino', 'Juntos por el Perú', 36.1);
  END IF;
END $$;

-- ── IEP tercera medición R2: mayo 22-26, 2026 ───────────────
-- IEP / La República. Intención de voto segunda vuelta.
-- Keiko 36%, Sánchez 30%, Blanco/Nulo 6%, Aún no decide 26%, No vota 2%.
-- Campo: 22-26 mayo 2026. Publicado: 28 mayo 2026. n=1204, ±2.8%, 95%.
-- METODOLOGÍA: en mayo-26 las opciones "Blanco" y "Nulo" NO se leyeron a los
-- encuestados (vs. sí en abr III-26). El 6% B/N son respuestas espontáneas
-- (Blanco 2.1% + Nulo 4.2%). El 26% de indecisos incluye: No decide 15.9%,
-- Ninguno 5.5%, No precisa 3.2%, Voto secreto 1.1%.
-- La caída de B/N 24%→6% y el alza de indecisos 13%→26% son en parte artefacto
-- metodológico, no señal real de cambio de intención.
-- En votos válidos (KF+RSP=66%): Keiko 54.5%, Sánchez 45.5%.
-- Geográfico: Lima KF 51%; Norte KF 32%; Centro RSP 40%; Sur RSP 35%;
-- Oriente RSP 38%; Rural RSP 42%, KF 21%.
DO $$
DECLARE
  p_id INT;
  poll_id INT;
BEGIN
  SELECT id INTO p_id FROM pollsters WHERE name = 'IEP';

  IF NOT EXISTS (
    SELECT 1 FROM polls WHERE pollster_id = p_id AND field_end = '2026-05-26' AND election_round = 2
  ) THEN
    INSERT INTO polls (pollster_id, field_start, field_end, published_date, sample_n, margin_error,
                       confidence_lvl, scope, technique, poll_type,
                       pct_undecided, pct_blank_null, notes, election_round)
    VALUES (p_id, '2026-05-22', '2026-05-26', '2026-05-28', 1204, 2.80, 95.0,
            'nacional', 'telefonica', 'intencion_voto',
            26.0, 6.0,
            'IEP may 22-26 2026. Intención de voto R2: Keiko 36%, Sánchez 30%, B/N 6% (espontáneo, no leído), Indecisos 26%, No vota 2%. NOTA: Blanco/Nulo no se leyó como opción → caída 24%→6% es artefacto metodológico. Indecisos 26% = No decide 15.9% + Ninguno 5.5% + No precisa 3.2% + Secreto 1.1%. V.v.: Keiko 54.5%, Sánchez 45.5%. Geog: Lima KF51%; Norte KF32%; Centro RSP40%; Sur RSP35%; Oriente RSP38%; Rural RSP42%/KF21%.',
            2)
    RETURNING id INTO poll_id;

    INSERT INTO poll_results (poll_id, candidate, party, pct_raw) VALUES
      (poll_id, 'Keiko Fujimori',           'Fuerza Popular',     36.0),
      (poll_id, 'Roberto Sánchez Palomino', 'Juntos por el Perú', 30.0);
  END IF;
END $$;

-- ── CIT segunda vuelta: mayo 2026 ───────────────────────────
-- CIT (Centro de Investigación Territorial). Simulacro: "Si las elecciones fueran mañana".
-- Keiko 40.5%, Sánchez 36%, Blanco/Viciado 23.5%. Sin NS/NR (100% distribuido).
-- En votos válidos: Keiko 52.9%, Sánchez 47.1%.
-- Campo: 14-17 mayo 2026. Publicado: 22 mayo 2026. n=1220, ±2.8%, nivel confianza 95%.
DO $$
DECLARE
  p_id INT;
  poll_id INT;
BEGIN
  SELECT id INTO p_id FROM pollsters WHERE name = 'CIT';

  IF NOT EXISTS (
    SELECT 1 FROM polls WHERE pollster_id = p_id AND field_end = '2026-05-17' AND election_round = 2
  ) THEN
    INSERT INTO polls (pollster_id, field_start, field_end, published_date, sample_n, margin_error,
                       confidence_lvl, scope, technique, poll_type,
                       pct_undecided, pct_blank_null, notes, election_round)
    VALUES (p_id, '2026-05-14', '2026-05-17', '2026-05-22', 1220, 2.80, 95.0,
            'nacional', 'presencial', 'simulacro',
            NULL, 23.5,
            'CIT simulacro R2 may 2026. "Si las elecciones fueran mañana": Keiko 40.5%, Sánchez 36%, B/N 23.5%. Sin NS/NR. Keiko domina Lima (60 vs 29) y Norte (37.4 vs 26.4); Sánchez lidera Sur (54.7 vs 16.5) y Centro (46.9 vs 20). V.v.: Keiko 52.9%, Sánchez 47.1%.',
            2)
    RETURNING id INTO poll_id;

    INSERT INTO poll_results (poll_id, candidate, party, pct_raw) VALUES
      (poll_id, 'Keiko Fujimori',           'Fuerza Popular',     40.5),
      (poll_id, 'Roberto Sánchez Palomino', 'Juntos por el Perú', 36.0);
  END IF;
END $$;

-- ── CPI segunda vuelta: mayo 26-28, 2026 ────────────────────
-- CPI / RPP. Intención de voto segunda vuelta (presencial, no simulacro).
-- Keiko 32.5%, Sánchez 29.1%, Blanco/Viciado 22.6%, Indecisos 13.4%, No vota 2.4%.
-- Campo: 26-28 mayo 2026. n=1200, ±2.8%, confianza 95.5%. 19 departamentos.
-- Blanco/Nulo SÍ se leyó como opción (comparable con IEP abr y Datum).
-- En votos válidos (KF+RSP=61.6%): Keiko 52.8%, Sánchez 47.2%.
-- Geog: Lima/Callao KF 45.6% vs RSP 19.7%; Norte KF 32.1% vs RSP 20.7%;
--        Oriente KF 36.8%; Sur costa RSP 42.8%; Sierra C/Sur RSP 53.3% vs KF 12.9%.
DO $$
DECLARE
  p_id INT;
  poll_id INT;
BEGIN
  SELECT id INTO p_id FROM pollsters WHERE name = 'CPI';

  IF NOT EXISTS (
    SELECT 1 FROM polls WHERE pollster_id = p_id AND field_end = '2026-05-28' AND election_round = 2
  ) THEN
    INSERT INTO polls (pollster_id, field_start, field_end, published_date, sample_n, margin_error,
                       confidence_lvl, scope, technique, poll_type,
                       pct_undecided, pct_blank_null, notes, election_round)
    VALUES (p_id, '2026-05-26', '2026-05-28', '2026-05-29', 1200, 2.80, 95.5,
            'nacional', 'presencial', 'intencion_voto',
            13.4, 22.6,
            'CPI R2 may 26-28 2026. Intención de voto: Keiko 32.5%, Sánchez 29.1%, B/V 22.6%, Indecisos 13.4%, No vota 2.4%. B/N sí se leyó como opción. V.v.: Keiko 52.8%, Sánchez 47.2%. Geog: Lima/Callao KF45.6%/RSP19.7%; Norte KF32.1%/RSP20.7%; Oriente KF36.8%; Sur costa RSP42.8%; Sierra C/Sur RSP53.3%/KF12.9%.',
            2)
    RETURNING id INTO poll_id;

    INSERT INTO poll_results (poll_id, candidate, party, pct_raw) VALUES
      (poll_id, 'Keiko Fujimori',           'Fuerza Popular',     32.5),
      (poll_id, 'Roberto Sánchez Palomino', 'Juntos por el Perú', 29.1);
  END IF;
END $$;
