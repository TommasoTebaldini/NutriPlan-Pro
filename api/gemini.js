// api/ai.js — Vercel Serverless Function
// Usa Groq API: GRATIS, velocissima, nessun limite pratico
// Chiave gratuita su: https://console.groq.com/keys (registrazione con Google/GitHub)
// Vercel: Settings → Environment Variables → GEMINI_API_KEY (stessa variabile, non cambiare nome)

import { checkRateLimit } from './_rateLimit.js';
import { checkMonthlyQuota } from './_monthlyQuota.js';
import { ragSearch } from './_ragSearch.js';
import { withErrorLogging, logServerError } from './_errorLog.js';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://hvdwqowkhutfsdpiubxe.supabase.co';
// No hardcoded fallback for the anon key: verifySupabaseToken() below already
// returns null (→ 401) if this is unset, instead of silently using a fixed key.
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

const MAX_TOKENS_LIMIT = 4096;
const MAX_CONTENT_BYTES = 32768; // 32 KB per request body

// Rate limiter distribuito/in-memoria — vedi api/_rateLimit.js. 10 req/min.
const RL_MAX = 10;
// mode:'rag-search' è una ricerca dati (nessuna chiamata LLM, nessun costo
// Groq) — limite più permissivo e scope separato dalla chat vera e propria.
const RAG_RL_MAX = 30;
// Tetto mensile duraturo condiviso con api/claude.js (stesso scope 'ai_calls'
// in usage_counters — stessa API Groq/costo sottostante, vedi api/_monthlyQuota.js).
const MONTHLY_MAX = 500;

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

async function handler(req, res) {
  setCorsHeaders(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Enforce request body size limit
  const contentLength = parseInt(req.headers['content-length'] || '0', 10);
  if (contentLength > MAX_CONTENT_BYTES) {
    return res.status(413).json({ error: 'Richiesta troppo grande.' });
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

  // mode:'rag-search' — ricerca nel contesto clinico auditato (linee guida,
  // consigli, ricette), nessuna chiamata LLM: bypassa quota mensile e modelli
  // Groq, usa solo il proprio rate limit. Riusa lo stesso endpoint/auth di
  // /api/gemini invece di aggiungere una nuova function Vercel (piano Hobby:
  // limite di 12 function, vedi vercel.json).
  if (req.body?.mode === 'rag-search') {
    if (!(await checkRateLimit(user.id, { scope: 'rag-search', max: RAG_RL_MAX }))) {
      return res.status(429).json({ error: 'Troppe richieste. Riprova tra un minuto.' });
    }
    const tags = Array.isArray(req.body.tags) ? req.body.tags.slice(0, 20).map(t => String(t).slice(0, 100)) : [];
    const query = String(req.body.query || '').slice(0, 500);
    try {
      return res.status(200).json(ragSearch({ tags, query }));
    } catch (err) {
      console.error('rag-search error:', err);
      await logServerError('gemini:rag-search', err, req).catch(() => {});
      return res.status(500).json({ error: 'Errore ricerca contesto: ' + err.message });
    }
  }

  if (!(await checkRateLimit(user.id, { scope: 'gemini', max: RL_MAX }))) {
    return res.status(429).json({ error: 'Troppe richieste. Riprova tra un minuto.' });
  }
  if (!(await checkMonthlyQuota(token, user.id, 'ai_calls', MONTHLY_MAX))) {
    return res.status(429).json({ error: `Hai raggiunto il limite di ${MONTHLY_MAX} richieste AI incluse nel piano per questo mese. Il conteggio si azzera a inizio mese.` });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({
      error: 'API Key non configurata. Registrati GRATIS su https://console.groq.com/keys e aggiungi la chiave in Vercel → Settings → Environment Variables → GEMINI_API_KEY'
    });
  }

  try {
    const { system, messages, max_tokens } = req.body;

    // Validate and sanitize inputs
    if (messages !== undefined && !Array.isArray(messages)) {
      return res.status(400).json({ error: 'Parametro messages non valido.' });
    }
    const safeMaxTokens = Math.min(Math.max(parseInt(max_tokens, 10) || 1024, 1), MAX_TOKENS_LIMIT);

    const allMessages = [
      { role: 'system', content: String(system || 'Sei un assistente nutrizionale clinico per dietisti italiani. Rispondi in italiano in modo preciso e professionale.').slice(0, 8192) },
      ...(messages || []).map(m => ({
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: String(m.content || '').slice(0, 8192)
      }))
    ];

    // Groq free models — llama3 è eccellente per domande cliniche
    const MODELS = [
      'llama-3.1-8b-instant',    // Più veloce
      'llama3-8b-8192',          // Alternativa
      'gemma2-9b-it',            // Gemma 2 Google via Groq
      'mixtral-8x7b-32768',      // Mixtral
    ];

    let lastError = null;

    for (const model of MODELS) {
      try {
        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
          },
          body: JSON.stringify({
            model,
            messages: allMessages,
            max_tokens: safeMaxTokens,
            temperature: 0.7,
            stream: false
          })
        });

        const data = await response.json();

        if (response.ok && data.choices?.[0]?.message?.content) {
          return res.status(200).json({
            content: [{ type: 'text', text: data.choices[0].message.content }],
            model,
            usage: data.usage || {}
          });
        }

        lastError = data.error?.message || `HTTP ${response.status}`;
        console.warn(`Groq model ${model} failed: ${lastError}`);

        // Auth error — no point retrying other models
        if (response.status === 401) {
          return res.status(401).json({
            error: 'Chiave API Groq non valida. Verifica su https://console.groq.com/keys che la chiave sia corretta e aggiorna GEMINI_API_KEY in Vercel.'
          });
        }

        // Rate limit — try next model
        if (response.status === 429) continue;

      } catch(e) {
        lastError = e.message;
      }
    }

    return res.status(503).json({
      error: `Servizio AI temporaneamente non disponibile. Riprova tra qualche secondo. (${lastError})`
    });

  } catch (err) {
    console.error('AI proxy error:', err);
    await logServerError('gemini', err, req).catch(() => {});
    return res.status(500).json({ error: 'Errore server: ' + err.message });
  }
}

export default withErrorLogging('gemini', handler);
