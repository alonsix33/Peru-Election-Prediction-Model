const { DateTime } = require('luxon');
const { nowPeru, electoralPhase, timeToElection } = require('./clock');

/**
 * Calcula el peso de Polymarket (α) en tiempo real basado en hora Lima.
 * R2: rango 25-60%. Encuestas empatadas (50/50) vs PM (65/33) → PM tiene sesgo
 * histórico en R2 (Keiko sobre-representada), por eso cap más conservador.
 *
 * PRE_VEDA  (hasta 31 may 8am):  α = 0.20–0.25  → encuestas dominan fuertemente
 * VEDA      (31 may – 6 jun):    α crece 0.25→0.60  → parte del nivel pre-veda
 * ELECTION  (7 jun):             α = 0.60  → encuestas mantienen 40% de peso
 *
 * La veda arranca en 0.25 (no 0.20) para evitar la caída en el momento en que
 * las encuestas se congelan — en ese punto PM debería tener al menos el mismo
 * peso que tenía el día anterior, no menos.
 */
function getPolymarketWeight(volumeUSD = 5_100_000) {
  const phase = electoralPhase();
  const { totalHours } = timeToElection();
  const liquidityFactor = Math.min(1.0, volumeUSD / 8_000_000);

  switch (phase) {
    case 'pre_veda':
      return Math.min(0.25, 0.20 + (liquidityFactor * 0.05));

    case 'veda': {
      const vedaHours = 160; // 168h total − 8h gap (00:00–08:00 election day): α maxes at 08:00
      const hoursElapsed = Math.max(0, vedaHours - Math.max(0, totalHours));
      const vedaProgress = Math.min(1, hoursElapsed / vedaHours);
      // Parte desde 0.25 (igual al techo de pre_veda) y crece a 0.60.
      // Exponente 0.6: crecimiento cóncavo — sube rápido los primeros días.
      return Math.min(0.60, 0.25 + (Math.pow(vedaProgress, 0.6) * 0.35));
    }

    case 'election_day':
      return 0.60;

    case 'post_election':
      return null;

    default:
      return 0.20;
  }
}

/**
 * Decaimiento exponencial del peso de una encuesta.
 * Post-veda: λ aumenta — las encuestas envejecen más rápido.
 */
function getPollDecayWeight(fieldEndDate) {
  const phase = electoralPhase();
  const λ = phase === 'pre_veda' ? 0.08 : 0.12;
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
