// Cerca un prodotto su Open Food Facts (usato dal progetto stesso lato app,
// vedi Diet-Plan-Pro-app-claude/api/off-proxy.js — stessa cascata di
// endpoint: Meilisearch → API v2 → CGI, qui chiamati direttamente in Node
// senza bisogno del proxy CORS che serve solo al browser).
//
// Uso:
//   node off-lookup.cjs "nutella"                → elenca i risultati
//   node off-lookup.cjs --code 0009800800049      → estrae un prodotto per barcode

const https = require('https');

const HEADERS = { 'User-Agent': 'NutriPlanAudit/1.0 (nutrition data audit; non-commercial thesis project)' };
const FIELDS = 'code,product_name,product_name_it,product_name_en,brands,countries_tags,nutriments,completeness';

function get(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: HEADERS }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return resolve(get(res.headers.location));
      }
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch (e) { reject(new Error('OFF non-JSON: ' + d.slice(0, 200))); } });
    }).on('error', reject);
  });
}

function productName(p) {
  return p.product_name_it || p.product_name || p.product_name_en || '';
}

async function search(query) {
  const q = encodeURIComponent(query);
  try {
    const data = await get(`https://search.openfoodfacts.org/search?q=${q}&page_size=15&fields=${FIELDS}`);
    if (data.hits && data.hits.length) return data.hits.map(normalize);
  } catch (e) { /* fall through */ }
  try {
    const data = await get(`https://world.openfoodfacts.org/api/v2/search?search_terms=${q}&fields=${FIELDS}&page_size=15`);
    if (data.products && data.products.length) return data.products.map(normalize);
  } catch (e) { /* fall through */ }
  return [];
}

function normalize(p) {
  return {
    code: p.code,
    title: productName(p),
    brands: p.brands || '',
    countries: p.countries_tags || [],
    nutriments: p.nutriments || {},
    completeness: p.completeness || 0,
  };
}

async function fetchByCode(code) {
  const data = await get(`https://world.openfoodfacts.org/api/v0/product/${encodeURIComponent(code)}.json?fields=${FIELDS}`);
  if (data.status !== 1) return null;
  return normalize(data.product);
}

async function main() {
  const args = process.argv.slice(2);
  if (args[0] === '--code') {
    const p = await fetchByCode(args[1]);
    console.log(JSON.stringify(p, null, 1));
    return;
  }
  const results = await search(args.join(' '));
  console.log(JSON.stringify(results, null, 1));
}

if (require.main === module) {
  main().catch(e => { console.error(e); process.exit(1); });
}

module.exports = { search, fetchByCode };
