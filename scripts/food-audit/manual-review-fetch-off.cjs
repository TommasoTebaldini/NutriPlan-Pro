// Stessa idea di manual-review-fetch.cjs ma per Open Food Facts (UPF):
// recupera candidati grezzi (senza filtro/punteggio) per un blocco di
// alimenti UPF ancora irrisolti, li scrive su file per revisione manuale
// diretta (io leggo i titoli/marche/nutrienti veri, non uno score).
const fs = require('fs');
const path = require('path');
const off = require('./off-lookup.cjs');

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function buildQueryVariants(name) {
  const variants = [];
  const parenMatch = name.match(/\(([^)]+)\)/);
  const withoutParens = name.replace(/\([^)]*\)/g, '').trim();
  if (withoutParens) variants.push(withoutParens);
  variants.push(name.replace(/[()/]/g, ' ').replace(/\s+/g, ' ').trim());
  if (parenMatch) variants.push(parenMatch[1].trim());
  const words = (withoutParens || name).trim().split(/\s+/);
  for (let n = Math.min(4, words.length - 1); n >= 2; n--) variants.push(words.slice(0, n).join(' '));
  if (words.length >= 1) variants.push(words[0]);
  return [...new Set(variants.filter(Boolean))];
}

async function main() {
  const args = process.argv.slice(2);
  const startIdx = parseInt(args[0], 10) || 0;
  const count = parseInt(args[1], 10) || 40;

  const items = JSON.parse(fs.readFileSync(path.join(__dirname, 'remaining-upf.json'), 'utf8'));
  const batch = items.slice(startIdx, startIdx + count);
  console.log(`Recupero candidati OFF per ${batch.length} alimenti (${startIdx}-${startIdx + batch.length})...`);

  const out = [];
  for (let i = 0; i < batch.length; i++) {
    const item = batch[i];
    process.stdout.write(`[${i + 1}/${batch.length}] ${item.n} ... `);
    let results = [];
    let queryUsed = null;
    for (const q of buildQueryVariants(item.n)) {
      try { results = await off.search(q); } catch (e) { results = []; }
      await sleep(250);
      if (results.length) { queryUsed = q; break; }
    }
    console.log(`OFF:${results.length} (query: ${queryUsed || 'nessuna'})`);
    out.push({
      id: item.id, n: item.n, src: item.src, queryUsed,
      candidates: results.slice(0, 8).map(r => ({
        code: r.code, title: r.title, brands: r.brands,
        countries: (r.countries || []).slice(0, 3),
        kcal: r.nutriments && r.nutriments['energy-kcal_100g'],
        completeness: r.completeness,
      })),
    });
  }
  fs.writeFileSync(path.join(__dirname, 'manual-review-candidates-upf.json'), JSON.stringify(out, null, 1));
  console.log('Scritto manual-review-candidates-upf.json');
}

main().catch(e => { console.error(e); process.exit(1); });
