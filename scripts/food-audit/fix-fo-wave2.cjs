// Third pass of the same placeholder-folate bug: found by comparing every item's fo against its
// own category median (not just an absolute >=90 threshold like the first pass) - a "second tier"
// of the same confectionery/snack/gelato cluster sitting at 50-90mcg, below the first pass's
// threshold but still 3-4x the now-established category baseline (~20 for biscuits/sweets,
// ~12 for gelato). Same bucketing logic as fix-fo-placeholder-cluster.cjs - 2026-07-30.
const fs = require('fs');

const DB_PATH = 'C:/Users/Manutenzione/Desktop/Nut/NutriPlan-Pro/js/db.js';
let text = fs.readFileSync(DB_PATH, 'utf8');

const candidates = JSON.parse(fs.readFileSync('fo-wave2-candidates.json', 'utf8'));

function bucket(f) {
  const n = f.n;
  if (/gelato|cornetto algida|cornetto confezionato/i.test(n)) return 12;
  if (/torta margherita|crostata|struffoli|krapfen|bombolone|pandoro|colomba|cheesecake|tiramis[uù]|muffin|brioche|croissant/i.test(n)) return 35;
  if (/cracker.*(semi|keto)/i.test(n)) return 25; // seed-based cracker, moderate
  if (/focaccia/i.test(n)) return 25;
  return 20; // default: biscuits, wafers, chocolate, chips
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
fs.writeFileSync('fo-wave2-fix-log.json', JSON.stringify({ applied, log, skipped }, null, 2));
console.log('Applicate:', applied, '| Saltate:', skipped.length);
if (skipped.length) console.log(skipped);
