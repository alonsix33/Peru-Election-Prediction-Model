const { DateTime } = require('luxon');

const PERU_TIMEZONE = 'America/Lima'; // UTC-5, sin horario de verano
const ELECTION_DAY  = '2026-06-07'; // Segunda vuelta: Keiko Fujimori vs Roberto Sánchez
const VEDA_START    = '2026-05-31T08:00:00'; // Veda desde 8am del sábado anterior

/**
 * Retorna el DateTime actual en hora de Perú.
 * SIEMPRE usar esta función — nunca new Date() directamente.
 */
function nowPeru() {
  return DateTime.now().setZone(PERU_TIMEZONE);
}

/**
 * Retorna días y horas hasta la elección desde Lima.
 */
function timeToElection() {
  const now = nowPeru();
  const election = DateTime.fromISO(ELECTION_DAY, { zone: PERU_TIMEZONE })
    .startOf('day').plus({ hours: 8 }); // Apertura de mesas: 8am
  const diff = election.diff(now, ['days', 'hours', 'minutes']);
  return {
    days: Math.floor(diff.days),
    hours: Math.floor(diff.hours),
    minutes: Math.floor(diff.minutes),
    totalHours: election.diff(now, 'hours').hours,
    isElectionDay: now.toISODate() === ELECTION_DAY,
    isPastElection: now > election
  };
}

/**
 * Determina la fase electoral actual.
 * Retorna: 'pre_veda' | 'veda' | 'election_day' | 'post_election'
 */
function electoralPhase() {
  const now = nowPeru();
  const veda = DateTime.fromISO(VEDA_START, { zone: PERU_TIMEZONE });
  const election = DateTime.fromISO(ELECTION_DAY, { zone: PERU_TIMEZONE }).startOf('day');
  const electionEnd = election.plus({ hours: 17 }); // Cierre de mesas: 5pm (ONPE)

  if (now < veda)           return 'pre_veda';
  if (now < election)       return 'veda';
  if (now < electionEnd)    return 'election_day';
  return 'post_election';
}

module.exports = { nowPeru, timeToElection, electoralPhase, PERU_TIMEZONE, ELECTION_DAY };
