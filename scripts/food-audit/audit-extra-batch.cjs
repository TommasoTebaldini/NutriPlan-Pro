// Giro sistematico per gli alimenti src:"EXTRA" (esotici/internazionali)
// ancora 'pending': cerca su USDA FoodData Central (solo Foundation + SR
// Legacy, niente Branded — vedi usda-lookup.cjs) e aggiorna in-place.
//
// Sfida in più rispetto a CREA/BDA: i nomi locali sono in ITALIANO, USDA è
// in INGLESE. La parola-testa (identità dell'alimento, es. "Mango"/"Quinoa")
// è quasi sempre uguale o quasi-uguale nelle due lingue (prestito diretto),
// ma le parole di stato (crudo/cotto/fresco) NON lo sono — serve una
// piccola traduzione IT→EN prima di applicare le stesse guardie già
// validate su CREA/BDA (head-word, secondo-termine, ordine, guardie
// categoria). Molti alimenti pending qui sono piatti etnici COMPOSTI
// (Ramen, Tacos, Moussaka...) che USDA Foundation/SR Legacy — pensato per
// ingredienti singoli — probabilmente non ha: aspettarsi un tasso di
// "nessun match" alto, è il comportamento SICURO, non un difetto.
//
// Uso: USDA_API_KEY=xxx node audit-extra-batch.cjs --limit 100

const fs = require('fs');
const path = require('path');
const usda = require('./usda-lookup.cjs');

const DB_PATH = path.join(__dirname, '..', '..', 'js', 'db.js');
const PROGRESS_PATH = path.join(__dirname, 'progress.json');
const BATCH_LOG_PATH = path.join(__dirname, 'extra-batch-log.jsonl');

const NUM_FIELDS = ['k','p','gs','g','z','ch','fi','ca','fe','mg','k2','na','zn','fo','se','col'];

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// Traduzione IT→EN delle parole di stato/descrittori più comuni nei nomi
// locali — SOLO queste, non un traduttore generico (rischioso, meglio
// tradurre poco ma con sicurezza che tradurre tanto e sbagliare).
const IT_EN = {
  crudo: 'raw', cruda: 'raw', crudi: 'raw', crude: 'raw',
  cotto: 'cooked', cotta: 'cooked', cotti: 'cooked', cotte: 'cooked',
  fresco: 'raw', fresca: 'raw', freschi: 'raw', fresche: 'raw',
  secco: 'dried', secca: 'dried', secchi: 'dried', secche: 'dried',
  essiccato: 'dried', essiccata: 'dried',
  tostato: 'roasted', tostata: 'roasted', tostati: 'roasted',
  bollito: 'boiled', bollita: 'boiled',
  fritto: 'fried', fritta: 'fried',
  vapore: 'steamed',
  polvere: 'powder',
  affumicato: 'smoked', affumicata: 'smoked',
  surgelato: 'frozen', surgelata: 'frozen',
  spremuto: 'juice', succo: 'juice',
  marinato: 'marinated', marinata: 'marinated',
  speziato: 'spiced', speziata: 'spiced',
};
const STOPWORDS = new Set(['di','da','in','con','e','il','lo','la','i','gli','le','un','una','del','della','dei','delle','al','allo','alla','per']);
function normalize(s) {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean)
    .filter(w => !STOPWORDS.has(w))
    .map(w => IT_EN[w] || w);
}
function headWord(s) { const n = normalize(s); return n.length ? n[0] : null; }
const STATE_WORDS = new Set(['raw','cooked','dried','roasted','boiled','fried','steamed','powder','smoked','frozen','juice','marinated','spiced']);
function secondContentWord(s) {
  const n = normalize(s).filter(w => !STATE_WORDS.has(w));
  return n.length >= 2 ? n[1] : null;
}
function nameSimilarity(localName, candidateTitle) {
  const ta = new Set(normalize(localName.replace(/\([^)]*\)/g, '')));
  const tb = new Set(normalize(candidateTitle));
  if (ta.size === 0 || tb.size === 0) return 0;
  const ha = headWord(localName.replace(/\([^)]*\)/g, '')), hb = headWord(candidateTitle);
  if (ha !== hb) return 0;
  const secondA = secondContentWord(localName.replace(/\([^)]*\)/g, ''));
  if (secondA && !tb.has(secondA)) return 0;
  if (!secondA) {
    const extra = [...tb].filter(w => w !== hb && !STATE_WORDS.has(w));
    if (extra.length) return 0;
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
  variants.push(withoutParens);
  const words = withoutParens.split(/\s+/).filter(Boolean);
  for (let n = Math.min(3, words.length - 1); n >= 2; n--) variants.push(words.slice(0, n).join(' '));
  if (words.length >= 1) variants.push(words[0]);
  return [...new Set(variants.filter(Boolean))];
}
async function searchBestEffort(name) {
  for (const q of buildQueryVariants(name)) {
    let results;
    try { results = await usda.search(q); } catch (e) { results = []; }
    await sleep(400); // rate limit rispettoso con chiave personale
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
  }
  return out;
}
function hasRealDiff(entry, corrections) {
  for (const [k, v] of Object.entries(corrections)) {
    const cur = entry[k];
    if (cur == null) return true;
    if (Math.abs(cur - v) > Math.max(0.05, Math.abs(v) * 0.03)) return true;
  }
  return false;
}
function round(x) { return Math.round(x * 100) / 100; }

