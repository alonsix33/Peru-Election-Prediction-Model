-- Peru Election Prediction Model 2026
-- Seed data — Sección 5 del Master Plan v2
-- Generado: 2 abril 2026, hora Lima
-- Corregido: nombres de candidatos + IDs dinámicos con RETURNING

-- ============================================================
-- 5.1 ENCUESTADORAS Y PESOS HISTÓRICOS
-- ============================================================

INSERT INTO pollsters (id, name, historical_mae, weight_multiplier, notes) VALUES
  (1, 'IEP',   3.50, 1.25, 'Mejor track record 2021; única que captó crecimiento de Castillo; mayor cobertura rural'),
  (2, 'Datum', 4.20, 1.10, 'Mayor muestra (n=2000); ficha técnica más robusta'),
  (3, 'Ipsos', 4.80, 1.00, 'Referencia base; metodología consistente y documentada'),
  (4, 'CPI',   5.10, 0.95, 'Ligeramente menor precisión 2021'),
  (5, 'CIT',   NULL, 0.85, 'Sin data comparable 2021; penalización por incertidumbre');

-- ============================================================
-- 5.2 RESULTADOS REALES 2021 (GROUND TRUTH ONPE)
-- Primera vuelta — 11 abril 2021, votos válidos
-- ============================================================

INSERT INTO historical_results (election_year, round, candidate, party, pct_actual, pct_valid_actual) VALUES
  (2021, 1, 'Pedro Castillo',       'Perú Libre',         18.92, 18.92),
  (2021, 1, 'Keiko Fujimori',       'Fuerza Popular',     13.41, 13.41),
  (2021, 1, 'Rafael López Aliaga',  'Renovación Popular', 11.73, 11.73),
  (2021, 1, 'Hernando de Soto',     'Avanza País',        11.62, 11.62),
  (2021, 1, 'Yonhy Lescano',        'Acción Popular',      9.87,  9.87),
  (2021, 1, 'Verónica Mendoza',     'Juntos por el Perú',  8.84,  8.84),
  (2021, 1, 'César Acuña',          'APP',                 6.00,  6.00);

-- ============================================================
-- 5.5 DATASET COMPLETO DE ENCUESTAS 2026
-- Usa DO block + currval para IDs dinámicos
-- ============================================================

DO $$
DECLARE
  pid INT;
BEGIN

-- ------------------------------------------------------------
-- SERIE CPI (Presencial, Urb+Rural, n~1300, ME ±2.7-2.8%, Confianza 95.5%)
-- ------------------------------------------------------------

-- CPI Nov 2025
INSERT INTO polls (pollster_id, field_start, field_end, sample_n, margin_error, confidence_lvl, scope, technique, poll_type, pct_undecided, pct_blank_null, notes)
VALUES (4, '2025-11-01', '2025-11-30', 1300, 2.80, 95.5, 'nacional', 'presencial', 'intencion_voto', 30.70, 19.20, 'CPI Nov 2025 via RPP')
RETURNING id INTO pid;

INSERT INTO poll_results (poll_id, candidate, party, pct_raw) VALUES
  (pid, 'Rafael López Aliaga',  'Renovación Popular', 12.50),
  (pid, 'Keiko Fujimori',       'Fuerza Popular',      7.60),
  (pid, 'Carlos Álvarez',       NULL,                   4.00),
  (pid, 'López Chau',           NULL,                   1.80),
  (pid, 'César Acuña',          'APP',                  2.80),
  (pid, 'Yonhy Lescano',        'Acción Popular',       0.50);

-- CPI Ene I 2026
INSERT INTO polls (pollster_id, field_start, field_end, sample_n, margin_error, confidence_lvl, scope, technique, poll_type, notes)
VALUES (4, '2026-01-01', '2026-01-15', 1300, 2.80, 95.5, 'nacional', 'presencial', 'intencion_voto', 'CPI Ene I 2026 via RPP')
RETURNING id INTO pid;

