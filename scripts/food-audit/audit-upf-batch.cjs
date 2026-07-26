// Giro sistematico per gli alimenti src:"UPF" (prodotti confezionati/di
// marca) ancora 'pending': cerca su Open Food Facts (stessa cascata usata
// dall'app, vedi off-lookup.cjs) e aggiorna in-place con guardie pensate
// per OFF (database globale MOLTO più rumoroso di CREA/BDA: milioni di
// prodotti, dati incompleti, paesi diversi, doppioni).
//
// Differenza chiave rispetto a CREA/BDA: la ricerca a frase-intera di OFF
// (match_phrase) fallisce quasi sempre sui nomi locali "Categoria Prodotto
// (Marca, per 100g)" — es. "gocciole mulino bianco" NON trova i biscotti
// Gocciole, li batte "Mulino Bianco" generico per boost sul brand. La
// query giusta è quasi sempre la SOLA parola distintiva del prodotto
// (Gocciole, Ringo, Oreo…), non frase+marca insieme — verificato a mano
// prima di scrivere questo script, vedi note di sessione.
//
// Uso: node audit-upf-batch.cjs --limit 200

const fs = require('fs');
const path = require('path');
const off = require('./off-lookup.cjs');

const DB_PATH = path.join(__dirname, '..', '..', 'js', 'db.js');
const PROGRESS_PATH = path.join(__dirname, 'progress.json');
const BATCH_LOG_PATH = path.join(__dirname, 'upf-batch-log.jsonl');

const NUM_FIELDS = ['k','p','gs','g','z','ch','fi','ca','fe','mg','k2','na','zn','fo','se','col'];
// OFF riporta pochissimi micronutrienti per la maggior parte dei prodotti
// (niente magnesio/zinco/selenio/folati quasi mai) — si corregge SOLO quello
// che OFF riporta davvero, il resto della entry locale resta invariato.
function offToFields(n) {
  const out = {};
  if (n['energy-kcal_100g'] != null) out.k = round1(n['energy-kcal_100g']);
  if (n.proteins_100g != null) out.p = round1(n.proteins_100g);
  if (n.fat_100g != null) out.g = round1(n.fat_100g);
  if (n['saturated-fat_100g'] != null) out.gs = round2(n['saturated-fat_100g']);
  if (n.carbohydrates_100g != null) out.ch = round1(n.carbohydrates_100g);
  if (n.sugars_100g != null) out.z = round1(n.sugars_100g);
  if (n.fiber_100g != null) out.fi = round1(n.fiber_100g);
  if (n.calcium_100g != null) out.ca = round1(n.calcium_100g * 1000); // OFF: g/100g → mg
  if (n.iron_100g != null) out.fe = round2(n.iron_100g * 1000);
  if (n.magnesium_100g != null) out.mg = round1(n.magnesium_100g * 1000);
  if (n.potassium_100g != null) out.k2 = round1(n.potassium_100g * 1000);
  if (n.sodium_100g != null) out.na = round1(n.sodium_100g * 1000);
  else if (n.salt_100g != null) out.na = round1(n.salt_100g * 1000 / 2.5); // sale → sodio
  if (n.zinc_100g != null) out.zn = round2(n.zinc_100g * 1000);
  if (n.cholesterol_100g != null) out.col = round1(n.cholesterol_100g * 1000);
  return out;
}
function round1(x) { return Math.round(x * 10) / 10; }
function round2(x) { return Math.round(x * 100) / 100; }

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// Parole di categoria generica che aprono quasi sempre il nome locale — MAI
// buone come query da sole (troppo generiche, risultati enormi e casuali).
const GENERIC_LEAD_WORDS = new Set(['biscotti','biscotto','merendina','barretta','snack','crackers','gallette','bevanda','yogurt','pane','pasta','riso','polpette','burger','proteina','cioccolato','caramelle','wafer','cereali','fette','torta','patatine','gelato','succo','salsa','sugo','minestrone','zuppa','cornetto','brioche','pizza','lasagne']);

function stripBoilerplate(name) {
  return name.replace(/\(?per 100\s*g\)?/gi, '').replace(/\(?per 100\s*m[lL]\)?/gi, '').trim();
}

