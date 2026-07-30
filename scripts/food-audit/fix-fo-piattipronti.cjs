// Fourth wave of the same placeholder-folate bug, this time in "Piatti pronti" (ready meals) -
// virtually every pasta/pizza/risotto/lasagne/soup dish sat at 53-250mcg regardless of real
// ingredient folate content. Unlike the confectionery clusters, this category genuinely has
// some dishes that SHOULD be higher (legume soups, leafy-green dishes) so bucket by ingredient
// keyword rather than a single flat value - 2026-07-30.
const fs = require('fs');

const DB_PATH = 'C:/Users/Manutenzione/Desktop/Nut/NutriPlan-Pro/js/db.js';
let text = fs.readFileSync(DB_PATH, 'utf8');

const candidates = JSON.parse(fs.readFileSync('fo-piattipronti-candidates.json', 'utf8'));

function bucket(f) {
  const n = f.n;
  // Legume-based: genuinely higher real folate (chickpeas/lentils/beans)
  if (/fagiol|cec\b|lentic|legum|dhal|hummus|falafel/i.test(n)) return 70;
  // Leafy-green / vegetable-forward dishes
  if (/ribollita|pizzoccheri|strangolapreti|minestrone|verdure|zucca|cipolle|guacamole|pappa al pomodoro|wok/i.test(n)) return 45;
  // Fried potato/rice snacks, minimal folate contributors
  if (/crocchette di patate|gnocchi di patate|patate al forno|polenta|riso in busta/i.test(n)) return 15;
  if (/insalata pronta/i.test(n)) return 25;
  // Default: flour+tomato+dairy+meat based dishes (pasta, pizza, lasagne, risotto, ravioli/tortellini,
  // gnocchi alla sorrentina, arancino/suppli, piadina, tramezzino, wrap, tacos, sushi, gyoza, tortilla)
  return 22;
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
fs.writeFileSync('fo-piattipronti-fix-log.json', JSON.stringify({ applied, log, skipped }, null, 2));
console.log('Applicate:', applied, '| Saltate:', skipped.length);
if (skipped.length) console.log(skipped);
