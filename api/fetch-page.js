// api/fetch-page.js — Vercel Serverless Function
// Proxy per fetch di pagine web (risolve CORS per importazione ricette da URL)

import dns from 'node:dns';
import http from 'node:http';
import https from 'node:https';
import { checkRateLimit } from './_rateLimit.js';
import { withErrorLogging, logServerError } from './_errorLog.js';
const dnsLookup = dns.promises.lookup;

// Rate limiter distribuito/in-memoria — vedi api/_rateLimit.js. 30 req/min.
const RL_MAX = 30;

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://hvdwqowkhutfsdpiubxe.supabase.co';
// No hardcoded fallback for the anon key: verifySupabaseToken() below already
// returns null (→ 401) if this is unset, instead of silently using a fixed key.
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

// Blocklist of private/internal IP ranges to prevent SSRF
const PRIVATE_IP_PATTERNS = [
  /^0\./,                             // "this" network
  /^127\./,                          // loopback
  /^10\./,                           // RFC1918
  /^172\.(1[6-9]|2\d|3[01])\./,     // RFC1918
  /^192\.168\./,                     // RFC1918
  /^169\.254\./,                     // link-local / cloud metadata (AWS/GCP/Azure)
  /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./,  // CGNAT RFC6598
  /^::1$/,                           // IPv6 loopback
  // IPv6 ULA is the whole fc00::/7 block (first byte 0xFC or 0xFD), not just
  // the literal "fc00:" prefix — fd00::/8 is what's actually assigned in
  // practice (Docker, Tailscale, home/corporate LANs), and was previously
  // let straight through this filter.
  /^f[cd][0-9a-f]{0,2}:/i,           // IPv6 ULA (fc00::/7)
  /^fe80:/i,                         // IPv6 link-local
];

// Normalizza IPv4-mapped IPv6 (::ffff:127.0.0.1 → 127.0.0.1) prima del match.
// Node può normalizzare lo stesso indirizzo sia in forma "dotted"
// (::ffff:127.0.0.1) sia in forma esadecimale pura (::ffff:7f00:1, stessa
// entità di 127.0.0.1) a seconda di come arriva l'input — solo la prima
// veniva gestita, lasciando passare un bypass del filtro via
// http://[::ffff:7f00:1]/.
function isPrivateIp(ip) {
  let normalized = ip.replace(/^::ffff:/i, '');
  const hexMatch = normalized.match(/^([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i);
  if (hexMatch) {
    const hi = parseInt(hexMatch[1], 16);
    const lo = parseInt(hexMatch[2], 16);
    normalized = [hi >> 8, hi & 0xff, lo >> 8, lo & 0xff].join('.');
  }
  return PRIVATE_IP_PATTERNS.some(re => re.test(normalized));
}

function isPrivateHost(hostname) {
  return isPrivateIp(hostname) || hostname === 'localhost';
}

// Protezione SSRF contro DNS rebinding.
//
// Prima di questa funzione, il controllo faceva un lookup DNS separato per
// validare l'hostname, poi chiamava fetch(url) — che internamente fa un
// SECONDO lookup DNS proprio. Con un dominio attaccante (TTL bassissimo o
// DNS server malevolo), i due lookup possono restituire risposte diverse:
// il primo un IP pubblico (passa la validazione), il secondo — pochi
// millisecondi dopo, durante il vero fetch — un IP privato/interno
// (169.254.169.254, 127.0.0.1, ...), bypassando completamente il filtro.
// Qui risolviamo UNA VOLTA, validiamo TUTTI gli indirizzi restituiti, e la
// richiesta reale si connette esplicitamente al primo IP validato invece di
// ri-risolvere l'hostname (vedi pinnedRequest sotto) — l'hostname originale
// resta comunque usato per l'header Host e per l'SNI/verifica del
// certificato TLS, così la richiesta rimane corretta per l'hosting
// virtuale e la validazione del certificato.
async function resolveValidatedIp(hostname) {
  if (isPrivateHost(hostname)) return null;
  let records;
  try {
    records = await dnsLookup(hostname, { all: true, verbatim: true });
  } catch {
    return null; // dominio non risolvibile → non consentito
  }
  if (!records.length || records.some(r => isPrivateIp(r.address))) return null;
  return records[0].address;
}

// Richiesta HTTP(S) "pinnata" al preciso IP già validato da
// resolveValidatedIp, evitando che Node risolva di nuovo l'hostname in fase
// di connessione. Per HTTPS, servername forza comunque l'SNI e la verifica
// del certificato sull'hostname reale (non sull'IP) — la connessione è
// pinnata, la sicurezza TLS resta quella corretta.
function pinnedRequest(urlObj, ip, signal) {
  return new Promise((resolve, reject) => {
    const isHttps = urlObj.protocol === 'https:';
    const mod = isHttps ? https : http;
    const req = mod.request({
      hostname: ip,
      port: urlObj.port || (isHttps ? 443 : 80),
      path: urlObj.pathname + urlObj.search,
      method: 'GET',
      headers: {
        'Host': urlObj.hostname,
        'User-Agent': 'Mozilla/5.0 (compatible; DietPlanPro/1.0)',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'it-IT,it;q=0.9'
      },
      servername: isHttps ? urlObj.hostname : undefined,
      signal,
    }, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve({
        status: res.statusCode,
        headers: res.headers,
        text: () => Buffer.concat(chunks).toString('utf-8'),
      }));
      res.on('error', reject);
    });
    req.on('error', reject);
    req.end();
  });
}