// Genera le query da provare in ordine: prima la parola/e più distintiva
// (capitalizzata a metà frase, o dentro le parentesi se non è "per 100g"),
// poi il nome ripulito intero, poi le singole parole non generiche.
function buildOffQueries(rawName) {
  const name = stripBoilerplate(rawName);
  const parenMatch = name.match(/\(([^)]+)\)/);
  const parenContent = parenMatch ? parenMatch[1].replace(/,?\s*per 100\s*(g|ml)/i, '').trim() : null;
  const withoutParens = name.replace(/\([^)]*\)/g, '').trim();

  const words = withoutParens.split(/\s+/).filter(Boolean);
  // parole capitalizzate NON in prima posizione = probabile nome prodotto proprio (Gocciole, Ringo, Oreo...)
  const capWords = words.filter((w, i) => i > 0 && /^[A-ZÀ-Ù]/.test(w) && w.length > 2);

  const variants = [];
  capWords.forEach(w => variants.push(w));
  if (parenContent && parenContent.split(/\s+/).length <= 3) variants.push(parenContent);
  capWords.forEach(w => { if (parenContent) variants.push(`${w} ${parenContent}`); });
  variants.push(withoutParens);
  // fallback: parole di contenuto (non generiche) in ordine di lunghezza decrescente
  words.filter(w => !GENERIC_LEAD_WORDS.has(w.toLowerCase()) && w.length > 3)
    .sort((a, b) => b.length - a.length)
    .forEach(w => variants.push(w));

  return [...new Set(variants.filter(Boolean))];
}

const STOPWORDS = new Set(['di','da','in','con','e','il','lo','la','i','gli','le','un','una','del','della','dei','delle','al','allo','alla','per']);
function normalize(s) {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean).filter(w => !STOPWORDS.has(w));
}
function tokenScore(localName, candidate) {
  const localTokens = new Set(normalize(stripBoilerplate(localName)));
  const candTokens = new Set([...normalize(candidate.title), ...normalize(Array.isArray(candidate.brands) ? candidate.brands.join(' ') : candidate.brands || '')]);
  let inter = 0; for (const t of localTokens) if (candTokens.has(t)) inter++;
  return localTokens.size ? inter / localTokens.size : 0;
}
function isItalian(candidate) {
  return (candidate.countries || []).some(c => /italy|:it$/i.test(c));
}
function nutrimentCompleteness(n) {
  return ['energy-kcal_100g', 'proteins_100g', 'carbohydrates_100g', 'fat_100g'].filter(k => n[k] != null).length;
}

