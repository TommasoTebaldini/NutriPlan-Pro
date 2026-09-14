#!/usr/bin/env node
// Codifica in controlli automatici i pattern di rischio scoperti "a mano"
// più volte durante la sessione di bug-hunting del 2026-09-14 su
// supabase_setup.sql (9500+ righe, 125+ SEZIONI in un unico file — il
// rischio di sezioni duplicate/contraddittorie cresce con la dimensione).
// Diverso da check-sql-syntax.js (quello trova statement malformati/uniti
// per errore di copia-incolla): questo cerca pattern SEMANTICAMENTE
// rischiosi che restano sintatticamente validi.
//
// Uso: node scripts/check-sql-risks.js supabase_setup.sql
//
// Controlli:
// 1. ADD CONSTRAINT non idempotente — Postgres non supporta
//    "ADD CONSTRAINT IF NOT EXISTS": un ALTER TABLE ... ADD CONSTRAINT nudo
//    fallisce con "already exists" se rieseguito, e in una transazione
//    multi-statement (es. incollando più SEZIONI insieme nello SQL Editor)
//    questo fa ROLLBACK anche del lavoro adiacente non correlato — successo
//    esattamente il 2026-09-14 (SEZIONE 118 annullata insieme al fallimento
//    della 119 già eseguita in precedenza).
// 2. FK/trigger su un nome che è diventato una VISTA per la cifratura
//    applicativa (cartelle, esami_biochimici, schede_valutazione,
//    note_specialistiche, ncpt, chat_messages — usare sempre *_raw). Una FK
//    non può puntare a una vista, un trigger AFTER non può essere creato su
//    una vista — trovato e corretto 2 volte nella stessa sessione
//    (SEZIONE 51, SEZIONE 50/tail).
// 3. Numeri di SEZIONE duplicati.
// 4. Policy RLS che usano get_studio_owner() per lo scoping di studio ma
//    non richiamano is_dietitian_level_collaborator() — pattern "policy
//    dimentica il filtro sul livello di collaboratore" ripetuto 4 volte
//    (SEZIONE 60/61/63, poi ancora su coach_ai_messages). Solo un avviso:
//    non ogni policy scoped a studio deve per forza escludere i
//    collaboratori "segretario", va valutato caso per caso.

import fs from 'fs';

const VIEW_NAMES = ['cartelle', 'esami_biochimici', 'schede_valutazione', 'note_specialistiche', 'ncpt', 'chat_messages'];

function findSezioneHeaders(sql) {
  const re = /^-- SEZIONE (\d+)\s*[—-]/gm;
  const headers = [];
  let m;
  while ((m = re.exec(sql))) {
    const lineNo = sql.slice(0, m.index).split('\n').length;
    headers.push({ num: m[1], line: lineNo });
  }
  return headers;
}

function findDuplicateSezioni(headers) {
  const seen = new Map();
  const dups = [];
  for (const h of headers) {
    if (seen.has(h.num)) dups.push({ num: h.num, lines: [seen.get(h.num), h.line] });
    else seen.set(h.num, h.line);
  }
  return dups;
}

function findNonIdempotentAddConstraint(sql) {
  const lines = sql.split('\n');
  const issues = [];
  for (let i = 0; i < lines.length; i++) {
    if (/^\s*(ALTER TABLE\s+\S+\s+)?ADD CONSTRAINT\b/i.test(lines[i]) && !/IF NOT EXISTS/i.test(lines[i])) {
      // Idempotente se le ~6 righe precedenti contengono un guard esplicito
      // (DO $$ ... IF NOT EXISTS (SELECT ... pg_constraint ...) — il pattern
      // ormai standard in questo file dopo l'incidente SEZIONE 119).
      const context = lines.slice(Math.max(0, i - 6), i).join('\n');
      if (!/pg_constraint/i.test(context)) {
        issues.push({ line: i + 1, text: lines[i].trim() });
      }
    }
  }
  return issues;
}