INSERT INTO poll_results (poll_id, candidate, party, pct_raw) VALUES
  (pid, 'Rafael López Aliaga',  'Renovación Popular', 13.60),
  (pid, 'Keiko Fujimori',       'Fuerza Popular',      7.10),
  (pid, 'López Chau',           NULL,                   3.10),
  (pid, 'Jorge Nieto',          'Partido del Buen Gobierno', 0.20);

-- CPI 29 ene - 2 feb 2026
INSERT INTO polls (pollster_id, field_start, field_end, sample_n, margin_error, confidence_lvl, scope, technique, poll_type, pct_blank_null, notes)
VALUES (4, '2026-01-29', '2026-02-02', 1300, 2.70, 95.5, 'nacional', 'presencial', 'intencion_voto', 16.10, 'CPI 29ene-2feb 2026 via RPP')
RETURNING id INTO pid;

INSERT INTO poll_results (poll_id, candidate, party, pct_raw) VALUES
  (pid, 'Rafael López Aliaga',      'Renovación Popular',    14.60),
  (pid, 'Keiko Fujimori',           'Fuerza Popular',         6.60),
  (pid, 'López Chau',               NULL,                      3.70),
  (pid, 'Carlos Álvarez',           NULL,                      3.60),
  (pid, 'César Acuña',              'APP',                     3.90),
  (pid, 'Roberto Sánchez Palomino', 'Juntos por el Perú',     1.80);

-- CPI 14-18 feb 2026
INSERT INTO polls (pollster_id, field_start, field_end, sample_n, margin_error, confidence_lvl, scope, technique, poll_type, pct_undecided, pct_blank_null, notes)
VALUES (4, '2026-02-14', '2026-02-18', 1300, 2.70, 95.5, 'nacional', 'presencial', 'intencion_voto', 29.10, 16.10, 'CPI 14-18feb 2026 via RPP')
RETURNING id INTO pid;

INSERT INTO poll_results (poll_id, candidate, party, pct_raw) VALUES
  (pid, 'Rafael López Aliaga',      'Renovación Popular',    13.90),
  (pid, 'Keiko Fujimori',           'Fuerza Popular',         7.00),
  (pid, 'López Chau',               NULL,                      5.10),
  (pid, 'Carlos Álvarez',           NULL,                      4.00),
  (pid, 'Wolfgang Grozo',           NULL,                      0.60),
  (pid, 'Roberto Sánchez Palomino', 'Juntos por el Perú',     1.80),
  (pid, 'César Acuña',              'APP',                     4.40),
  (pid, 'Yonhy Lescano',            'Acción Popular',          2.20);

-- CPI 28feb-5mar 2026
INSERT INTO polls (pollster_id, field_start, field_end, sample_n, margin_error, confidence_lvl, scope, technique, poll_type, pct_undecided, notes)
VALUES (4, '2026-02-28', '2026-03-05', 1300, 2.70, 95.5, 'nacional', 'presencial', 'intencion_voto', 20.80, 'CPI 28feb-5mar 2026 via RPP')
RETURNING id INTO pid;

INSERT INTO poll_results (poll_id, candidate, party, pct_raw) VALUES
  (pid, 'Rafael López Aliaga',  'Renovación Popular', 12.70),
  (pid, 'Keiko Fujimori',       'Fuerza Popular',      8.00),
  (pid, 'López Chau',           NULL,                   5.60),
  (pid, 'Carlos Álvarez',       NULL,                   5.00),
  (pid, 'Wolfgang Grozo',       NULL,                   4.80),
  (pid, 'César Acuña',          'APP',                  3.40);

-- CPI 21-23 mar 2026
INSERT INTO polls (pollster_id, field_start, field_end, sample_n, margin_error, confidence_lvl, scope, technique, poll_type, pct_undecided, pct_blank_null, notes)
VALUES (4, '2026-03-21', '2026-03-23', 1300, 2.70, 95.5, 'nacional', 'presencial', 'intencion_voto', 23.10, 24.20, 'CPI 21-23mar 2026 via RPP')
RETURNING id INTO pid;