function setCorsHeaders(req, res) {
  const origin = req.headers.origin || '';
  const configured = process.env.ALLOWED_ORIGIN || '';
  const allowed = configured.split(',').map(s => s.trim()).filter(Boolean);
  if (allowed.length > 0 && allowed.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

// Token verification cache: evita una chiamata HTTP a Supabase per ogni richiesta
const _tkCache = new Map(); // token → { user, exp }

async function verifySupabaseToken(token) {
  const now = Date.now();
  const cached = _tkCache.get(token);
  if (cached && now < cached.exp) return cached.user;

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return null;
  const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { Authorization: `Bearer ${token}`, apikey: SUPABASE_ANON_KEY },
  });
  if (!res.ok) { _tkCache.delete(token); return null; }
  const user = await res.json();
  if (user?.id) {
    if (_tkCache.size > 200) {
      for (const [k, v] of _tkCache) if (v.exp < now) _tkCache.delete(k);
    }
    _tkCache.set(token, { user, exp: now + 60_000 });
  }
  return user;
}

async function handler(req, res) {
  setCorsHeaders(req, res);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Require authentication
  const authHeader = req.headers.authorization || '';
  if (!authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Non autorizzato: token mancante.' });
  }
  const token = authHeader.slice(7);
  const user = await verifySupabaseToken(token);
  if (!user?.id) {
    return res.status(401).json({ error: 'Non autorizzato: sessione non valida.' });
  }

  if (!(await checkRateLimit(user.id, { scope: 'fetch-page', max: RL_MAX }))) {
    return res.status(429).json({ error: 'Troppe richieste. Riprova tra un minuto.' });
  }

  const { url } = req.query;

  if (!url) {
    return res.status(400).json({ error: 'Parametro url mancante' });
  }

  // Validazione base URL
  let parsedUrl;
  try {
    parsedUrl = new URL(url);
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      return res.status(400).json({ error: 'Protocollo non supportato' });
    }
  } catch {
    return res.status(400).json({ error: 'URL non valido' });
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    let response;
    try {
      // redirect: 'manual' + rivalidazione ad ogni hop — con 'follow' (il
      // default) il controllo SSRF sopra riguarderebbe solo l'URL iniziale:
      // un sito esterno consentito potrebbe rispondere con un 3xx verso
      // http://169.254.169.254/ (metadata cloud) o http://localhost/... e
      // fetch lo seguirebbe automaticamente, bypassando la protezione.
      let currentUrl = parsedUrl;
      let hops = 0;
      const MAX_REDIRECTS = 5;
      for (;;) {
        if (!['http:', 'https:'].includes(currentUrl.protocol)) {
          return res.status(400).json({ error: 'Protocollo non supportato' });
        }
        const validatedIp = await resolveValidatedIp(currentUrl.hostname);
        if (!validatedIp) {
          return res.status(400).json({ error: 'URL non consentito' });
        }

        response = await pinnedRequest(currentUrl, validatedIp, controller.signal);

        if ([301, 302, 303, 307, 308].includes(response.status)) {
          const location = response.headers.location;
          if (!location || ++hops > MAX_REDIRECTS) {
            return res.status(400).json({ error: 'Troppi redirect o redirect senza destinazione' });
          }
          try {
            currentUrl = new URL(location, currentUrl);
          } catch {
            return res.status(400).json({ error: 'Redirect verso un URL non valido' });
          }
          continue;
        }
        break;
      }
    } finally {
      clearTimeout(timeout);
    }

    if (response.status < 200 || response.status >= 300) {
      return res.status(response.status).json({ error: `HTTP ${response.status}` });
    }

    const contentType = response.headers['content-type'] || '';
    if (!contentType.includes('text/html')) {
      return res.status(400).json({ error: 'La pagina non è HTML' });
    }

    const html = await response.text();
    return res.status(200).json({ contents: html, url });

  } catch (err) {
    if (err.name === 'AbortError') {
      return res.status(408).json({ error: 'Timeout: la pagina ha impiegato troppo a rispondere' });
    }
    console.error('Fetch page error:', err);
    await logServerError('fetch-page', err, req).catch(() => {});
    return res.status(500).json({ error: 'Errore fetch: ' + err.message });
  }
}

export default withErrorLogging('fetch-page', handler);
