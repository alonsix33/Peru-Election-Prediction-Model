// NOTA DE CALIBRACIÓN — 3 abril 2026
// Recalibrado con volatilidad peruana (3 de 4 elecciones tuvieron sorpresas):
// - Fat tails: t-Student df=4 en vez de normal (eventos extremos ~3x más frecuentes)
// - Shock negativo al líder: 15% de simulaciones (-5 a -15 pts, redistribuidos)
// - Shock negativo al #2: 10% de simulaciones (-5 a -12 pts)
// - Shock positivo "efecto Castillo" al #3-#6: 10% de simulaciones (+5 a +12 pts)
// - Temporal drift: 0.30 pts/día (2.7 pts a 9 días)
// Total: 35% de simulaciones tienen algún shock (vs 5% anterior)
// Target: Aliaga P(2da vuelta) ~88-92%, P(ganar) ~55-62%
//
// RECALIBRACIÓN R2 — 23 mayo 2026
// - Voto oculto: 10% de simulaciones R2 (+3 a +6pp al candidato rezagado).
//   Modela sesgo estructural tipo Castillo 2021: base rural subestimada por encuestas urbanas.
//   Asimétrico: solo aplica cuando hay exactamente 2 candidatos (segunda vuelta).
// - runoffUncertainty: 8.0 → 11.0. La campaña de 7 semanas entre vueltas tiene alta
//   volatilidad histórica (debates, alianzas, movilización diferencial). σ=11 da ±11pp
//   en el 68% de simulaciones, más realista para una carrera decidida por <1pp en 2021.

const { handleError } = require('../errors/errorHandler');
const { timeToElection } = require('./clock');

/**
 * Correlación de error entre encuestadoras (sección 5.4).
 * Usado para generar errores correlacionados via Cholesky.
 */
const ERROR_CORRELATION = {
  'Ipsos-CPI':   0.65,
  'Ipsos-Datum': 0.55,
  'Ipsos-IEP':   0.35,
  'Ipsos-CIT':   0.40,
  'CPI-Datum':   0.60,
  'CPI-IEP':     0.30,
  'CPI-CIT':     0.45,
  'Datum-IEP':   0.35,
  'Datum-CIT':   0.50,
  'IEP-CIT':     0.30
};

const POLLSTER_ORDER = ['Ipsos', 'CPI', 'Datum', 'IEP', 'CIT'];

/**
 * Rechazo definitivo por candidato — "Def. No" de CIT (sección 5.5).
 * Techo duro: si 62.7% dice "definitivamente NO Keiko", ese % no le transferirá votos.
 */
// Promedio ponderado CIT marzo (40%) + Ipsos abril (60%)
// Post-R1 (Ipsos 23-24 abr 2026): Keiko 48%, Sánchez 43%.
// CIT campaña tenía Keiko 60.5% — caída de 12.5pp tras concretar R2.
const REJECTION_RATES = {
  'Rafael López Aliaga': 50.9,
  'Keiko Fujimori':      48.0,
  'Carlos Álvarez':      42.9,
  'López Chau':          45.9,
  'Roberto Sánchez Palomino': 43.0,
  'Wolfgang Grozo':      45.6
};

const DEFAULT_REJECTION = 40.0;

/**
 * Matriz de transferencia de votos en segunda vuelta.
 * Para cada candidato eliminado, define qué fracción de sus votos
 * se transfiere a cada posible finalista. Lo que no se transfiere = blanco.
 * Basado en afinidad ideológica real de la política peruana 2026.
 *
 * Clave: 'eliminado'. Valor: { finalista: fracción }
 * Si un finalista no aparece en la lista del eliminado, recibe 0.20 por defecto.
 */
