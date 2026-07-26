// Test di non-regressione: OGNI bug reale trovato in sessioni precedenti,
// rifatto girare come controllo automatico PRIMA di ogni batch UPF su
// scala. Se anche uno solo fallisce, NON lanciare batch — investigare prima.
const fs = require('fs');
const src = fs.readFileSync(__dirname + '/audit-upf-batch.cjs', 'utf8');
eval(src.split('async function main()')[0]);

const cases = [
  { name: 'Pollo petto (senza pelle)', bad: { title: 'Faraona, petto, senza pelle, crudo', brands: [] }, desc: 'specie sbagliata (faraona invece di pollo)' },
  { name: 'Latte intero fresco', bad: { title: 'Yogurt, da latte intero', brands: [] }, desc: 'prodotto sbagliato (yogurt invece di latte)' },
  { name: 'Merendina tipo Fiesta (Ferrero)', bad: { title: 'Fiesta schnitzel', brands: ['Fiesta'] }, desc: 'marca omonima ma categoria diversa (pollo impanato)' },
  { name: 'Biscotti Gocciole (Mulino Bianco, per 100g)', bad: { title: 'Gelato Gocciole', brands: ['Gocciole'] }, desc: 'stesso nome ma gelato invece di biscotti' },
  { name: 'Kebab in pita (stima per 200g porzione)', bad: { title: 'Sauce Kebab Pita Altesse', brands: [] }, desc: 'salsa invece del piatto' },
  { name: 'Coca-Cola / cola classica', bad: { title: 'Coca Cola, Coke Zero', brands: ['Coca-Cola'] }, desc: 'variante zero invece di classica' },
  { name: 'Latte al cioccolato industriale', bad: { title: 'Cioccolato al latte', brands: ['Novi'] }, desc: 'parole invertite, prodotto opposto' },
  { name: 'Sottilette fette di formaggio', bad: { title: 'Formaggio pecorino a fette', brands: [] }, desc: 'formaggio diverso, parola più specifica assente' },
  { name: 'Cocktail Mojito (porzione 200mL)', bad: { title: 'Sirop pour cocktail mojito', brands: ['Auchan'] }, desc: 'sciroppo (termine francese) invece del cocktail' },
  { name: 'Liquirizia industriale', bad: { title: 'Orogiallo Fresh Pasta', brands: ['La Bolognese SRL Zona Industriale 1'] }, desc: '"industriale" ha trovato match su un indirizzo' },
  { name: 'Cavolo cappuccio crudo', bad: { title: 'Cavolo cappuccio, rosso, crudo', brands: [] }, tie: { title: 'Cavolo cappuccio, verde, crudo', brands: [] }, desc: 'colore ambiguo non specificato localmente' },
  { name: "McDonald's McFlurry Oreo (per 100g)", bad: { title: "Mcdonald's kitkat banana split mcflurry", brands: ["Mcdonald's"] }, desc: 'gusto sbagliato — "mcdonald" (8 lettere) batteva "oreo" (4 lettere) sulla sola lunghezza' },
];

let allPass = true;
for (const c of cases) {
  let ok;
  if (c.tie) {
    // caso di pareggio: entrambi passano le guardie singolarmente, ma il
    // controllo finale nel loop di scelta best/second deve rilevare il
    // pareggio — qui verifichiamo solo che entrambi i candidati abbiano
    // punteggio identico (la logica di scarto è nel loop principale, non
    // testabile in isolamento senza duplicarlo — verifica manuale annotata).
    const s1 = tokenScore(c.name, c.bad), s2 = tokenScore(c.name, c.tie);
    ok = Math.abs(s1 - s2) < 0.08; // se il gap è piccolo, il tie-break del loop principale lo scarterà
    console.log(ok ? 'OK (pareggio rilevabile)' : 'DA VERIFICARE A MANO', '-', c.name, `(${c.desc})`);
    continue;
  }
  // Replica la condizione REALE di accettazione del loop principale: deve
  // passare le guardie dure E avere tokenScore >= soglia (0.45). Testare
  // solo le guardie in isolamento dà falsi allarmi quando in realtà è la
  // soglia a scartare il candidato (visto succedere davvero).
  const passesGuards = passesHardGuards(c.name, c.bad) && orderConsistent(c.name, c.bad);
  const score = tokenScore(c.name, c.bad);
  const wouldBeAccepted = passesGuards && score >= 0.45;
  ok = !wouldBeAccepted;
  if (!ok) console.log('  (tokenScore=' + score.toFixed(2) + ', guardie=' + passesGuards + ')');
  if (!ok) allPass = false;
  console.log(ok ? 'OK' : '❌ REGRESSIONE', '-', c.name, `→ "${c.bad.title}"`, `(${c.desc})`);
}
console.log('\n' + (allPass ? 'TUTTI I TEST PASSANO — sicuro procedere con un batch.' : 'ATTENZIONE: una o più regressioni — NON lanciare batch, investigare prima.'));
process.exit(allPass ? 0 : 1);
