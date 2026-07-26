// Seconda passata su alimenti CREA/BDA rimasti "needs-review-*" (non
// duplicati): prova la fonte nativa (CREA per src:CREA, BDA per src:BDA) e,
// se non trova un match sicuro, prova ANCHE l'altra fonte come fallback
// (una voce taggata CREA potrebbe comunque esistere su BDA e viceversa).
// Usa le guardie più raffinate maturate su UPF (head-word ESATTO, TUTTE le
// parole di contenuto richieste, non solo la più lunga, controllo ordine,
// pareggio ambiguo) invece del vecchio sinonimo-per-sinonimo di
// audit-crea-batch.cjs — più robusto e generale.
//
// Uso: node audit-crea-bda-cross.cjs --limit 300 [--only CREA|BDA]

const fs = require('fs');
const path = require('path');
const crea = require('./crea-lookup.cjs');
const bda = require('./bda-lookup.cjs');

const DB_PATH = path.join(__dirname, '..', '..', 'js', 'db.js');
const PROGRESS_PATH = path.join(__dirname, 'progress.json');
const BATCH_LOG_PATH = path.join(__dirname, 'crea-bda-cross-log.jsonl');

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

// Sinonimi Italiano-Italiano tra il modo in cui i nomi locali e CREA/BDA
// chiamano le stesse cose — estende quelli già noti da sessioni precedenti.
// ⚠️ "filetto" e "fettina" volutamente RIMOSSI da qui (erano mappati a
// "fesa" insieme a "petto"): per il POLLO petto≈fesa≈filetto sono termini
// colloquiali abbastanza interscambiabili, ma per manzo/vitello/maiale
// "filetto" e "fesa" sono TAGLI DIVERSI con composizione diversa — trovato
// un errore reale: "Vitello (spalla) crudo" E "Vitello fesa" abbinati
// entrambi a "Vitello, filetto, crudo" solo perché la sinonimia li rendeva
// indistinguibili. Tenere SOLO petto→fesa (specifico per il petto di
// pollo/tacchino, dove l'ambiguità è minima).
const SYNONYMS = {
  petto: 'fesa', fesa: 'fesa',
  parz: 'parzialmente', magro: 'magro', sgrassato: 'magro',
  grano: 'frumento', frumento: 'frumento', // "grano tenero" locale = "frumento" CREA — MA "grano saraceno" resta diverso (saraceno non è sinonimo)
};
const STOPWORDS = new Set(['di','da','in','con','e','il','lo','la','i','gli','le','un','una','del','della','dei','delle','al','allo','alla','per']);
function normalize(s) {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean)
    .filter(w => !STOPWORDS.has(w))
    .map(w => SYNONYMS[w] || w);
}
const GENERIC_DESCRIPTORS = new Set(['industriale','industriali','confezionato','confezionata','confezionati','pronto','pronta','pronti','generico','generica','generici','classico','classica','classici','commerciale','commerciali','tradizionale','tradizionali','porzione','stima','tipo']);
const STATE_WORDS = new Set(['crudo','crudi','cruda','crude','cotto','cotti','cotta','cotte','secco','secchi','secca','secche','fresco','freschi','fresca','fresche','surgelato','surgelata','surgelati','bollito','bollita','bolliti','intero','intera','interi','scremato','scremata','parzialmente','affumicato','affumicata','scolato','scolata','salato','salata','tostato','tostata','tostati','arrosto','grigliato','grigliata','padella','vapore','microonde','forno','pastorizzato','pastorizzata']);
// ⚠️ Rimuovere TUTTO il contenuto tra parentesi era un bug, non solo una
// semplificazione: "Vitello (spalla) crudo" e "Agnello (coscia magra)"
// hanno le parole PIÙ importanti (il taglio) dentro le parentesi — solo
// "(per 100g)"/"(per 100mL)" sono davvero boilerplate da buttare via.
function stripOnlyBoilerplateParens(s) {
  return s.replace(/\(\s*per\s+\d+\s*(g|ml|mL)\s*\)/gi, '').trim();
}
function headWord(s) { const n = normalize(stripOnlyBoilerplateParens(s).replace(/[()]/g, '')); return n.length ? n[0] : null; }
function contentWords(localName) {
  const words = normalize(stripOnlyBoilerplateParens(localName).replace(/[()]/g, ''));
  return words.filter(w => !GENERIC_DESCRIPTORS.has(w) && w !== headWord(localName) && w.length > 3);
}
function explicitPercents(s) { return (s.match(/\d+(?:[.,]\d+)?\s*%/g) || []).map(x => parseFloat(x.replace(',', '.'))); }
// Parole che segnalano una preparazione/concentrazione RADICALMENTE diversa
// (non una semplice variante) se assenti dal nome locale — "Succo di
// arancia" (bevanda pronta, ~38kcal/100g) abbinato a "Succo Di Arancia,
// CONCENTRATO" (sciroppo da diluire, 184kcal/100g, quasi 5 volte di più) è
// passato tutte le altre guardie perché "arancia" c'era comunque. Un
// concentrato/disidratato non è una variante minore come un gusto diverso,
// è un ordine di grandezza diverso di densità calorica.
// "essiccato/secco" volutamente ESCLUSO da questa lista: si sovrappone
// troppo con STATE_WORDS (secco/secca) già gestito altrove, rischio di
// falsi rigetti su frutta secca legittima. Qui solo preparazioni che
// cambiano la densità calorica di un ordine di grandezza, non lo stato.
const MAJOR_PREP_MISMATCH = ['concentrato', 'concentrata', 'disidratato', 'disidratata', 'liofilizzato', 'liofilizzata', 'polvere', 'estratto'];

