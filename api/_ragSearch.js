// api/_ragSearch.js — retrieval helper per il contesto RAG (linee guida cliniche,
// consigli pratici, ricette). Prefisso `_`: non è una function Vercel a sé, solo
// un modulo importato da altri handler (api/rag-search.js, ecc.) — non conta
// verso il limite di 12 function del piano Hobby.
//
// LG_DATA/CONSIGLI_BASE/RICETTE_DB sono script pensati per il browser (variabili
// globali `const`/plain assignment, non moduli CommonJS/ESM) — li carichiamo in
// Node con un vm context isolato, senza toccare i file sorgente. Le `const` di
// primo livello non diventano proprietà dell'oggetto contesto: si leggono
// rilanciando una seconda valutazione nello STESSO contesto (il binding lessicale
// persiste tra chiamate a vm.runInContext sullo stesso oggetto contestualizzato).
//
// Nessun embedding/vector DB: con ~285+285+1060 voci (~3.1MB) uno scoring per
// overlap di parole su id/nome/desc è sufficiente e gira in poche decine di ms.

import vm from 'node:vm';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let _cache = null; // { guidelines, recipeIndex } — costruita una sola volta per istanza calda

function loadRaw(relPath) {
  return fs.readFileSync(path.join(__dirname, '..', relPath), 'utf8');
}

function runIgnoringErrors(source, sandbox, filename) {
  // I file dati hanno codice di wiring browser (window.addEventListener, ecc.)
  // in coda, che qui non esiste e lancia ReferenceError — non ci interessa,
  // le const/assignment con i dati sono già valorizzate prima di quel punto.
  try {
    vm.runInContext(source, sandbox, { filename });
  } catch { /* ignora errori del codice browser-only in coda al file */ }
}

function loadData() {
  if (_cache) return _cache;

  const sandbox = { console: { warn() {}, log() {}, error() {} } };
  vm.createContext(sandbox);

  runIgnoringErrors(loadRaw('js/linee-guida-data.js'), sandbox, 'linee-guida-data.js');
  const lgData = vm.runInContext('typeof LG_DATA !== "undefined" ? LG_DATA : []', sandbox);

  runIgnoringErrors(loadRaw('js/consigli-data.js'), sandbox, 'consigli-data.js');
  const consigliData = vm.runInContext('typeof CONSIGLI_BASE !== "undefined" ? CONSIGLI_BASE : []', sandbox);

  runIgnoringErrors(loadRaw('js/ricette-db.js'), sandbox, 'ricette-db.js');
  const ricette = vm.runInContext('typeof RICETTE_DB !== "undefined" ? RICETTE_DB : []', sandbox);

  const consigliById = new Map(consigliData.map(c => [c.id, c]));

  const guidelines = lgData.map(g => {
    const c = consigliById.get(g.id) || {};
    const searchText = [g.id, g.nome, g.desc].filter(Boolean).join(' ');
    return {
      id: g.id,
      nome: g.nome,
      badge: g.badge,
      target: g.target,
      note: g.note,
      ok: g.ok,
      no: g.no,
      fonte: g.fonte,
      pasti: c.pasti,
      porzioni: c.porzioni,
      pratici: c.pratici,
      avvisi: c.avvisi,
      _tokens: tokenSet(searchText),
    };
  });

  const recipeIndex = ricette.map(r => {
    const ingredientNames = Array.isArray(r.ingredienti) ? r.ingredienti.map(i => i.nome).join(' ') : '';
    const searchText = [r.nome, r.note, r.categoria, ingredientNames].filter(Boolean).join(' ');
    return {
      id: r.id,
      nome: r.nome,
      categoria: r.categoria,
      porzioni: r.porzioni,
      ingredienti: r.ingredienti,
      kcal: r._dbEntry?.k,
      _tokens: tokenSet(searchText),
    };
  });

  _cache = { guidelines, recipeIndex };
  return _cache;
}

const STOPWORDS = new Set([
  'di', 'la', 'il', 'le', 'gli', 'lo', 'e', 'o', 'a', 'da', 'in', 'con', 'su', 'per',
  'tra', 'fra', 'un', 'una', 'uno', 'del', 'della', 'dei', 'delle', 'che', 'non',
  'sono', 'ha', 'ho', 'mi', 'ti', 'si', 'ci', 'vi', 'piu', 'meno', 'molto', 'poco',
  'anche', 'come', 'cosa', 'quali', 'quale', 'lieve', 'grave', 'cronica', 'cronico',
  'diagnosticata', 'diagnosticato', 'sospetta', 'sospetto',
]);

