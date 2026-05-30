/**
 * onpe_zda_slow_batch.js
 *
 * Browser console script — pegar en resultadoelectoral.onpe.gob.pe
 *
 * Descarga mesas 900k en lotes pequeños con delay real entre requests.
 * Una sesión de browser descarga ~100 mesas → 47 sesiones para cubrir 900001-904703.
 *
 * INSTRUCCIONES:
 *   1. Ir a: https://resultadoelectoral.onpe.gob.pe/main/resumen
 *   2. Abrir DevTools → Console
 *   3. Cambiar BATCH_START y BATCH_END según la sesión (ver tabla abajo)
 *   4. Pegar este script completo y Enter
 *   5. Esperar ~5-6 minutos hasta que descargue el JSON
 *   6. Repetir con siguiente rango en nueva sesión (F5 + re-pegar)
 *
 * TABLA DE SESIONES:
 *   Sesión  1: 900001 - 900100  (ya tenemos, skip si ya tienes el JSON)
 *   Sesión  2: 900101 - 900200
 *   ...
 *   Sesión  5: 900401 - 900500  (ya tenemos, skip)
 *   Sesión  6: 900501 - 900600  ← EMPIEZA AQUÍ (lo que nos falta)
 *   Sesión  7: 900601 - 900700
 *   ...
 *   Sesión 47: 904601 - 904703
 *
 * Por qué funciona lento: 1 request cada 3 segundos → no activa rate limit.
 */

const BATCH_START = 900501;  // ← CAMBIAR por sesión
const BATCH_END   = 900600;  // ← CAMBIAR por sesión (máx 900001 + 99)
const DELAY_MS    = 3000;    // 3 segundos entre requests — NO bajar de 2500

const BASE = 'https://resultadoelectoral.onpe.gob.pe/presentacion-backend';
const ID_ELECCION = 10;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function kfR2Share(kfV, rspV) {
  if (!kfV && !rspV) return null;
  return parseFloat((kfV / (kfV + rspV) * 100).toFixed(2));
}

async function fetchMesa(codigo) {
  try {
    const r = await fetch(
      `${BASE}/actas/buscar/mesa?codigoMesa=${codigo}&idEleccion=${ID_ELECCION}`,
      { headers: { 'Accept': 'application/json' } }
    );
    if (!r.ok || r.status === 204) return null;
    const ct = r.headers.get('content-type') || '';
    if (!ct.includes('json')) return null;
    const d = await r.json();
    if (!d || !d.codigoMesa) return null;
    return d;
  } catch { return null; }
}

function extractVotos(acta) {
  const cands = acta.candidatos || acta.resultados || acta.votos || [];
  let kfV = null, rspV = null;
  for (const c of cands) {
    const name = ((c.nombreCandidato || '') + ' ' + (c.nombreAgrupacionPolitica || '')).toUpperCase();
    if (name.includes('KEIKO') || name.includes('FUJIMORI')) kfV = c.totalVotosValidos ?? c.totalVotos ?? 0;
    if (name.includes('SÁNCHEZ') || name.includes('SANCHEZ') || name.includes('ROBERTO')) rspV = c.totalVotosValidos ?? c.totalVotos ?? 0;
  }
  return { kfV, rspV };
}

async function run() {
  const total = BATCH_END - BATCH_START + 1;
  console.log(`\n🗳️  ZDA Batch: ${BATCH_START} → ${BATCH_END} (${total} códigos, delay=${DELAY_MS}ms)`);
  console.log(`   Tiempo estimado: ~${Math.ceil(total * DELAY_MS / 60000)} minutos\n`);

  const results = {};
  let validas = 0, procesadas = 0;

  for (let code = BATCH_START; code <= BATCH_END; code++) {
    procesadas++;
    const acta = await fetchMesa(code);
    if (acta) {
      const { kfV, rspV } = extractVotos(acta);
      results[code] = {
        codigoMesa: code,
        idUbigeo: acta.idUbigeo || acta.ubigeo || null,
        centroPoblado: acta.centroPoblado || acta.nombreCentroPoblado || null,
        nombreLocalVotacion: acta.nombreLocalVotacion || null,
        totalElectoresHabiles: acta.totalElectoresHabiles ?? null,
        totalVotosEmitidos: acta.totalVotosEmitidos ?? null,
        totalVotosValidos: acta.totalVotosValidos ?? null,
        estadoActa: acta.estadoActa || null,
        kfV,
        rspV,
        kf_r2_share: kfR2Share(kfV, rspV),
      };
      validas++;
    }

    if (procesadas % 10 === 0 || code === BATCH_END) {
      console.log(`   ${procesadas}/${total} | válidas: ${validas} | última: ${code}`);
    }

    if (code < BATCH_END) await sleep(DELAY_MS);
  }

  console.log(`\n✅ Fin: ${validas} mesas válidas de ${total} códigos probados`);

  // Descarga JSON
  const blob = new Blob([JSON.stringify(results, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `zda_${BATCH_START}_${BATCH_END}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  console.log(`📥 Descargado: zda_${BATCH_START}_${BATCH_END}.json`);

  return results;
}

run();
