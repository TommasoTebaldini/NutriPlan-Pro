#!/usr/bin/env node
// scripts/resign-storage-urls.js — MIGRAZIONE ONE-TIME (da eseguire a mano una
// volta, dopo aver applicato la SEZIONE 33 che rende privati i bucket).
//
// I bucket `document-prints` e `voice-messages` erano pubblici: gli URL già
// salvati nel DB sono URL pubblici permanenti che, ora che i bucket sono
// privati, restituiscono 403. Questo script li ri-firma (createSignedUrl ~10
// anni) in modo che i vecchi piani/documenti e i vecchi vocali tornino
// visibili senza dover ri-salvare tutto a mano.
//
// USO:
//   1. Applica prima la SEZIONE 33 su Supabase (bucket → privati).
//   2. Esporta le credenziali (NON committarle):
//        export SUPABASE_URL="https://hvdwqowkhutfsdpiubxe.supabase.co"
//        export SUPABASE_SERVICE_ROLE_KEY="<service role key dal dashboard>"
//   3. Anteprima (non scrive nulla):   node scripts/resign-storage-urls.js
//      Applica per davvero:            node scripts/resign-storage-urls.js --apply
//
// Sicuro da rieseguire: salta gli URL già firmati (contengono /object/sign/).
// Nessuna dipendenza npm: usa solo fetch (Node 18+).

const SUPABASE_URL = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const APPLY = process.argv.includes('--apply');
const SIGN_EXPIRES = 315360000; // ~10 anni, come createSignedUrl nel codice

// Colonne che contengono URL del bucket document-prints (stringa singola o
// array JSON di stringhe). Chiave = tabella, valore = colonna.
const PRINT_TABLES = {
  piani: 'print_image_url',
  bia_records: 'print_image_url',
  note_specialistiche: 'print_image_url',
  schede_valutazione: 'print_image_url',
};

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('❌ Imposta SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY nell\'ambiente.');
  process.exit(1);
}

const H = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` };

async function rest(path, init = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: { ...H, 'Content-Type': 'application/json', ...(init.headers || {}) },
  });
  if (!res.ok) throw new Error(`REST ${path} → ${res.status}: ${await res.text().catch(() => '')}`);
  return res.status === 204 ? null : res.json();
}

// Estrae il path interno al bucket da un URL pubblico Supabase, oppure null se
// l'URL non è un URL pubblico di quel bucket (già firmato, esterno, vuoto).
function publicPath(url, bucket) {
  if (typeof url !== 'string' || !url) return null;
  const marker = `/storage/v1/object/public/${bucket}/`;
  const i = url.indexOf(marker);
  if (i === -1) return null;
  let p = url.slice(i + marker.length);
  const q = p.indexOf('?');
  if (q !== -1) p = p.slice(0, q);
  try { p = decodeURIComponent(p); } catch { /* lascia grezzo */ }
  return p || null;
}

async function signPath(bucket, path) {
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/sign/${bucket}/${encodeURI(path)}`, {
    method: 'POST',
    headers: { ...H, 'Content-Type': 'application/json' },
    body: JSON.stringify({ expiresIn: SIGN_EXPIRES }),
  });
  if (!res.ok) {
    // 404 = file non esiste più nello storage: lo segnaliamo ma non blocchiamo
    if (res.status === 404) return { missing: true };
    throw new Error(`sign ${bucket}/${path} → ${res.status}: ${await res.text().catch(() => '')}`);
  }
  const data = await res.json();
  const rel = data.signedURL || data.signedUrl;
  if (!rel) throw new Error(`sign ${bucket}/${path}: risposta senza signedURL`);
  return { url: `${SUPABASE_URL}/storage/v1${rel.startsWith('/') ? '' : '/'}${rel}` };
}

// Ri-firma un valore che può essere: URL singolo, array JSON di URL, o altro.
// Ritorna { changed, value, stats } — value è il nuovo valore serializzato
// nello STESSO formato (stringa o array JSON) di quello originale.
async function resignValue(raw, bucket, stats) {
  const isArray = typeof raw === 'string' && raw.trim().startsWith('[');
  let items;
  if (isArray) {
    try { items = JSON.parse(raw); } catch { return { changed: false }; }
    if (!Array.isArray(items)) return { changed: false };
  } else {
    items = [raw];
  }

  let changed = false;
  const out = [];
  for (const item of items) {
    const path = publicPath(item, bucket);
    if (!path) { out.push(item); continue; } // già firmato o non pertinente
    stats.found++;
    const signed = await signPath(bucket, path);
    if (signed.missing) { stats.missing++; out.push(item); continue; }
    out.push(signed.url);
    changed = true;
    stats.signed++;
  }
  if (!changed) return { changed: false };
  return { changed: true, value: isArray ? JSON.stringify(out) : out[0] };
}

async function processPrintTables(stats) {
  for (const [table, col] of Object.entries(PRINT_TABLES)) {
    let rows;
    try {
      rows = await rest(`${table}?select=id,${col}&${col}=not.is.null&limit=100000`);
    } catch (e) {
      console.warn(`  ⚠️  ${table}: ${e.message.split('\n')[0]} (salto)`);
      continue;
    }
    let touched = 0;
    for (const row of rows) {
      const r = await resignValue(row[col], 'document-prints', stats);
      if (!r.changed) continue;
      touched++;
      if (APPLY) {
        await rest(`${table}?id=eq.${row.id}`, {
          method: 'PATCH',
          headers: { Prefer: 'return=minimal' },
          body: JSON.stringify({ [col]: r.value }),
        });
      }
    }
    console.log(`  ${table}: ${touched} righe ${APPLY ? 'aggiornate' : 'da aggiornare'}`);
  }
}

async function processVoiceMessages(stats) {
  // content e file_url possono entrambi contenere l'URL pubblico del vocale.
  let rows;
  try {
    rows = await rest('chat_messages?select=id,content,file_url&or=(message_type.eq.audio,type.eq.voice)&limit=100000');
  } catch {
    // schema senza type/message_type ancora migrato: fallback su tutte le righe
    rows = await rest('chat_messages?select=id,content,file_url&limit=100000');
  }
  let touched = 0;
  for (const row of rows) {
    const patch = {};
    for (const col of ['content', 'file_url']) {
      const r = await resignValue(row[col], 'voice-messages', stats);
      if (r.changed) patch[col] = r.value;
    }
    if (!Object.keys(patch).length) continue;
    touched++;
    if (APPLY) {
      await rest(`chat_messages?id=eq.${row.id}`, {
        method: 'PATCH',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify(patch),
      });
    }
  }
  console.log(`  chat_messages (voice): ${touched} righe ${APPLY ? 'aggiornate' : 'da aggiornare'}`);
}

(async () => {
  console.log(APPLY ? '🚀 MODALITÀ APPLY — scrivo le modifiche.\n' : '🔍 ANTEPRIMA (nessuna scrittura). Aggiungi --apply per applicare.\n');
  const stats = { found: 0, signed: 0, missing: 0 };

  console.log('document-prints (immagini piani/documenti clinici):');
  await processPrintTables(stats);
  console.log('\nvoice-messages (messaggi vocali chat):');
  await processVoiceMessages(stats);

  console.log(`\n✅ Fatto. URL pubblici trovati: ${stats.found} · ri-firmati: ${stats.signed} · file mancanti nello storage: ${stats.missing}`);
  if (!APPLY && stats.found) console.log('   Riesegui con --apply per scrivere le modifiche.');
})().catch(e => { console.error('❌', e.message); process.exit(1); });