function stripAccents(s) {
  return s.normalize('NFD').split('').filter(ch => {
    const cp = ch.codePointAt(0);
    return !(cp >= 0x0300 && cp <= 0x036f); // combining diacritical marks
  }).join('');
}

function tokenize(s) {
  return stripAccents(String(s || '').toLowerCase())
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2 && !STOPWORDS.has(w));
}

// Set (non array): ogni parola unica conta al massimo 1 punto, altrimenti un
// campo `desc` verboso che ripete una parola più volte batterebbe ingiustamente
// una voce più pertinente ma più concisa.
function tokenSet(s) {
  return new Set(tokenize(s));
}

function scoreOverlap(tokens, querySet) {
  if (!querySet.size) return 0;
  let score = 0;
  for (const t of tokens) if (querySet.has(t)) score++;
  return score;
}

function matchGuidelines(guidelines, tagTokens, queryTokens, limit) {
  return guidelines
    .map(g => ({ g, score: scoreOverlap(g._tokens, tagTokens) * 2 + scoreOverlap(g._tokens, queryTokens) }))
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(x => x.g); // include _tokens: rimosso dal chiamante quando serve
}

function stripTokens(entries) {
  return entries.map(({ _tokens, ...rest }) => rest);
}

/**
 * @param {object} opts
 * @param {string[]} [opts.tags]   tag/patologie del paziente (testo libero, es. "Diabete T2")
 * @param {string}   [opts.query]  domanda/messaggio dell'utente (testo libero)
 * @returns {{guidelines: object[], recipes: object[]}}
 */
export function ragSearch({ tags = [], query = '' } = {}) {
  const { guidelines, recipeIndex } = loadData();

  const tagTokens = new Set(tags.flatMap(t => tokenize(t)));
  const queryTokens = new Set(tokenize(query));

  const scoredGuidelines = stripTokens(matchGuidelines(guidelines, tagTokens, queryTokens, 5));

  let scoredRecipes = [];
  if (queryTokens.size > 0) {
    scoredRecipes = recipeIndex
      .map(r => ({ r, score: scoreOverlap(r._tokens, queryTokens) }))
      .filter(x => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 8)
      .map(x => x.r);
    scoredRecipes = stripTokens(scoredRecipes);
  }

  return { guidelines: scoredGuidelines, recipes: scoredRecipes };
}

const MEAL_PLAN_CATEGORIES = [
  'Colazione', 'Spuntino', 'Primo piatto', 'Secondo piatto', 'Contorno',
  'Insalata', 'Zuppa', 'Piatto unico', 'Dolce', 'Antipasto',
];

/**
 * Recupero pensato per il generatore di piani alimentari: linee guida
 * pertinenti al paziente (per i target numerici) + un campione di ricette
 * per categoria pasto, escludendo quelle che contengono parole presenti
 * nelle liste "no" delle linee guida abbinate (es. niente ricette con
 * "zucchero" per un paziente diabetico).
 *
 * @param {object} opts
 * @param {string[]} [opts.tags]        tag/patologie del paziente
 * @param {number}   [opts.perCategory] quante ricette proporre per categoria
 * @returns {{guidelines: object[], recipesByCategory: Record<string, object[]>}}
 */
export function recipesForMealPlan({ tags = [], perCategory = 3 } = {}) {
  const { guidelines, recipeIndex } = loadData();
  const tagTokens = new Set(tags.flatMap(t => tokenize(t)));

  const matched = matchGuidelines(guidelines, tagTokens, new Set(), 5);
  const noWords = new Set(matched.flatMap(g => (g.no || []).flatMap(phrase => tokenize(phrase))));

  const recipesByCategory = {};
  for (const cat of MEAL_PLAN_CATEGORIES) {
    const candidates = recipeIndex.filter(r =>
      r.categoria === cat && ![...r._tokens].some(t => noWords.has(t))
    );
    recipesByCategory[cat] = stripTokens(candidates.slice(0, perCategory));
  }

  return { guidelines: stripTokens(matched), recipesByCategory };
}