function candidateTokens(title) { return normalize(title); }

function tokenSetHas(set, w) { return set.has(w) || (pluralize(w) && set.has(pluralize(w))); }

function nameSimilarity(localName, candidateTitle) {
  const ta = new Set(normalize(localName)), tb = new Set(candidateTokens(candidateTitle));
  if (ta.size === 0 || tb.size === 0) return { score: 0, ok: false };
  const ha = headWord(localName), hb = headWord(candidateTitle);
  const headMatches = ha === hb || pluralize(ha) === hb || pluralize(hb) === ha;
  if (!headMatches) return { score: 0, ok: false };
  const content = contentWords(localName);
  if (content.length && !content.every(w => tokenSetHas(tb, w) || STATE_WORDS.has(w))) {
    // consenti che le parole "di stato" locali manchino nel titolo (spesso
    // CREA/BDA hanno solo alcune combinazioni cotto/crudo disponibili),
    // ma le parole di CONTENUTO vere (taglio/varietà) devono esserci tutte
    const nonState = content.filter(w => !STATE_WORDS.has(w));
    if (nonState.length && !nonState.every(w => tokenSetHas(tb, w))) return { score: 0, ok: false };
  }
  const pctA = explicitPercents(localName);
  if (pctA.length) {
    const pctB = explicitPercents(candidateTitle);
    if (!pctB.length || !pctA.some(p => pctB.some(q => Math.abs(p - q) < 0.5))) return { score: 0, ok: false };
  }
  const localHasPrep = MAJOR_PREP_MISMATCH.some(w => ta.has(w));
  const candHasPrep = MAJOR_PREP_MISMATCH.some(w => tb.has(w));
  if (candHasPrep && !localHasPrep) return { score: 0, ok: false };
  let inter = 0; for (const t of ta) if (tokenSetHas(tb, t)) inter++;
  const union = new Set([...ta, ...tb]).size;
  const score = 0.5 * (inter / union) + 0.5 * (inter / ta.size);
  return { score, ok: true };
}

// Scoperta a metà sessione: il motore di ricerca CREA/BDA fa match LETTERALE
// sulla parola, senza stemming — "mela" (singolare) NON trova "Mele, fresche"
// (plurale) e viceversa. Moltissimi alimenti base (Mela, Arancia, Fragola,
// Zucchina...) sono scritti al SINGOLARE nel nome locale ma CREA/BDA li
// catalogano quasi sempre al PLURALE. Euristica di pluralizzazione italiana
// semplice (non perfetta, ma sufficiente per i pattern comuni) provata come
// query aggiuntiva, mai in sostituzione dell'originale.
function pluralize(word) {
  if (/cia$/.test(word)) return word.replace(/cia$/, 'ce');   // arancia→arance
  if (/gia$/.test(word)) return word.replace(/gia$/, 'ge');   // ciliegia→ciliege
  if (/a$/.test(word)) return word.replace(/a$/, 'e');        // mela→mele, fragola→fragole
  if (/one$/.test(word)) return word.replace(/one$/, 'oni');  // limone→limoni, peperone→peperoni
  if (/o$/.test(word)) return word.replace(/o$/, 'i');        // pomodoro→pomodori
  if (/e$/.test(word)) return word.replace(/e$/, 'i');        // patate già plurale, ma es. carne→carni (raro, innocuo se non trova nulla)
  return null;
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
  if (words.length >= 1) {
    variants.push(words[0]);
    const plural = pluralize(words[0].toLowerCase());
    if (plural) variants.push(plural + (words.length > 1 ? ' ' + words.slice(1).join(' ') : ''));
    if (plural) variants.push(plural);
  }
  return [...new Set(variants.filter(Boolean))];
}

