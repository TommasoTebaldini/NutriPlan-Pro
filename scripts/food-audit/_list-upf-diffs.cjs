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

const curLines = fs.readFileSync(dbPath, 'utf8').split('\n');
const diffs = [];
curLines.forEach(l => {
  const ns = extract(l);
  if (ns && ns.src === 'UPF' && origByName[ns.name] && origByName[ns.name] !== l) diffs.push(ns.name);
});
fs.writeFileSync(path.join(__dirname, '_upf-diff-names.json'), JSON.stringify(diffs, null, 1));
console.log('Voci UPF diverse da HEAD:', diffs.length);
console.log(diffs);