INSERT INTO poll_results (poll_id, candidate, party, pct_raw) VALUES
  (pid, 'Rafael López Aliaga',      'Renovación Popular',       11.70),
  (pid, 'Keiko Fujimori',           'Fuerza Popular',           10.10),
  (pid, 'López Chau',               NULL,                         6.60),
  (pid, 'Carlos Álvarez',           NULL,                         3.50),
  (pid, 'Jorge Nieto',              'Partido del Buen Gobierno',  3.90),
  (pid, 'Roberto Sánchez Palomino', 'Juntos por el Perú',        3.10),
  (pid, 'César Acuña',              'APP',                        3.20),
  (pid, 'Ricardo Belmont',          'Partido Cívico Obras',       2.10);  -- CPI informe oficial; confirmado

-- ------------------------------------------------------------
-- SERIE IPSOS (Presencial, Urb+Rural, n=1212, ME ±2.5%, Confianza 95%)
-- ------------------------------------------------------------

-- Ipsos Ene 2026
INSERT INTO polls (pollster_id, field_start, field_end, sample_n, margin_error, confidence_lvl, scope, technique, poll_type, notes)
VALUES (3, '2026-01-01', '2026-01-31', 1212, 2.50, 95.0, 'nacional', 'presencial', 'intencion_voto', 'Ipsos Ene 2026 via Peru21')
RETURNING id INTO pid;

INSERT INTO poll_results (poll_id, candidate, party, pct_raw) VALUES
  (pid, 'Rafael López Aliaga',  'Renovación Popular', 10.00),
  (pid, 'Keiko Fujimori',       'Fuerza Popular',      7.00);

-- Ipsos 5-6 feb 2026
INSERT INTO polls (pollster_id, field_start, field_end, sample_n, margin_error, confidence_lvl, scope, technique, poll_type, notes)
VALUES (3, '2026-02-05', '2026-02-06', 1212, 2.50, 95.0, 'nacional', 'presencial', 'intencion_voto', 'Ipsos 5-6feb 2026 via Peru21')
RETURNING id INTO pid;

INSERT INTO poll_results (poll_id, candidate, party, pct_raw) VALUES
  (pid, 'Rafael López Aliaga',  'Renovación Popular', 12.00),
  (pid, 'Keiko Fujimori',       'Fuerza Popular',      8.00),
  (pid, 'López Chau',           NULL,                   3.00);

-- Ipsos 6 mar 2026
INSERT INTO polls (pollster_id, field_start, field_end, sample_n, margin_error, confidence_lvl, scope, technique, poll_type, notes)
VALUES (3, '2026-03-06', '2026-03-06', 1212, 2.50, 95.0, 'nacional', 'presencial', 'intencion_voto', 'Ipsos 6mar 2026 via Peru21')
RETURNING id INTO pid;

INSERT INTO poll_results (poll_id, candidate, party, pct_raw) VALUES
  (pid, 'Rafael López Aliaga',  'Renovación Popular',  9.00),
  (pid, 'Keiko Fujimori',       'Fuerza Popular',       6.00),
  (pid, 'Carlos Álvarez',       NULL,                    6.00);

-- Ipsos 21-22 mar 2026
INSERT INTO polls (pollster_id, field_start, field_end, sample_n, margin_error, confidence_lvl, scope, technique, poll_type, pct_blank_null, notes)
VALUES (3, '2026-03-21', '2026-03-22', 1212, 2.50, 95.0, 'nacional', 'presencial', 'intencion_voto', 21.00, 'Ipsos 21-22mar 2026 via Peru21')
RETURNING id INTO pid;

INSERT INTO poll_results (poll_id, candidate, party, pct_raw) VALUES
  (pid, 'Rafael López Aliaga',      'Renovación Popular',          10.00),
  (pid, 'Keiko Fujimori',           'Fuerza Popular',              11.00),
  (pid, 'López Chau',               NULL,                            5.00),
  (pid, 'Carlos Álvarez',           NULL,                            5.00),
  (pid, 'Roberto Sánchez Palomino', 'Juntos por el Perú',           5.00),
  (pid, 'Jorge Nieto',              'Partido del Buen Gobierno',     5.00);

