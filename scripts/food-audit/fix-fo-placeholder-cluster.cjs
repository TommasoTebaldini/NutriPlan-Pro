// Fix a large systemic pattern found 2026-07-30: ~139 packaged sweets/snacks/gelato/biscuit
// items across UPF/EXTRA/ONS/CREA/BDA had "fo" (folati) clustered in a suspicious 90-250mcg
// band regardless of actual ingredients - e.g. Pringles/Doritos/Cheetos (potato/corn+oil, no
// folate-rich ingredient) at 90-160mcg, Nutella/Twix/Snickers (cocoa+sugar+fat, no folate
// source) at 100-145mcg. Verified via external search that real values for these product
// types are 10-40mcg (confirmed Oreo ~65mcg, Nutella folate not even tracked commercially/
// negligible). This looks like an old templated placeholder never corrected per-product,
// not organic per-item research. Excluded from this fix: organ meats (Cuore/Rognone/Animelle
// - genuinely higher-folate tissue, left as-is, lower confidence of being a bug), fish roe/
// oyster/matcha/peanut butter/fortified protein products (plausible legitimate high values).
//
// This applies CONSERVATIVE CATEGORY-LEVEL estimates, not per-product research (the volume
// makes per-product web verification impractical) - documented explicitly, treat as an
// order-of-magnitude fix rather than precision data.
const fs = require('fs');

const DB_PATH = 'C:/Users/Manutenzione/Desktop/Nut/NutriPlan-Pro/js/db.js';
let text = fs.readFileSync(DB_PATH, 'utf8');

const candidates = JSON.parse(fs.readFileSync('fo-cluster-candidates.json', 'utf8'));

const EXCLUDE_NAME = /rognone|cuore (bovino|di manzo)|animelle|protein shake rtd/i;

function bucket(f) {
  const n = f.n;
  if (/pringles|doritos|cheetos|nachos|patatine|pretzel|popcorn.*(salat|microonde)|cracker.*salat.*industrial|ciambelline salate/i.test(n)) return 15;
  if (/frittata|omelette/i.test(n)) return 45;
  if (/mascarpone|philadelphia/i.test(n)) return 12;
  if (/bacon|nduja/i.test(n)) return 5;
  if (/tiramis|panettone|pandoro|colomba|cannolo|crostata|profiteroles|bombolone|maritozzo|zeppole|croissant|brioche|cr[eè]me caramel/i.test(n)) return 35;
  if (/gelato|magnum|maxibon|h[aä]agen|cono gelato/i.test(n)) return 12;
  if (/cannelloni/i.test(n)) return 25;
  return 20; // default: flour/cocoa-based confectionery, wafers, chocolate bars, biscuits
}

let applied = 0;
let skipped = [];
const log = [];

for (const f of candidates) {
  if (EXCLUDE_NAME.test(f.n)) {
    skipped.push({ id: f.id, n: f.n, reason: 'organ-meat-or-fortified, excluded by design' });
    continue;
  }
  const newFo = bucket(f);
  // Escape regex special chars in name
  const escName = f.n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Match the specific line: contains this exact name AND the exact old fo value, as a distinct field
  const lineRe = new RegExp(`(\\{n:"${escName}"[^}]*?fo:)${f.fo}(?=[,}])`);
  if (lineRe.test(text)) {
    text = text.replace(lineRe, `$1${newFo}`);
    applied++;
    log.push({ id: f.id, n: f.n, oldFo: f.fo, newFo, bucket: newFo });
  } else {
    skipped.push({ id: f.id, n: f.n, reason: 'line not found/already changed' });
  }
}

fs.writeFileSync(DB_PATH, text);
fs.writeFileSync('fo-cluster-fix-log.json', JSON.stringify({ applied, log, skipped }, null, 2));
console.log('Applicate:', applied, '| Saltate:', skipped.length);
if (skipped.length) console.log(skipped.slice(0, 20));
