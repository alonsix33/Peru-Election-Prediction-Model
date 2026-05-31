const cron = require('node-cron');
const { nowPeru, electoralPhase, timeToElection } = require('../model/clock');
const { handleError } = require('../errors/errorHandler');
const db = require('../db');

const EVENT_SLUG = 'peru-presidential-election-winner';
const GAMMA_BASE_URL = 'https://gamma-api.polymarket.com';
const FETCH_TIMEOUT_MS = 15_000;

// Regex para filtrar placeholders genéricos (candidate A, candidate B, another candidate, etc.)
const PLACEHOLDER_RE = /^candidate\s+[a-z]$/i;
const GENERIC_NAMES = new Set(['another candidate', 'other', '']);

// Mapeo de nombres de la API a nombres canónicos del seed.
// La key es el nombre tal cual viene de la API (extraído del question).
const CANDIDATE_MAP = {
  'Alfonso López Chau':       'López Chau',
  'Rafael López Aliaga':      'Rafael López Aliaga',
  'Roberto Sánchez Palomino': 'Roberto Sánchez Palomino',
  'Jorge Nieto':              'Jorge Nieto',
  'Carlos Álvarez':           'Carlos Álvarez',
  'Keiko Fujimori':           'Keiko Fujimori',
  'Ricardo Belmont':          'Ricardo Belmont',
  'Marisol Pérez Tello':      'Marisol Pérez Tello',
  'Wolfgang Grozo':           'Wolfgang Grozo',
  'Carlos Espá':              'Carlos Espá',
  'César Acuña':              'César Acuña',
  'Yonhy Lescano':            'Yonhy Lescano',
  'Martín Vizcarra':          'Mario Vizcarra',
  'Mesías Guevara':           'Mesías Guevara',
  'George Forsyth':           'George Forsyth',
  'Mario Vizcarra':           'Mario Vizcarra',
  'Vladimir Cerrón':          'Vladimir Cerrón',
  'Roberto Chiabra':          'Roberto Chiabra',
  'Fiorella Molinelli':       'Fiorella Molinelli',
  'José Williams':            'José Williams',
  'Fernando Olivera':         'Fernando Olivera',
  'Rafael Belaúnde Llosa':    'Rafael Belaúnde Llosa',
  'José Luna':                'José Luna',
  'Enrique Valderrama':       'Enrique Valderrama'
};

// Segunda vuelta: solo los 2 finalistas.
const EXPECTED_CANDIDATES = ['Keiko Fujimori', 'Roberto Sánchez Palomino'];

/**
 * Extrae el nombre del candidato del question de cada mercado binario.
 * "Will Rafael López Aliaga win the 2026 Peruvian presidential election?" → "Rafael López Aliaga"
 */
function extractCandidateName(question) {
  return question
    .replace(/^Will\s+/i, '')
    .replace(/\s+win the 2026 Peruvian presidential election\?$/i, '')
    .trim();
}

/**
 * Normaliza un nombre de la API al nombre canónico del seed.
 */
function normalizeCandidateName(apiName) {
  return CANDIDATE_MAP[apiName] || apiName;
}

/**
 * Determina si un nombre es un placeholder genérico que debe filtrarse.
 */
function isPlaceholder(name) {
  if (GENERIC_NAMES.has(name.toLowerCase())) return true;
  if (PLACEHOLDER_RE.test(name)) return true;
  return false;
}

/**
 * Obtiene datos del evento de elecciones de Perú desde Polymarket Gamma API.
 * Estructura: 1 evento → N mercados binarios (uno por candidato).
 */