-- Ipsos 26-27 mar 2026
INSERT INTO polls (pollster_id, field_start, field_end, sample_n, margin_error, confidence_lvl, scope, technique, poll_type, pct_blank_null, notes)
VALUES (3, '2026-03-26', '2026-03-27', 1212, 2.50, 95.0, 'nacional', 'presencial', 'intencion_voto', 21.00, 'Ipsos 26-27mar 2026 via Peru21')
RETURNING id INTO pid;

INSERT INTO poll_results (poll_id, candidate, party, pct_raw) VALUES
  (pid, 'Rafael López Aliaga',      'Renovación Popular',           9.00),
  (pid, 'Keiko Fujimori',           'Fuerza Popular',              11.00),
  (pid, 'López Chau',               NULL,                            4.00),
  (pid, 'Carlos Álvarez',           NULL,                            7.00),
  (pid, 'Roberto Sánchez Palomino', 'Juntos por el Perú',           4.00),
  (pid, 'Jorge Nieto',              'Partido del Buen Gobierno',     5.00),
  (pid, 'Ricardo Belmont',          NULL,                            3.00),
  (pid, 'César Acuña',              'APP',                           3.00);

-- ------------------------------------------------------------
-- SERIE DATUM (Presencial, Urb+Rural, n=2000, ME ±2.2%, Confianza 95%)
-- ------------------------------------------------------------

-- Datum 13-17 mar 2026
INSERT INTO polls (pollster_id, field_start, field_end, sample_n, margin_error, confidence_lvl, scope, technique, poll_type, notes)
VALUES (2, '2026-03-13', '2026-03-17', 2000, 2.20, 95.0, 'nacional', 'presencial', 'intencion_voto', 'Datum 13-17mar 2026 via El Comercio/Cuarto Poder')
RETURNING id INTO pid;

INSERT INTO poll_results (poll_id, candidate, party, pct_raw) VALUES
  (pid, 'Rafael López Aliaga',      'Renovación Popular',        11.70),
  (pid, 'Keiko Fujimori',           'Fuerza Popular',            11.90),
  (pid, 'Carlos Álvarez',           NULL,                          4.50),
  (pid, 'Roberto Sánchez Palomino', 'Juntos por el Perú',         1.70),
  (pid, 'Ricardo Belmont',          NULL,                          2.40);

-- Datum 25-27 mar 2026 (intención de voto)
INSERT INTO polls (pollster_id, field_start, field_end, sample_n, margin_error, confidence_lvl, scope, technique, poll_type, notes)
VALUES (2, '2026-03-25', '2026-03-27', 2000, 2.20, 95.0, 'nacional', 'presencial', 'intencion_voto', 'Datum 25-27mar 2026 intencion via El Comercio')
RETURNING id INTO pid;

INSERT INTO poll_results (poll_id, candidate, party, pct_raw) VALUES
  (pid, 'Rafael López Aliaga',  'Renovación Popular', 11.70),
  (pid, 'Keiko Fujimori',       'Fuerza Popular',     13.00);

-- Datum 25-27 mar 2026 (simulacro)
INSERT INTO polls (pollster_id, field_start, field_end, sample_n, margin_error, confidence_lvl, scope, technique, poll_type, pct_blank_null, notes)
VALUES (2, '2026-03-25', '2026-03-27', 2000, 2.20, 95.0, 'nacional', 'presencial', 'simulacro', 28.90, 'Datum 25-27mar 2026 simulacro via El Comercio')
RETURNING id INTO pid;

INSERT INTO poll_results (poll_id, candidate, party, pct_raw) VALUES
  (pid, 'Rafael López Aliaga',      'Renovación Popular',         9.50),
  (pid, 'Keiko Fujimori',           'Fuerza Popular',            13.20),
  (pid, 'López Chau',               NULL,                          4.20),
  (pid, 'Carlos Álvarez',           NULL,                          6.30),
  (pid, 'Roberto Sánchez Palomino', 'Juntos por el Perú',         5.30),
  (pid, 'Jorge Nieto',              'Partido del Buen Gobierno',   4.90),
  (pid, 'Ricardo Belmont',          NULL,                          1.90);

