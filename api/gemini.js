// api/ai.js — Vercel Serverless Function
// Usa Groq API: GRATIS, velocissima, nessun limite pratico
// Chiave gratuita su: https://console.groq.com/keys (registrazione con Google/GitHub)
// Vercel: Settings → Environment Variables → GEMINI_API_KEY (stessa variabile, non cambiare nome)

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://hvdwqowkhutfsdpiubxe.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh2ZHdxb3draHV0ZnNkcGl1YnhlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ3OTU0ODMsImV4cCI6MjA5MDM3MTQ4M30.HenM_wKdcrSVmQ2NyHsg0r9HfQDgcLgb2q1EAIMVcfs';

const MAX_TOKENS_LIMIT = 4096;
const MAX_CONTENT_BYTES = 32768; // 32 KB per request body

async function verifySupabaseToken(token) {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return null;
  const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: SUPABASE_ANON_KEY,
    },
  });
  if (!res.ok) return null;
  return await res.json();
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
    return res.status(500).json({ error: 'Errore server: ' + err.message });
  }
}
