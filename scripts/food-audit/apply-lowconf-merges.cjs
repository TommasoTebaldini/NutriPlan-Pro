// Applica le decisioni manuali in lowconf-decisions.json: per ogni nome in
// "merge" scarica la scheda CREA del codice indicato, aggiorna la voce
// superstite (preferendo quella già src:"CREA") e cancella le altre righe
// duplicate. Non tocca i gruppi in "confirmedAbsent" (restano duplicati,
// serve BDA/fonte produttore).
const fs = require('fs');
const path = require('path');
const { fetchFood } = require('./crea-lookup.cjs');

const DB_PATH = path.join(__dirname, '..', '..', 'js', 'db.js');
const decisions = require('./lowconf-decisions.json');
const allFoods = require('./all-foods.json');

const NUM_FIELDS = ['k','p','gs','g','z','ch','fi','ca','fe','mg','k2','na','zn','fo','se','col'];
const CREA_MAP = {
  k: 'Energia (kcal)', p: 'Proteine (g)', g: 'Lipidi (g)', ch: 'Carboidrati disponibili (g)',
  z: 'Zuccheri solubili (g)', fi: 'Fibra totale (g)', ca: 'Calcio (mg)', fe: 'Ferro (mg)',
  mg: 'Magnesio (mg)', k2: 'Potassio (mg)', na: 'Sodio (mg)', zn: 'Zinco (mg)',
  se: 'Selenio (μg)', col: 'Colesterolo (mg)',
};
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

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
function applyCorrections(line, corrections) {
  let out = line;
  for (const [key, val] of Object.entries(corrections)) {
    const re = new RegExp(`\\b${key}:-?\\d+(?:\\.\\d+)?`);
    if (re.test(out)) out = out.replace(re, `${key}:${val}`);
  }
  return out;
}

async function main() {
  const byName = {};
  allFoods.forEach(f => { (byName[f.n] = byName[f.n] || []).push(f); });

  const dbText = fs.readFileSync(DB_PATH, 'utf8');
  const lines = dbText.split('\n');
  const usedIdx = new Set();
  const toDeleteIdx = new Set();
  const log = [];

  for (const [name, code] of Object.entries(decisions.merge)) {
    const entries = byName[name];
    if (!entries || entries.length < 2) { console.log('SALTO (non trovato/non duplicato):', name); continue; }

    const creaData = await fetchFood(code);
    await sleep(300);

    const located = entries.map(e => ({ e, idx: findLineIndex(lines, e, usedIdx) }));
    if (located.some(l => l.idx === null)) {
      console.log('SALTO (riga non trovata):', name);
      continue;
    }
    located.forEach(l => usedIdx.add(l.idx));

    const keeper = located.find(l => l.e.src === 'CREA') || located[0];
    const toRemove = located.filter(l => l !== keeper);

    const corrections = {};
    for (const [key, label] of Object.entries(CREA_MAP)) {
      const v = creaData.nutrients[label];
      if (v != null) corrections[key] = v;
    }
    const satPct = creaData.nutrients['Acidi grassi Saturi (%)'];
    const lipidi = creaData.nutrients['Lipidi (g)'];
    if (satPct != null && lipidi != null) corrections.gs = +(lipidi * satPct / 100).toFixed(2);

    lines[keeper.idx] = applyCorrections(lines[keeper.idx], corrections);
    toRemove.forEach(l => toDeleteIdx.add(l.idx));

    console.log('MERGE:', name, '→ CREA', code, creaData.title, '| rimuovo', toRemove.map(l=>l.e.id).join(','));
    log.push({ name, code, title: creaData.title, corrections, removedIds: toRemove.map(l => l.e.id), keptId: keeper.e.id });
  }

  const newLines = lines.filter((_, i) => !toDeleteIdx.has(i));
  fs.writeFileSync(DB_PATH, newLines.join('\n'));
  fs.writeFileSync(path.join(__dirname, 'lowconf-merge-log.json'), JSON.stringify(log, null, 1));
  console.log(`\nFatto: ${log.length} gruppi uniti, ${toDeleteIdx.size} righe rimosse.`);
}

main().catch(e => { console.error(e); process.exit(1); });
