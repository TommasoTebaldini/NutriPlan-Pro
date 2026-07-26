// Applica decisioni PRESE A MANO (io stesso, guardando manual-review-candidates-upf.json)
// per alimenti src:"UPF", src usa sempre "UPF" (nessun cambio di src come per CREA/BDA).
// Uso: node apply-manual-decisions-off.cjs manual-decisions-upf-batch1.json
const fs = require('fs');
const path = require('path');
const off = require('./off-lookup.cjs');

const DB_PATH = path.join(__dirname, '..', '..', 'js', 'db.js');
const PROGRESS_PATH = path.join(__dirname, 'progress.json');
const NUM_FIELDS = ['k','p','gs','g','z','ch','fi','ca','fe','mg','k2','na','zn','fo','se','col'];

function offToFields(n) {
  const out = {};
  if (n['energy-kcal_100g'] != null) out.k = round1(n['energy-kcal_100g']);
  if (n.proteins_100g != null) out.p = round1(n.proteins_100g);
  if (n.fat_100g != null) out.g = round1(n.fat_100g);
  if (n['saturated-fat_100g'] != null) out.gs = round2(n['saturated-fat_100g']);
  if (n.carbohydrates_100g != null) out.ch = round1(n.carbohydrates_100g);
  if (n.sugars_100g != null) out.z = round1(n.sugars_100g);
  if (n.fiber_100g != null) out.fi = round1(n.fiber_100g);
  if (n.calcium_100g != null) out.ca = round1(n.calcium_100g * 1000);
  if (n.iron_100g != null) out.fe = round2(n.iron_100g * 1000);
  if (n.magnesium_100g != null) out.mg = round1(n.magnesium_100g * 1000);
  if (n.potassium_100g != null) out.k2 = round1(n.potassium_100g * 1000);
  if (n.sodium_100g != null) out.na = round1(n.sodium_100g * 1000);
  else if (n.salt_100g != null) out.na = round1(n.salt_100g * 1000 / 2.5);
  if (n.zinc_100g != null) out.zn = round2(n.zinc_100g * 1000);
  if (n.cholesterol_100g != null) out.col = round1(n.cholesterol_100g * 1000);
  return out;
}
function round1(x) { return Math.round(x * 10) / 10; }
function round2(x) { return Math.round(x * 100) / 100; }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function parseLineFields(line) {
  const out = {};
  const re = /\b(k|p|gs|g|z|ch|fi|ca|fe|mg|k2|na|zn|fo|se|col):(-?\d+(?:\.\d+)?)/g;
  let m; while ((m = re.exec(line))) out[m[1]] = parseFloat(m[2]);
  return out;
}
function fieldsMatch(entryFields, lineFields, keys) {
  for (const k of keys) {
    if (entryFields[k] == null) continue;
    const lv = lineFields[k];
    if (lv == null || Math.abs(lv - entryFields[k]) > 0.005) return false;
  }
  return true;
}
function findLineIndex(lines, name, src, oldValues, usedIdx) {
  const nameToken = `n:"${name}"`, srcToken = `src:"${src}"`;
  const candidates = [];
  for (let i = 0; i < lines.length; i++) {
    if (usedIdx.has(i)) continue;
    if (lines[i].includes(nameToken) && lines[i].includes(srcToken)) candidates.push(i);
  }
  if (candidates.length === 1) return candidates[0];
  if (oldValues) {
    const keys = NUM_FIELDS.filter(k => oldValues[k] != null);
    const exact = candidates.filter(i => fieldsMatch(oldValues, parseLineFields(lines[i]), keys));
    if (exact.length === 1) return exact[0];
  }
  return candidates.length ? candidates[0] : null;
}
function applyCorrections(line, corrections) {
  let out = line;
  for (const [key, val] of Object.entries(corrections)) {
    const re = new RegExp(`\\b${key}:-?\\d+(?:\\.\\d+)?`);
    if (re.test(out)) out = out.replace(re, `${key}:${val}`);
  }
  return out;
}

async function main() {
  const decisionsFile = process.argv[2];
  const decisions = JSON.parse(fs.readFileSync(path.join(__dirname, decisionsFile), 'utf8'));
  const allFoods = JSON.parse(fs.readFileSync(path.join(__dirname, 'all-foods.json'), 'utf8'));
  const foodsById = {}; allFoods.forEach(f => foodsById[f.id] = f);

  const progress = JSON.parse(fs.readFileSync(PROGRESS_PATH, 'utf8'));
  const dbLines = fs.readFileSync(DB_PATH, 'utf8').split('\n');
  const usedIdx = new Set();

  let applied = 0, failed = 0;
  for (const d of decisions) {
    const food = foodsById[d.id];
    if (!food) { console.log('SALTO (id non trovato):', d.n); failed++; continue; }
    process.stdout.write(`${d.n} → OFF ${d.code} ... `);
    try {
      const data = await off.fetchByCode(d.code);
      await sleep(250);
      if (!data) { console.log('PRODOTTO NON TROVATO'); failed++; continue; }
      const corrections = offToFields(data.nutriments || {});
      if (Object.keys(corrections).length === 0) { console.log('NESSUN NUTRIENTE UTILE'); failed++; continue; }
      const idx = findLineIndex(dbLines, food.n, food.src, food, usedIdx);
      if (idx === null) { console.log('RIGA NON TROVATA'); failed++; continue; }
      usedIdx.add(idx);
      dbLines[idx] = applyCorrections(dbLines[idx], corrections);
      progress[d.id] = { n: d.n, src: food.src, status: 'corrected', checked: '2026-07-26', notes: `Verificato a mano su Open Food Facts ${d.code} (${data.title}${data.brands ? ', ' + data.brands : ''}) — revisione diretta dei candidati, non punteggio automatico.`, source: `OFF:${d.code}` };
      applied++;
      console.log('OK (' + data.title + ')');
    } catch (e) {
      console.log('ERRORE: ' + e.message);
      failed++;
    }
  }
  fs.writeFileSync(DB_PATH, dbLines.join('\n'));
  fs.writeFileSync(PROGRESS_PATH, JSON.stringify(progress, null, 1));
  console.log(`\nApplicate ${applied}, fallite ${failed}.`);
}

main().catch(e => { console.error(e); process.exit(1); });
