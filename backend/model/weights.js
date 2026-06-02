const { DateTime } = require('luxon');
const { nowPeru, electoralPhase, timeToElection } = require('./clock');

/**
 * Calcula el peso de Polymarket (α) en tiempo real basado en hora Lima.
 * R2: rango 22-50%. PM tiene sesgo estructural hacia el candidato conocido (Keiko)
 * en mercados de baja liquidez relativa — cap conservador para no sobreponderar.
 *
 * PRE_VEDA  (hasta 31 may 8am):  α = 0.20–0.22  → encuestas dominan fuertemente
 * VEDA      (31 may – 6 jun):    α crece 0.22→0.50  → parte del nivel pre-veda
 * ELECTION  (7 jun):             α = 0.50  → encuestas mantienen 50% de peso
 *
 * La veda arranca en 0.22 (igual al techo de pre_veda) para evitar caída brusca
 * al congelarse las encuestas.
 */
function getPolymarketWeight(volumeUSD = 5_100_000) {
  const phase = electoralPhase();
  const { totalHours } = timeToElection();
  const liquidityFactor = Math.min(1.0, volumeUSD / 8_000_000);

  switch (phase) {
    case 'pre_veda':
      return Math.min(0.22, 0.20 + (liquidityFactor * 0.02));

    case 'veda': {
      const vedaHours = 152; // Jun 1 00:00 → Jun 7 08:00 = 6×24+8h
      const hoursElapsed = Math.max(0, vedaHours - Math.max(0, totalHours));
      const vedaProgress = Math.min(1, hoursElapsed / vedaHours);
      // Parte desde 0.22 (igual al techo de pre_veda) y crece a 0.50.
      // Exponente 0.6: crecimiento cóncavo — sube rápido los primeros días.
      return Math.min(0.50, 0.22 + (Math.pow(vedaProgress, 0.6) * 0.28));
    }

    case 'election_day':
      return 0.50;

    case 'post_election':
      return null;

    default:
      return 0.20;
  }
}

/**
 * Decaimiento exponencial del peso de una encuesta.
 * En veda λ baja — sin información nueva, los datos existentes no deben penalizarse más.
 * Simulacros 29-30 may retienen ~70% de peso el día electoral (vs ~43% con λ=0.12).
 */
function getPollDecayWeight(fieldEndDate) {
  const phase = electoralPhase();
  const λ = phase === 'pre_veda' ? 0.08 : 0.05;
  const now = nowPeru();
  // fieldEndDate puede ser string ISO o Date object (PostgreSQL)
  const pollEnd = fieldEndDate instanceof Date
    ? DateTime.fromJSDate(fieldEndDate, { zone: 'America/Lima' })
    : DateTime.fromISO(fieldEndDate, { zone: 'America/Lima' });
  const daysOld = now.diff(pollEnd, 'days').days;
  return Math.exp(-λ * Math.max(0, daysOld));
}

/**
 * Peso compuesto final de una encuesta individual.
 * W = decaimiento × muestra × encuestadora × tipo
 */
function getPollWeight(poll, pollsterWeightMultiplier) {
  const decay    = getPollDecayWeight(poll.field_end);
  const sample   = Math.sqrt(poll.sample_n / 2000);
  const pollster = pollsterWeightMultiplier;
  const type     = poll.poll_type === 'simulacro' ? 1.20
                 : poll.poll_type === 'ambos'     ? 1.10
                 : 1.00;
  return decay * sample * pollster * type;
}

module.exports = { getPolymarketWeight, getPollDecayWeight, getPollWeight };
