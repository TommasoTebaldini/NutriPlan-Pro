// api/gemini.js — Vercel Serverless Function
// Usa OpenRouter: modelli AI gratuiti, nessun limite quota per il progetto
// Chiave gratuita su: https://openrouter.ai/keys
// Vercel: Settings → Environment Variables → GEMINI_API_KEY (stessa variabile)

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({
      error: 'API Key non configurata. Vai su https://openrouter.ai/keys, crea una chiave gratuita e aggiungila in Vercel → Settings → Environment Variables come GEMINI_API_KEY'
    });
  }

  try {
    const { system, messages, max_tokens } = req.body;

    // Build messages array with system prompt
    const allMessages = [
      { role: 'system', content: system || 'Sei un assistente nutrizionale clinico per dietisti italiani.' },
      ...(messages || []).map(m => ({
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: m.content
      }))
    ];

    // Free models on OpenRouter (no credits needed)
    // Try in order: best quality first
    const FREE_MODELS = [
      'google/gemma-3-9b-it:free',
      'meta-llama/llama-3.1-8b-instruct:free',
      'microsoft/phi-3-mini-128k-instruct:free',
      'mistralai/mistral-7b-instruct:free',
    ];

    let lastError = null;

    for (const model of FREE_MODELS) {
      try {
        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
            'HTTP-Referer': 'https://dietplanpro.vercel.app',
            'X-Title': 'DietPlan Pro'
          },
          body: JSON.stringify({
            model,
            messages: allMessages,
            max_tokens: max_tokens || 1024,
            temperature: 0.7
          })
        });

        const data = await response.json();

        if (response.ok && data.choices?.[0]?.message?.content) {
          const text = data.choices[0].message.content;
          return res.status(200).json({
            content: [{ type: 'text', text }],
            model,
            usage: data.usage || {}
          });
        }

        lastError = data.error?.message || `HTTP ${response.status}`;
        console.warn(`Model ${model} failed: ${lastError}`);

        // If rate limited, try next model
        if (response.status === 429 || response.status === 503) continue;
        // If auth error, no point retrying
        if (response.status === 401) {
          return res.status(401).json({
            error: 'Chiave API OpenRouter non valida. Verificala su https://openrouter.ai/keys'
          });
        }

      } catch(e) {
        lastError = e.message;
        console.warn(`Model ${model} exception: ${e.message}`);
      }
    }

    return res.status(503).json({
      error: `Tutti i modelli gratuiti non disponibili al momento. Riprova tra qualche minuto. (${lastError})`
    });

  } catch (err) {
    console.error('AI proxy error:', err);
    return res.status(500).json({ error: 'Errore server: ' + err.message });
  }
}
