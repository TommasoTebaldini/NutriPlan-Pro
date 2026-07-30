// api/ocr-referto-immagine.js — Vercel Serverless Function
// Estrae i valori di un referto di laboratorio da una FOTO (o PDF scansionato
// convertito in immagine lato client). Completa import-PDF-con-AI in
// pazienti.html, che legge solo PDF con testo estraibile: qui il testo non
// c'è (foto scattata col telefono, o PDF scansionato) e serve un modello
// vision. Groq (stessa GEMINI_API_KEY di api/claude.js e api/gemini.js) offre
// un solo modello multimodale attivo al momento della scrittura:
// meta-llama/llama-4-maverick-17b-128e-instruct (fino a 5 immagini per
// richiesta, qui ne usiamo una sola). Se Groq lo deprecasse, sostituire qui
// il MODEL — vedi https://console.groq.com/docs/deprecations.

import { checkRateLimit } from './_rateLimit.js';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://hvdwqowkhutfsdpiubxe.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

const MODEL = 'meta-llama/llama-4-maverick-17b-128e-instruct';
const MAX_TOKENS_LIMIT = 2048;
// Le foto sono compresse lato client prima dell'invio (vedi pazienti.html,
// _resizeImageForOcr) ma qui manteniamo comunque un tetto generoso lato
// server per non dipendere ciecamente dal client.
const MAX_CONTENT_BYTES = 3 * 1024 * 1024; // 3 MB (data URL base64 inclusa)

// Chiamate vision costano di più su Groq del testo puro: limite più stretto
// delle 10/min di claude.js/gemini.js.
const RL_MAX = 6;

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

function setCorsHeaders(req, res) {
  const origin = req.headers.origin || '';
  const configured = process.env.ALLOWED_ORIGIN || '';
  const allowed = configured.split(',').map(s => s.trim()).filter(Boolean);
  if (allowed.length > 0 && allowed.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

export default async function handler(req, res) {
  setCorsHeaders(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const contentLength = parseInt(req.headers['content-length'] || '0', 10);
  if (contentLength > MAX_CONTENT_BYTES) {
    return res.status(413).json({ error: 'Immagine troppo grande (max ~3MB dopo compressione).' });
  }

  const authHeader = req.headers.authorization || '';
  if (!authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Non autorizzato: token mancante.' });
  }
  const token = authHeader.slice(7);
  const user = await verifySupabaseToken(token);
  if (!user?.id) {
    return res.status(401).json({ error: 'Non autorizzato: sessione non valida.' });
  }

  if (!(await checkRateLimit(user.id, { scope: 'ocr-referto', max: RL_MAX }))) {
    return res.status(429).json({ error: 'Troppe richieste. Riprova tra un minuto.' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'API Key non configurata (GEMINI_API_KEY su Vercel).' });
  }

  try {
    const { system, image, max_tokens } = req.body;
    if (!image || typeof image !== 'string' || !image.startsWith('data:image/')) {
      return res.status(400).json({ error: 'Parametro image non valido (atteso data URL image/*).' });
    }
    const safeMaxTokens = Math.min(Math.max(parseInt(max_tokens, 10) || 1200, 1), MAX_TOKENS_LIMIT);

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: String(system || '').slice(0, 4096) },
            { type: 'image_url', image_url: { url: image } },
          ],
        }],
        max_tokens: safeMaxTokens,
        temperature: 0.2,
        response_format: { type: 'json_object' },
      }),
    });

    const data = await response.json();

    if (response.ok && data.choices?.[0]?.message?.content) {
      return res.status(200).json({
        content: [{ type: 'text', text: data.choices[0].message.content }],
        model: MODEL,
        usage: data.usage || {},
      });
    }

    if (response.status === 401) {
      return res.status(401).json({ error: 'Chiave API Groq non valida. Verifica GEMINI_API_KEY su Vercel.' });
    }
    return res.status(503).json({ error: data.error?.message || `Servizio AI non disponibile (HTTP ${response.status}).` });

  } catch (err) {
    console.error('ocr-referto-immagine error:', err);
    return res.status(500).json({ error: 'Errore server: ' + err.message });
  }
}
