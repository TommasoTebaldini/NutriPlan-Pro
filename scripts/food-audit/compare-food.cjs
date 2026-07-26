// Confronta un alimento locale (per id, da all-foods.json) con la scheda
// CREA ufficiale (per code), campo per campo, con tolleranza.
// Uso: node compare-food.cjs <localId> <creaCode>
const { fetchFood } = require('./crea-lookup.cjs');
const foods = require('./all-foods.json');

const MAP = {
  k:   { label: 'Energia (kcal)',                    tol: 0.05 },
  p:   { label: 'Proteine (g)',                       tol: 0.15 },
  g:   { label: 'Lipidi (g)',                          tol: 0.15 },
  ch:  { label: 'Carboidrati disponibili (g)',         tol: 0.15 },
  z:   { label: 'Zuccheri solubili (g)',               tol: 0.3 },
  fi:  { label: 'Fibra totale (g)',                    tol: 0.2 },
  ca:  { label: 'Calcio (mg)',                         tol: 0.15 },
  fe:  { label: 'Ferro (mg)',                          tol: 0.2 },
  mg:  { label: 'Magnesio (mg)',                       tol: 0.15 },
  k2:  { label: 'Potassio (mg)',                       tol: 0.15 },
  na:  { label: 'Sodio (mg)',                          tol: 0.3 },
  zn:  { label: 'Zinco (mg)',                          tol: 0.2 },
  se:  { label: 'Selenio (μg)',                        tol: 0.3 },
  col: { label: 'Colesterolo (mg)',                    tol: 0.2 },
};

async function main() {
  const [localId, creaCode] = process.argv.slice(2);
  const local = foods.find(f => f.id === localId);
  if (!local) { console.error('Non trovato in locale:', localId); process.exit(1); }
  const crea = await fetchFood(creaCode);

  // grassi saturi derivati da % su Lipidi
  const satPct = crea.nutrients['Acidi grassi Saturi (%)'];
  const creaGs = (satPct != null && crea.nutrients['Lipidi (g)'] != null)
    ? +(crea.nutrients['Lipidi (g)'] * satPct / 100).toFixed(2) : null;

  console.log(`\n=== ${local.n}  (locale ${localId})  vs  CREA ${crea.title} [${creaCode}] ===`);
  console.log(crea.url);
  const rows = [];
  for (const [key, def] of Object.entries(MAP)) {
    const lv = local[key];
    const cv = crea.nutrients[def.label];
    if (cv == null) { rows.push([key, def.label, lv, '(assente in CREA)', '']); continue; }
    const diff = lv == null ? null : Math.abs(lv - cv);
    const relOk = lv != null && (cv === 0 ? diff <= 0.05 : diff / Math.max(cv, 0.01) <= def.tol);
    rows.push([key, def.label, lv, cv, lv == null ? '?' : (relOk ? 'OK' : '⚠ DIFF')]);
  }
  rows.push(['gs', 'Grassi saturi (calc. da %)', local.gs, creaGs, (local.gs!=null && creaGs!=null && Math.abs(local.gs-creaGs)<=0.15*Math.max(creaGs,0.05)) ? 'OK' : '⚠ DIFF']);
  console.table(rows.map(r => ({ campo: r[0], nome_CREA: r[1], locale: r[2], CREA: r[3], esito: r[4] })));

  console.log('fo (folati) locale =', local.fo, '→ CREA spesso non riporta i folati per questo alimento; verificare separatamente su BDA.');
}

main().catch(e => { console.error(e); process.exit(1); });