const TRANSFER_AFFINITY = {
  // Aliaga eliminado: derecha conservador — su base va a Keiko,
  // pero forzados entre centro/izquierda sí votan por "mal menor"
  'Rafael López Aliaga': {
    'Keiko Fujimori': 0.62,
    'Carlos Álvarez': 0.38,
    'Roberto Sánchez Palomino': 0.22,
    'López Chau': 0.20,
    'Jorge Nieto': 0.28,
    'Ricardo Belmont': 0.15,             // base vieja conservadora no va a populista joven
  },
  // Keiko eliminada: fujimorismo va a derecha, pero también al centro
  'Keiko Fujimori': {
    'Rafael López Aliaga': 0.58,
    'Carlos Álvarez': 0.40,
    'Roberto Sánchez Palomino': 0.20,
    'López Chau': 0.18,
    'Jorge Nieto': 0.28,
    'Ricardo Belmont': 0.15,             // fujimorismo no va a izquierda populista
  },
  // Álvarez eliminado: centro anti-establishment — su base es diversa,
  // parte va a derecha, parte a izquierda, pero prefiere no-establishment
  'Carlos Álvarez': {
    'Rafael López Aliaga': 0.35,         // centro va algo a derecha
    'Keiko Fujimori': 0.30,              // opción "conocida" para parte del centro
    'Roberto Sánchez Palomino': 0.42, // anti-establishment va a anti-establishment
    'López Chau': 0.38,
    'Jorge Nieto': 0.38,
    'Ricardo Belmont': 0.35,             // centro joven comparte algo de base
  },
  // Sánchez eliminado: izquierda rural — fuerte antifujimorismo,
  // forzados entre Aliaga y Keiko votan Aliaga como "mal menor"
  'Roberto Sánchez Palomino': {
    'Rafael López Aliaga': 0.38,      // antifujimorismo empuja hacia Aliaga
    'Keiko Fujimori': 0.18,           // antifujimorismo duro
    'Carlos Álvarez': 0.50,
    'López Chau': 0.60,
    'Jorge Nieto': 0.48,
    'Ricardo Belmont': 0.50,          // izquierda a izquierda populista
  },
  // Chau eliminado: izquierda — misma lógica antifujimorista
  'López Chau': {
    'Rafael López Aliaga': 0.35,      // antifujimorismo
    'Keiko Fujimori': 0.18,
    'Carlos Álvarez': 0.45,
    'Roberto Sánchez Palomino': 0.58,
    'Jorge Nieto': 0.42,
    'Ricardo Belmont': 0.40,          // izquierda urbana comparte base
  },
  // Nieto eliminado: centro-izquierda — antifujimorista
  'Jorge Nieto': {
    'Rafael López Aliaga': 0.35,      // antifujimorismo
    'Keiko Fujimori': 0.20,
    'Carlos Álvarez': 0.42,
    'Roberto Sánchez Palomino': 0.45,
    'López Chau': 0.40,
    'Ricardo Belmont': 0.40,          // jóvenes moderados migran
  },
  // Belmont eliminado: izquierda populista, voto joven TikTok, NSE C/D
  // Apoyó a Castillo/Cerrón/AMLO. Su base joven NO va a derecha conservadora.
  'Ricardo Belmont': {
    'Carlos Álvarez': 0.30,              // centro joven, anti-establishment
    'Jorge Nieto': 0.30,                 // joven moderado, overlap generacional
    'Roberto Sánchez Palomino': 0.25,    // izquierda, tercer destino natural
    'Rafael López Aliaga': 0.20,         // algo de base limeña popular comparte
    'López Chau': 0.20,                  // izquierda pero menor overlap
    'Keiko Fujimori': 0.10,              // muy poco — antifujimorismo joven
  },
  // Acuña eliminado: pragmático, maquinaria norte
  'César Acuña': {
    'Rafael López Aliaga': 0.33,
    'Keiko Fujimori': 0.35,
    'Carlos Álvarez': 0.38,
    'Roberto Sánchez Palomino': 0.25,
    'López Chau': 0.25,
  },
  // Lescano eliminado: izquierda — antifujimorista, vota "mal menor"
  'Yonhy Lescano': {
    'Rafael López Aliaga': 0.35,      // antifujimorismo
    'Keiko Fujimori': 0.18,
    'Carlos Álvarez': 0.42,
    'Roberto Sánchez Palomino': 0.55,
    'López Chau': 0.50,
  },
  // Pérez Tello eliminada: centro-izquierda — vota con pragmatismo
  'Marisol Pérez Tello': {
    'Rafael López Aliaga': 0.28,
    'Keiko Fujimori': 0.22,
    'Carlos Álvarez': 0.48,
    'Roberto Sánchez Palomino': 0.42,
    'López Chau': 0.40,
  },
  // Grozo eliminado: voto protesta — disperso pero sí vota
  'Wolfgang Grozo': {
    'Rafael López Aliaga': 0.28,
    'Keiko Fujimori': 0.25,
    'Carlos Álvarez': 0.40,
    'Roberto Sánchez Palomino': 0.38,
    'López Chau': 0.35,
  },
};

