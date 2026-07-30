// Scan all-foods.json for logically-impossible or highly-implausible macro/micronutrient
// combinations. Pure-logic checks, no external source needed - same category of bug that
// found the zuccheri>carboidrati / grassi-saturi>grassi-totali errors fixed 2026-07-30.
const fs = require('fs');

const foods = JSON.parse(fs.readFileSync('all-foods.json', 'utf8'));

// NOTA: niente check "fiber > carbs" o "colesterolo in alimenti vegetali" - entrambi
// rimossi dopo verifica: fi/ch sono tracciati separatamente nella convenzione CREA/BDA
// (ch = carboidrati DISPONIBILI, non totali-per-differenza), quindi fi>ch e' normalissimo
// per verdure/noci ad alta fibra (avocado, mandorle, aglio...) - non e' un bug. Il check
// colesterolo dava quasi solo falsi positivi su pasta/gnocchi con uovo o ripieni di carne
// dentro categorie nominalmente "Cereali" - troppo rumoroso per essere utile.

const ALCOHOL_KEYWORDS = /birra|vino|prosecco|spumante|champagne|liquore|amaro|whisky|whiskey|vodka|gin(?!\w)|rum\b|cognac|brandy|grappa|limoncello|mirto|campari|aperol|spritz|mojito|sidro|porto\b|sherry|vermouth|sambuca|sake|amaretto|negroni|cocktail|martini|tequila|rye\b/i;

const issues = [];

function push(type, f, detail) {
  issues.push({ type, id: f.id, n: f.n, src: f.src, detail });
}

for (const f of foods) {
  const num = (x) => (typeof x === 'number' ? x : NaN);
  const { k, p, gs, g, z, ch, fi, ca, fe, mg, k2, na, zn, fo, se, col } = f;

  // 1. Sugars cannot exceed total carbs
  if (num(z) - num(ch) > 0.15) {
    push('sugar-exceeds-carbs', f, `z=${z} > ch=${ch}`);
  }
  // 2. Saturated fat cannot exceed total fat
  if (num(gs) - num(g) > 0.1) {
    push('satfat-exceeds-totalfat', f, `gs=${gs} > g=${g}`);
  }
  // 3. Negative values anywhere
  for (const [key, val] of Object.entries({ k, p, gs, g, z, ch, fi, ca, fe, mg, k2, na, zn, fo, se, col })) {
    if (typeof val === 'number' && val < 0) {
      push('negative-value', f, `${key}=${val}`);
    }
  }
  // 4. Atwater consistency: kcal vs 4P + 4C + 9F
  // Skip: alcoholic drinks (ethanol 7kcal/g untracked), very high fiber foods (bran/herbs/cacao -
  // official tables often use reduced/near-zero kcal factors for fiber, breaks the naive formula),
  // non-nutritive sweeteners (erythritol/xylitol/etc, near-0kcal despite "carbs" on label).
  const SWEETENER_KEYWORDS = /eritritolo|xilitolo|maltitolo|sorbitolo|isomalto|stevia|chewing ?gum/i;
  if (!ALCOHOL_KEYWORDS.test(f.n) && !SWEETENER_KEYWORDS.test(f.n) && num(fi) < 15
      && [k, p, ch, g].every((v) => typeof v === 'number')) {
    const expected = p * 4 + ch * 4 + g * 9;
    const absDiff = Math.abs(k - expected);
    const relDiff = expected > 0 ? absDiff / expected : (k > 0 ? 1 : 0);
    if (absDiff > 25 && relDiff > 0.30) {
      push('atwater-mismatch', f, `k=${k} vs expected~${expected.toFixed(1)} (p=${p},ch=${ch},g=${g})`);
    }
  }
}

// 5. Duplicate names (case/space-insensitive) with divergent core macro values, still unresolved
const byName = new Map();
for (const f of foods) {
  const key = f.n.trim().toLowerCase();
  if (!byName.has(key)) byName.set(key, []);
  byName.get(key).push(f);
}
for (const [name, group] of byName) {
  if (group.length < 2) continue;
  const kcals = group.map((x) => x.k);
  const spread = Math.max(...kcals) - Math.min(...kcals);
  if (spread > 15) {
    issues.push({
      type: 'duplicate-name-divergent-kcal',
      id: group.map((x) => x.id).join(','),
      n: name,
      src: group.map((x) => x.src).join(','),
      detail: `kcal values: ${kcals.join(', ')}`,
    });
  }
}

const bySeverity = {};
for (const i of issues) bySeverity[i.type] = (bySeverity[i.type] || 0) + 1;
console.log('Totale problemi:', issues.length);
console.log(bySeverity);

fs.writeFileSync('structural-issues.json', JSON.stringify(issues, null, 2));
console.log('Scritto structural-issues.json');
