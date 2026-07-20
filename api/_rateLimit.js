// api/_rateLimit.js — rate limiter condiviso dagli endpoint AI/serverless.
// Il prefisso `_` fa sì che Vercel NON tratti questo file come una serverless
// function a sé (non conta verso il limite di 12 del piano Hobby): è solo un
// modulo importato dagli handler.
//
// DUE MODALITÀ, selezionate automaticamente a runtime:
//
//   • DISTRIBUITO (corretto a qualunque scala) — se sono presenti le env
//     UPSTASH_REDIS_REST_URL e UPSTASH_REDIS_REST_TOKEN, il contatore vive su
//     Redis (Upstash), condiviso tra TUTTE le istanze serverless. È il fix del
//     problema noto: il limiter in memoria contava per-istanza, quindi con più
//     istanze calde il limite reale si moltiplicava ed era aggirabile.
//
//   • IN MEMORIA (fallback) — se Upstash non è configurato (o è irraggiungibile),
//     si ricade sul vecchio contatore per-istanza. Meglio di niente, e permette
//     di deployare questo codice PRIMA di aver provisionato Upstash: appena si
//     aggiungono le due env var, il rate limiting distribuito si attiva da solo.
//
// SETUP UPSTASH (una tantum, lato utente):
//   Vercel → progetto → Storage/Integrations → Upstash → crea un database Redis.
//   L'integrazione inietta automaticamente UPSTASH_REDIS_REST_URL e
//   UPSTASH_REDIS_REST_TOKEN come env var del progetto. Nessun codice da toccare.

const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL;
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const upstashEnabled = Boolean(UPSTASH_URL && UPSTASH_TOKEN);

// ── Fallback in memoria (per-istanza) ──────────────────────────────────────
const _mem = new Map(); // `${scope}:${id}` → { n, t }

function memAllow(key, max, windowMs) {
  const now = Date.now();
  const e = _mem.get(key);
  if (!e || now - e.t > windowMs) { _mem.set(key, { n: 1, t: now }); return true; }
  if (e.n >= max) return false;
  e.n++;
  return true;
}

function memPrune() {
  if (_mem.size < 5000) return;
  const now = Date.now();
  for (const [k, v] of _mem) if (now - v.t > 3_600_000) _mem.delete(k);
}

// ── Distribuito (Upstash Redis REST, fixed window) ─────────────────────────
async function upstashAllow(key, max, windowSec) {
  // Pipeline in una sola richiesta: INCR + (EXPIRE solo se non già impostato).
  // EXPIRE ... NX evita di prolungare la finestra a ogni richiesta.
  const res = await fetch(`${UPSTASH_URL}/pipeline`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${UPSTASH_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify([
      ['INCR', key],
      ['EXPIRE', key, String(windowSec), 'NX'],
    ]),
  });
  if (!res.ok) throw new Error(`Upstash ${res.status}`);
  const out = await res.json(); // [{result:n}, {result:0|1}]
  const count = Number(out?.[0]?.result);
  if (!Number.isFinite(count)) throw new Error('Upstash risposta inattesa');
  return count <= max;
}

/**
 * Ritorna true se la richiesta è consentita, false se ha superato il limite.
 * @param {string} id     identificatore (di solito user.id)
 * @param {object} [opts] { scope, max, windowSec }
 */
export async function checkRateLimit(id, opts = {}) {
  const scope = opts.scope || 'ai';
  const max = opts.max || 10;
  const windowSec = opts.windowSec || 60;
  const key = `rl:${scope}:${id}`;

  if (upstashEnabled) {
    try {
      return await upstashAllow(key, max, windowSec);
    } catch {
      // Upstash momentaneamente irraggiungibile: non bloccare l'utente, ricadi
      // sul limiter in memoria (fail-safe, mai fail-closed su un errore infra).
    }
  }
  memPrune();
  return memAllow(key, max, windowSec * 1000);
}
