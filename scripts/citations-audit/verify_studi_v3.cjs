// Ri-verifica DOI/PMID di tutti gli studi in js/studies-data.js contro Crossref/PubMed.
// Ripropone la metodologia v2 documentata in PROGRESS.md (confronto titolo + autori,
// non solo titolo) per rigenerare l'elenco corrente degli studi ancora fabbricati.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const repoRoot = path.resolve(__dirname, '..', '..');
let code = fs.readFileSync(path.join(repoRoot, 'js', 'studies-data.js'), 'utf8');
code = code.replace(/^﻿/, '');
const sandbox = {};
vm.createContext(sandbox);
vm.runInContext(code + '\nthis.__STUDI = STUDI;', sandbox);
const studi = sandbox.__STUDI;

function normalize(s) {
  return (s || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function titleSimilarity(a, b) {
  const wa = new Set(normalize(a).split(' ').filter(w => w.length > 3));
  const wb = new Set(normalize(b).split(' ').filter(w => w.length > 3));
  if (wa.size === 0 || wb.size === 0) return 0;
  let common = 0;
  for (const w of wa) if (wb.has(w)) common++;
  return common / Math.min(wa.size, wb.size);
}

function extractSurnames(authorStr) {
  return (authorStr || '')
    .split(',')
    .map(s => normalize(s.trim().split(' ')[0]))
    .filter(Boolean);
}

async function fetchJson(url, headers) {
  try {
    const res = await fetch(url, { headers: headers || {} });
    if (!res.ok) return null;
    return await res.json();
  } catch (e) {
    return null;
  }
}

async function checkDoi(doi, titolo, autori) {
  if (!doi) return { checked: false };
  const data = await fetchJson(`https://api.crossref.org/works/${encodeURIComponent(doi)}`, {
    'User-Agent': 'nutriplan-citations-audit/1.0 (mailto:audit@example.com)'
  });
  if (!data || !data.message) return { checked: true, resolves: false };
  const msg = data.message;
  const crTitle = Array.isArray(msg.title) ? msg.title[0] : '';
  const crAuthors = Array.isArray(msg.author) ? msg.author.map(a => normalize(a.family || '')) : [];
  const sim = titleSimilarity(titolo, crTitle);
  const ourSurnames = extractSurnames(autori);
  const authorOverlap = ourSurnames.some(s => crAuthors.includes(s));
  return { checked: true, resolves: true, title: crTitle, sim, authorOverlap, authors: crAuthors };
}

async function checkPmid(pmid, titolo, autori) {
  if (!pmid) return { checked: false };
  const data = await fetchJson(
    `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=pubmed&id=${encodeURIComponent(pmid)}&retmode=json`
  );
  const result = data && data.result && data.result[pmid];
  if (!result) return { checked: true, resolves: false };
  const pmTitle = result.title || '';
  const pmAuthors = Array.isArray(result.authors) ? result.authors.map(a => normalize((a.name || '').split(' ')[0])) : [];
  const sim = titleSimilarity(titolo, pmTitle);
  const ourSurnames = extractSurnames(autori);
  const authorOverlap = ourSurnames.some(s => pmAuthors.includes(s));
  return { checked: true, resolves: true, title: pmTitle, sim, authorOverlap, authors: pmAuthors };
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  const results = [];
  for (const s of studi) {
    const doiRes = await checkDoi(s.doi, s.titolo, s.autori);
    await sleep(150);
    const pmidRes = await checkPmid(s.pubmed, s.titolo, s.autori);
    await sleep(150);

    const doiOk = doiRes.checked && doiRes.resolves && (doiRes.sim > 0.5 || doiRes.authorOverlap);
    const pmidOk = pmidRes.checked && pmidRes.resolves && (pmidRes.sim > 0.5 || pmidRes.authorOverlap);
    const hasIdentifier = !!(s.doi || s.pubmed);

    let verdict;
    if (!hasIdentifier) verdict = 'no-id';
    else if (doiOk || pmidOk) verdict = 'real';
    else verdict = 'fabricated';

    results.push({
      id: s.id,
      titolo: s.titolo,
      autori: s.autori,
      doi: s.doi,
      pubmed: s.pubmed,
      verdict,
      doi_check: doiRes,
      pmid_check: pmidRes,
    });
    console.error(`#${s.id} -> ${verdict}`);
  }

  const outPath = path.join(__dirname, 'studi_bad_v3.json');
  fs.writeFileSync(outPath, JSON.stringify(results, null, 2));
  const fabricated = results.filter(r => r.verdict === 'fabricated');
  const real = results.filter(r => r.verdict === 'real');
  const noId = results.filter(r => r.verdict === 'no-id');
  console.log(`\nTotale: ${results.length}`);
  console.log(`Reali: ${real.length}`);
  console.log(`Fabbricati: ${fabricated.length}`);
  console.log(`Senza DOI/PMID: ${noId.length}`);
  console.log(`\nID fabbricati: ${fabricated.map(r => r.id).join(', ')}`);
  console.log(`\nOutput completo: ${outPath}`);
}

main();
