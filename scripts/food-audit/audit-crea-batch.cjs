// Giro sistematico: per ogni alimento src:"CREA" ancora 'pending' in
// progress.json (non duplicato, non già corretto), cerca la scheda CREA
// corrispondente e — solo con un match di buona confidenza — aggiorna i
// valori sulla riga esistente in db.js (nessuna cancellazione: non è un
// duplicato, è un aggiornamento in-place). Salva sempre in progress.json,
// anche i "non trovato" (con motivo), così le sessioni future non
// ripetono lavoro già fatto.
//
// Uso: node audit-crea-batch.cjs --limit 250 [--start-after <nomeAlimento>]

const fs = require('fs');
const path = require('path');
const { search, fetchFood } = require('./crea-lookup.cjs');

const DB_PATH = path.join(__dirname, '..', '..', 'js', 'db.js');
const PROGRESS_PATH = path.join(__dirname, 'progress.json');
const BATCH_LOG_PATH = path.join(__dirname, 'crea-batch-log.jsonl');

const NUM_FIELDS = ['k','p','gs','g','z','ch','fi','ca','fe','mg','k2','na','zn','fo','se','col'];
const CREA_MAP = {
  k: 'Energia (kcal)', p: 'Proteine (g)', g: 'Lipidi (g)', ch: 'Carboidrati disponibili (g)',
  z: 'Zuccheri solubili (g)', fi: 'Fibra totale (g)', ca: 'Calcio (mg)', fe: 'Ferro (mg)',
  mg: 'Magnesio (mg)', k2: 'Potassio (mg)', na: 'Sodio (mg)', zn: 'Zinco (mg)',
  se: 'Selenio (μg)', col: 'Colesterolo (mg)',
};

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// Sinonimi comuni tra il modo in cui l'app nomina i tagli/prodotti e come li
// chiama CREA (es. "petto" di pollo/tacchino = "fesa" in CREA) — senza
// questa normalizzazione la similarità a token perde molti match ovvi.
const SYNONYMS = {
  petto: 'fesa', fesa: 'fesa',
  fettina: 'fesa', filetto: 'fesa',
  parz: 'parzialmente',
  magro: 'magro', sgrassato: 'magro',
  // Aggiunti 2026-07-29: parole colloquiali diverse dalla terminologia CREA
  // per lo stesso alimento (senza questi, l'head-word gate scarta a priori
  // match corretti — es. "Manzo" locale vs "Bovino" CREA).
  manzo: 'bovino', susina: 'prugna', susine: 'prugna', susino: 'prugna',
};
// Stopword tolte perché gonfiano artificialmente containment/jaccard senza
// portare informazione (es. "Succo DI arancia" vs "Succo DI frutta" — "di"
// condiviso nasconde che "arancia" non compare affatto nel titolo CREA).
const STOPWORDS = new Set(['di','da','in','con','e','il','lo','la','i','gli','le','un','una','del','della','dei','delle','al','allo','alla']);
function normalize(s) {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean)
    .filter(w => !STOPWORDS.has(w))
    .map(w => SYNONYMS[w] || w);
}
// I titoli CREA sono spesso più verbosi/descrittivi del nome locale (es.
// "Coniglio" vs "Coniglio intero, crudo") — la sola Jaccard penalizza troppo
// questi casi. Media tra Jaccard (simmetrica) e "containment" rispetto al
// nome locale (quanti dei SUOI token compaiono nel titolo CREA) — cattura i
// nomi locali terse pur restando severa quando i token locali specifici
// (es. "espresso") non compaiono affatto nel titolo.
// GATE CRITICO: la prima parola del nome locale è quasi sempre l'identità
// vera dell'alimento (l'animale/ingrediente base — "Pollo", "Latte", "Riso"…)
// e nei titoli CREA è quasi sempre anche lei la prima parola. Un punteggio a
// bag-of-words puro può far vincere un titolo con specie/prodotto SBAGLIATO
// solo perché condivide parole descrittive comuni (es. "Faraona, petto,
// senza pelle, crudo" batte a punteggio alto "Pollo petto (senza pelle)"
// perché "petto/senza/pelle/crudo" coincidono, pur essendo tacchino... anzi
// faraona, non pollo!). Scoperto e corretto dopo un batch reale che aveva
// scambiato Pollo→Faraona e Latte→Yogurt. Se le prime parole (dopo sinonimi)
// non coincidono, il match è SCARTATO a prescindere dal punteggio.
function headWord(s) {
  const n = normalize(s);
  return n.length ? n[0] : null;
}
// Parole di "stato" (cottura/conservazione) — possono legittimamente
// mancare o differire senza indicare un alimento diverso. Tutto il resto
// (soprattutto la 2ª parola, spesso il TAGLIO/VARIETÀ — "petto", "bianco",
// "integrale"…) è quanto di più importante nutrizionalmente e NON deve
// essere ignorato da un punteggio bag-of-words che lo lascerebbe annegare
// tra parole di stato condivise (successo reale, poi scartato: "Pollo
// petto" appaiato a "Pollo, intero, senza pelle" — "senza pelle" bastava a
// vincere pur perdendo "petto", cioè il taglio giusto).
// "affumicato/affumicata" RIMOSSO 2026-07-29 dopo un errore reale: il
// guardrail monoparola (vedi sotto) trattava l'affumicatura come uno stato
// innocuo equivalente a crudo/cotto, permettendo di sostituire "Anguilla"
// generica coi valori di "Anguilla, AFFUMICATA" — l'affumicatura concentra
// acqua/nutrienti in modo molto più marcato di una semplice cottura e va
// trattata come una parola di contenuto vera e propria (deve comparire nel
// nome locale per essere accettata), non come uno stato equivalente.
const STATE_WORDS = new Set(['crudo','crudi','cruda','crude','cotto','cotti','cotta','cotte','secco','secchi','secca','secche','fresco','freschi','fresca','fresche','surgelato','surgelata','surgelati','bollito','bollita','bolliti','intero','intera','interi','scremato','scremata','parzialmente','scolato','scolata','salato','salata','tostato','tostata','tostati','arrosto','grigliato','grigliata','padella','vapore','microonde','forno','pastorizzato','pastorizzata']);
function secondContentWord(s) {
  const n = normalize(s).filter(w => !STATE_WORDS.has(w));
  return n.length >= 2 ? n[1] : null;
}
// Se il nome locale contiene una percentuale esplicita (es. "Panna da
// cucina 18%"), un titolo CREA con una percentuale DIVERSA (es. "23% di
// lipidi") è un prodotto diverso, non un errore di trascrizione — mai
// ignorare un numero esplicito diverso.
function explicitPercents(s) {
  return (s.match(/\d+(?:[.,]\d+)?\s*%/g) || []).map(x => parseFloat(x.replace(',', '.')));
}
function nameSimilarity(a, b) {
  const ta = new Set(normalize(a)), tb = new Set(normalize(b));
  if (ta.size === 0 || tb.size === 0) return 0;
  const ha = headWord(a), hb = headWord(b);
  if (ha !== hb) return 0;
  const secondA = secondContentWord(a);
  if (secondA && !tb.has(secondA)) return 0; // taglio/varietà locale non rappresentato nel titolo CREA
  if (!secondA) {
    // Nome locale di una sola parola (es. "Anguilla"): senza un secondo
    // termine da confrontare, un titolo CREA "qualificato" (affumicata, di
    // fiume, marinata…) è una scelta arbitraria tra prodotti diversi — si
    // accetta solo un titolo CREA altrettanto generico (nessuna parola
    // extra oltre alla testa e a parole di stato).
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
// BUG storico corretto 2026-07-28: la versione precedente provava PER PRIMO
// il solo contenuto tra parentesi (es. "(cotte)" -> query "cotte") e
// costruiva le varianti più corte a partire da QUEL testo invece che dal
// nome vero dell'alimento. Per un nome tipo "Lenticchie nere beluga (cotte)"
// la prima (e spesso unica) query tentata era il termine generico "cotte",
// che alimentinutrizione.it a volte risolve con risultati spuri (mai col
// head-word giusto) — il loop si fermava lì (searchBestEffort ritorna alla
// prima query con risultati) senza mai provare "Lenticchie nere beluga".
// Scoperto rileggendo 353 note di log tutte con lo stesso pattern "Query
// '<state-word>' -> miglior match 'null' score 0.00". Fix: usare SEMPRE il
// nome senza parentesi come base per le varianti principali, e provare il
// contenuto tra parentesi da solo per ultimo, e solo se contiene informazione
// reale (non solo parole di stato tipo cotta/cruda/secca).
// Fix aggiuntivo 2026-07-29: molti alimenti (soprattutto frutta/verdura)
// sono indicizzati da CREA al PLURALE ("Pesche" non "Pesca", "Ciliege" non
// "Ciliegia") o con un sinonimo diverso da quello colloquiale ("Bovino" non
// "Manzo") — senza queste varianti la ricerca risultava vuota (falso "non
// trovato") anche per alimenti sicuramente presenti. Scoperto testando a
// mano durante la revisione del bucket "low-confidence": "cavolo" da solo
// funzionava, "pesca" no ma "pesche" sì, "manzo" mai ma "bovino"/"vitellone"
// sì. Queste varianti sono aggiunte per ULTIME (dopo tutte quelle già
// esistenti) così non cambiano il comportamento nei casi che già
// funzionavano — vengono provate solo se tutto il resto ha dato zero
// risultati (searchBestEffort si ferma alla prima query con risultati).
const QUERY_SYNONYMS = { manzo: 'bovino', susina: 'prugna', susine: 'prugne', susino: 'prugno' };
function italianNumberVariants(word) {
  const w = word.toLowerCase();
  const out = new Set();
  if (/a$/.test(w)) out.add(w.slice(0, -1) + 'e');
  if (/e$/.test(w)) { out.add(w.slice(0, -1) + 'i'); out.add(w.slice(0, -1) + 'a'); }
  if (/o$/.test(w)) out.add(w.slice(0, -1) + 'i');
  if (/i$/.test(w)) { out.add(w.slice(0, -1) + 'a'); out.add(w.slice(0, -1) + 'o'); out.add(w.slice(0, -1) + 'e'); }
  out.delete(w);
  return [...out];
}
function extraVariants(phrase) {
  const words = phrase.trim().split(/\s+/);
  const out = [];
  words.forEach((w, i) => {
    const lw = w.toLowerCase();
    if (QUERY_SYNONYMS[lw]) { const r = [...words]; r[i] = QUERY_SYNONYMS[lw]; out.push(r.join(' ')); }
    italianNumberVariants(w).forEach(v => { const r = [...words]; r[i] = v; out.push(r.join(' ')); });
  });
  return out;
}
function buildQueryVariants(name) {
  const variants = [];
  const parenMatch = name.match(/\(([^)]+)\)/);
  const withoutParens = name.replace(/\([^)]*\)/g, '').trim();
  const parenContent = parenMatch ? parenMatch[1].trim() : '';
  const parenIsJustState = parenContent && parenContent.split(/\s+/).every(w => STATE_WORDS.has(w.toLowerCase()));
  if (withoutParens) variants.push(withoutParens);
  variants.push(name.replace(/[()]/g, '').trim());
  const words = (withoutParens || name).trim().split(/\s+/);
  for (let n = Math.min(4, words.length - 1); n >= 2; n--) variants.push(words.slice(0, n).join(' '));
  if (words.length >= 1) variants.push(words[0]);
  if (parenContent && !parenIsJustState) variants.push(parenContent);
  extraVariants(withoutParens || name).forEach(v => variants.push(v));
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

  const targets = allFoods.filter(f => f.src === 'CREA' && progress[f.id] && progress[f.id].status === 'pending').slice(0, limit);
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
        result = { status: 'needs-review-no-crea-match' };
      } else {
        let best = null, bestScore = 0, second = null, secondScore = 0;
        for (const r of results) {
          const s = nameSimilarity(f.n, r.title);
          if (s > bestScore) { second = best; secondScore = bestScore; best = r; bestScore = s; }
          else if (s > secondScore) { second = r; secondScore = s; }
        }
        // Due candidati quasi a pari punteggio ma con TITOLI diversi = un
        // qualificatore ambiguo non esplicitato dal nome locale (es. "Cavolo
        // cappuccio crudo" → poteva vincere "rosso" O "verde" per un pelo:
        // caso reale scoperto in batch, il colore non è nel nome locale
        // quindi non c'è modo di scegliere in automatico). Meglio non
        // decidere che decidere a caso.
        const ambiguousTie = best && second && best.code !== second.code && (bestScore - secondScore) < 0.08;
        if (!best || bestScore < 0.5 || ambiguousTie) {
          const tieNote = ambiguousTie ? ` (pareggio con "${second.title}" score ${secondScore.toFixed(2)} — ambiguo, non deciso)` : '';
          result = { status: 'needs-review-low-confidence', notes: `Query "${queryUsed}" → miglior match "${best && best.title}" score ${bestScore.toFixed(2)}${tieNote}` };
          nLowConf++;
        } else {
          const creaData = await fetchFood(best.code);
          await sleep(250);
          const corrections = {};
          for (const [key, label] of Object.entries(CREA_MAP)) {
            const v = creaData.nutrients[label];
            if (v != null) corrections[key] = v;
          }
          const satPct = creaData.nutrients['Acidi grassi Saturi (%)'];
          const lipidi = creaData.nutrients['Lipidi (g)'];
          if (satPct != null && lipidi != null) corrections.gs = +(lipidi * satPct / 100).toFixed(2);

          if (!hasRealDiff(f, corrections)) {
            result = { status: 'corrected', notes: `Verificato su CREA ${best.code} (${best.title}) — già corretto, nessuna modifica necessaria.`, source: `alimentinutrizione.it/${best.code}` };
            nAlreadyOk++;
          } else {
            const idxLine = findLineIndex(lines, f);
            if (idxLine === null) {
              result = { status: 'needs-review-line-not-found' };
              nLineNotFound++;
            } else {
              lines[idxLine] = applyCorrections(lines[idxLine], corrections);
              result = { status: 'corrected', notes: `Corretto su CREA ${best.code} (${best.title}). Campi aggiornati: ${Object.keys(corrections).join(',')}`, source: `alimentinutrizione.it/${best.code}` };
              nCorrected++;
            }
          }
        }
      }
    } catch (e) {
      result = { status: 'needs-review-error', notes: e.message };
    }
    if (result.status === 'needs-review-no-crea-match') nNoMatch++;
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