async function main() {
  const args = process.argv.slice(2);
  const limitIdx = args.indexOf('--limit');
  const limit = limitIdx >= 0 ? parseInt(args[limitIdx + 1], 10) : 100;

  const allFoods = JSON.parse(fs.readFileSync(path.join(__dirname, 'all-foods.json'), 'utf8'));
  const progress = JSON.parse(fs.readFileSync(PROGRESS_PATH, 'utf8'));

  const targets = allFoods.filter(f => f.src === 'EXTRA' && progress[f.id] && progress[f.id].status === 'pending').slice(0, limit);
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
        result = { status: 'needs-review-no-usda-match' };
      } else {
        let best = null, bestScore = 0, second = null, secondScore = 0;
        for (const r of results) {
          const s = nameSimilarity(f.n, r.title);
          if (s > bestScore) { second = best; secondScore = bestScore; best = r; bestScore = s; }
          else if (s > secondScore) { second = r; secondScore = s; }
        }
        const ambiguousTie = best && second && best.id !== second.id && (bestScore - secondScore) < 0.08;
        if (!best || bestScore < 0.5 || ambiguousTie) {
          result = { status: 'needs-review-low-confidence', notes: `Query "${queryUsed}" → miglior match "${best && best.title}" score ${bestScore.toFixed(2)}${ambiguousTie ? ' (pareggio ambiguo)' : ''}` };
          nLowConf++;
        } else {
          const usdaData = await usda.fetchFood(best.id);
          await sleep(400);
          const corrections = {};
          for (const [key, val] of Object.entries(usdaData.nutrients)) {
            if (val != null) corrections[key] = round(val);
          }
          if (Object.keys(corrections).length < 4) {
            result = { status: 'needs-review-no-usda-match', notes: 'match trovato ma dati nutrizionali insufficienti' };
          } else if (!hasRealDiff(f, corrections)) {
            result = { status: 'corrected', notes: `Verificato su USDA FDC ${best.id} (${best.title}, ${best.dataType}) — già corretto. score=${bestScore.toFixed(2)}`, source: usdaData.url };
            nAlreadyOk++;
          } else {
            const idxLine = findLineIndex(lines, f);
            if (idxLine === null) {
              result = { status: 'needs-review-line-not-found' };
              nLineNotFound++;
            } else {
              lines[idxLine] = applyCorrections(lines[idxLine], corrections);
              result = { status: 'corrected', notes: `Corretto su USDA FDC ${best.id} (${best.title}, ${best.dataType}). score=${bestScore.toFixed(2)}. Campi aggiornati: ${Object.keys(corrections).join(',')}`, source: usdaData.url };
              nCorrected++;
            }
          }
        }
      }
    } catch (e) {
      result = { status: 'needs-review-error', notes: e.message };
    }
    if (result.status === 'needs-review-no-usda-match') nNoMatch++;
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
