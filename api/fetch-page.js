// api/fetch-page.js — Vercel Serverless Function
// Proxy per fetch di pagine web (risolve CORS per importazione ricette da URL)

import dns from 'node:dns';
import { checkRateLimit } from './_rateLimit.js';
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
  /^fc00:/i,                         // IPv6 ULA
  /^fe80:/i,                         // IPv6 link-local
];

// Normalizza IPv4-mapped IPv6 (::ffff:127.0.0.1 → 127.0.0.1) prima del match.
function isPrivateIp(ip) {
  const normalized = ip.replace(/^::ffff:/i, '');
  return PRIVATE_IP_PATTERNS.some(re => re.test(normalized));
}

function isPrivateHost(hostname) {
  return isPrivateIp(hostname) || hostname === 'localhost';
}

// Protezione SSRF contro DNS rebinding: un hostname pubblico può comunque
// risolvere (in fase di fetch) a un IP privato. Risolviamo qui e validiamo
// TUTTI gli indirizzi restituiti, invece di fidarci solo della stringa hostname.
async function resolvesToPrivateIp(hostname) {
  if (isPrivateHost(hostname)) return true;
  try {
    const records = await dnsLookup(hostname, { all: true, verbatim: true });
    return records.some(r => isPrivateIp(r.address));
  } catch {
    return true; // dominio non risolvibile → non consentito
  }
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

export default async function handler(req, res) {
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

  // SSRF protection: block requests to private/internal network addresses,
  // including hostnames that only resolve to a private IP at fetch time.
  if (await resolvesToPrivateIp(parsedUrl.hostname)) {
    return res.status(400).json({ error: 'URL non consentito' });
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; DietPlanPro/1.0)',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'it-IT,it;q=0.9'
      }
    });

    clearTimeout(timeout);

    if (!response.ok) {
      return res.status(response.status).json({ error: `HTTP ${response.status}` });
    }

    const contentType = response.headers.get('content-type') || '';
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
    return res.status(500).json({ error: 'Errore fetch: ' + err.message });
  }
}
