-- Peru Election Prediction Model 2026
-- Schema de base de datos — PostgreSQL (Railway)

CREATE TABLE pollsters (
  id                SERIAL PRIMARY KEY,
  name              VARCHAR(50) NOT NULL,
  historical_mae    DECIMAL(4,2),
  weight_multiplier DECIMAL(4,2),
  notes             TEXT
);

CREATE TABLE polls (
  id              SERIAL PRIMARY KEY,
  pollster_id     INT REFERENCES pollsters(id),
  field_start     DATE NOT NULL,
  field_end       DATE NOT NULL,
  published_date  DATE,
  sample_n        INT,
  margin_error    DECIMAL(4,2),
  confidence_lvl  DECIMAL(4,1),
  scope           VARCHAR(20),
  technique       VARCHAR(30),
  poll_type       VARCHAR(20),   -- 'intencion_voto' | 'simulacro' | 'ambos'
  pct_undecided   DECIMAL(5,2),
  pct_blank_null  DECIMAL(5,2),
  pct_no_answer   DECIMAL(5,2),
  source_url      TEXT,
  notes           TEXT
);

CREATE TABLE poll_results (
  id            SERIAL PRIMARY KEY,
  poll_id       INT REFERENCES polls(id),
  candidate     VARCHAR(50) NOT NULL,
  party         VARCHAR(60),
  pct_raw       DECIMAL(5,2),
  pct_valid     DECIMAL(5,2),
  is_valid_vote BOOLEAN DEFAULT FALSE
);

CREATE TABLE polymarket_snapshots (
  id               SERIAL PRIMARY KEY,
  captured_at      TIMESTAMPTZ DEFAULT NOW(),
  captured_at_lima TIMESTAMPTZ,
  candidate        VARCHAR(50) NOT NULL,
  probability      DECIMAL(5,2),
  price_yes        DECIMAL(6,4),
  price_no         DECIMAL(6,4),
  volume_usd       DECIMAL(12,2),
  market_slug      VARCHAR(100),
  phase            VARCHAR(20)  -- fase electoral en el momento de captura
);

CREATE TABLE historical_results (
  id               SERIAL PRIMARY KEY,
  election_year    INT,
  round            INT,
  candidate        VARCHAR(50),
  party            VARCHAR(60),
  pct_actual       DECIMAL(5,2),
  pct_valid_actual DECIMAL(5,2)
);

CREATE TABLE model_predictions (
  id                   SERIAL PRIMARY KEY,
  generated_at         TIMESTAMPTZ DEFAULT NOW(),
  generated_at_lima    TIMESTAMPTZ,
  electoral_phase      VARCHAR(20),
  polymarket_weight    DECIMAL(4,2),
  polls_weight         DECIMAL(4,2),
  candidate            VARCHAR(50),
  predicted_pct_mean   DECIMAL(5,2),
  predicted_pct_p10    DECIMAL(5,2),
  predicted_pct_p90    DECIMAL(5,2),
  prob_first_round     DECIMAL(5,2),
  prob_win_overall     DECIMAL(5,2),
  model_version        VARCHAR(10),
  trigger              VARCHAR(30) DEFAULT 'auto_polymarket_update',
  runoff_json          TEXT,
  polls_pct            DECIMAL(5,2),
  polymarket_pct       DECIMAL(5,2),
  posterior_pct        DECIMAL(5,2),
  risk_json            TEXT,
  is_final_snapshot    BOOLEAN DEFAULT FALSE,
  frozen_at            TIMESTAMPTZ
);

-- Performance indexes (idempotent)
CREATE INDEX IF NOT EXISTS idx_polymarket_snapshots_lima     ON polymarket_snapshots(captured_at_lima DESC);
CREATE INDEX IF NOT EXISTS idx_model_predictions_lima        ON model_predictions(generated_at_lima DESC);
CREATE INDEX IF NOT EXISTS idx_model_predictions_round       ON model_predictions(election_round, trigger, generated_at_lima DESC);
CREATE INDEX IF NOT EXISTS idx_polymarket_snapshots_round    ON polymarket_snapshots(election_round, captured_at_lima DESC);

-- Tabla de errores del sistema
CREATE TABLE error_log (
  id               SERIAL PRIMARY KEY,
  occurred_at      TIMESTAMPTZ DEFAULT NOW(),
  occurred_at_lima TIMESTAMPTZ,
  error_type       VARCHAR(50),
  error_code       VARCHAR(30),
  module           VARCHAR(50),
  message          TEXT,
  stack_trace      TEXT,
  context          JSONB,
  resolved         BOOLEAN DEFAULT FALSE,
  resolved_at      TIMESTAMPTZ
);
