require('dotenv').config();

const express = require('express');
const { validateSystemIntegrity } = require('./startup');
const { startPolymarketCron } = require('./scraper/polymarket');
const { startOnpeCron } = require('./jobs/onpeCron');
const routes = require('./api/routes');

const app = express();
const PORT = process.env.PORT || 3000;

// CORS — bookmarklet ONPE necesita Authorization header para inject-snapshot
app.options('/(.*)', (req, res) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  res.sendStatus(204);
});

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  next();
});

app.use(express.json());

// Estado del sistema — se actualiza después de la validación
let systemStatus = 'starting';

// API routes
app.use('/api', routes);

// Health check — debe responder SIEMPRE, incluso si DB no está lista
app.get('/', (req, res) => {
  res.json({
    name: 'Peru Election Prediction Model 2026',
    version: '2.0',
    status: systemStatus,
    docs: [
      'GET /api/status        — hora Lima, fase, α actual',
      'GET /api/predictions   — última predicción automática (actualizada cada 30 min)',
      'GET /api/polymarket    — último snapshot de Polymarket',
      'GET /api/polls         — encuestas con pesos efectivos',
      'GET /api/run-model     — simulación personal (no guarda en DB)',
      'GET /api/model-history — últimas 20 corridas automáticas'
    ]
  });
});

// 1. Escuchar PRIMERO — Railway necesita healthcheck antes de validar DB
app.listen(PORT, () => {
  console.log(`🗳️  API escuchando en puerto ${PORT}`);

  // 2. Validar sistema DESPUÉS de que Express ya está escuchando
  validateSystemIntegrity()
    .then(() => {
      systemStatus = 'ready';
      startPolymarketCron();
      startOnpeCron();
    })
    .catch(err => {
      console.error('⚠️  Sistema arrancó con errores:', err.message);
      systemStatus = 'degraded';
      // No process.exit — el servidor sigue corriendo en modo degradado
    });
});