// 4 guardie aggiunte dopo aver trovato ERRORI REALI scrivendo su db.js in un
// batch di verifica (mai lasciati senza controllo — sempre trovati a
// campione prima di proseguire, poi ripristinati i valori originali):
//
// 1) Parola più lunga del nome locale (spesso il termine più specifico/di
//    marca, es. "Sottilette") deve comparire nel candidato — altrimenti
//    "Sottilette fette di formaggio" può abbinarsi a "Pecorino a fette"
//    (stesso "fette/formaggio" ma tutt'altro prodotto), perso perché la
//    parola più identificativa non veniva mai richiesta.
// Aggettivi/descrittori generici che ricorrono in tantissimi nomi locali ma
// NON identificano il prodotto — capitato che "industriale" (11 lettere,
// più lunga di "liquirizia") vincesse come "parola più lunga" e trovasse un
// match a caso su "Zona Industriale" nell'indirizzo di un produttore di
// pasta, per un prodotto che è liquirizia. Vanno esclusi esplicitamente,
// non basta la lunghezza a segnalare specificità.
const GENERIC_DESCRIPTORS = new Set(['industriale','industriali','confezionato','confezionata','confezionati','pronto','pronta','pronti','generico','generica','generici','classico','classica','classici','commerciale','commerciali','tradizionale','tradizionali','porzione','stima','tipo']);
// Marchi che ricorrono su decine di prodotti DIVERSISSIMI tra loro (una
// catena fast food, un pastificio, un produttore di gelati...) — se
// "vincono" come parola-più-lunga possono mascherare la vera parola
// distintiva. Successo reale: "McDonald's McFlurry OREO" → McFlurry
// Kit Kat Banana Split (tutt'altro gusto) perché "mcdonald" (8 lettere)
// pareggiava con "mcflurry" e batteva "oreo" (solo 4 lettere) sulla sola
// lunghezza, pur essendo "oreo" la parola che identificava il prodotto.
const RECURRING_BRAND_WORDS = new Set(['mcdonald','mcdonalds','kinder','ferrero','barilla','mulino','findus','algida','coop','esselunga','carrefour','conad','eurospin','despar','lidl','penny','nestle','danone','parmalat','granarolo','rana','buitoni','unilever']);
// "Parola più lunga" da sola si è rivelata un'euristica debole: lunghezza
// non è distintività ("mcflurry", generico su TUTTI i gusti McDonald's, è
// più lungo di "oreo", che è il gusto vero). Ora si richiedono TUTTE le
// parole di contenuto (non solo la più lunga), non solo una a caso.
function contentWords(localName) {
  const words = normalize(stripBoilerplate(localName).replace(/\([^)]*\)/g, ''));
  return words.filter(w => !GENERIC_LEAD_WORDS.has(w) && !GENERIC_DESCRIPTORS.has(w) && !RECURRING_BRAND_WORDS.has(w) && w.length > 3);
}
// 2) Parole che segnalano un prodotto DIVERSO (salsa/condimento invece del
//    piatto vero) se assenti nel nome locale — "Kebab in pita" abbinato a
//    "Sauce Kebab Pita" (una salsa, non il kebab) aveva superato tutte le
//    altre guardie perché "kebab"/"pita" c'erano comunque entrambe.
const WRONG_CATEGORY_IF_ABSENT_LOCALLY = ['sauce','salsa','sciroppo','sirop','syrup','condimento','aroma','concentrato','concentre','concentrato'];
// 3) Varianti mutuamente esclusive: zero/light/diet non possono sostituire
//    silenziosamente un prodotto "classico" e viceversa — "Coca-Cola / cola
//    classica" abbinato a "Coke Zero" aveva zuccheri completamente diversi.
const VARIANT_MARKERS = ['zero','light','lite','diet','senza zucchero','senza zuccheri','senza grassi','0%','sugar free'];

function hasAny(tokens, list) {
  const joined = ' ' + tokens.join(' ') + ' ';
  return list.some(w => joined.includes(' ' + w.replace(/\s+/g, ' ') + ' ') || tokens.includes(w));
}
// 5) Testa del titolo: il primo token del titolo OFF deve coincidere con la
//    testa del nome locale — "Latte intero fresco" abbinato a "Yogurt, da
//    latte intero" superava longestContentWord (la parola più lunga era
//    "intero", presente in entrambi) pur essendo yogurt, non latte. Stessa
//    lezione già imparata su CREA/BDA (head-word gate), qui mancava ancora.
function candidateHeadWord(candidate) {
  const n = normalize(candidate.title);
  return n.length ? n[0] : null;
}
function passesHardGuards(localName, candidate) {
  const localTokens = normalize(stripBoilerplate(localName).replace(/\([^)]*\)/g, ''));
  const candTokens = [...normalize(candidate.title), ...normalize(Array.isArray(candidate.brands) ? candidate.brands.join(' ') : candidate.brands || '')];

  const localHead = localTokens[0];
  const candHead = candidateHeadWord(candidate);
  // Niente scappatoie: deve essere ESATTAMENTE la stessa testa. "latte"
  // compare comunque da qualche parte in "Yogurt, da latte intero" — un
  // controllo permissivo (basta che compaia ovunque) non l'avrebbe scartato.
  if (localHead && candHead && localHead !== candHead) return false;

  const content = contentWords(localName);
  if (content.length && !content.every(w => candTokens.includes(w))) return false;

  const candHasWrongCat = WRONG_CATEGORY_IF_ABSENT_LOCALLY.some(w => candTokens.includes(w.split(' ')[0]));
  const localHasWrongCat = WRONG_CATEGORY_IF_ABSENT_LOCALLY.some(w => localTokens.includes(w.split(' ')[0]));
  if (candHasWrongCat && !localHasWrongCat) return false;

  const candHasVariant = VARIANT_MARKERS.some(w => candTokens.includes(w));
  const localHasVariant = VARIANT_MARKERS.some(w => localTokens.includes(w) || localName.toLowerCase().includes(w));
  if (candHasVariant !== localHasVariant) return false;

  return true;
}
// 4) Ordine delle parole: "latte al cioccolato" (bevanda) e "cioccolato al
//    latte" (dolce) sono lo STESSO insieme di parole ma prodotti opposti —
//    un punteggio bag-of-words non li distingue. Se il nome locale ha 2
//    parole di contenuto adiacenti, il candidato deve avere le stesse due
//    nello stesso ordine relativo (non necessariamente adiacenti nel
//    titolo, ma non invertite).
// ATTENZIONE: qui NON va usata GENERIC_LEAD_WORDS (pensata per il
// query-building) — conteneva "cioccolato", che è ESATTAMENTE la parola la
// cui posizione andava controllata per "Latte al cioccolato" vs "Cioccolato
// al latte". Bug reale, trovato perché l'inversione si è ripetuta una terza
// volta nonostante questa guardia dedicata. Qui si esclude solo i
// descrittori generici (industriale/pronto/ecc.), non le parole di categoria.
function contentWordOrder(name) {
  return normalize(stripBoilerplate(name).replace(/\([^)]*\)/g, '')).filter(w => !GENERIC_DESCRIPTORS.has(w) && w.length > 3);
}
function orderConsistent(localName, candidate) {
  const local = contentWordOrder(localName);
  if (local.length < 2) return true;
  const candText = normalize(candidate.title).join(' ');
  for (let i = 0; i < local.length - 1; i++) {
    const a = local[i], b = local[i + 1];
    const posA = candText.indexOf(a), posB = candText.indexOf(b);
    if (posA === -1 || posB === -1) continue; // non entrambi presenti, non è questa la coppia da controllare
    if (posB < posA) return false; // stesse 2 parole ma in ordine invertito → prodotto diverso
  }
  return true;
}

