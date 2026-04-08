// api/claude.js — Vercel Serverless Function
// Usa Groq API (stessa chiave di gemini.js)
// Variabile: GEMINI_API_KEY

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://hvdwqowkhutfsdpiubxe.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh2ZHdxb3draHV0ZnNkcGl1YnhlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ3OTU0ODMsImV4cCI6MjA5MDM3MTQ4M30.HenM_wKdcrSVmQ2NyHsg0r9HfQDgcLgb2q1EAIMVcfs';

async function verifySupabaseToken(token) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: SUPABASE_ANON_KEY,
    },
  });
  if (!res.ok) return null;
  return await res.json();
}

export default async function handler(req, res) {
  const origin = req.headers.origin || '';
  const allowedOrigin = process.env.ALLOWED_ORIGIN || origin;
  res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Vary', 'Origin');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

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
      error: 'API Key non configurata. Aggiungi GEMINI_API_KEY in Vercel → Settings → Environment Variables. Chiave gratuita su https://console.groq.com/keys'
    });
  }

  try {
    const { system, messages, max_tokens } = req.body;

    const allMessages = [];
    if (system) allMessages.push({ role: 'system', content: system });
    (messages || []).forEach(m => allMessages.push({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: m.content
    }));

    const MODELS = ['llama-3.1-8b-instant', 'llama3-8b-8192', 'gemma2-9b-it'];
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
            max_tokens: max_tokens || 1024,
            temperature: 0.3
          })
        });

        const data = await response.json();

        if (response.ok && data.choices?.[0]?.message?.content) {
          const text = data.choices[0].message.content;
          // Return in format compatible with both old Claude format and new
          return res.status(200).json({
            content: [{ type: 'text', text }],
            model,
            usage: data.usage || {}
          });
        }

        lastError = data.error?.message || `HTTP ${response.status}`;
        if (response.status === 401) {
          return res.status(401).json({ error: 'Chiave API non valida. Verifica GEMINI_API_KEY su https://console.groq.com/keys' });
        }
        if (response.status !== 429) break;

      } catch(e) {
        lastError = e.message;
      }
    }

    return res.status(503).json({ error: lastError || 'Servizio non disponibile' });

  } catch (err) {
    return res.status(500).json({ error: 'Errore server: ' + err.message });
  }
}