function findViewAsForeignKeyOrTrigger(sql) {
  const issues = [];
  const lines = sql.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const view of VIEW_NAMES) {
      // REFERENCES <view>( — non REFERENCES <view>_raw(
      const fkRe = new RegExp(`REFERENCES\\s+${view}\\s*\\(`, 'i');
      if (fkRe.test(line)) issues.push({ line: i + 1, kind: 'REFERENCES', view, text: line.trim() });
      // CREATE TRIGGER ... ON <view> (non ON <view>_raw)
      const trigRe = new RegExp(`\\bON\\s+${view}\\b(?!_raw)`, 'i');
      if (/CREATE TRIGGER|BEFORE (INSERT|UPDATE|DELETE)|AFTER (INSERT|UPDATE|DELETE)/i.test(line) && trigRe.test(line)) {
        issues.push({ line: i + 1, kind: 'TRIGGER', view, text: line.trim() });
      }
    }
  }
  return issues;
}

function findPolicyMissingCollaboratorCheck(sql) {
  // Isola ogni blocco CREATE POLICY (fino al ; di chiusura) e verifica se usa
  // get_studio_owner senza is_dietitian_level_collaborator nello stesso blocco.
  const issues = [];
  const policyRe = /CREATE POLICY[\s\S]*?;/gi;
  let m;
  while ((m = policyRe.exec(sql))) {
    const block = m[0];
    if (/get_studio_owner/i.test(block) && !/is_dietitian_level_collaborator/i.test(block)) {
      const lineNo = sql.slice(0, m.index).split('\n').length;
      const nameMatch = block.match(/CREATE POLICY\s+"?([^"(\s]+)"?/i);
      issues.push({ line: lineNo, name: nameMatch ? nameMatch[1] : '?' });
    }
  }
  return issues;
}

const file = process.argv[2];
if (!file) {
  console.error('Uso: node scripts/check-sql-risks.js supabase_setup.sql');
  process.exit(2);
}

const sql = fs.readFileSync(file, 'utf8');
let hadIssues = false;

const headers = findSezioneHeaders(sql);
console.log(`${file}: ${headers.length} intestazioni SEZIONE trovate.`);

const dups = findDuplicateSezioni(headers);
if (dups.length) {
  hadIssues = true;
  console.error(`\n✗ SEZIONE duplicate (${dups.length}):`);
  for (const d of dups) console.error(`  SEZIONE ${d.num} appare alle righe ${d.lines.join(' e ')}`);
} else {
  console.log('✓ nessuna SEZIONE duplicata');
}

const constraintIssues = findNonIdempotentAddConstraint(sql);
if (constraintIssues.length) {
  hadIssues = true;
  console.error(`\n✗ ADD CONSTRAINT non idempotente (${constraintIssues.length}) — rieseguire fa fallire con "already exists" e può far ROLLBACK di sezioni adiacenti in un'esecuzione multi-statement:`);
  for (const c of constraintIssues) console.error(`  riga ${c.line}: ${c.text}`);
} else {
  console.log('✓ nessun ADD CONSTRAINT non idempotente');
}

const viewIssues = findViewAsForeignKeyOrTrigger(sql);
if (viewIssues.length) {
  hadIssues = true;
  console.error(`\n✗ Riferimenti a viste cifrate come tabella base (${viewIssues.length}) — usare sempre ${VIEW_NAMES.map(v => v + '_raw').join('/')}:`);
  for (const v of viewIssues) console.error(`  riga ${v.line} [${v.kind} su ${v.view}]: ${v.text}`);
} else {
  console.log('✓ nessun riferimento a vista cifrata come tabella base');
}

const collabIssues = findPolicyMissingCollaboratorCheck(sql);
if (collabIssues.length) {
  console.warn(`\n⚠ Policy con scoping di studio ma senza is_dietitian_level_collaborator() (${collabIssues.length}) — da verificare caso per caso, non necessariamente un errore:`);
  for (const c of collabIssues) console.warn(`  riga ${c.line}: policy "${c.name}"`);
}

process.exit(hadIssues ? 1 : 0);