-- ------------------------------------------------------------
-- CIT SIMULACRO (Presencial cédula réplica, n=1220, 20-23 mar)
-- ------------------------------------------------------------

INSERT INTO polls (pollster_id, field_start, field_end, sample_n, margin_error, confidence_lvl, scope, technique, poll_type, pct_blank_null, notes)
VALUES (5, '2026-03-20', '2026-03-23', 1220, 2.80, 95.0, 'nacional', 'presencial', 'simulacro', 22.50, 'CIT simulacro 20-23mar 2026 cédula réplica')
RETURNING id INTO pid;

INSERT INTO poll_results (poll_id, candidate, party, pct_raw) VALUES
  (pid, 'Rafael López Aliaga',      'Renovación Popular',         16.80),
  (pid, 'Keiko Fujimori',           'Fuerza Popular',             12.90),
  (pid, 'López Chau',               NULL,                           7.00),
  (pid, 'César Acuña',              'APP',                          6.30),
  (pid, 'Carlos Álvarez',           NULL,                           6.10),
  (pid, 'Wolfgang Grozo',           NULL,                           4.30),
  (pid, 'Yonhy Lescano',            'Acción Popular',               3.60),
  (pid, 'Jorge Nieto',              'Partido del Buen Gobierno',    3.00),
  (pid, 'Roberto Sánchez Palomino', 'Juntos por el Perú',          2.30),
  (pid, 'Ricardo Belmont',          'Partido Cívico Obras',         1.63); -- ~2.1% v.v. ÷ 77.5% pool

-- ------------------------------------------------------------
-- IEP INTENCIÓN (28-30 mar 2026) — última encuesta IEP pre-veda publicada
-- Fuente: PDF oficial IEP "Mar II-26". Metodología: Encuesta telefónica a celulares.
-- IEP realizó además encuesta 7-9 abr (durante veda, n=1219, confidencial, no publicada hasta 29 abr).
-- Pool correcto: 69.6% (top 11 candidatos 55.3% + Otros 14.3%). B/N=2.8%, NS/NP+ninguno=26.0%, ausentes=1.3%.
-- ------------------------------------------------------------

INSERT INTO polls (pollster_id, field_start, field_end, sample_n, margin_error, confidence_lvl, scope, technique, poll_type, notes)
VALUES (1, '2026-03-28', '2026-03-30', 1200, 2.80, 95.0, 'nacional', 'telefonica', 'intencion_voto', 'IEP Mar II-26 — campo 28-30 mar 2026 — Encuesta telefónica a celulares — fuente: PDF oficial IEP')
RETURNING id INTO pid;

INSERT INTO poll_results (poll_id, candidate, party, pct_raw) VALUES
  (pid, 'Rafael López Aliaga',      'Renovación Popular',          8.70),
  (pid, 'Keiko Fujimori',           'Fuerza Popular',             10.00),
  (pid, 'Carlos Álvarez',           NULL,                           6.90),
  (pid, 'Roberto Sánchez Palomino', 'Juntos por el Perú',          6.70),
  (pid, 'López Chau',               NULL,                           6.30),
  (pid, 'Jorge Nieto',              'Partido del Buen Gobierno',    5.40),
  (pid, 'Ricardo Belmont',          NULL,                           5.20),
  (pid, 'Yonhy Lescano',            'Acción Popular',               2.20),
  (pid, 'César Acuña',              'APP',                          2.20),
  (pid, 'Wolfgang Grozo',           NULL,                           1.10),
  (pid, 'Mario Vizcarra',           NULL,                           1.90);

-- ------------------------------------------------------------
-- IPSOS TRACKING DIARIO (campo 29 mar - 1 abr 2026)
-- Post-debates ronda 1 y 2 JNE. Dato más reciente antes de veda.
-- ------------------------------------------------------------

