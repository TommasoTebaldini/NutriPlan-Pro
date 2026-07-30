// Second straggler cluster of the same placeholder-folate bug, found by comparing "Fast food"
// category entries: many generic/unbranded items (pizza surgelata, hot dog, panzerotto, piadina,
// lasagne, tramezzino, sofficini, arancino, spring roll, onion rings) sat at 45-250mcg while the
// specifically-branded items in the same category (McDonald's/KFC/Subway, previously researched
// individually in earlier UPF sessions) were already correctly down at 5-30mcg. The unbranded
// generic items were apparently never covered by that manual pass. Same conservative
// category-level estimate approach as fix-fo-placeholder-cluster.cjs - 2026-07-30.
const fs = require('fs');

const DB_PATH = 'C:/Users/Manutenzione/Desktop/Nut/NutriPlan-Pro/js/db.js';
let text = fs.readFileSync(DB_PATH, 'utf8');

const candidates = JSON.parse(fs.readFileSync('fo-fastfood-candidates.json', 'utf8'));

function bucket(f) {
  const n = f.n;
  if (/falafel/i.test(n)) return 60; // legume-based, genuinely higher but diluted by breading/frying
  if (/pizza/i.test(n)) return 35; // flour + tomato + mozzarella
  if (/panzerotto|calzone/i.test(n)) return 30;
  if (/lasagne/i.test(n)) return 25;
  if (/piadina/i.test(n)) return 25;
  if (/tramezzino/i.test(n)) return 25;
  if (/hot ?dog|w[uü]rstel/i.test(n)) return 25;
  if (/hamburger|cheeseburger|panino da hamburger/i.test(n)) return 25;
  if (/kebab/i.test(n)) return 20;
  if (/sofficini/i.test(n)) return 20;
  if (/spring roll|rotoli primavera/i.test(n)) return 20;
  if (/onion rings/i.test(n)) return 15;
  if (/arancino|suppl/i.test(n)) return 15;
  return 20;
}

let applied = 0;
let skipped = [];
const log = [];

for (const f of candidates) {
  const newFo = bucket(f);
  const escName = f.n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const lineRe = new RegExp(`(\\{n:"${escName}"[^}]*?fo:)${f.fo}(?=[,}])`);
  if (lineRe.test(text)) {
    text = text.replace(lineRe, `$1${newFo}`);
    applied++;
    log.push({ id: f.id, n: f.n, oldFo: f.fo, newFo });
  } else {
    skipped.push({ id: f.id, n: f.n, reason: 'line not found/already changed' });
  }
}

fs.writeFileSync(DB_PATH, text);
fs.writeFileSync('fo-fastfood-fix-log.json', JSON.stringify({ applied, log, skipped }, null, 2));
console.log('Applicate:', applied, '| Saltate:', skipped.length);
if (skipped.length) console.log(skipped);
