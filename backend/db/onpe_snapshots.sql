-- Tabla para snapshots de resultados ONPE en tiempo real (noche electoral R2)
-- Correr: psql $DATABASE_URL -f db/onpe_snapshots.sql

CREATE TABLE IF NOT EXISTS onpe_live_snapshots (
  id               SERIAL PRIMARY KEY,
  captured_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  has_data         BOOLEAN     NOT NULL DEFAULT FALSE,
  actas_total      INTEGER,
  actas_processed  INTEGER,
  pct_actas        NUMERIC(5,2),
  keiko_votos      BIGINT,
  keiko_pct        NUMERIC(5,2),
  sanchez_votos    BIGINT,
  sanchez_pct      NUMERIC(5,2),
  dept_breakdown   JSONB,
  ext_breakdown    JSONB,
  totales_raw      JSONB
);

CREATE INDEX IF NOT EXISTS idx_onpe_snapshots_captured_at
  ON onpe_live_snapshots(captured_at DESC);

CREATE INDEX IF NOT EXISTS idx_onpe_snapshots_has_data
  ON onpe_live_snapshots(has_data, captured_at DESC);
