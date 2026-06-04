#!/usr/bin/env node
/**
 * verify_relay.js — test end-to-end del relay bookmarklet → Railway
 *
 * Uso:
 *   RAILWAY_URL=https://xxx.railway.app ADMIN_SECRET=xxx node scripts/verify_relay.js
 *
 * Sin variables de entorno: prueba contra localhost:3000 con secret "test-secret".
 *
 * Tests:
 *   1. OPTIONS preflight (CORS)
 *   2. POST sin auth → 401
 *   3. POST con auth incorrecta → 401
 *   4. POST con auth correcta, payload vacío → guardado (has_data=false)
 *   5. POST con auth correcta, snapshot real (~40% actas) → proyección ejecutada
 */

const http  = require('http');
const https = require('https');

const RAILWAY_URL  = process.env.RAILWAY_URL  || 'http://localhost:3000';
const ADMIN_SECRET = process.env.ADMIN_SECRET || 'test-secret';

const isHttps = RAILWAY_URL.startsWith('https');
const lib     = isHttps ? https : http;

function request(method, path, headers = {}, body = null) {
  return new Promise((resolve, reject) => {
    const url  = new URL(path, RAILWAY_URL);
    const opts = {
      hostname: url.hostname,
      port:     url.port || (isHttps ? 443 : 80),
      path:     url.pathname + url.search,
      method,
      headers: { 'Content-Type': 'application/json', ...headers },
    };
    const req = lib.request(opts, res => {
      let data = '';
      res.on('data', c => (data += c));
      res.on('end', () => {
        let json;
        try { json = JSON.parse(data); } catch { json = data; }
        resolve({ status: res.statusCode, headers: res.headers, body: json });
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

// ── Mock snapshot que simula ~40% actas con depts Lima+Callao+ICA reportando
// Ubigeos correctos (ONPE ubigeo 6-digit): Lima=140000, Callao=240000, ICA=100000
// R2 shares simuladas: Lima 82% KF (vs R1 baseline 84.5%), shift -2.5pp (realista)
// Nacional raw: Lima+Callao+ICA dominan → 81% KF raw → alta sobrerepresentación KF
const MOCK_SNAPSHOT_40PCT = {
  captured_at:    new Date().toISOString(),
  has_data:       true,
  actas_total:    88000,
  actas_processed: 35200,
  pct_actas:      40.0,
  keiko_votos:    2050000,   // Lima+Callao+ICA dominant → raw ~81% KF
  keiko_pct:      80.6,
  sanchez_votos:   495000,
  sanchez_pct:    19.4,
  dept_breakdown: [
    // R1 bilaterals: Lima 84.5%, Callao 87.3%, ICA 72.5%
    // R2 shifts simulated: Lima -2.5pp, Callao -3pp, ICA -5pp (KF slightly underperforms R1)
    { ubigeo: '140000', nombre: 'LIMA',   keiko_votos: 1540000, sanchez_votos: 340000 },  // 82.0% KF
    { ubigeo: '240000', nombre: 'CALLAO', keiko_votos:  160000, sanchez_votos:  37000 },  // 84.2% KF
    { ubigeo: '100000', nombre: 'ICA',    keiko_votos:  120000, sanchez_votos:  55000 },  // 68.6% KF
  ],
  province_breakdown: [],
  district_breakdown: [],
  ext_breakdown: [],
};

async function run() {
  console.log(`\n🗳️  verify_relay.js — ${RAILWAY_URL}\n${'─'.repeat(60)}`);

  // ── Test 1: CORS preflight ─────────────────────────────────────
  console.log('\n[1] OPTIONS /api/admin/inject-snapshot (CORS preflight)');
  try {
    const r = await request('OPTIONS', '/api/admin/inject-snapshot', {
      'Origin': 'https://resultadoelectoral.onpe.gob.pe',
      'Access-Control-Request-Method': 'POST',
      'Access-Control-Request-Headers': 'Authorization,Content-Type',
    });
    const acao = r.headers['access-control-allow-origin'];
    const acah = r.headers['access-control-allow-headers'] || '';
    const ok = r.status === 204 && acao && acah.toLowerCase().includes('authorization');
    console.log(`  Status: ${r.status}  ACAO: ${acao}  → ${ok ? '✅ CORS OK' : '❌ CORS FAIL'}`);
    if (!ok) console.log('  Headers:', r.headers);
  } catch (e) {
    console.log(`  ❌ Connection error: ${e.message}`);
    console.log('  ⚠️  Is Railway/server running?');
    process.exit(1);
  }

  // ── Test 2: sin auth → 401 ──────────────────────────────────────
  console.log('\n[2] POST sin Authorization → debe ser 401');
  {
    const r = await request('POST', '/api/admin/inject-snapshot', {}, { test: true });
    console.log(`  Status: ${r.status}  → ${r.status === 401 ? '✅' : `❌ esperaba 401, got ${r.status}`}`);
  }

  // ── Test 3: auth incorrecta → 401 ──────────────────────────────
  console.log('\n[3] POST con Bearer WRONG-SECRET → debe ser 401');
  {
    const r = await request('POST', '/api/admin/inject-snapshot',
      { Authorization: 'Bearer WRONG-SECRET-DEFINITELY-INVALID' }, { test: true });
    console.log(`  Status: ${r.status}  → ${r.status === 401 ? '✅' : `❌ esperaba 401, got ${r.status}`}`);
  }

  // ── Test 4: auth correcta, payload vacío ───────────────────────
  console.log('\n[4] POST con auth correcta, has_data=false');
  {
    const r = await request('POST', '/api/admin/inject-snapshot',
      { Authorization: `Bearer ${ADMIN_SECRET}` },
      { has_data: false, pct_actas: 0 });
    const ok = r.status === 200 && r.body?.ok === true;
    console.log(`  Status: ${r.status}  body: ${JSON.stringify(r.body)}  → ${ok ? '✅' : '❌'}`);
    if (!ok && r.status === 503) {
      console.log('  ⚠️  ADMIN_SECRET not set on server — set env var and restart');
    }
  }

  // ── Test 5: snapshot real ~40% ─────────────────────────────────
  console.log('\n[5] POST snapshot real ~40% actas (Lima+Callao+ICA reportando)');
  {
    const r = await request('POST', '/api/admin/inject-snapshot',
      { Authorization: `Bearer ${ADMIN_SECRET}` },
      MOCK_SNAPSHOT_40PCT);
    const ok = r.status === 200 && r.body?.ok === true;
    const snid = r.body?.snapshot_id;
    console.log(`  Status: ${r.status}  snapshot_id: ${snid}  has_data: ${r.body?.has_data}  → ${ok ? '✅' : '❌'}`);
    if (ok) {
      // Fetch the live projection to verify it ran
      const proj = await request('GET', '/api/live-projection');
      if (proj.status === 200 && proj.body?.projected) {
        const p = proj.body.projected;
        console.log(`\n  📊 Proyección obtenida:`);
        console.log(`     pct_actas:       ${proj.body.pct_actas}%`);
        console.log(`     raw KF:          ${proj.body.observed?.kf_r2_share}%`);
        console.log(`     proyectado KF:   ${p.kf_r2_share}%`);
        console.log(`     CI 95:           [${p.ci_95?.lo}%, ${p.ci_95?.hi}%]`);
        console.log(`     ganador:         ${p.winner}  margin: ${p.margin_pp}pp`);
        console.log(`     shift nivel:     ${proj.body.shift_granularity}`);
        console.log(`     shift nacional:  ${proj.body.national_shift_pp}pp`);
        const bias = (proj.body.observed?.kf_r2_share || 0) - (p.kf_r2_share || 0);
        console.log(`\n  ✅ Corrección del sesgo Lima: ${bias > 0 ? '-' : '+'}${Math.abs(bias).toFixed(2)}pp`);
        console.log(`     (raw KF - proyectado KF — debe ser positivo si Lima domina)`);
      } else {
        console.log(`  ⚠️  /api/live-projection returned ${proj.status}`);
      }
    }
  }

  console.log(`\n${'─'.repeat(60)}`);
  console.log('Checklist pre-7J:');
  console.log('  [ ] RAILWAY_URL real editado en bookmarklet (solo copia local)');
  console.log('  [ ] ADMIN_SECRET real editado en bookmarklet (solo copia local)');
  console.log('  [ ] Este script corrido contra Railway live con vars reales: ✅ todos los tests');
  console.log('  [ ] idEleccion confirmado en sitio ONPE (esperado: 11)');
  console.log('  [ ] Tab ONPE abierto antes de 20:00 PET del 7J\n');
}

run().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