// Parola singola più "distintiva" del nome locale: quella capitalizzata a
// metà frase (nome di prodotto proprio, es. "Gocciole"), altrimenti null.
function distinctiveWord(localName) {
  const withoutParens = stripBoilerplate(localName).replace(/\([^)]*\)/g, '').trim();
  const words = withoutParens.split(/\s+/).filter(Boolean);
  const cap = words.find((w, i) => i > 0 && /^[A-ZÀ-Ù]/.test(w) && w.length > 2);
  return cap ? normalize(cap)[0] : null;
}

async function bestOffMatch(localName) {
  const queries = buildOffQueries(localName);
  const distinctive = distinctiveWord(localName);
  let usable = [];
  for (const q of queries.slice(0, 6)) { // limite di query provate per non esplodere il numero di richieste
    const results = await off.search(q);
    await sleep(150);
    if (!results.length) continue;
    usable = results.filter(c => nutrimentCompleteness(c.nutriments) >= 4);
    if (usable.length) break; // continua a provare query più mirate finché non trova candidati con dati utilizzabili
  }
  if (!usable.length) return null;

  usable = usable.filter(c => passesHardGuards(localName, c) && orderConsistent(localName, c));
  if (!usable.length) return null;

  // La parola distintiva (es. "Gocciole") da sola NON basta come prova: si è
  // rivelata pericolosa in pratica — "Fiesta" (Ferrero) ha trovato "Fiesta
  // schnitzel" (marca di pollo impanato, tutt'altra categoria), "Gocciole"
  // ha trovato un gelato invece dei biscotti. La parola distintiva resta
  // solo un fattore di RANKING tra i candidati che già superano la soglia
  // piena di sovrapposizione token — mai un bypass della soglia.
  let best = null, bestScore = -1;
  for (const c of usable) {
    const distinctiveBonus = distinctive && normalize(c.title).includes(distinctive) ? 0.1 : 0;
    const score = tokenScore(localName, c) + (isItalian(c) ? 0.15 : 0) + Math.min(nutrimentCompleteness(c.nutriments), 8) * 0.01 + distinctiveBonus;
    if (score > bestScore) { bestScore = score; best = c; }
  }
  if (!best || tokenScore(localName, best) < 0.45) return null;

  // Guardia clinica: i prodotti APROTEICI (Aproten/Loprofin/Flavis, per
  // pazienti con insufficienza renale o PKU) si definiscono per avere
  // proteine bassissime (<1-2g/100g) — se il candidato trovato ha proteine
  // "normali" da pasta/pane vero (>3g/100g), è quasi certamente il prodotto
  // comune sbagliato invece della versione aproteica, un errore che qui ha
  // un impatto clinico reale, non solo nutrizionale generico.
  if (/aprote/i.test(localName) && best.nutriments.proteins_100g != null && best.nutriments.proteins_100g > 2) {
    return null;
  }
  return { best, score: bestScore, tokenScore: tokenScore(localName, best) };
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
    if (Math.abs(cur - v) > Math.max(1, Math.abs(v) * 0.05)) return true; // tolleranza più larga: OFF ha rumore di misura reale tra lotti/dati inseriti da utenti
  }
  return false;
}

