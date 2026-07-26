// Cerca un alimento su alimentinutrizione.it (portale ufficiale CREA) e ne
// estrae la tabella nutrizionale completa, parsando l'HTML direttamente
// (niente riassunto via modello — numeri esatti dalla fonte).
//
// Uso:
//   node crea-lookup.cjs "pasta di semola"        → elenca i risultati della ricerca
//   node crea-lookup.cjs --code 000800             → estrae la tabella per un codice noto

const https = require('https');

function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; NutriPlanAudit/1.0)' } }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return resolve(fetchUrl(new URL(res.headers.location, url).toString()));
      }
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

async function search(query) {
  const url = `https://www.alimentinutrizione.it/component/search/?searchword=${encodeURIComponent(query)}&searchphrase=all`;
  const html = await fetchUrl(url);
  const results = [];
  const re = /<a href="\/tabelle-nutrizionali\/(\d+)">([\s\S]*?)<\/a>/g;
  let m;
  while ((m = re.exec(html))) {
    const title = m[2].replace(/<[^>]+>/g, '').replace(/&#160;/g, ' ').replace(/\s+/g, ' ').trim();
    results.push({ code: m[1], title });
  }
  return results;
}

function parseVal(raw) {
  if (raw == null) return null;
  const s = raw.replace(/&nbsp;/g, '').trim();
  if (s === '' || s === '-') return null;
  if (/^tr$/i.test(s)) return 0; // traccia
  const n = parseFloat(s.replace(',', '.'));
  return Number.isNaN(n) ? null : n;
}

async function fetchFood(code) {
  const url = `https://www.alimentinutrizione.it/tabelle-nutrizionali/${code}`;
  const html = await fetchUrl(url);
  const titleMatch = html.match(/<title>AlimentiNUTrizione - ([^<]+)<\/title>/);
  const title = titleMatch ? titleMatch[1].trim() : null;

  const nutrients = {};
  // Ogni riga dati: <td width="250">Label (unit)</td><td>unit</td><td>VALUE...
  const re = /<td width="250">([^<]+)<\/td><td>[^<]*<\/td><td>([^<]*)</g;
  let m;
  while ((m = re.exec(html))) {
    const label = m[1].trim();
    const val = parseVal(m[2]);
    if (val !== null) nutrients[label] = val;
  }
  return { code, title, nutrients, url };
}

// ─── CLI ────────────────────────────────────────────────────────────────
async function main() {
  const args = process.argv.slice(2);
  if (args[0] === '--code') {
    const food = await fetchFood(args[1]);
    console.log(JSON.stringify(food, null, 1));
    return;
  }
  const query = args.join(' ');
  const results = await search(query);
  console.log(JSON.stringify(results, null, 1));
}

if (require.main === module) {
  main().catch(e => { console.error(e); process.exit(1); });
}

module.exports = { search, fetchFood, parseVal };
