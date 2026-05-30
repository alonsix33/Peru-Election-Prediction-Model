#!/usr/bin/env node
/**
 * merge_zda_batches.js
 *
 * Combina todos los archivos zda_XXXXXX_YYYYYY.json descargados del browser
 * con r1_zda_mesas.json (el existente con 900001-900500) y guarda el resultado.
 *
 * Uso:
 *   node scripts/merge_zda_batches.js ~/Downloads/zda_*.json
 *
 * Output:
 *   backend/data/r1_zda_mesas.json  (actualizado con todos los batches)
 *   + re-corre merge_zda_into_flat.js automáticamente
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const zdaPath = path.join(ROOT, 'backend/data/r1_zda_mesas.json');

// Load existing
let existing = {};
if (fs.existsSync(zdaPath)) {
  existing = JSON.parse(fs.readFileSync(zdaPath, 'utf8'));
  // normalize to keyed-by-code object
  if (Array.isArray(existing)) {
    const keyed = {};
    existing.forEach(m => { keyed[m.codigoMesa] = m; });
    existing = keyed;
  }
  console.log(`Existing mesas: ${Object.keys(existing).length}`);
}

// Load each batch file from args
const batchFiles = process.argv.slice(2);
if (batchFiles.length === 0) {
  console.error('Usage: node merge_zda_batches.js ~/Downloads/zda_*.json');
  process.exit(1);
}

let added = 0, skipped = 0;
for (const f of batchFiles) {
  if (!fs.existsSync(f)) { console.warn(`Not found: ${f}`); continue; }
  const batch = JSON.parse(fs.readFileSync(f, 'utf8'));
  const mesas = Array.isArray(batch) ? batch : Object.values(batch);
  for (const m of mesas) {
    const key = m.codigoMesa;
    if (!existing[key]) {
      existing[key] = m;
      added++;
    } else {
      skipped++;
    }
  }
  console.log(`Loaded ${path.basename(f)}: ${mesas.length} mesas`);
}

console.log(`\nAdded: ${added} | Already existed: ${skipped}`);
console.log(`Total mesas: ${Object.keys(existing).length}`);

// Sort by codigoMesa
const sorted = {};
Object.keys(existing).sort((a, b) => parseInt(a) - parseInt(b))
  .forEach(k => { sorted[k] = existing[k]; });

fs.writeFileSync(zdaPath, JSON.stringify(sorted, null, 2));
console.log(`\nSaved: ${zdaPath}`);

// Auto-run merge into flat
console.log('\nRunning merge_zda_into_flat.js...');
execSync(`node ${path.join(__dirname, 'merge_zda_into_flat.js')}`, { stdio: 'inherit' });
