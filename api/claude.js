// api/claude.js — Vercel Serverless Function
// Usa Groq API (stessa chiave di gemini.js)
// Variabile: GEMINI_API_KEY

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

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
