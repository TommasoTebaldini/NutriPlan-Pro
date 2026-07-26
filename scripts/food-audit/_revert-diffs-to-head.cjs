const fs = require('fs');
const cp = require('child_process');
const path = require('path');
const dbPath = path.join(__dirname, '..', '..', 'js', 'db.js');
const original = cp.execSync('git show HEAD:js/db.js', { cwd: path.join(__dirname, '..', '..'), maxBuffer: 1024 * 1024 * 50 }).toString();

function extract(line) {
  const n = line.match(/n:"((?:[^"\\]|\\.)*)"/);
  const s = line.match(/src:"([A-Z]+)"/);
  if (!n || !s) return null;
  return { name: n[1], src: s[1] };
}
const origByName = {};
original.split('\n').forEach(l => {
  const ns = extract(l);
  if (ns && ns.src === 'UPF' && !origByName[ns.name]) origByName[ns.name] = l;
});

const diffNames = new Set(require('./_upf-diff-names.json'));
const curLines = fs.readFileSync(dbPath, 'utf8').split('\n');
let reverted = 0;
const newLines = curLines.map(l => {
  const ns = extract(l);
  if (ns && ns.src === 'UPF' && diffNames.has(ns.name) && origByName[ns.name]) { reverted++; return origByName[ns.name]; }
  return l;
});
fs.writeFileSync(dbPath, newLines.join('\n'));
console.log('Ripristinate a HEAD (per re-verifica pulita):', reverted);
