// Risolve i gruppi di alimenti duplicati (stesso nome, valori diversi):
// per i gruppi che includono almeno una voce src:"CREA" prova una verifica
// automatica su alimentinutrizione.it e unisce il gruppo in UNA sola voce
// (aggiornata con i valori CREA reali dove disponibili), cancellando le
// altre righe duplicate da js/db.js. I gruppi senza nessuna voce CREA
// vengono SOLO segnalati (needs-review), non toccati: non abbiamo ancora
// uno strumento di verifica automatico per BDA/UPF/EXTRA.
//
// Uso: node dedupe-resolve.cjs [--limit N] [--dry-run]

const fs = require('fs');
const path = require('path');
const { search, fetchFood } = require('./crea-lookup.cjs');

const DB_PATH = path.join(__dirname, '..', '..', 'js', 'db.js');
const PROGRESS_PATH = path.join(__dirname, 'progress.json');
const LOG_PATH = path.join(__dirname, 'dedupe-log.json');

const NUM_FIELDS = ['k','p','gs','g','z','ch','fi','ca','fe','mg','k2','na','zn','fo','se','col'];
const CREA_MAP = {
  k: 'Energia (kcal)', p: 'Proteine (g)', g: 'Lipidi (g)', ch: 'Carboidrati disponibili (g)',
  z: 'Zuccheri solubili (g)', fi: 'Fibra totale (g)', ca: 'Calcio (mg)', fe: 'Ferro (mg)',
  mg: 'Magnesio (mg)', k2: 'Potassio (mg)', na: 'Sodio (mg)', zn: 'Zinco (mg)',
  se: 'Selenio (μg)', col: 'Colesterolo (mg)',
};

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// Il motore di ricerca del sito CREA fa un AND su tutte le parole e non
// gestisce bene parentesi o nomi troppo specifici (es. "Spaghetti (pasta di
// semola cruda)" non trova nulla, ma "pasta di semola cruda" sì). Proviamo
// più varianti della query, dalla più specifica alla più generica.
function buildQueryVariants(name) {
  const variants = [];
  const parenMatch = name.match(/\(([^)]+)\)/);
  const withoutParens = name.replace(/\([^)]*\)/g, '').trim();
  if (parenMatch) variants.push(parenMatch[1].trim());
  variants.push(name.replace(/[()]/g, '').trim());
  if (withoutParens && withoutParens !== name) variants.push(withoutParens);
  // Progressivamente più corta (ultime parole spesso sono lo stato: crudo/cotto/fresco ecc, le teniamo)
  const words = (parenMatch ? parenMatch[1] : withoutParens || name).trim().split(/\s+/);
  for (let n = Math.min(4, words.length - 1); n >= 2; n--) {
    variants.push(words.slice(0, n).join(' '));
  }
  if (words.length >= 1) variants.push(words[0]);
  // dedup preservando l'ordine
  return [...new Set(variants.filter(Boolean))];
}

async function searchBestEffort(name) {
  for (const q of buildQueryVariants(name)) {
    const results = await search(q);
    await sleep(250);
    if (results.length) return { results, queryUsed: q };
  }
  return { results: [], queryUsed: null };
}

function normalize(s) {
  return s.toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/).filter(Boolean);
}

function nameSimilarity(a, b) {
  const ta = new Set(normalize(a));
  const tb = new Set(normalize(b));
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  const union = new Set([...ta, ...tb]).size;
  return union === 0 ? 0 : inter / union;
}

// Estrae tutte le coppie chiave:numero presenti in una riga (per confronto robusto,
// non dipende dalla formattazione esatta del numero in sorgente).
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

// Trova l'indice di riga esatto per una entry (nome+src+valori numerici).
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
  // Disambigua con i valori numerici
  const keys = NUM_FIELDS.filter(k => entry[k] != null);
  const exact = candidates.filter(i => fieldsMatch(entry, parseLineFields(lines[i]), keys));
  if (exact.length === 1) return exact[0];
  return null; // ambiguo o non trovato: non tocchiamo nulla
}

function applyCorrections(line, corrections) {
  let out = line;
  for (const [key, val] of Object.entries(corrections)) {
    const re = new RegExp(`\\b${key}:-?\\d+(?:\\.\\d+)?`);
    if (re.test(out)) out = out.replace(re, `${key}:${val}`);
  }
  return out;
}

