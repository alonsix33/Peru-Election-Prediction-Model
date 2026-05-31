-- r2_projections.sql
-- Tabla para proyecciones de noche electoral R2.
-- Correr: psql $DATABASE_URL -f db/r2_projections.sql
--
-- Almacena una proyección por snapshot ONPE.
-- Vacía hasta el 7 de junio 2026 — costo cero de compute antes de esa fecha.

CREATE TABLE IF NOT EXISTS r2_election_projections (
  id                    SERIAL PRIMARY KEY,
  snapshot_id           INTEGER     REFERENCES onpe_live_snapshots(id) ON DELETE CASCADE,
  projected_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Progreso del conteo
  pct_actas             NUMERIC(5,2),
  phase                 CHAR(1),          -- A, B, C, D

  -- Observado en el momento
  obs_kf_r2_share       NUMERIC(6,3),     -- % KF / (KF + RSP) de votos ya contados
  obs_keiko_votos       BIGINT,
  obs_sanchez_votos     BIGINT,

  -- Proyección final
  proj_kf_r2_share      NUMERIC(6,3),     -- punto estimado
  proj_ci95_lo          NUMERIC(6,3),     -- IC 95% lower
  proj_ci95_hi          NUMERIC(6,3),     -- IC 95% upper
  proj_ci80_lo          NUMERIC(6,3),     -- IC 80% lower
  proj_ci80_hi          NUMERIC(6,3),     -- IC 80% upper
  proj_winner           VARCHAR(3),       -- 'KF' o 'RSP'
  proj_margin_pp        NUMERIC(5,2),     -- |proj - 50| en pp
  proj_sigma_pp         NUMERIC(5,2),

  -- Corrección ZDA
  zda_correction_applied BOOLEAN,
  zda_remaining_mesas   INTEGER,
  zda_proj_kf_r2_share  NUMERIC(6,3),
  zda_effect_pp         NUMERIC(5,2),

  -- Shift nacional R2 vs R1
  national_shift_pp     NUMERIC(5,2),
  shift_granularity     VARCHAR(20),      -- 'district' | 'province' | 'dept' | 'naive'

  -- Shifts por granularidad (arrays con shift_pp por unidad)
  dept_shifts           JSONB,
  province_shifts       JSONB,
  district_shifts       JSONB,

  -- JSON completo de la proyección (para frontend y debug)
  full_result           JSONB
);

CREATE INDEX IF NOT EXISTS idx_r2_proj_projected_at
  ON r2_election_projections(projected_at DESC);

CREATE INDEX IF NOT EXISTS idx_r2_proj_snapshot_id
  ON r2_election_projections(snapshot_id);

CREATE INDEX IF NOT EXISTS idx_r2_proj_snapshot_latest
  ON r2_election_projections(snapshot_id, projected_at DESC);
