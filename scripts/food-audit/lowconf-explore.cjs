// Esplora manualmente i 47 duplicati "low-confidence": per ciascuno prova
// query mirate (scelte a mano, non l'euristica automatica) e stampa TUTTI i
// risultati di ricerca CREA per revisione umana.
const { search } = require('./crea-lookup.cjs');
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

const QUERIES = {
  'Caffè espresso': ['caffe tostato', 'espresso'],
  'Semi di chia': ['chia'],
  'Asparagi': ['asparagi coltivati', 'asparagi verdi'],
  'Caprino fresco': ['caprino fresco', 'formaggio caprino'],
  'Semi di sesamo crudi': ['sesamo semi', 'sesamo'],
  'Litchi fresco': ['litchi'],
  'Carciofo crudo': ['carciofo crudo', 'carciofi'],
  'Topinambur': ['topinambur crudo'],
  'Orata fresca': ['orata fresca', 'orata'],
  'Ghee (burro chiarificato)': ['ghee', 'burro chiarificato'],
  'Pane con noci': ['pane con noci', 'pane noci'],
  'Pane multicereali': ['pane multicereali', 'pane ai cereali'],
  'Stracciatella di bufala': ['stracciatella bufala', 'stracciatella formaggio'],
  'Semi di canapa sgusciati': ['canapa semi', 'canapa'],
  'Panna fresca da cucina (35% grassi)': ['panna da cucina', 'panna 35'],
  'Labneh (yogurt colato mediorientale)': ['labneh'],
  'Freekeh (grano verde tostato)': ['freekeh'],
  'Miso (pasta di soia fermentata)': ['miso'],
  'Natto (soia fermentata giapponese)': ['natto'],
  'Anguilla fresca': ['anguilla fresca', 'anguilla'],
  'Edamame (soia verde)': ['edamame'],
  'Semi di girasole': ['semi girasole', 'girasole semi'],
  'Semi di zucca': ['semi zucca', 'zucca semi'],
  'Mirtilli essiccati': ['mirtilli essiccati', 'mirtilli secchi'],
  'Farina di grano tenero tipo 2': ['farina tipo 2', 'farina grano tenero'],
  'Pesce spada affumicato': ['pesce spada affumicato'],
  'Lupini in salamoia sgocciolati': ['lupini salamoia', 'lupini ammollati'],
  'Rucola cruda': ['rucola'],
  'Ribes rosso fresco': ['ribes rosso'],
  'Semi di lino crudi': ['semi lino', 'lino semi'],
  'Nocciole tostate': ['nocciole tostate', 'nocciole secche'],
  'Pistacchi tostati non salati': ['pistacchi tostati', 'pistacchi secchi'],
  'Pesce spada fresco': ['pesce spada fresco', 'pesce spada'],
  'Tahini (crema di sesamo)': ['tahin', 'tahini'],
  'Ketchup Heinz': ['ketchup'],
  'Agretti (barba di frate)': ['agretti', 'barba di frate'],
  'Freekeh (grano verde arrostito, cotto)': ['freekeh cotto'],
  'Ribes nero fresco': ['ribes nero'],
  'Semi di canapa decorticati': ['canapa decorticati', 'canapa'],
  'Semi di papavero': ['papavero semi', 'papavero'],
  'Valtellina Casera DOP': ['valtellina casera', 'casera'],
  'Grappa (per 100ml)': ['grappa'],
  'Noci di Macadamia crude': ['macadamia'],
  'Piselli lessati': ['piselli lessati', 'piselli bolliti'],
  'Farina di grano tenero tipo 1': ['farina tipo 1'],
  'Semola rimacinata di grano duro': ['semola rimacinata', 'semola grano duro'],
};

async function main() {
  for (const [name, queries] of Object.entries(QUERIES)) {
    console.log(`\n### ${name}`);
    for (const q of queries) {
      const results = await search(q);
      await sleep(280);
      console.log(`  "${q}" →`, results.length ? results.map(r => `[${r.code}] ${r.title}`).join(' | ') : '(nessun risultato)');
    }
  }
}
main().catch(e => { console.error(e); process.exit(1); });