async function resolveGroup(group, lines, usedIdx) {
  const hasCrea = group.entries.some(e => e.src === 'CREA');
  if (!hasCrea) {
    return { name: group.name, action: 'skip-no-crea-source', ids: group.entries.map(e => e.id) };
  }

  let searchResults, queryUsed;
  try {
    const r = await searchBestEffort(group.name);
    searchResults = r.results;
    queryUsed = r.queryUsed;
  } catch (e) {
    return { name: group.name, action: 'skip-search-error', error: e.message };
  }

  if (!searchResults.length) {
    return { name: group.name, action: 'skip-no-search-match' };
  }
  // Migliore candidato per similarità nome
  let best = null, bestScore = 0;
  for (const r of searchResults) {
    const s = nameSimilarity(group.name, r.title);
    if (s > bestScore) { bestScore = s; best = r; }
  }
  if (!best || bestScore < 0.4) {
    return { name: group.name, action: 'skip-low-confidence', bestTitle: best && best.title, bestScore, queryUsed };
  }

  let creaData;
  try {
    creaData = await fetchFood(best.code);
  } catch (e) {
    return { name: group.name, action: 'skip-fetch-error', error: e.message };
  }
  await sleep(300);

  // Trova le righe corrispondenti a ciascuna entry del gruppo
  const located = group.entries.map(e => ({ e, idx: findLineIndex(lines, e, usedIdx) }));
  if (located.some(l => l.idx === null)) {
    return { name: group.name, action: 'skip-line-not-found', located: located.map(l => ({ id: l.e.id, found: l.idx !== null })) };
  }

  // Tieni la entry CREA (la prima se più di una); aggiorna con i valori CREA reali.
  const keeper = located.find(l => l.e.src === 'CREA') || located[0];
  const toRemove = located.filter(l => l !== keeper);

  const corrections = {};
  for (const [key, label] of Object.entries(CREA_MAP)) {
    const v = creaData.nutrients[label];
    if (v != null) corrections[key] = v;
  }
  // grassi saturi da % se disponibile
  const satPct = creaData.nutrients['Acidi grassi Saturi (%)'];
  const lipidi = creaData.nutrients['Lipidi (g)'];
  if (satPct != null && lipidi != null) corrections.gs = +(lipidi * satPct / 100).toFixed(2);

  const oldLine = lines[keeper.idx];
  lines[keeper.idx] = applyCorrections(oldLine, corrections);
  usedIdx.add(keeper.idx);

  // Marca le righe da rimuovere (rimozione reale fatta a fine batch, in ordine decrescente)
  toRemove.forEach(l => usedIdx.add(l.idx));

  return {
    name: group.name,
    action: 'merged',
    keptId: keeper.e.id,
    removedIds: toRemove.map(l => l.e.id),
    removedLineIdx: toRemove.map(l => l.idx),
    creaCode: best.code,
    creaTitle: best.title,
    queryUsed,
    matchScore: +bestScore.toFixed(2),
    corrections,
    foNote: creaData.nutrients['Folati (μg)'] == null ? 'CREA non riporta folati per questo alimento — fo non verificato' : undefined,
  };
}

async function main() {
  const args = process.argv.slice(2);
  const limitIdx = args.indexOf('--limit');
  const limit = limitIdx >= 0 ? parseInt(args[limitIdx + 1], 10) : Infinity;
  const dryRun = args.includes('--dry-run');

  const allFoods = JSON.parse(fs.readFileSync(path.join(__dirname, 'all-foods.json'), 'utf8'));
  const byName = {};
  allFoods.forEach(f => { (byName[f.n] = byName[f.n] || []).push(f); });
  const sig = f => NUM_FIELDS.map(k => f[k]).join(',');
  const groups = Object.entries(byName)
    .filter(([n, arr]) => arr.length > 1 && new Set(arr.map(sig)).size > 1)
    .map(([n, arr]) => ({ name: n, entries: arr }));

  console.log('Gruppi duplicati conflittuali totali:', groups.length, '— elaboro fino a', limit === Infinity ? 'tutti' : limit);

  const dbText = fs.readFileSync(DB_PATH, 'utf8');
  const lines = dbText.split('\n');
  const usedIdx = new Set();

  const log = [];
  let processed = 0;
  for (const group of groups) {
    if (processed >= limit) break;
    process.stdout.write(`[${processed + 1}/${Math.min(limit, groups.length)}] ${group.name} ... `);
    const result = await resolveGroup(group, lines, usedIdx);
    console.log(result.action);
    log.push(result);
    processed++;
  }

  fs.writeFileSync(LOG_PATH, JSON.stringify(log, null, 1));

  const merged = log.filter(r => r.action === 'merged');
  console.log('\n--- Riepilogo ---');
  const byAction = {};
  log.forEach(r => byAction[r.action] = (byAction[r.action] || 0) + 1);
  console.log(byAction);

  if (dryRun) {
    console.log('DRY RUN: nessuna modifica scritta su db.js. Log in dedupe-log.json.');
    return;
  }

  // Rimuovi le righe marcate (in ordine decrescente per non sfasare gli indici)
  const toDeleteIdx = new Set();
  merged.forEach(r => r.removedLineIdx.forEach(i => toDeleteIdx.add(i)));
  const newLines = lines.filter((_, i) => !toDeleteIdx.has(i));
  fs.writeFileSync(DB_PATH, newLines.join('\n'));

  console.log(`Rimosse ${toDeleteIdx.size} righe duplicate, corrette ${merged.length} voci superstiti. db.js aggiornato.`);
}

main().catch(e => { console.error(e); process.exit(1); });