INSERT INTO polls (pollster_id, field_start, field_end, published_date, sample_n, margin_error, confidence_lvl, scope, technique, poll_type, pct_undecided, pct_blank_null, notes)
VALUES (3, '2026-03-29', '2026-04-01', '2026-04-03', 1203, 2.80, 95.0, 'nacional', 'presencial', 'intencion_voto', 14.00, 16.00, 'Tracking diario Ipsos para Perú21. Campo 29 mar - 1 abr 2026. Post-debates ronda 1 y 2 JNE. Dato más reciente antes de la veda electoral.')
RETURNING id INTO pid;

INSERT INTO poll_results (poll_id, candidate, party, pct_raw) VALUES
  (pid, 'Keiko Fujimori',           'Fuerza Popular',               12.00),
  (pid, 'Rafael López Aliaga',      'Renovación Popular',            8.00),
  (pid, 'Carlos Álvarez',           'País para Todos',               8.00),
  (pid, 'Roberto Sánchez Palomino', 'Juntos por el Perú',            6.00),
  (pid, 'Jorge Nieto',              'Partido del Buen Gobierno',     5.00),
  (pid, 'López Chau',               'Ahora Nación',                  4.00),
  (pid, 'César Acuña',              'APP',                           4.00),
  (pid, 'Ricardo Belmont',          'Partido Cívico Obras',          3.00),
  (pid, 'Marisol Pérez Tello',      'Primero la Gente',              2.00),
  (pid, 'George Forsyth',           'Somos Perú',                    2.00),
  (pid, 'Yonhy Lescano',            'Cooperación Popular',           2.00),
  (pid, 'Carlos Espá',              'SíCreo',                        2.00);

-- ============================================================
-- ÚLTIMAS ENCUESTAS PRE-VEDA R1 2026 (campo abr 2026)
-- Publicadas el 5 de abril de 2026 — última fecha permitida antes de la veda.
-- ============================================================

-- ------------------------------------------------------------
-- CIT SIMULACRO (campo 30 mar – 1 abr 2026, publicado 5 abr en Panorama)
-- n=1500, B/N=23.4%, pool=76.6%. Informe oficial CIT.
-- Más reciente que el CIT de 20-23 mar (arriba). ESTE es el último CIT pre-veda.
-- ------------------------------------------------------------

INSERT INTO polls (pollster_id, field_start, field_end, published_date, sample_n, margin_error, confidence_lvl, scope, technique, poll_type, pct_blank_null, notes)
VALUES (5, '2026-03-30', '2026-04-01', '2026-04-05', 1500, 2.80, 95.0, 'nacional', 'presencial', 'simulacro', 23.40, 'CIT simulacro 30mar-1abr 2026 · publicado 5 abr Panorama · cédula réplica · última encuesta pre-veda CIT')
RETURNING id INTO pid;

INSERT INTO poll_results (poll_id, candidate, party, pct_raw) VALUES
  (pid, 'Rafael López Aliaga',      'Renovación Popular',         13.60),
  (pid, 'Keiko Fujimori',           'Fuerza Popular',             13.10),
  (pid, 'Carlos Álvarez',           'País para Todos',             8.10),
  (pid, 'César Acuña',              'APP',                         6.00),
  (pid, 'López Chau',               'Ahora Nación',                6.00),
  (pid, 'Jorge Nieto',              'Partido del Buen Gobierno',   4.20),
  (pid, 'Marisol Pérez Tello',      'Primero la Gente',            3.50),
  (pid, 'Roberto Sánchez Palomino', 'Juntos por el Perú',         3.00),
  (pid, 'Ricardo Belmont',          'Partido Cívico Obras',        2.60);
-- v.v. directas del informe CIT: Aliaga=17.8%, Keiko=17.1%, Sánchez=3.9%, Nieto=5.5%, Belmont=3.4%

