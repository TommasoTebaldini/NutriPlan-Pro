// Applica decisioni PRESE A MANO (io stesso, guardando
// manual-review-candidates-extra.json) per alimenti src:"EXTRA" verificati
// su USDA FoodData Central. Uso:
//   USDA_API_KEY=xxx node apply-manual-decisions-usda.cjs manual-decisions-extra-batch1.json
const fs = require('fs');
const path = require('path');
const usda = require('./usda-lookup.cjs');

const DB_PATH = path.join(__dirname, '..', '..', 'js', 'db.js');
const PROGRESS_PATH = path.join(__dirname, 'progress.json');
const NUM_FIELDS = ['k','p','gs','g','z','ch','fi','ca','fe','mg','k2','na','zn','fo','se','col'];

function round1(x) { return Math.round(x * 10) / 10; }
function round2(x) { return Math.round(x * 100) / 100; }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function usdaToFields(n) {
  const out = {};
  if (n.k != null) out.k = round1(n.k);
  if (n.p != null) out.p = round1(n.p);
  if (n.g != null) out.g = round1(n.g);
  if (n.gs != null) out.gs = round2(n.gs);
  if (n.ch != null) out.ch = round1(n.ch);
  if (n.z != null) out.z = round1(n.z);
  if (n.fi != null) out.fi = round1(n.fi);
  if (n.ca != null) out.ca = round1(n.ca);
  if (n.fe != null) out.fe = round2(n.fe);
  if (n.mg != null) out.mg = round1(n.mg);
  if (n.k2 != null) out.k2 = round1(n.k2);
  if (n.na != null) out.na = round1(n.na);
  if (n.zn != null) out.zn = round2(n.zn);
  if (n.se != null) out.se = round1(n.se);
  if (n.fo != null) out.fo = round1(n.fo);
  if (n.col != null) out.col = round1(n.col);
  return out;
}

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
    process.stdout.write(`${d.n} → USDA ${d.code} ... `);
    try {
      const data = await usda.fetchFood(d.code);
      await sleep(200);
      const corrections = usdaToFields(data.nutrients || {});
      if (Object.keys(corrections).length === 0) { console.log('NESSUN NUTRIENTE UTILE'); failed++; continue; }
      const idx = findLineIndex(dbLines, food.n, food.src, food, usedIdx);
      if (idx === null) { console.log('RIGA NON TROVATA'); failed++; continue; }
      usedIdx.add(idx);
      dbLines[idx] = applyCorrections(dbLines[idx], corrections);
      progress[d.id] = { n: d.n, src: food.src, status: 'corrected', checked: '2026-07-26', notes: `Verificato a mano su USDA FoodData Central fdcId ${d.code} (${data.title}) — revisione diretta dei candidati, non punteggio automatico.`, source: `USDA:${d.code}` };
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
