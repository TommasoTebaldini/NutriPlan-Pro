#!/usr/bin/env node
// Catches the class of bug that broke a full run of a SQL migration file in the
// Supabase SQL editor: a missing semicolon (or an orphaned fragment left over
// from a copy-paste) silently merges two statements into one. Postgres only
// reports this as a generic "syntax error near X" pointing at the wrong line,
// so this does a structural pass instead: split the file into statements
// (comment- and dollar-quote-aware) and flag any that don't start with a
// recognized SQL keyword.
//
// This is a heuristic, not a real SQL parser — it won't catch every mistake,
// but it reliably catches merged/orphaned statements, which is what has bitten
// this project before. Usage: node scripts/check-sql-syntax.js <file.sql> [file2.sql ...]

import fs from 'fs';

const STATEMENT_KEYWORDS = /^(create|alter|drop|insert|update|delete|select|do|grant|revoke|comment|begin|end)\b/i;

function stripDollarQuotedBodies(sql) {
  let out = [];
  let i = 0;
  while (i < sql.length) {
    if (sql[i] === '$' && sql[i + 1] === '$') {
      const close = sql.indexOf('$$', i + 2);
      if (close === -1) { out.push(sql.slice(i)); break; }
      const body = sql.slice(i, close + 2);
      const newlines = (body.match(/\n/g) || []).length;
      out.push('X' + '\n'.repeat(newlines));
      i = close + 2;
    } else {
      out.push(sql[i]);
      i++;
    }
  }
  return out.join('');
}

function stripLineComments(sql) {
  return sql
    .split('\n')
    .map(line => {
      const idx = line.indexOf('--');
      return idx === -1 ? line : line.slice(0, idx);
    })
    .join('\n');
}

function findSuspiciousStatements(sql) {
  const cleaned = stripLineComments(stripDollarQuotedBodies(sql));
  const statements = cleaned.split(';');
  let lineNo = 1;
  const suspicious = [];
  for (const raw of statements) {
    const linesIn = (raw.match(/\n/g) || []).length;
    const startLine = lineNo;
    lineNo += linesIn;
    const flat = raw.replace(/\s+/g, ' ').trim();
    if (!flat) continue;
    if (!STATEMENT_KEYWORDS.test(flat)) {
      suspicious.push({ line: startLine, preview: flat.slice(0, 100) });
    }
  }
  return suspicious;
}

const files = process.argv.slice(2);
if (files.length === 0) {
  console.error('Usage: node scripts/check-sql-syntax.js <file.sql> [file2.sql ...]');
  process.exit(2);
}

let hadIssues = false;
for (const file of files) {
  const sql = fs.readFileSync(file, 'utf8');
  const suspicious = findSuspiciousStatements(sql);
  if (suspicious.length === 0) {
    console.log(`✓ ${file}: no suspicious statement boundaries found`);
  } else {
    hadIssues = true;
    console.error(`✗ ${file}: ${suspicious.length} suspicious statement(s) — likely a missing semicolon or orphaned fragment:`);
    for (const s of suspicious) console.error(`  line ~${s.line}: ${s.preview}`);
  }
}

process.exit(hadIssues ? 1 : 0);
