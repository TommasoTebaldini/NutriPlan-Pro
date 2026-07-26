// Cerca un alimento su bda.ieo.it (Banca Dati di Composizione degli
// Alimenti, IEO) tramite l'API JSON che alimenta la loro webapp
// (bda-frontend, Vue SPA) — trovata ispezionando il bundle JS compilato
// (bda.ieo.it/bda-frontend/js/app.*.js), non documentata pubblicamente.
//
// ⚠️ Il certificato TLS di bda.ieo.it risulta SCADUTO (verificato 2026-07-25,
// errore "certificate has expired" sia con curl che con WebFetch). Le
// richieste qui sotto usano rejectUnauthorized:false per poter comunque
// leggere i dati pubblici (nessuna autenticazione/dato sensibile coinvolto,
// sola lettura di una tabella nutrizionale pubblica). Se in futuro il sito
// rinnova il certificato si può rimuovere il flag.
//
// Uso:
//   node bda-lookup.cjs "pasta di semola"       → elenca i risultati della ricerca
//   node bda-lookup.cjs --id 50_2                → estrae la scheda completa per un idFood

const https = require('https');

function apiPost(path, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = https.request({
      hostname: 'bda.ieo.it', path: '/api' + path, method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data), 'User-Agent': 'Mozilla/5.0 (compatible; NutriPlanAudit/1.0)' },
      rejectUnauthorized: false,
    }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch (e) { reject(new Error('BDA API non-JSON response: ' + d.slice(0, 200))); } });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function search(query) {
  const r = await apiPost('/BDA/SearchFoodByName', { language: 0, searchValue: query });
  if (!r.success) return [];
  return (r.foods || []).map(f => ({ id: f.idFood, code: f.idFoodShort, title: titleCase(f.description) }));
}

function titleCase(s) {
  // BDA ritorna i nomi TUTTO MAIUSCOLO ("PASTA DI SEMOLA, cruda") — normalizzo
  // solo per leggibilità nei log, il confronto lo fa comunque lowercase.
  return s.replace(/\b[A-ZÀ-Ù]{2,}\b/g, w => w.charAt(0) + w.slice(1).toLowerCase());
}

function parseVal(raw) {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (s === '' || /^tr$/i.test(s)) return 0;
  const n = parseFloat(s.replace(',', '.'));
  return Number.isNaN(n) ? null : n;
}

async function fetchFood(id) {
  const [infoRes, compRes] = await Promise.all([
    apiPost('/BDA/FoodInfo', { language: 0, foodId: id }),
    apiPost('/BDA/FoodComponents', { language: 0, foodId: id }),
  ]);
  const title = infoRes.success ? titleCase(infoRes.foodInfo.description) : null;
  const nutrients = {};
  if (compRes.success) {
    for (const group of compRes.foodComponents) {
      for (const c of group.components) {
        // Alcuni componenti (es. "Energia") appaiono 2 volte con unità
        // diverse (kJ/kcal) — chiave = "descrizione (unità)" per non perdere
        // nessuna delle due, mai sovrascrivere una entry già presente.
        const key = `${c.dscomp} (${c.cnum})`;
        if (!(key in nutrients)) nutrients[key] = parseVal(c.valore);
      }
    }
  }
  return { id, title, nutrients, url: `https://bda.ieo.it/bda-frontend/PageFoodInfo/Ita/${id}` };
}

async function main() {
  const args = process.argv.slice(2);
  if (args[0] === '--id') {
    const food = await fetchFood(args[1]);
    console.log(JSON.stringify(food, null, 1));
    return;
  }
  const results = await search(args.join(' '));
  console.log(JSON.stringify(results, null, 1));
}

if (require.main === module) {
  main().catch(e => { console.error(e); process.exit(1); });
}

module.exports = { search, fetchFood, parseVal };
