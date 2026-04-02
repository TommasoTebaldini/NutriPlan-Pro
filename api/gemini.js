// api/ai.js — Vercel Serverless Function
// Usa Groq API: GRATIS, velocissima, nessun limite pratico
// Chiave gratuita su: https://console.groq.com/keys (registrazione con Google/GitHub)
// Vercel: Settings → Environment Variables → GEMINI_API_KEY (stessa variabile, non cambiare nome)

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({
      error: 'API Key non configurata. Registrati GRATIS su https://console.groq.com/keys e aggiungi la chiave in Vercel → Settings → Environment Variables → GEMINI_API_KEY'
    });
  }

  try {
    const { system, messages, max_tokens } = req.body;

    const allMessages = [
      { role: 'system', content: system || 'Sei un assistente nutrizionale clinico per dietisti italiani. Rispondi in italiano in modo preciso e professionale.' },
      ...(messages || []).map(m => ({
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: m.content
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
            max_tokens: max_tokens || 1024,
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