// Default transfer cuando el eliminado o finalista no está en la matriz
const DEFAULT_TRANSFER = 0.25;

/**
 * Obtiene la fracción de transferencia de un eliminado a un finalista.
 */
function getTransfer(eliminated, finalist) {
  return TRANSFER_AFFINITY[eliminated]?.[finalist] ?? DEFAULT_TRANSFER;
}

/**
 * Simula segunda vuelta con transferencia de votos basada en
 * matriz de afinidad por pares y voto blanco calibrado.
 *
 * Mecánica:
 * 1. Base: votos propios de cada finalista
 * 2. Para cada eliminado: transferir según TRANSFER_AFFINITY
 *    Lo que no se transfiere a ninguno = voto blanco
 * 3. Voto blanco extra si ambos finalistas tienen alto rechazo
 * 4. Incertidumbre de campaña (7 semanas entre vueltas)
 */
function simulateRunoff(finalistA, finalistB, allFirstRoundResults, dynamicRejection = {}) {
  // Factor de conversión para el blanco extra por doble rechazo
  const rejectionDiscount = 0.35 + Math.random() * 0.20;
  // Prioriza tasas dinámicas (de antivoto_snapshots en BD); cae a hardcoded solo si no hay dato
  const rateA = dynamicRejection[finalistA] ?? REJECTION_RATES[finalistA] ?? DEFAULT_REJECTION;
  const rateB = dynamicRejection[finalistB] ?? REJECTION_RATES[finalistB] ?? DEFAULT_REJECTION;
  const rejA = (rateA / 100) * rejectionDiscount;
  const rejB = (rateB / 100) * rejectionDiscount;

  // 1. Base: votos propios
  let votesA = allFirstRoundResults[finalistA] || 0;
  let votesB = allFirstRoundResults[finalistB] || 0;
  let blankVotes = 0;

  // 2. Transferir votos de cada candidato eliminado
  for (const [candidate, pct] of Object.entries(allFirstRoundResults)) {
    if (candidate === finalistA || candidate === finalistB) continue;
    if (pct <= 0) continue;

    // Obtener fracción de transferencia a cada finalista
    const transferToA = getTransfer(candidate, finalistA);
    const transferToB = getTransfer(candidate, finalistB);

    // Normalizar si la suma > 1 (no debería pero por seguridad)
    const totalTransfer = transferToA + transferToB;
    let effectiveToA = transferToA;
    let effectiveToB = transferToB;
    if (totalTransfer > 1.0) {
      effectiveToA = transferToA / totalTransfer;
      effectiveToB = transferToB / totalTransfer;
    }

    votesA += pct * effectiveToA;
    votesB += pct * effectiveToB;

    // Lo que no se transfiere = voto blanco
    const toBlank = 1.0 - effectiveToA - effectiveToB;
    if (toBlank > 0) blankVotes += pct * toBlank;
  }

  // 3. Voto blanco extra por doble rechazo alto
  const rejSum = rejA * 100 + rejB * 100;
  if (rejSum > 100) {
    const extraBlank = (rejSum - 100) * 0.3;
    const totalVotes = votesA + votesB;
    if (totalVotes > 0) {
      votesA -= extraBlank * (votesA / totalVotes);
      votesB -= extraBlank * (votesB / totalVotes);
      blankVotes += extraBlank;
    }
  }

  // Clamp a 0
  votesA = Math.max(0, votesA);
  votesB = Math.max(0, votesB);

  const totalAll = votesA + votesB + blankVotes;
  const blankPct = totalAll > 0 ? (blankVotes / totalAll) * 100 : 0;

  // 4. Compresión logística de segunda vuelta.
  // Basado en evidencia empírica: toda segunda vuelta peruana converge
  // hacia ~50/50 por dinámica de antivoto (Castillo 50.1%, PPK 50.1%,
  // Humala 51.4%, García 52.6%). Ningún candidato ha ganado con >62%.
  // Comprime resultados extremos hacia el centro sin cambiar el ganador.
  const totalValid = votesA + votesB;
  if (totalValid > 0) {
    const rawPctA = votesA / totalValid; // fracción cruda (0 a 1)
    const MAX_WIN = 0.62;               // techo histórico peruano
    const K = 2.5;                      // factor de compresión
    const compressedA = 0.5 + (MAX_WIN - 0.5) * Math.tanh(K * (rawPctA - 0.5));
    const compressedB = 1 - compressedA;
    votesA = compressedA * totalValid;
    votesB = compressedB * totalValid;
  }

  // 5. Incertidumbre propia de segunda vuelta:
  // Recalibrado T-2: 11pp era volatilidad de 7 semanas de campaña; a T-2 esas semanas
  // ya ocurrieron. 6pp da rango p10-p90 de ~±7pp, apropiado para incertidumbre residual.
  const runoffUncertainty = 6.0;
  const shockA = randn() * runoffUncertainty;
  const shockB = -shockA * 0.7;
  votesA += shockA;
  votesB += shockB;

  const winner = votesA >= votesB ? finalistA : finalistB;

  return {
    winner,
    votesA: parseFloat(votesA.toFixed(2)),
    votesB: parseFloat(votesB.toFixed(2)),
    blankVotes: parseFloat(blankVotes.toFixed(2)),
    blankPct: parseFloat(blankPct.toFixed(2))
  };
}

