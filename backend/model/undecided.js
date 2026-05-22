/**
 * Voto potencial — promedio ponderado CIT marzo (40%) + Ipsos abril (60%).
 * Piso = "Definitivamente sí", Techo = Potencial, Rechazo = "Definitivamente no".
 * Solo aplica en R1 (multi-candidato). En R2 se normaliza a votos válidos sin redistribución.
 */
const VOTE_POTENTIAL_CIT = {
  'Rafael López Aliaga': { ceiling: 25.5, floor:  9.2, rejection: 50.9 },  // CIT 27.7/14.6/50.8 + Ipsos 24/6/51
  'Keiko Fujimori':      { ceiling: 23.0, floor: 10.3, rejection: 60.5 },  // CIT 18.5/10.8/62.7 + Ipsos 26/10/59
  'Carlos Álvarez':      { ceiling: 27.8, floor:  5.9, rejection: 42.9 },  // CIT 18.4/4.2/50.2 + Ipsos 34/7/38
  'López Chau':          { ceiling: 18.9, floor:  4.0, rejection: 45.9 },  // CIT 17.2/5.4/51.7 + Ipsos 20/3/42
  'Wolfgang Grozo':      { ceiling: 14.0, floor:  5.5, rejection: 45.6 },  // solo CIT marzo (sin dato Ipsos)
  'Roberto Sánchez Palomino': { ceiling: 19.0, floor: 5.4, rejection: 44.2 }  // CIT est 22/6/48 + Ipsos 17/5/41
};

/**
 * Redistribuye el voto indeciso.
 *
 * R1 (multi-candidato): fórmula de espacio de crecimiento con techos CIT/Ipsos.
 *   espacio = (techo − estimado_actual) × (1 − rechazo/100)
 *   redistribucion = indecisos × (espacio_i / Σ espacios)
 *
 * R2 (2 candidatos): normalización a votos válidos.
 *   No redistribuimos indecisos — no hay evidencia de cómo van a romper.
 *   estimated_pct = current_pct / Σ current_pct × 100 (proporción declarada)
 *   La incertidumbre sobre los no comprometidos la absorbe el MC (±5.7pp hoy).
 *
 * @param {Object} aggregated  - Salida de aggregatePolls(): { candidate: { weighted_pct, ... } }
 * @param {number} undecidedPct - % de indecisos (solo informativo en R2, no se usa)
 * @param {Object} [votePotential] - Override de voto potencial CIT (solo R1)
 * @param {number} [electionRound] - 1 (default) o 2
 * @returns {Object} - { candidate: { estimated_pct, redistribution, ceiling, floor, rejection } }
 */
function redistributeUndecided(aggregated, undecidedPct, votePotential = VOTE_POTENTIAL_CIT, electionRound = 1) {
  const result = {};

  // ── R2: normalización a votos válidos ────────────────────────────────────
  // En R2 no redistribuimos indecisos. No sabemos cómo van a romper (en 2021
  // rompieron masivamente hacia Castillo). Trabajamos con la proporción
  // declarada entre los dos candidatos y dejamos que el MC capture la
  // incertidumbre sobre el comportamiento de los no comprometidos.
  if (electionRound === 2) {
    const totalPolled = Object.values(aggregated).reduce((s, d) => s + d.weighted_pct, 0);
    for (const [candidate, data] of Object.entries(aggregated)) {
      const current = data.weighted_pct;
      const share = totalPolled > 0 ? current / totalPolled : 0.5;
      result[candidate] = {
        current_pct: current,
        ceiling: 100,
        floor: 0,
        rejection: null,
        space: 0,
        redistribution: 0,
        estimated_pct: share * 100,
      };
    }
    return result;
  }

  // ── R1: espacio de crecimiento con techos CIT/Ipsos ──────────────────────
  let totalSpace = 0;

  for (const [candidate, data] of Object.entries(aggregated)) {
    const current = data.weighted_pct;
    const potential = votePotential[candidate];

    let ceiling, floor, rejection;
    if (potential) {
      ceiling = potential.ceiling;
      floor = potential.floor;
      rejection = potential.rejection;
    } else {
      ceiling = current * 2;
      floor = 0;
      rejection = 40;
    }

    const rawSpace = Math.max(0, ceiling - current);
    const space = rawSpace * (1 - rejection / 100);

    result[candidate] = {
      current_pct: current,
      ceiling,
      floor,
      rejection,
      space,
      redistribution: 0,
      estimated_pct: current
    };

    totalSpace += space;
  }

  if (totalSpace > 0 && undecidedPct > 0) {
    for (const [candidate, data] of Object.entries(result)) {
      const proportion = data.space / totalSpace;
      data.redistribution = undecidedPct * proportion;
      data.estimated_pct = data.current_pct + data.redistribution;

      if (data.estimated_pct > data.ceiling) {
        data.estimated_pct = data.ceiling;
        data.redistribution = data.ceiling - data.current_pct;
        data.clamped = true;
        data.excess = data.estimated_pct - data.ceiling;
      }
    }
  }

  return result;
}

module.exports = { redistributeUndecided, VOTE_POTENTIAL_CIT };
