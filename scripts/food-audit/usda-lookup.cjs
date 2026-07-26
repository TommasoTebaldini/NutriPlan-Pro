// Cerca un alimento su USDA FoodData Central — usato per gli alimenti
// src:"EXTRA" (esotici/internazionali, non tipicamente italiani, quindi
// assenti da CREA/BDA). Filtra SOLO su dataType Foundation + SR Legacy
// (dati di riferimento curati, tipo tabelle ufficiali) — ESCLUDE
// deliberatamente "Branded" (prodotti di marca inseriti da aziende/utenti,
// stessa categoria di rumore già vista con Open Food Facts per UPF, non
// serve qui e aggiungerebbe lo stesso rischio di match sbagliati).
//
// Richiede una API key personale (api.data.gov/signup, gratuita) passata
// come env var USDA_API_KEY — MAI committare la chiave nel codice.
//
// Uso:
//   USDA_API_KEY=xxx node usda-lookup.cjs "mango"
//   USDA_API_KEY=xxx node usda-lookup.cjs --id 169910

const https = require('https');

const API_KEY = process.env.USDA_API_KEY;
if (!API_KEY) {
  console.error('Manca USDA_API_KEY nell\'ambiente.');
  process.exit(1);
}

function get(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'NutriPlanAudit/1.0' } }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch (e) { reject(new Error('USDA non-JSON: ' + d.slice(0, 300))); } });
    }).on('error', reject);
  });
}

async function search(query) {
  const url = `https://api.nal.usda.gov/fdc/v1/foods/search?query=${encodeURIComponent(query)}&api_key=${API_KEY}&pageSize=15&dataType=Foundation,SR%20Legacy`;
  const data = await get(url);
  if (data.error) throw new Error('USDA API error: ' + JSON.stringify(data.error));
  return (data.foods || []).map(f => ({ id: f.fdcId, title: f.description, dataType: f.dataType, category: f.foodCategory }));
}

// nutrientNumber → campo locale (numeri standard USDA, stabili tra dataType)
const NUTRIENT_NUMBER_MAP = {
  '208': 'k', '203': 'p', '204': 'g', '205': 'ch', '269': 'z', '291': 'fi',
  '301': 'ca', '303': 'fe', '304': 'mg', '306': 'k2', '307': 'na', '309': 'zn',
  '317': 'se', '606': 'gs', '601': 'col', '417': 'fo',
};

async function fetchFood(id) {
  const url = `https://api.nal.usda.gov/fdc/v1/food/${id}?api_key=${API_KEY}`;
  const data = await get(url);
  if (data.error) throw new Error('USDA API error: ' + JSON.stringify(data.error));
  const nutrients = {};
  for (const n of data.foodNutrients || []) {
    const num = n.nutrient && n.nutrient.number;
    const field = NUTRIENT_NUMBER_MAP[num];
    if (field && !(field in nutrients)) nutrients[field] = n.amount;
  }
  return { id, title: data.description, dataType: data.dataType, nutrients, url: `https://fdc.nal.usda.gov/food-details/${id}/nutrients` };
}

async function main() {
  const args = process.argv.slice(2);
  if (args[0] === '--id') {
    const f = await fetchFood(args[1]);
    console.log(JSON.stringify(f, null, 1));
    return;
  }
  const results = await search(args.join(' '));
  console.log(JSON.stringify(results, null, 1));
}

if (require.main === module) {
  main().catch(e => { console.error(e); process.exit(1); });
}

module.exports = { search, fetchFood };
