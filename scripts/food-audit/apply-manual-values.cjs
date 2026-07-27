// Applica correzioni con VALORI DIRETTI (non da un lookup API, ma da
// ricerca manuale/agent su fonti ufficiali del produttore — usato per
// ONS/APROT/FLAVIS, prodotti medico-nutrizionali senza fonte API
// consultabile). Uso:
//   node apply-manual-values.cjs manual-values-<categoria>-batchN.json
// Formato decisions: [{id, n, values:{k,p,ch,z,g,gs,fi,na,ca,fe,...}, source, notes}]
// Applica SOLO i campi presenti in `values` (update parziale, i campi non
// forniti restano quelli esistenti).
const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', '..', 'js', 'db.js');
const PROGRESS_PATH = path.join(__dirname, 'progress.json');
const NUM_FIELDS = ['k','p','gs','g','z','ch','fi','ca','fe','mg','k2','na','zn','fo','se','col'];

function round1(x) { return Math.round(x * 10) / 10; }
function round2(x) { return Math.round(x * 100) / 100; }

function findLineIndex(lines, name, src, usedIdx) {
  const nameToken = `n:"${name}"`, srcToken = `src:"${src}"`;
  const candidates = [];
  for (let i = 0; i < lines.length; i++) {
    if (usedIdx.has(i)) continue;
    if (lines[i].includes(nameToken) && lines[i].includes(srcToken)) candidates.push(i);
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

function main() {
  const decisionsFile = process.argv[2];
  const src = process.argv[3]; // 'ONS' | 'APROT' | 'FLAVIS'
  const decisions = JSON.parse(fs.readFileSync(path.join(__dirname, decisionsFile), 'utf8'));

  const progress = JSON.parse(fs.readFileSync(PROGRESS_PATH, 'utf8'));
  const dbLines = fs.readFileSync(DB_PATH, 'utf8').split('\n');
  const usedIdx = new Set();

  let applied = 0, failed = 0;
  for (const d of decisions) {
    process.stdout.write(`${d.n} ... `);
    const corrections = {};
    for (const k of NUM_FIELDS) {
      if (d.values[k] == null) continue;
      corrections[k] = (k === 'fe' || k === 'zn' || k === 'gs') ? round2(d.values[k]) : round1(d.values[k]);
    }
    if (Object.keys(corrections).length === 0) { console.log('NESSUN VALORE'); failed++; continue; }
    const idx = findLineIndex(dbLines, d.n, src, usedIdx);
    if (idx === null) { console.log('RIGA NON TROVATA'); failed++; continue; }
    usedIdx.add(idx);
    dbLines[idx] = applyCorrections(dbLines[idx], corrections);
    progress[d.id] = { n: d.n, src, status: 'corrected', checked: '2026-07-27', notes: d.notes || `Verificato a mano su fonte produttore ufficiale: ${d.source}`, source: d.source };
    applied++;
    console.log('OK (' + Object.keys(corrections).join(',') + ')');
  }
  fs.writeFileSync(DB_PATH, dbLines.join('\n'));
  fs.writeFileSync(PROGRESS_PATH, JSON.stringify(progress, null, 1));
  console.log(`\nApplicate ${applied}, fallite ${failed}.`);
}

main();
