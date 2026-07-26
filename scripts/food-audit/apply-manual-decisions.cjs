// Applica decisioni PRESE A MANO (non da un punteggio automatico) — ogni
// riga di un file tipo manual-decisions-batchN.json è stata scelta
// guardando io stesso i candidati reali in manual-review-candidates.json.
// Uso: node apply-manual-decisions.cjs manual-decisions-batch1.json
const fs = require('fs');
const path = require('path');
const crea = require('./crea-lookup.cjs');
const bda = require('./bda-lookup.cjs');

const DB_PATH = path.join(__dirname, '..', '..', 'js', 'db.js');
const PROGRESS_PATH = path.join(__dirname, 'progress.json');

const NUM_FIELDS = ['k','p','gs','g','z','ch','fi','ca','fe','mg','k2','na','zn','fo','se','col'];
const CREA_MAP = {
  k: 'Energia (kcal)', p: 'Proteine (g)', g: 'Lipidi (g)', ch: 'Carboidrati disponibili (g)',
  z: 'Zuccheri solubili (g)', fi: 'Fibra totale (g)', ca: 'Calcio (mg)', fe: 'Ferro (mg)',
  mg: 'Magnesio (mg)', k2: 'Potassio (mg)', na: 'Sodio (mg)', zn: 'Zinco (mg)',
  se: 'Selenio (μg)', col: 'Colesterolo (mg)',
};
const BDA_MAP = {
  k: 'Energia, Ric con fibra (kcal)', p: 'Proteine totali (g)', g: 'Lipidi totali (g)',
  ch: 'Carboidrati disponibili (MSE) (g)', z: 'Carboidrati solubili (MSE) (g)',
  fi: 'Fibra alimentare totale (g)', ca: 'Calcio (mg)', fe: 'Ferro (mg)',
  mg: 'Magnesio (mg)', k2: 'Potassio (mg)', na: 'Sodio (mg)', zn: 'Zinco (mg)',
  se: 'Selenio (ug)', col: 'Colesterolo (mg)', gs: 'Acidi grassi saturi totali (g)',
  fo: 'Folati totali (ug)',
};
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
function applyCorrections(line, corrections, newSrc, oldSrc) {
  let out = line;
  for (const [key, val] of Object.entries(corrections)) {
    const re = new RegExp(`\\b${key}:-?\\d+(?:\\.\\d+)?`);
    if (re.test(out)) out = out.replace(re, `${key}:${val}`);
  }
  if (newSrc !== oldSrc) out = out.replace(new RegExp(`src:"${oldSrc}"`), `src:"${newSrc}"`);
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
    process.stdout.write(`${d.n} → ${d.source} ${d.code} ... `);
    try {
      const data = d.source === 'CREA' ? await crea.fetchFood(d.code) : await bda.fetchFood(d.code);
      await sleep(250);
      const map = d.source === 'CREA' ? CREA_MAP : BDA_MAP;
      const corrections = {};
      for (const [key, label] of Object.entries(map)) {
        const v = data.nutrients[label];
        if (v != null) corrections[key] = v;
      }
      if (d.source === 'CREA') {
        const satPct = data.nutrients['Acidi grassi Saturi (%)'];
        const lipidi = data.nutrients['Lipidi (g)'];
        if (satPct != null && lipidi != null) corrections.gs = +(lipidi * satPct / 100).toFixed(2);
      }
      const idx = findLineIndex(dbLines, food.n, food.src, food, usedIdx);
      if (idx === null) { console.log('RIGA NON TROVATA'); failed++; continue; }
      usedIdx.add(idx);
      dbLines[idx] = applyCorrections(dbLines[idx], corrections, d.source, food.src);
      progress[d.id] = { n: d.n, src: food.src, status: 'corrected', checked: '2026-07-26', notes: `Verificato a mano su ${d.source} ${d.code} (${data.title}) — revisione diretta dei candidati, non punteggio automatico.`, source: `${d.source}:${d.code}` };
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
