// Giro sistematico: per ogni alimento src:"BDA" ancora 'pending' in
// progress.json, cerca la scheda su bda.ieo.it e — solo con un match di
// buona confidenza (stesse guardie anti-errore validate sul giro CREA:
// head-word, stopword, secondo-termine, percentuali, nome monoparola,
// pareggio ambiguo — vedi audit-crea-batch.cjs per la spiegazione di ognuna,
// scoperte tutte da errori REALI durante quel giro) — aggiorna i valori in
// db.js. In più, BDA riporta i FOLATI reali (CREA spesso non li ha): per la
// prima volta corregge anche il campo `fo`, finora mai verificato.
//
// Uso: node audit-bda-batch.cjs --limit 250

const fs = require('fs');
const path = require('path');
const { search, fetchFood } = require('./bda-lookup.cjs');

const DB_PATH = path.join(__dirname, '..', '..', 'js', 'db.js');
const PROGRESS_PATH = path.join(__dirname, 'progress.json');
const BATCH_LOG_PATH = path.join(__dirname, 'bda-batch-log.jsonl');

const NUM_FIELDS = ['k','p','gs','g','z','ch','fi','ca','fe','mg','k2','na','zn','fo','se','col'];
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
    .filter(w => !STOPWORDS.has(w))
    .map(w => SYNONYMS[w] || w);
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
  const jaccard = inter / union;
  const containmentLocal = inter / ta.size;
  return 0.5 * jaccard + 0.5 * containmentLocal;
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
async function searchBestEffort(name) {
  for (const q of buildQueryVariants(name)) {
    const results = await search(q);
    await sleep(200);
    if (results.length) return { results, queryUsed: q };
  }
  return { results: [], queryUsed: null };
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
function findLineIndex(lines, entry) {
  const nameToken = `n:"${entry.n}"`, srcToken = `src:"${entry.src}"`;
  const candidates = [];
  for (let i = 0; i < lines.length; i++) {
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
    else out = out.replace(/,src:/, `,${key}:${val},src:`); // campo assente in origine (es. fo mai popolato)
  }
  return out;
}
function hasRealDiff(entry, corrections) {
  for (const [k, v] of Object.entries(corrections)) {
    const cur = entry[k];
    if (cur == null) return true;
    if (Math.abs(cur - v) > Math.max(0.05, Math.abs(v) * 0.02)) return true;
  }
  return false;
}

async function main() {
  const args = process.argv.slice(2);
  const limitIdx = args.indexOf('--limit');
  const limit = limitIdx >= 0 ? parseInt(args[limitIdx + 1], 10) : 250;

  const allFoods = JSON.parse(fs.readFileSync(path.join(__dirname, 'all-foods.json'), 'utf8'));
  const progress = JSON.parse(fs.readFileSync(PROGRESS_PATH, 'utf8'));

  const targets = allFoods.filter(f => f.src === 'BDA' && progress[f.id] && progress[f.id].status === 'pending').slice(0, limit);
  console.log(`Da elaborare in questo batch: ${targets.length}`);

  const dbText = fs.readFileSync(DB_PATH, 'utf8');
  const lines = dbText.split('\n');

  let nCorrected = 0, nAlreadyOk = 0, nNoMatch = 0, nLowConf = 0, nLineNotFound = 0;
  const logStream = fs.createWriteStream(BATCH_LOG_PATH, { flags: 'a' });

  for (let idx = 0; idx < targets.length; idx++) {
    const f = targets[idx];
    process.stdout.write(`[${idx + 1}/${targets.length}] ${f.n} ... `);
    let result;
    try {
      const { results, queryUsed } = await searchBestEffort(f.n);
      if (!results.length) {
        result = { status: 'needs-review-no-bda-match' };
      } else {
        let best = null, bestScore = 0, second = null, secondScore = 0;
        for (const r of results) {
          const s = nameSimilarity(f.n, r.title);
          if (s > bestScore) { second = best; secondScore = bestScore; best = r; bestScore = s; }
          else if (s > secondScore) { second = r; secondScore = s; }
        }
        const ambiguousTie = best && second && best.id !== second.id && (bestScore - secondScore) < 0.08;
        if (!best || bestScore < 0.5 || ambiguousTie) {
          const tieNote = ambiguousTie ? ` (pareggio con "${second.title}" score ${secondScore.toFixed(2)} — ambiguo, non deciso)` : '';
          result = { status: 'needs-review-low-confidence', notes: `Query "${queryUsed}" → miglior match "${best && best.title}" score ${bestScore.toFixed(2)}${tieNote}` };
          nLowConf++;
        } else {
          const bdaData = await fetchFood(best.id);
          await sleep(200);
          const corrections = {};
          for (const [key, label] of Object.entries(BDA_MAP)) {
            const v = bdaData.nutrients[label];
            if (v != null) corrections[key] = v;
          }
          if (!hasRealDiff(f, corrections)) {
            result = { status: 'corrected', notes: `Verificato su BDA ${best.id} (${best.title}) — già corretto, nessuna modifica necessaria.`, source: bdaData.url };
            nAlreadyOk++;
          } else {
            const idxLine = findLineIndex(lines, f);
            if (idxLine === null) {
              result = { status: 'needs-review-line-not-found' };
              nLineNotFound++;
            } else {
              lines[idxLine] = applyCorrections(lines[idxLine], corrections);
              result = { status: 'corrected', notes: `Corretto su BDA ${best.id} (${best.title}). Campi aggiornati: ${Object.keys(corrections).join(',')}`, source: bdaData.url };
              nCorrected++;
            }
          }
        }
      }
    } catch (e) {
      result = { status: 'needs-review-error', notes: e.message };
    }
    if (result.status === 'needs-review-no-bda-match') nNoMatch++;
    console.log(result.status);
    progress[f.id] = { n: f.n, src: f.src, status: result.status, checked: '2026-07-25', notes: result.notes, source: result.source };
    logStream.write(JSON.stringify({ id: f.id, n: f.n, ...result }) + '\n');
  }
  logStream.end();

  fs.writeFileSync(DB_PATH, lines.join('\n'));
  fs.writeFileSync(PROGRESS_PATH, JSON.stringify(progress, null, 1));

  console.log(`\n--- Riepilogo batch ---`);
  console.log({ corretti: nCorrected, giaCorretti: nAlreadyOk, bassaConfidenza: nLowConf, nessunMatch: nNoMatch, rigaNonTrovata: nLineNotFound });
}

main().catch(e => { console.error(e); process.exit(1); });
