// Stessa idea di manual-review-fetch-off.cjs ma per USDA FoodData Central
// (alimenti src:"EXTRA" — esotici/internazionali): recupera candidati
// grezzi (titolo + kcal dei primi 3) per revisione manuale diretta, non un
// punteggio automatico. Nomi locali in italiano, USDA in inglese — provo
// alcune varianti di query (nome intero, senza stato/parentesi, sola testa)
// sperando in prestiti diretti (es. "mango", "quinoa", "curry" restano
// uguali) prima di arrendermi.
const fs = require('fs');
const path = require('path');
const usda = require('./usda-lookup.cjs');

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

const IT_EN_DROP = new Set([
  'crudo','crudi','cruda','crude','cotto','cotta','cotti','cotte',
  'fresco','fresca','freschi','fresche','secco','secca','secchi','secche',
  'in','di','da','con','per','pronto','pronta','industriale','confezionato',
]);

function buildQueryVariants(name) {
  const variants = [];
  const withoutParens = name.replace(/\([^)]*\)/g, '').trim();
  if (withoutParens) variants.push(withoutParens);
  variants.push(name.replace(/[()/]/g, ' ').replace(/\s+/g, ' ').trim());
  const words = (withoutParens || name).split(/\s+/).filter(w => w && !IT_EN_DROP.has(w.toLowerCase()));
  if (words.length) variants.push(words.join(' '));
  for (let n = Math.min(3, words.length - 1); n >= 1; n--) variants.push(words.slice(0, n).join(' '));
  return [...new Set(variants.filter(Boolean))];
}

async function main() {
  const args = process.argv.slice(2);
  const startIdx = parseInt(args[0], 10) || 0;
  const count = parseInt(args[1], 10) || 40;

  const items = JSON.parse(fs.readFileSync(path.join(__dirname, 'remaining-extra.json'), 'utf8'));
  const batch = items.slice(startIdx, startIdx + count);
  console.log(`Recupero candidati USDA per ${batch.length} alimenti (${startIdx}-${startIdx + batch.length})...`);

  const out = [];
  for (let i = 0; i < batch.length; i++) {
    const item = batch[i];
    process.stdout.write(`[${i + 1}/${batch.length}] ${item.n} ... `);
    let results = [];
    let queryUsed = null;
    for (const q of buildQueryVariants(item.n)) {
      try { results = await usda.search(q); } catch (e) { results = []; }
      await sleep(150);
      if (results.length) { queryUsed = q; break; }
    }
    const top = results.slice(0, 5);
    const withKcal = [];
    for (const r of top) {
      try {
        const full = await usda.fetchFood(r.id);
        withKcal.push({ id: r.id, title: r.title, dataType: r.dataType, category: r.category, kcal: full.nutrients.k });
      } catch (e) {
        withKcal.push({ id: r.id, title: r.title, dataType: r.dataType, category: r.category, kcal: null });
      }
      await sleep(150);
    }
    console.log(`USDA:${results.length} (query: ${queryUsed || 'nessuna'})`);
    out.push({ id: item.id, n: item.n, src: item.src, queryUsed, candidates: withKcal });
  }
  fs.writeFileSync(path.join(__dirname, 'manual-review-candidates-extra.json'), JSON.stringify(out, null, 1));
  console.log('Scritto manual-review-candidates-extra.json');
}

main().catch(e => { console.error(e); process.exit(1); });