// ─── Funciones auxiliares de álgebra lineal ──────────────────

/**
 * Construye la matriz de correlación 5x5 entre encuestadoras.
 */
function buildCorrelationMatrix() {
  const n = POLLSTER_ORDER.length;
  const matrix = Array.from({ length: n }, () => Array(n).fill(0));

  for (let i = 0; i < n; i++) {
    matrix[i][i] = 1.0;
    for (let j = i + 1; j < n; j++) {
      const key1 = `${POLLSTER_ORDER[i]}-${POLLSTER_ORDER[j]}`;
      const key2 = `${POLLSTER_ORDER[j]}-${POLLSTER_ORDER[i]}`;
      const corr = ERROR_CORRELATION[key1] || ERROR_CORRELATION[key2] || 0;
      matrix[i][j] = corr;
      matrix[j][i] = corr;
    }
  }

  return matrix;
}

/**
 * Descomposición de Cholesky: M = L × L^T
 * Retorna L (triangular inferior). Null si no es positiva definida.
 */
function cholesky(matrix) {
  const n = matrix.length;
  const L = Array.from({ length: n }, () => Array(n).fill(0));

  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) {
      let sum = 0;
      for (let k = 0; k < j; k++) {
        sum += L[i][k] * L[j][k];
      }

      if (i === j) {
        const diag = matrix[i][i] - sum;
        if (diag <= 0) return null;
        L[i][j] = Math.sqrt(diag);
      } else {
        L[i][j] = (matrix[i][j] - sum) / L[j][j];
      }
    }
  }

  return L;
}

