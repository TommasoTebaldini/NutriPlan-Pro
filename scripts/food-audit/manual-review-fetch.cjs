// Fase 1 di una revisione "alimento per alimento" vera: per un blocco di
// alimenti ancora irrisolti, interroga CREA e BDA e scrive TUTTI i
// candidati grezzi (senza filtrare per punteggio) in un file JSON che poi
// leggo e valuto io stesso, uno per uno — non un punteggio automatico che
// decide, ma dati reali su cui ragionare.
const fs = require('fs');
const path = require('path');
const crea = require('./crea-lookup.cjs');
const bda = require('./bda-lookup.cjs');

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function buildQueryVariants(name) {
  const variants = [];
  const parenMatch = name.match(/\(([^)]+)\)/);
  const withoutParens = name.replace(/\([^)]*\)/g, '').trim();
  if (parenMatch) variants.push(parenMatch[1].trim());
  variants.push(name.replace(/[()]/g, '').trim());
  if (withoutParens && withoutParens !== name) variants.push(withoutParens);
  const words = (parenMatch ? parenMatch[1] : withoutParens || name).trim().split(/\s+/);
  for (let n = Math.min(3, words.length - 1); n >= 2; n--) variants.push(words.slice(0, n).join(' '));
  if (words.length >= 1) variants.push(words[0]);
  return [...new Set(variants.filter(Boolean))];
}

async function searchAll(name, searchFn) {
  for (const q of buildQueryVariants(name)) {
    let results;
    try { results = await searchFn(q); } catch (e) { results = []; }
    await sleep(220);
    if (results.length) return { results: results.slice(0, 8), queryUsed: q };
  }
  return { results: [], queryUsed: null };
}

async function main() {
  const args = process.argv.slice(2);
  const startIdx = parseInt(args[0], 10) || 0;
  const count = parseInt(args[1], 10) || 60;

  const items = JSON.parse(fs.readFileSync(path.join(__dirname, 'remaining-crea-bda.json'), 'utf8'));
  const batch = items.slice(startIdx, startIdx + count);
  console.log(`Recupero candidati per ${batch.length} alimenti (${startIdx}-${startIdx + batch.length})...`);

  const out = [];
  for (let i = 0; i < batch.length; i++) {
    const item = batch[i];
    process.stdout.write(`[${i + 1}/${batch.length}] ${item.n} ... `);
    const creaR = await searchAll(item.n, crea.search);
    const bdaR = await searchAll(item.n, bda.search);
    console.log(`CREA:${creaR.results.length} BDA:${bdaR.results.length}`);
    out.push({
      id: item.id, n: item.n, src: item.src,
      crea: creaR.results.map(r => ({ code: r.code, title: r.title })),
      bda: bdaR.results.map(r => ({ id: r.id, title: r.title })),
    });
  }
  fs.writeFileSync(path.join(__dirname, 'manual-review-candidates.json'), JSON.stringify(out, null, 1));
  console.log('Scritto manual-review-candidates.json');
}

main().catch(e => { console.error(e); process.exit(1); });