async function bestMatch(name, searchFn) {
  for (const q of buildQueryVariants(name)) {
    let results;
    try { results = await searchFn(q); } catch (e) { results = []; }
    await sleep(280);
    if (!results.length) continue;
    let best = null, bestScore = 0, second = null, secondScore = 0;
    for (const r of results) {
      const { score, ok } = nameSimilarity(name, r.title);
      if (!ok) continue;
      if (score > bestScore) { second = best; secondScore = bestScore; best = r; bestScore = score; }
      else if (score > secondScore) { second = r; secondScore = score; }
    }
    const ambiguousTie = best && second && (best.code || best.id) !== (second.code || second.id) && (bestScore - secondScore) < 0.08;
    if (best && bestScore >= 0.45 && !ambiguousTie) return { best, bestScore, queryUsed: q };
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
function applyCorrections(line, corrections, newSrc, oldSrc) {
  let out = line;
  for (const [key, val] of Object.entries(corrections)) {
    const re = new RegExp(`\\b${key}:-?\\d+(?:\\.\\d+)?`);
    if (re.test(out)) out = out.replace(re, `${key}:${val}`);
  }
  if (newSrc !== oldSrc) out = out.replace(new RegExp(`src:"${oldSrc}"`), `src:"${newSrc}"`);
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
  const limit = limitIdx >= 0 ? parseInt(args[limitIdx + 1], 10) : 200;
  const onlyIdx = args.indexOf('--only');
  const only = onlyIdx >= 0 ? args[onlyIdx + 1] : null;

  const allFoods = JSON.parse(fs.readFileSync(path.join(__dirname, 'all-foods.json'), 'utf8'));
  const progress = JSON.parse(fs.readFileSync(PROGRESS_PATH, 'utf8'));

  const reviewStatuses = new Set(['needs-review-low-confidence', 'needs-review-no-crea-match', 'needs-review-no-bda-match']);
  let targets = allFoods.filter(f => (f.src === 'CREA' || f.src === 'BDA') && progress[f.id] && reviewStatuses.has(progress[f.id].status));
  if (only) targets = targets.filter(f => f.src === only);
  targets = targets.slice(0, limit);
  console.log(`Da elaborare in questo batch: ${targets.length}`);

  const dbText = fs.readFileSync(DB_PATH, 'utf8');
  const lines = dbText.split('\n');

  let nCorrected = 0, nAlreadyOk = 0, nStillNoMatch = 0;
  const logStream = fs.createWriteStream(BATCH_LOG_PATH, { flags: 'a' });

  for (let idx = 0; idx < targets.length; idx++) {
    const f = targets[idx];
    process.stdout.write(`[${idx + 1}/${targets.length}] ${f.n} (${f.src}) ... `);
    let result;
    try {
      const nativeSearch = f.src === 'CREA' ? crea.search : bda.search;
      const fallbackSearch = f.src === 'CREA' ? bda.search : crea.search;
      let source = f.src, match = await bestMatch(f.n, nativeSearch);
      if (!match) {
        source = f.src === 'CREA' ? 'BDA' : 'CREA';
        match = await bestMatch(f.n, fallbackSearch);
      }
      if (!match) {
        result = { status: f.src === 'CREA' ? 'needs-review-no-crea-match' : 'needs-review-no-bda-match', notes: 'Nessun match sicuro né sulla fonte nativa né sull\'altra (CREA/BDA incrociate).' };
        nStillNoMatch++;
      } else {
        const fetchFn = source === 'CREA' ? crea.fetchFood : bda.fetchFood;
        const id = source === 'CREA' ? match.best.code : match.best.id;
        const data = await fetchFn(id);
        await sleep(280);
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
        if (!hasRealDiff(f, corrections)) {
          result = { status: 'corrected', notes: `Verificato su ${source} ${id} (${match.best.title}) — già corretto (fonte incrociata). score=${match.bestScore.toFixed(2)}`, source: `${source}:${id}` };
          nAlreadyOk++;
        } else {
          const idxLine = findLineIndex(lines, f);
          if (idxLine === null) {
            result = { status: 'needs-review-line-not-found' };
          } else {
            lines[idxLine] = applyCorrections(lines[idxLine], corrections, source, f.src);
            result = { status: 'corrected', notes: `Corretto su ${source} ${id} (${match.best.title})${source !== f.src ? ' [fonte incrociata, src aggiornato]' : ''}. score=${match.bestScore.toFixed(2)}. Campi: ${Object.keys(corrections).join(',')}`, source: `${source}:${id}` };
            nCorrected++;
          }
        }
      }
    } catch (e) {
      result = { status: 'needs-review-error', notes: e.message };
    }
    console.log(result.status);
    progress[f.id] = { n: f.n, src: f.src, status: result.status, checked: '2026-07-26', notes: result.notes, source: result.source };
    logStream.write(JSON.stringify({ id: f.id, n: f.n, srcOriginal: f.src, ...result }) + '\n');
  }
  logStream.end();

  fs.writeFileSync(DB_PATH, lines.join('\n'));
  fs.writeFileSync(PROGRESS_PATH, JSON.stringify(progress, null, 1));

  console.log(`\n--- Riepilogo batch ---`);
  console.log({ corretti: nCorrected, giaCorretti: nAlreadyOk, ancoraNessunMatch: nStillNoMatch });
}

main().catch(e => { console.error(e); process.exit(1); });
