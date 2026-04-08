// api/fetch-page.js — Vercel Serverless Function
// Proxy per fetch di pagine web (risolve CORS per importazione ricette da URL)

// Blocklist of private/internal IP ranges to prevent SSRF
const PRIVATE_IP_PATTERNS = [
  /^127\./,                          // loopback
  /^10\./,                           // RFC1918
  /^172\.(1[6-9]|2\d|3[01])\./,     // RFC1918
  /^192\.168\./,                     // RFC1918
  /^169\.254\./,                     // link-local / AWS metadata
  /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./,  // CGNAT RFC6598
  /^::1$/,                           // IPv6 loopback
  /^fc00:/i,                         // IPv6 ULA
  /^fe80:/i,                         // IPv6 link-local
];

function isPrivateHost(hostname) {
  return PRIVATE_IP_PATTERNS.some(re => re.test(hostname)) || hostname === 'localhost';
}

export default async function handler(req, res) {
  const origin = req.headers.origin || '';
  const allowedOrigin = process.env.ALLOWED_ORIGIN || origin;
  res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Vary', 'Origin');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
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

  // SSRF protection: block requests to private/internal network addresses
  if (isPrivateHost(parsedUrl.hostname)) {
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