/**
 * Genera un número aleatorio con distribución normal estándar (Box-Muller).
 */
function randn() {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

/**
 * Genera un número aleatorio con distribución t de Student.
 * Fat tails: eventos extremos ocurren ~3x más que con normal.
 * @param {number} df - Grados de libertad (4 = fat tails moderados)
 */
function randt(df = 4) {
  // Ratio of normal / sqrt(chi-squared/df)
  const z = randn();
  let chi2 = 0;
  for (let i = 0; i < df; i++) {
    const n = randn();
    chi2 += n * n;
  }
  return z / Math.sqrt(chi2 / df);
}

/**
 * Genera errores correlacionados usando Cholesky.
 */
function correlatedErrors(L) {
  const n = L.length;
  const z = Array.from({ length: n }, () => randn());
  const errors = Array(n).fill(0);

  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) {
      errors[i] += L[i][j] * z[j];
    }
  }

  return errors;
}

/**
 * Normaliza un array de porcentajes para que sumen targetSum.
 */
function normalize(values, targetSum = 100) {
  const total = values.reduce((s, v) => s + v, 0);
  if (total <= 0) return values;
  return values.map(v => (v / total) * targetSum);
}

// ─── Motor principal Monte Carlo ────────────────────────────

/**
 * Ejecuta simulación Monte Carlo.
 *
 * Algoritmo (sección 6, Fase 4):
 *   1. Sortear errores correlacionados (Cholesky)
 *   2. Perturbar estimados con errores × sigma
 *   3. En 5% de simulaciones: shock estocástico (lección Castillo 2021)
 *   4. Normalizar, identificar top-2, simular segunda vuelta con simulateRunoff()
 *
 * @param {Object} posterior - { candidate: { posterior_pct, ... } }
 * @param {number} nSimulations - Número de simulaciones (default 10,000)
 * @param {Object} [dynamicRejection] - Tasas de rechazo dinámicas {candidate: pct} desde antivoto_snapshots.
 *   Si se provee, sobreescribe REJECTION_RATES para esos candidatos.
 * @returns {Object} results + runoffStats
 */
