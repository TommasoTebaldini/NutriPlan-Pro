// Inizializza (o aggiorna, senza toccare le voci già presenti) il file di
// avanzamento dell'audit valori nutrizionali. Va rilanciato ogni volta che
// all-foods.json viene rigenerato dopo un'aggiunta di alimenti a db.js, così
// le nuove voci entrano in coda come 'pending' senza perdere lo stato di
// quelle già verificate.
const fs = require('fs');
const path = require('path');

const foodsPath = path.join(__dirname, 'all-foods.json');
const progressPath = path.join(__dirname, 'progress.json');

const foods = JSON.parse(fs.readFileSync(foodsPath, 'utf8'));
let progress = {};
if (fs.existsSync(progressPath)) {
  progress = JSON.parse(fs.readFileSync(progressPath, 'utf8'));
}

let added = 0;
for (const f of foods) {
  if (!progress[f.id]) {
    progress[f.id] = { n: f.n, src: f.src, status: 'pending' };
    added++;
  }
}

fs.writeFileSync(progressPath, JSON.stringify(progress, null, 1));

const statusCounts = {};
const srcPendingCounts = {};
Object.values(progress).forEach(p => {
  statusCounts[p.status] = (statusCounts[p.status] || 0) + 1;
  if (p.status === 'pending') srcPendingCounts[p.src] = (srcPendingCounts[p.src] || 0) + 1;
});

console.log('Nuove voci aggiunte:', added);
console.log('Totale voci tracciate:', Object.keys(progress).length);
console.log('Per stato:', statusCounts);
console.log('Pending per src:', srcPendingCounts);