async function fetchPolymarketData() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const res = await fetch(
      `${GAMMA_BASE_URL}/events?slug=${EVENT_SLUG}`,
      { signal: controller.signal }
    );

    if (!res.ok) {
      throw new Error(`Gamma API responded ${res.status}: ${res.statusText}`);
    }

    const events = await res.json();
    if (!events || events.length === 0) {
      throw new Error(`Event '${EVENT_SLUG}' not found in Gamma API`);
    }

    const event = events[0];
    const eventVolume = parseFloat(event.volume || event.volumeNum || 0);
    const markets = event.markets || [];

    const candidates = [];

    for (const market of markets) {
      // Extraer nombre del candidato del question
      const rawName = extractCandidateName(market.question || '');

      // Filtrar placeholders
      if (isPlaceholder(rawName)) continue;

      // Obtener precio Yes
      let priceYes = 0;
      try {
        const rawPrices = market.outcomePrices;
        const prices = typeof rawPrices === 'string' ? JSON.parse(rawPrices) : rawPrices;
        if (prices && prices.length > 0) {
          priceYes = parseFloat(prices[0]);
        }
      } catch {
        // Si no hay precios, saltar este mercado
        continue;
      }

      // Solo incluir candidatos con probabilidad > 0
      if (priceYes <= 0) continue;

      const canonicalName = normalizeCandidateName(rawName);

      candidates.push({
        candidate: canonicalName,
        probability: priceYes * 100,
        price_yes: priceYes,
        price_no: 1 - priceYes,
        volume_usd: eventVolume  // Volumen total del evento
      });
    }

    // Para R2: filtrar a solo los candidatos esperados (Keiko + Sánchez).
    // Si la API devuelve candidatos R1 con precios residuales, los descartamos.
    // Si no se encuentra ningún candidato R2, omitimos el snapshot (no fallback a R1).
    const r2Candidates = candidates.filter(c => EXPECTED_CANDIDATES.includes(c.candidate));
    if (r2Candidates.length === 0) {
      console.warn('⚠️ Ningún candidato R2 encontrado en la API — snapshot omitido');
      return { candidates: [], volume: 0 };
    }

    return { candidates: r2Candidates, volume: eventVolume };

  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Valida que las probabilidades sumen ~100% (rango 95–105%).
 * Si no, renormaliza y loguea ERR_PM_003.
 */
function validateAndNormalize(candidates) {
  const totalProb = candidates.reduce((sum, c) => sum + c.probability, 0);

  if (totalProb < 95 || totalProb > 105) {
    handleError('POLYMARKET_PRICE_ANOMALY', {
      module: 'scraper/polymarket',
      totalProbability: totalProb.toFixed(2),
      candidateCount: candidates.length
    });

    // Renormalizar
    for (const c of candidates) {
      c.probability = (c.probability / totalProb) * 100;
      c.price_yes = c.probability / 100;
      c.price_no = 1 - c.price_yes;
    }
  }

  return candidates;
}

/**
 * Verifica que todos los candidatos esperados del seed aparezcan en la API.
 * Si falta alguno, loguea ERR_PM_004 por cada uno.
 */
function checkExpectedCandidates(candidates) {
  const found = new Set(candidates.map(c => c.candidate));

  for (const expected of EXPECTED_CANDIDATES) {
    if (!found.has(expected)) {
      handleError('POLYMARKET_CANDIDATE_MISSING', {
        module: 'scraper/polymarket',
        candidate: expected,
        message: `Candidato '${expected}' no encontrado en Polymarket`
      });
    }
  }
}

/**
 * Guarda snapshot en polymarket_snapshots.
 */
async function saveSnapshot(candidates) {
  const now = nowPeru();
  const phase = electoralPhase();

  for (const c of candidates) {
    await db.query(
      `INSERT INTO polymarket_snapshots
       (captured_at_lima, candidate, probability, price_yes, price_no, volume_usd, market_slug, phase, election_round)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 2)`,
      [now.toISO(), c.candidate, c.probability, c.price_yes, c.price_no,
       c.volume_usd, EVENT_SLUG, phase]
    );
  }

  console.log(`✅ Polymarket snapshot guardado: ${candidates.length} candidatos @ ${now.toFormat('dd/MM HH:mm')} Lima (fase: ${phase})`);
  return candidates.length;
}

/**
 * Función principal del scraper — se ejecuta cada hora.
 */
async function scrapePolymarket() {
  const now = nowPeru();
  console.log(`\n🔄 Scraping Polymarket @ ${now.toFormat('dd/MM/yyyy HH:mm:ss')} Lima...`);

  try {
    const data = await fetchPolymarketData();

    if (!data.candidates || data.candidates.length === 0) {
      await handleError('POLYMARKET_CANDIDATE_MISSING', {
        module: 'scraper/polymarket',
        message: 'No candidates returned from API'
      });
      return;
    }

    checkExpectedCandidates(data.candidates);

    const validated = validateAndNormalize(data.candidates);
    await saveSnapshot(validated);

    // Log resumen
    const top = validated.sort((a, b) => b.probability - a.probability).slice(0, 6);
    console.log(`   Volume total: $${(data.volume / 1_000_000).toFixed(2)}M`);
    for (const c of top) {
      console.log(`   ${c.candidate}: ${c.probability.toFixed(1)}%`);
    }

    // Auto-run pipeline después de scrape exitoso
    try {
      const { runFullPipeline } = require('../model/pipeline');
      console.log('\n🧮 Auto-run modelo post-scrape...');
      await runFullPipeline({ saveToDB: true, trigger: 'auto_polymarket_update', electionRound: 2 });
      console.log('✅ Modelo actualizado automáticamente');
    } catch (pipelineErr) {
      console.error('⚠️  Auto-run pipeline falló:', pipelineErr.message);
    }

  } catch (err) {
    await handleError('POLYMARKET_API_TIMEOUT', {
      module: 'scraper/polymarket',
      timeout_ms: FETCH_TIMEOUT_MS
    }, err);
  }
}