function runMonteCarlo(posterior, nSimulations = 10_000, dynamicRejection = {}) {
  const candidates = Object.keys(posterior);
  const nCandidates = candidates.length;
  const basePcts = candidates.map(c => posterior[c].posterior_pct);

  // Sigma dinámico: crece con días restantes hasta la elección.
  // Calibrado en σ=3.0 el día de elección (días=0). A 20 días: σ≈6.7.
  const { days } = timeToElection();
  const temporalDrift = Math.max(0, days) * 0.30;
  const sigma = Math.sqrt(9.0 + temporalDrift * temporalDrift);

  // Cholesky
  const corrMatrix = buildCorrelationMatrix();
  let L = cholesky(corrMatrix);

  if (!L) {
    handleError('CHOLESKY_FAILURE', { module: 'montecarlo' });
    L = Array.from({ length: POLLSTER_ORDER.length }, (_, i) =>
      Array.from({ length: POLLSTER_ORDER.length }, (_, j) => i === j ? 1 : 0)
    );
  }

  // Acumuladores
  const simResults = candidates.map(() => []);
  const runoffCount = candidates.map(() => 0);
  const winCount = candidates.map(() => 0);
  let closeRunoffCount = 0; // runoff con margen < 5 pts entre finalistas
  let votoOcultoCount = 0;  // sims where voto oculto activated (R2 only)
  let votoOcultoWins = 0;   // of those, Sánchez wins

  // Acumuladores de segunda vuelta por par
  const runoffPairStats = {};

  // Acumuladores de escenarios de riesgo
  const riskCounters = {
    perCandidate: {},  // { candidato: { missesRunoff: 0, winsFirstRound: 0, gets20plus: 0 } }
    top2NotTop2Expected: 0,  // top-2 no es los 2 favoritos del modelo
    surpriseFirstRoundWinner: 0,  // ganador 1ra vuelta fuera del top-3
  };
  for (const c of candidates) {
    riskCounters.perCandidate[c] = { missesRunoff: 0, winsFirstRound: 0, gets20plus: 0, inTop2: 0 };
  }

  for (let sim = 0; sim < nSimulations; sim++) {
    // 1. Errores correlacionados
    const pollsterErrors = correlatedErrors(L);
    const avgError = pollsterErrors.reduce((s, e) => s + e, 0) / pollsterErrors.length;

    // 2. Perturbar estimados con fat tails (t-Student, df=4)
    const perturbed = basePcts.map((pct) => {
      const individualNoise = randt(4) * sigma * 0.5;
      const systemicNoise = avgError * sigma * 0.5;
      return pct + systemicNoise + individualNoise;
    });

    // 3. Shocks estocásticos (calibrados para volatilidad peruana)
    let simVotoOculto = false;
    const roll = Math.random();

    // 3a. Shock negativo al líder: 15% de simulaciones
    //     Escándalo, exclusión legal, colapso en debate
    if (roll < 0.15) {
      // Encontrar el líder actual en esta simulación
      let maxIdx = 0;
      for (let i = 1; i < nCandidates; i++) {
        if (perturbed[i] > perturbed[maxIdx]) maxIdx = i;
      }
      const shockSize = 5 + Math.random() * 10; // -5 a -15 pts
      const lost = Math.min(perturbed[maxIdx] - 1, shockSize);
      perturbed[maxIdx] -= lost;
      // R1: redistribuir al #3-#5; R2: al único otro candidato
      const sorted = perturbed.map((v, i) => ({ v, i })).sort((a, b) => b.v - a.v);
      const receivers = (sorted.length > 2 ? sorted.slice(2, 5) : sorted.slice(1)).map(s => s.i);
      if (receivers.length > 0) {
        const perReceiver = lost / receivers.length;
        for (const ri of receivers) perturbed[ri] += perReceiver;
      }
    }
    // 3b. Shock negativo al #2: 10% de simulaciones
    else if (roll < 0.25) {
      const sorted = perturbed.map((v, i) => ({ v, i })).sort((a, b) => b.v - a.v);
      if (sorted.length > 1) {
        const secondIdx = sorted[1].i;
        const shockSize = 5 + Math.random() * 7; // -5 a -12 pts
        const lost = Math.min(perturbed[secondIdx] - 1, shockSize);
        perturbed[secondIdx] -= lost;
        // R1: redistribuir al #3-#5; R2: al único líder
        const receivers = (sorted.length > 2 ? sorted.slice(2, 5) : sorted.slice(0, 1)).map(s => s.i);
        if (receivers.length > 0) {
          const perReceiver = lost / receivers.length;
          for (const ri of receivers) perturbed[ri] += perReceiver;
        }
      }
    }
    // 3c. Shock positivo: 10% de simulaciones (roll 0.25–0.35, R1 y R2)
    //     R1: "efecto Castillo" — candidato del #3-#6 sube fuerte
    //     R2: "efecto debate" — cualquiera de los dos finalistas recibe el swing
    else if (roll < 0.35) {
      const sorted = perturbed.map((v, i) => ({ v, i })).sort((a, b) => b.v - a.v);
      const eligible = sorted.slice(2, 6);
      const shockSize = 5 + Math.random() * 7; // +5 a +12 pts
      if (eligible.length > 0) {
        const luckyIdx = eligible[Math.floor(Math.random() * eligible.length)].i;
        perturbed[luckyIdx] += shockSize;
      } else {
        // R2: swing de debate a cualquier finalista con igual probabilidad
        const debateIdx = Math.random() < 0.5 ? sorted[0].i : sorted[1].i;
        perturbed[debateIdx] += shockSize;
      }
    }

    // 3d. Voto oculto: 10% de simulaciones, solo R2 (nCandidates === 2).
    //     Sesgo estructural tipo Castillo 2021: encuestas urbanas subestiman a candidatos
    //     con base rural fuerte. Aplica solo a Roberto Sánchez Palomino — evidencia R1 2026
    //     muestra subestimación sistemática de 3-5pp en todas las encuestadoras (ONPE 12.0%
    //     vs Ipsos 8.57%, Datum 7.45%). El efecto es candidato-específico, NO al que vaya
    //     atrás en esa simulación (Keiko también puede ir atrás en sims y no tiene este sesgo).
    else if (roll < 0.45 && nCandidates === 2) {
      votoOcultoCount++;
      simVotoOculto = true;
      const sanchezIdx = candidates.indexOf('Roberto Sánchez Palomino');
      if (sanchezIdx !== -1) {
        perturbed[sanchezIdx] += 3 + Math.random() * 3;
      } else {
        // Fallback si la composición del runoff es distinta a la esperada
        const trailingIdx = perturbed[0] >= perturbed[1] ? 1 : 0;
        perturbed[trailingIdx] += 3 + Math.random() * 3;
      }
    }

    // 4. Clamp y normalizar
    const clamped = perturbed.map(v => Math.max(0.1, v));
    const normalized = normalize(clamped, 100);

    for (let i = 0; i < nCandidates; i++) {
      simResults[i].push(normalized[i]);
    }

    // 5. Identificar top-2
    const indexed = normalized.map((v, i) => ({ idx: i, pct: v }));
    indexed.sort((a, b) => b.pct - a.pct);
    const firstIdx = indexed[0].idx;
    const secondIdx = indexed[1].idx;

    runoffCount[firstIdx]++;
    runoffCount[secondIdx]++;

    // 5b. Conteo de escenarios de riesgo
    riskCounters.perCandidate[candidates[firstIdx]].winsFirstRound++;
    riskCounters.perCandidate[candidates[firstIdx]].inTop2++;
    riskCounters.perCandidate[candidates[secondIdx]].inTop2++;
    for (let i = 0; i < nCandidates; i++) {
      if (i !== firstIdx && i !== secondIdx) riskCounters.perCandidate[candidates[i]].missesRunoff++;
      if (normalized[i] >= 20) riskCounters.perCandidate[candidates[i]].gets20plus++;
    }
    // Top-2 esperado: los 2 candidatos con mayor posterior base
    const expectedTop = basePcts.map((v, i) => ({ v, i })).sort((a, b) => b.v - a.v);
    const exp1 = expectedTop[0].i, exp2 = expectedTop[1].i;
    if (!((firstIdx === exp1 && secondIdx === exp2) || (firstIdx === exp2 && secondIdx === exp1))) {
      riskCounters.top2NotTop2Expected++;
    }
    // Sorpresa: ganador no está en top-3 del posterior base (solo aplica R1)
    if (expectedTop.length > 2) {
      const exp3 = expectedTop[2].i;
      if (firstIdx !== exp1 && firstIdx !== exp2 && firstIdx !== exp3) {
        riskCounters.surpriseFirstRoundWinner++;
      }
    }

    // 6. Segunda vuelta con simulateRunoff()
    const finalistA = candidates[firstIdx];
    const finalistB = candidates[secondIdx];
    const firstRoundResults = {};
    for (let i = 0; i < nCandidates; i++) {
      firstRoundResults[candidates[i]] = normalized[i];
    }

    const runoff = simulateRunoff(finalistA, finalistB, firstRoundResults, dynamicRejection);

    if (runoff.winner === finalistA) {
      winCount[firstIdx]++;
    } else {
      winCount[secondIdx]++;
    }
    if (Math.abs(runoff.votesA - runoff.votesB) < 5) closeRunoffCount++;
    if (simVotoOculto && runoff.winner === 'Roberto Sánchez Palomino') votoOcultoWins++;

    // Acumular stats del par
    const pairKey = [finalistA, finalistB].sort().join(' vs ');
    if (!runoffPairStats[pairKey]) {
      runoffPairStats[pairKey] = { wins: {}, blankSum: 0, count: 0 };
    }
    const pair = runoffPairStats[pairKey];
    pair.wins[runoff.winner] = (pair.wins[runoff.winner] || 0) + 1;
    pair.blankSum += runoff.blankPct;
    pair.count++;
  }

  // Estadísticas finales por candidato
  const results = {};

  for (let i = 0; i < nCandidates; i++) {
    const sims = simResults[i].sort((a, b) => a - b);
    const mean = sims.reduce((s, v) => s + v, 0) / nSimulations;
    const p10 = sims[Math.floor(nSimulations * 0.10)];
    const p25 = sims[Math.floor(nSimulations * 0.25)];
    const p40 = sims[Math.floor(nSimulations * 0.40)];
    const p60 = sims[Math.floor(nSimulations * 0.60)];
    const p75 = sims[Math.floor(nSimulations * 0.75)];
    const p90 = sims[Math.floor(nSimulations * 0.90)];

    results[candidates[i]] = {
      mean: parseFloat(mean.toFixed(2)),
      p10:  parseFloat(p10.toFixed(2)),
      p25:  parseFloat(p25.toFixed(2)),
      p40:  parseFloat(p40.toFixed(2)),
      p60:  parseFloat(p60.toFixed(2)),
      p75:  parseFloat(p75.toFixed(2)),
      p90:  parseFloat(p90.toFixed(2)),
      prob_runoff: parseFloat(((runoffCount[i] / nSimulations) * 100).toFixed(2)),
      prob_win:    parseFloat(((winCount[i] / nSimulations) * 100).toFixed(2))
    };
  }

  // Estadísticas de segunda vuelta por par más frecuente
  const runoffSummary = Object.entries(runoffPairStats)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 5)
    .map(([pair, stats]) => ({
      pair,
      frequency: parseFloat(((stats.count / nSimulations) * 100).toFixed(1)),
      wins: Object.fromEntries(
        Object.entries(stats.wins).map(([c, n]) => [c, parseFloat(((n / stats.count) * 100).toFixed(1))])
      ),
      avg_blank_pct: parseFloat((stats.blankSum / stats.count).toFixed(1))
    }));

  // Escenarios de riesgo
  const pct = (n) => parseFloat(((n / nSimulations) * 100).toFixed(1));
  const topByMean = Object.entries(results).sort((a, b) => b[1].mean - a[1].mean);

  // R2 (2 candidatos): escenarios relevantes para segunda vuelta
  // R1 (≥3 candidatos): escenarios de primera vuelta clásicos
  const riskScenarios = nCandidates > 2 ? {
    top2_not_expected: pct(riskCounters.top2NotTop2Expected),
    surprise_winner: pct(riskCounters.surpriseFirstRoundWinner),
    p_close_race: pct(closeRunoffCount),
    candidates: topByMean.slice(0, 6).map(([name, data]) => ({
      candidate: name,
      misses_runoff: pct(riskCounters.perCandidate[name].missesRunoff),
      wins_first_round: pct(riskCounters.perCandidate[name].winsFirstRound),
      in_top2: pct(riskCounters.perCandidate[name].inTop2),
      gets_20plus: pct(riskCounters.perCandidate[name].gets20plus),
    }))
  } : {
    p_close_race: pct(closeRunoffCount),
    voto_oculto_sanchez_win_pct: votoOcultoCount > 0
      ? parseFloat(((votoOcultoWins / votoOcultoCount) * 100).toFixed(1))
      : null,
    candidates: topByMean.slice(0, 2).map(([name, data]) => ({
      candidate: name,
      prob_win: data.prob_win,
    }))
  };

  return { results, runoffSummary, riskScenarios };
}

module.exports = { runMonteCarlo, simulateRunoff, ERROR_CORRELATION, POLLSTER_ORDER, TRANSFER_AFFINITY };