-- ------------------------------------------------------------
-- IPSOS tracking (campo 3-4 abr 2026, publicado ~4-5 abr, Perú21)
-- n=1205, B/N=11%, NS/NP=16%, pool=73%.  Última encuesta pre-veda Ipsos.
-- ------------------------------------------------------------

INSERT INTO polls (pollster_id, field_start, field_end, published_date, sample_n, margin_error, confidence_lvl, scope, technique, poll_type, pct_undecided, pct_blank_null, notes)
VALUES (3, '2026-04-03', '2026-04-04', '2026-04-05', 1205, 2.80, 95.0, 'nacional', 'presencial', 'intencion_voto', 16.00, 11.00, 'Ipsos/Perú21 3-4 abr 2026 · última encuesta pre-veda Ipsos · publicado 5 abr')
RETURNING id INTO pid;

INSERT INTO poll_results (poll_id, candidate, party, pct_raw) VALUES
  (pid, 'Keiko Fujimori',           'Fuerza Popular',               15.00),
  (pid, 'Carlos Álvarez',           'País para Todos',               8.00),
  (pid, 'Rafael López Aliaga',      'Renovación Popular',            7.00),
  (pid, 'Ricardo Belmont',          'Partido Cívico Obras',          6.00),
  (pid, 'Roberto Sánchez Palomino', 'Juntos por el Perú',           5.00),
  (pid, 'López Chau',               'Ahora Nación',                  5.00),
  (pid, 'Jorge Nieto',              'Partido del Buen Gobierno',     4.00),
  (pid, 'Marisol Pérez Tello',      'Primero la Gente',              3.00),
  (pid, 'César Acuña',              'APP',                           3.00),
  (pid, 'Fernando Olivera',         'Frente de la Esperanza',        3.00),
  (pid, 'José Luna Gálvez',         'Podemos Perú',                  2.00);
-- v.v. (pool 73%): Keiko=20.5%, Sánchez=6.8%, Aliaga=9.6%, Nieto=5.5%, Belmont=8.2%

-- ------------------------------------------------------------
-- CPI SIMULACRO (campo 3-4 abr 2026, publicado 5 abr, RPP)
-- n=2000, B/N=14.7%, NS/NP=13.9%, pool=71.4%.  Última encuesta pre-veda CPI.
-- ------------------------------------------------------------

INSERT INTO polls (pollster_id, field_start, field_end, published_date, sample_n, margin_error, confidence_lvl, scope, technique, poll_type, pct_undecided, pct_blank_null, notes)
VALUES (4, '2026-04-03', '2026-04-04', '2026-04-05', 2000, 2.20, 95.0, 'nacional', 'presencial', 'simulacro', 13.90, 14.70, 'CPI 3-4 abr 2026 simulacro con cédula · publicado 5 abr RPP · última encuesta pre-veda CPI')
RETURNING id INTO pid;

INSERT INTO poll_results (poll_id, candidate, party, pct_raw) VALUES
  (pid, 'Keiko Fujimori',           'Fuerza Popular',               13.30),
  (pid, 'Rafael López Aliaga',      'Renovación Popular',           10.60),
  (pid, 'Carlos Álvarez',           'País para Todos',               9.70),
  (pid, 'López Chau',               'Ahora Nación',                  6.80),
  (pid, 'Jorge Nieto',              'Partido del Buen Gobierno',     5.30),
  (pid, 'Ricardo Belmont',          'Partido Cívico Obras',          4.90),
  (pid, 'Marisol Pérez Tello',      'Primero la Gente',              4.40),
  (pid, 'Roberto Sánchez Palomino', 'Juntos por el Perú',           4.30),
  (pid, 'César Acuña',              'APP',                           3.70),
  (pid, 'Fernando Olivera',         'Frente de la Esperanza',        2.80);
-- v.v. (pool 71.4%): Keiko=18.6%, Sánchez=6.0%, Aliaga=14.8%, Nieto=7.4%, Belmont=6.9%

