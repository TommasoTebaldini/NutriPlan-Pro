// Estrae tutti gli array DB_* da js/db.js (senza eseguire codice browser-only)
// e produce un JSON piatto con un id stabile per ogni alimento, usato dallo
// script di audit valori nutrizionali (confronto CREA/BDA/fonte originale).
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const dbPath = path.join(__dirname, '..', '..', 'js', 'db.js');
const src = fs.readFileSync(dbPath, 'utf8');

const groups = ['DB_CREA', 'DB_BDA', 'DB_ONS', 'DB_APROTEICI', 'DB_FLAVIS', 'DB_UPF', 'DB_EXTRA'];

const sandbox = { console, currentUser: null, sb: null, window: {}, document: undefined, __EXPORT__: null };
vm.createContext(sandbox);
vm.runInContext(src, sandbox, { filename: 'db.js' });
// Top-level const/let in db.js aren't reflected as own properties of the
// context object — grab them explicitly in a follow-up script that shares
// the same lexical top-level scope.
vm.runInContext(`__EXPORT__ = { ${groups.join(', ')} };`, sandbox, { filename: 'export.js' });

const out = [];
for (const g of groups) {
  const arr = sandbox.__EXPORT__[g];
  if (!Array.isArray(arr)) { console.error('MISSING ARRAY:', g); continue; }
  arr.forEach((f, i) => {
    out.push({ id: `${g}_${i}`, group: g, ...f });
  });
}

fs.writeFileSync(path.join(__dirname, 'all-foods.json'), JSON.stringify(out, null, 1));

const bySrc = {};
out.forEach(f => { bySrc[f.src] = (bySrc[f.src] || 0) + 1; });
console.log('Totale alimenti estratti:', out.length);
console.log('Per src:', bySrc);
console.log('Per group:', groups.map(g => `${g}=${out.filter(f=>f.group===g).length}`).join(' '));