async function main() {
  const args = process.argv.slice(2);
  const limitIdx = args.indexOf('--limit');
  const limit = limitIdx >= 0 ? parseInt(args[limitIdx + 1], 10) : 200;
  const srcIdx = args.indexOf('--src');
  const targetSrc = srcIdx >= 0 ? args[srcIdx + 1] : 'UPF';

  const allFoods = JSON.parse(fs.readFileSync(path.join(__dirname, 'all-foods.json'), 'utf8'));
  const progress = JSON.parse(fs.readFileSync(PROGRESS_PATH, 'utf8'));

  const targets = allFoods.filter(f => f.src === targetSrc && progress[f.id] && progress[f.id].status === 'pending').slice(0, limit);
  console.log(`Da elaborare in questo batch: ${targets.length}`);

  const dbText = fs.readFileSync(DB_PATH, 'utf8');
  const lines = dbText.split('\n');

  let nCorrected = 0, nAlreadyOk = 0, nNoMatch = 0, nLineNotFound = 0;
  const logStream = fs.createWriteStream(BATCH_LOG_PATH, { flags: 'a' });

  for (let idx = 0; idx < targets.length; idx++) {
    const f = targets[idx];
    process.stdout.write(`[${idx + 1}/${targets.length}] ${f.n} ... `);
    let result;
    try {
      const match = await bestOffMatch(f.n);
      if (!match) {
        result = { status: 'needs-review-no-off-match' };
      } else {
        const corrections = offToFields(match.best.nutriments);
        if (Object.keys(corrections).length < 4) {
          result = { status: 'needs-review-no-off-match', notes: 'match trovato ma dati nutrizionali insufficienti' };
        } else if (!hasRealDiff(f, corrections)) {
          result = { status: 'corrected', notes: `Verificato su OFF ${match.best.code} (${match.best.title}, ${(Array.isArray(match.best.brands)?match.best.brands.join('/'):match.best.brands)||'senza marca'}) — già corretto. tokenScore=${match.tokenScore.toFixed(2)}`, source: `openfoodfacts.org/product/${match.best.code}` };
          nAlreadyOk++;
        } else {
          const idxLine = findLineIndex(lines, f);
          if (idxLine === null) {
            result = { status: 'needs-review-line-not-found' };
          } else {
            lines[idxLine] = applyCorrections(lines[idxLine], corrections);
            result = { status: 'corrected', notes: `Corretto su OFF ${match.best.code} (${match.best.title}, ${(Array.isArray(match.best.brands)?match.best.brands.join('/'):match.best.brands)||'senza marca'}). tokenScore=${match.tokenScore.toFixed(2)}. Campi aggiornati: ${Object.keys(corrections).join(',')}`, source: `openfoodfacts.org/product/${match.best.code}` };
            nCorrected++;
          }
        }
      }
    } catch (e) {
      result = { status: 'needs-review-error', notes: e.message };
    }
    if (result.status === 'needs-review-no-off-match') nNoMatch++;
    console.log(result.status);
    progress[f.id] = { n: f.n, src: f.src, status: result.status, checked: '2026-07-25', notes: result.notes, source: result.source };
    logStream.write(JSON.stringify({ id: f.id, n: f.n, ...result }) + '\n');
  }
  logStream.end();

  fs.writeFileSync(DB_PATH, lines.join('\n'));
  fs.writeFileSync(PROGRESS_PATH, JSON.stringify(progress, null, 1));

  console.log(`\n--- Riepilogo batch ---`);
  console.log({ corretti: nCorrected, giaCorretti: nAlreadyOk, nessunMatch: nNoMatch });
}

main().catch(e => { console.error(e); process.exit(1); });
