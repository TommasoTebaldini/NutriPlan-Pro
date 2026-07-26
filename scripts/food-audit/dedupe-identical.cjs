// Rimuove i doppioni con valori IDENTICI (stesso nome, stessi numeri, solo
// src diverso) — nessuna verifica esterna necessaria, tiene la copia CREA
// (o la prima se non c'è una copia CREA) e cancella le altre.
const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', '..', 'js', 'db.js');
const NUM_FIELDS = ['k','p','gs','g','z','ch','fi','ca','fe','mg','k2','na','zn','fo','se','col'];

function parseLineFields(line) {
  const out = {};
  const re = /\b(k|p|gs|g|z|ch|fi|ca|fe|mg|k2|na|zn|fo|se|col):(-?\d+(?:\.\d+)?)/g;
  let m;
  while ((m = re.exec(line))) out[m[1]] = parseFloat(m[2]);
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
function findLineIndex(lines, entry, usedIdx) {
  const nameToken = `n:"${entry.n}"`;
  const srcToken = `src:"${entry.src}"`;
  const candidates = [];
  for (let i = 0; i < lines.length; i++) {
    if (usedIdx.has(i)) continue;
    const line = lines[i];
    if (!line.includes(nameToken) || !line.includes(srcToken)) continue;
    candidates.push(i);
  }
  if (candidates.length === 1) return candidates[0];
  const keys = NUM_FIELDS.filter(k => entry[k] != null);
  const exact = candidates.filter(i => fieldsMatch(entry, parseLineFields(lines[i]), keys));
  if (exact.length === 1) return exact[0];
  return null;
}

const allFoods = JSON.parse(fs.readFileSync(path.join(__dirname, 'all-foods.json'), 'utf8'));
const byName = {};
allFoods.forEach(f => { (byName[f.n] = byName[f.n] || []).push(f); });
const sig = f => NUM_FIELDS.map(k => f[k]).join(',');
const identicalGroups = Object.entries(byName)
  .filter(([n, arr]) => arr.length > 1 && new Set(arr.map(sig)).size === 1)
  .map(([n, arr]) => ({ name: n, entries: arr }));

console.log('Gruppi identici da consolidare:', identicalGroups.length);

const dbText = fs.readFileSync(DB_PATH, 'utf8');
const lines = dbText.split('\n');
const usedIdx = new Set();
const toDeleteIdx = new Set();
let ok = 0, fail = 0;

for (const group of identicalGroups) {
  const located = group.entries.map(e => ({ e, idx: findLineIndex(lines, e, usedIdx) }));
  if (located.some(l => l.idx === null)) {
    console.log('  NON TROVATO, salto:', group.name);
    fail++; continue;
  }
  located.forEach(l => usedIdx.add(l.idx));
  const keeper = located.find(l => l.e.src === 'CREA') || located[0];
  const toRemove = located.filter(l => l !== keeper);
  toRemove.forEach(l => toDeleteIdx.add(l.idx));
  console.log('  OK:', group.name, '→ tengo', keeper.e.id, 'rimuovo', toRemove.map(l=>l.e.id).join(','));
  ok++;
}

const newLines = lines.filter((_, i) => !toDeleteIdx.has(i));
fs.writeFileSync(DB_PATH, newLines.join('\n'));
console.log(`\nConsolidati ${ok}/${identicalGroups.length} gruppi, rimosse ${toDeleteIdx.size} righe. Falliti: ${fail}`);
