// Risolve i gruppi duplicati rimasti provando PRIMA CREA poi, se non trova
// un match abbastanza sicuro, BDA (a differenza di dedupe-resolve.cjs, che
// usava solo CREA). Stesse 6 guardie anti-errore validate sui giri
// sistematici precedenti (head-word, stopword, secondo-termine, percentuali,
// nome monoparola, pareggio ambiguo — vedi audit-crea-batch.cjs).
//
// Uso: node dedupe-resolve-v2.cjs [--limit N] [--dry-run]

const fs = require('fs');
const path = require('path');
const crea = require('./crea-lookup.cjs');
const bda = require('./bda-lookup.cjs');

const DB_PATH = path.join(__dirname, '..', '..', 'js', 'db.js');
const PROGRESS_PATH = path.join(__dirname, 'progress.json');
const LOG_PATH = path.join(__dirname, 'dedupe-v2-log.jsonl');

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

const SYNONYMS = { petto: 'fesa', fesa: 'fesa', fettina: 'fesa', filetto: 'fesa', parz: 'parzialmente', magro: 'magro', sgrassato: 'magro' };
const STOPWORDS = new Set(['di','da','in','con','e','il','lo','la','i','gli','le','un','una','del','della','dei','delle','al','allo','alla']);
function normalize(s) {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean)
    .filter(w => !STOPWORDS.has(w)).map(w => SYNONYMS[w] || w);
}
function headWord(s) { const n = normalize(s); return n.length ? n[0] : null; }
const STATE_WORDS = new Set(['crudo','crudi','cruda','crude','cotto','cotti','cotta','cotte','secco','secchi','secca','secche','fresco','freschi','fresca','fresche','surgelato','surgelata','surgelati','bollito','bollita','bolliti','intero','intera','interi','scremato','scremata','parzialmente','affumicato','affumicata','scolato','scolata','salato','salata','tostato','tostata','tostati','arrosto','grigliato','grigliata','padella','vapore','microonde','forno','pastorizzato','pastorizzata']);
function secondContentWord(s) {
  const n = normalize(s).filter(w => !STATE_WORDS.has(w));
  return n.length >= 2 ? n[1] : null;
}
function explicitPercents(s) {
  return (s.match(/\d+(?:[.,]\d+)?\s*%/g) || []).map(x => parseFloat(x.replace(',', '.')));
}
function nameSimilarity(a, b) {
  const ta = new Set(normalize(a)), tb = new Set(normalize(b));
  if (ta.size === 0 || tb.size === 0) return 0;
  const ha = headWord(a), hb = headWord(b);
  if (ha !== hb) return 0;
  const secondA = secondContentWord(a);
  if (secondA && !tb.has(secondA)) return 0;
  if (!secondA) {
    const extra = [...tb].filter(w => w !== hb && !STATE_WORDS.has(w));
    if (extra.length) return 0;
  }
  const pctA = explicitPercents(a);
  if (pctA.length) {
    const pctB = explicitPercents(b);
    if (!pctB.length || !pctA.some(p => pctB.some(q => Math.abs(p - q) < 0.5))) return 0;
  }
  let inter = 0; for (const t of ta) if (tb.has(t)) inter++;
  const union = new Set([...ta, ...tb]).size;
  return 0.5 * (inter / union) + 0.5 * (inter / ta.size);
}
function buildQueryVariants(name) {
  const variants = [];
  const parenMatch = name.match(/\(([^)]+)\)/);
  const withoutParens = name.replace(/\([^)]*\)/g, '').trim();
  if (parenMatch) variants.push(parenMatch[1].trim());
  variants.push(name.replace(/[()]/g, '').trim());
  if (withoutParens && withoutParens !== name) variants.push(withoutParens);
  const words = (parenMatch ? parenMatch[1] : withoutParens || name).trim().split(/\s+/);
  for (let n = Math.min(4, words.length - 1); n >= 2; n--) variants.push(words.slice(0, n).join(' '));
  if (words.length >= 1) variants.push(words[0]);
  return [...new Set(variants.filter(Boolean))];
}
async function bestMatch(name, searchFn) {
  for (const q of buildQueryVariants(name)) {
    const results = await searchFn(q);
    await sleep(200);
    if (!results.length) continue;
    let best = null, bestScore = 0, second = null, secondScore = 0;
    for (const r of results) {
      const s = nameSimilarity(name, r.title);
      if (s > bestScore) { second = best; secondScore = bestScore; best = r; bestScore = s; }
      else if (s > secondScore) { second = r; secondScore = s; }
    }
    const ambiguousTie = best && second && (best.code || best.id) !== (second.code || second.id) && (bestScore - secondScore) < 0.08;
    if (best && bestScore >= 0.5 && !ambiguousTie) return { best, bestScore, queryUsed: q };
    if (best && bestScore >= 0.5 && ambiguousTie) continue; // prova la prossima variante di query, magari disambigua
  }
  return null;
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
function findLineIndex(lines, entry, usedIdx) {
  const nameToken = `n:"${entry.n}"`, srcToken = `src:"${entry.src}"`;
  const candidates = [];
  for (let i = 0; i < lines.length; i++) {
    if (usedIdx.has(i)) continue;
    if (lines[i].includes(nameToken) && lines[i].includes(srcToken)) candidates.push(i);
  }
  if (candidates.length === 1) return candidates[0];
  const keys = NUM_FIELDS.filter(k => entry[k] != null);
  const exact = candidates.filter(i => fieldsMatch(entry, parseLineFields(lines[i]), keys));
  return exact.length === 1 ? exact[0] : null;
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
  const name = group.name;

  let source = null, matchInfo = null, data = null;
  const creaResult = await bestMatch(name, crea.search);
  if (creaResult) {
    data = await crea.fetchFood(creaResult.best.code);
    await sleep(200);
    source = 'CREA'; matchInfo = creaResult;
  } else {
    const bdaResult = await bestMatch(name, bda.search);
    if (bdaResult) {
      data = await bda.fetchFood(bdaResult.best.id);
      await sleep(200);
      source = 'BDA'; matchInfo = bdaResult;
    }
  }

  if (!source) return { name, action: 'no-match-either-source', ids: group.entries.map(e => e.id) };

  const located = group.entries.map(e => ({ e, idx: findLineIndex(lines, e, usedIdx) }));
  if (located.some(l => l.idx === null)) {
    return { name, action: 'line-not-found', ids: group.entries.map(e => e.id) };
  }

  // Preferisci come "keeper" una entry già taggata con la fonte trovata; altrimenti la prima.
  const keeper = located.find(l => l.e.src === source) || located[0];
  const toRemove = located.filter(l => l !== keeper);

  const map = source === 'CREA' ? CREA_MAP : BDA_MAP;
  const corrections = {};
  for (const [key, label] of Object.entries(map)) {
    const v = data.nutrients[label];
    if (v != null) corrections[key] = v;
  }
  if (source === 'CREA') {
    const satPct = data.nutrients['Acidi grassi Saturi (%)'];
    const lipidi = data.nutrients['Lipidi (g)'];
    if (satPct != null && lipidi != null) corrections.gs = +(lipidi * satPct / 100).toFixed(2);
  }

  let newLine = applyCorrections(lines[keeper.idx], corrections);
  // Se la fonte trovata è diversa dal src della entry tenuta (es. teniamo la
  // riga CREA ma il match buono era su BDA), il tag src deve seguire i dati
  // reali — altrimenti resterebbe un'etichetta di provenienza falsa.
  if (keeper.e.src !== source) {
    newLine = newLine.replace(new RegExp(`src:"${keeper.e.src}"`), `src:"${source}"`);
  }
  lines[keeper.idx] = newLine;
  usedIdx.add(keeper.idx);
  toRemove.forEach(l => usedIdx.add(l.idx));

  return {
    name, action: 'merged', source,
    keptId: keeper.e.id, removedIds: toRemove.map(l => l.e.id), removedLineIdx: toRemove.map(l => l.idx),
    matchCode: source === 'CREA' ? matchInfo.best.code : matchInfo.best.id,
    matchTitle: matchInfo.best.title, queryUsed: matchInfo.queryUsed, matchScore: +matchInfo.bestScore.toFixed(2),
    corrections,
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

  const logStream = fs.createWriteStream(LOG_PATH, { flags: 'a' });
  let processed = 0;
  const summary = {};
  const results = [];
  for (const group of groups) {
    if (processed >= limit) break;
    process.stdout.write(`[${processed + 1}/${Math.min(limit, groups.length)}] ${group.name} ... `);
    let result;
    try {
      result = await resolveGroup(group, lines, usedIdx);
    } catch (e) {
      result = { name: group.name, action: 'error', error: e.message };
    }
    console.log(result.action);
    summary[result.action] = (summary[result.action] || 0) + 1;
    logStream.write(JSON.stringify(result) + '\n');
    results.push(result);
    processed++;
  }
  logStream.end();

  console.log('\n--- Riepilogo ---');
  console.log(summary);

  if (dryRun) { console.log('DRY RUN: nessuna modifica scritta.'); return; }

  const toDeleteIdx = new Set();
  results.filter(r => r.action === 'merged').forEach(r => r.removedLineIdx.forEach(i => toDeleteIdx.add(i)));
  const newLines = lines.filter((_, i) => !toDeleteIdx.has(i));
  fs.writeFileSync(DB_PATH, newLines.join('\n'));
  fs.writeFileSync(path.join(__dirname, 'dedupe-v2-results.json'), JSON.stringify(results, null, 1));
  console.log(`db.js aggiornato: ${results.filter(r=>r.action==='merged').length} gruppi uniti, ${toDeleteIdx.size} righe duplicate rimosse.`);
}

main().catch(e => { console.error(e); process.exit(1); });