-- ------------------------------------------------------------
-- DATUM intención de voto (campo 1-4 abr 2026, publicado 5 abr, Infobae)
-- n≈3000, ME ±1.8%, NS/NP=16.8%. Datum publica directamente % votos válidos.
-- NOTA: pct_raw aquí = % votos válidos ya calculados por Datum (excluye NS/NP y B/N).
--       pct_blank_null = 0 → sin normalización adicional en el modelo.
-- ------------------------------------------------------------

INSERT INTO polls (pollster_id, field_start, field_end, published_date, sample_n, margin_error, confidence_lvl, scope, technique, poll_type, pct_undecided, pct_blank_null, notes)
VALUES (2, '2026-04-01', '2026-04-04', '2026-04-05', 3000, 1.80, 95.0, 'nacional', 'presencial', 'intencion_voto', 16.80, 0.00, 'Datum 1-4 abr 2026 · publicado 5 abr Infobae · última encuesta pre-veda Datum · valores = % votos válidos publicados por Datum')
RETURNING id INTO pid;

INSERT INTO poll_results (poll_id, candidate, party, pct_raw) VALUES
  (pid, 'Keiko Fujimori',           'Fuerza Popular',               18.10),
  (pid, 'Carlos Álvarez',           'País para Todos',              10.80),
  (pid, 'Rafael López Aliaga',      'Renovación Popular',           10.30),
  (pid, 'Jorge Nieto',              'Partido del Buen Gobierno',     5.30),
  (pid, 'Roberto Sánchez Palomino', 'Juntos por el Perú',           5.20),
  (pid, 'Ricardo Belmont',          'Partido Cívico Obras',          4.80),
  (pid, 'Marisol Pérez Tello',      'Primero la Gente',              3.50),
  (pid, 'López Chau',               'Ahora Nación',                  3.40);
-- Estos valores son v.v. directos de Datum: Keiko +0.9pp vs ONPE, Sánchez −6.8pp vs ONPE

END $$;

-- ============================================================
-- POLYMARKET SNAPSHOTS HISTÓRICOS
-- ============================================================

INSERT INTO polymarket_snapshots (captured_at_lima, candidate, probability, volume_usd, phase) VALUES
  ('2026-02-15 12:00:00-05', 'Rafael López Aliaga',      47.50, 2000000, 'pre_veda'),
  ('2026-02-15 12:00:00-05', 'Keiko Fujimori',           14.00, 2000000, 'pre_veda'),
  ('2026-02-15 12:00:00-05', 'López Chau',               20.00, 2000000, 'pre_veda'),
  ('2026-02-15 12:00:00-05', 'Carlos Álvarez',            9.00, 2000000, 'pre_veda'),

  ('2026-03-24 12:00:00-05', 'Rafael López Aliaga',      40.00, 3990000, 'pre_veda'),
  ('2026-03-24 12:00:00-05', 'Roberto Sánchez Palomino', 17.00, 3990000, 'pre_veda'),

  ('2026-04-02 21:53:00-05', 'Rafael López Aliaga',      30.00, 5100000, 'pre_veda'),
  ('2026-04-02 21:53:00-05', 'Keiko Fujimori',           19.00, 5100000, 'pre_veda'),
  ('2026-04-02 21:53:00-05', 'Carlos Álvarez',           16.30, 5100000, 'pre_veda'),
  ('2026-04-02 21:53:00-05', 'Roberto Sánchez Palomino', 11.70, 5100000, 'pre_veda'),
  ('2026-04-02 21:53:00-05', 'López Chau',                8.00, 5100000, 'pre_veda'),
  ('2026-04-02 21:53:00-05', 'Jorge Nieto',               6.00, 5100000, 'pre_veda'),
  ('2026-04-02 21:53:00-05', 'Ricardo Belmont',           4.50, 5100000, 'pre_veda'),
  ('2026-04-02 21:53:00-05', 'Marisol Pérez Tello',       4.00, 5100000, 'pre_veda'),
  ('2026-04-02 21:53:00-05', 'Carlos Espá',               1.00, 5100000, 'pre_veda'),
  ('2026-04-02 21:53:00-05', 'Wolfgang Grozo',            0.90, 5100000, 'pre_veda');