/**
 * Inicia el cron job — cada 30 minutos.
 * También ejecuta inmediatamente al arrancar.
 */
/**
 * Verifica si el modelo debe congelarse (post 5pm día de elección).
 * Si ya pasó el corte y no hay foto final, ejecuta una última corrida.
 * Retorna true si el modelo está congelado y no debe correr más.
 */
async function checkElectionFreeze() {
  const now = nowPeru();
  const phase = electoralPhase();

  // Post-elección R2: siempre congelado
  if (phase === 'post_election') {
    console.log('🗳️ Post-elección R2 — modelo congelado permanentemente.');
    return true;
  }

  // Verificar si es día de elección (R2: 7 junio 2026) y pasó el corte de 5pm (ONPE)
  const { isElectionDay } = timeToElection();
  const pastCutoff = now.hour >= 17;

  if (!isElectionDay || !pastCutoff) return false;

  // Verificar si la foto final R2 ya existe
  const { rows } = await db.query(
    "SELECT COUNT(*) FROM model_predictions WHERE trigger = 'final_election_day' AND election_round = 2"
  );
  const finalExists = parseInt(rows[0].count) > 0;

  if (!finalExists) {
    console.log('🗳️ 5pm Lima — ejecutando FOTO FINAL R2 del modelo...');
    try {
      await scrapePolymarket();
    } catch (err) {
      console.error('Scrape final R2 falló:', err.message);
    }
    try {
      const { runFullPipeline } = require('../model/pipeline');
      await runFullPipeline({ saveToDB: true, trigger: 'final_election_day', electionRound: 2 });
      console.log('🗳️ FOTO FINAL R2 guardada. Modelo congelado.');
    } catch (err) {
      console.error('Pipeline final R2 falló:', err.message);
    }
  } else {
    console.log('🗳️ Modelo R2 ya congelado — foto final ya existe.');
  }

  return true;
}

// Retorna el intervalo mínimo en minutos según la fase electoral.
// pre_veda: 60min | veda: 30min | election_day: 15min | post_election: null (no correr)
function getPhaseIntervalMinutes() {
  const phase = electoralPhase();
  if (phase === 'election_day') return 15;
  if (phase === 'veda')         return 30;
  if (phase === 'pre_veda')     return 60;
  return null; // post_election
}

let lastCronRunAt = null;

function startPolymarketCron() {
  console.log('⏰ Polymarket cron job programado: fase-adaptivo (pre_veda 60min / veda 30min / election_day 15min)');

  // Ejecutar inmediatamente al arrancar (respetando freeze)
  (async () => {
    const frozen = await checkElectionFreeze().catch(() => false);
    if (!frozen) {
      lastCronRunAt = nowPeru();
      scrapePolymarket().catch(err => console.error('Scrape inicial falló:', err.message));
    }
  })();

  // Cron de base cada 5 min — decide si correr según intervalo de la fase actual
  cron.schedule('*/5 * * * *', async () => {
    try {
      const frozen = await checkElectionFreeze();
      if (frozen) return;

      const intervalMins = getPhaseIntervalMinutes();
      if (intervalMins === null) return;

      const now = nowPeru();
      if (lastCronRunAt && now.diff(lastCronRunAt, 'minutes').minutes < intervalMins) return;

      lastCronRunAt = now;
      await scrapePolymarket();
    } catch (err) {
      console.error('Cron scrape falló (no-fatal):', err.message);
    }
  });

  // Watchdog: cada 20 min, respetando freeze
  setInterval(async () => {
    try {
      const frozen = await checkElectionFreeze();
      if (frozen) return;
      const { rows } = await db.query('SELECT MAX(captured_at) as last FROM polymarket_snapshots');
      if (rows[0].last) {
        const minsAgo = (Date.now() - new Date(rows[0].last)) / 60000;
        if (minsAgo > 40) {
          console.warn(`⚠️ Watchdog: último snapshot hace ${minsAgo.toFixed(0)} min — forzando scrape`);
          await scrapePolymarket();
        }
      }
    } catch (err) {
      console.error('Watchdog error:', err.message);
    }
  }, 20 * 60 * 1000);
}

module.exports = { scrapePolymarket, startPolymarketCron, fetchPolymarketData };
