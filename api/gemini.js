// api/gemini.js — Vercel Serverless Function
// Proxy per Google Gemini API
// Chiave GRATIS su: https://aistudio.google.com/app/apikey (usa progetto NUOVO)
// Vercel: Settings → Environment Variables → GEMINI_API_KEY

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({
      error: 'GEMINI_API_KEY non configurata. Aggiungila in Vercel → Settings → Environment Variables. Chiave gratuita su https://aistudio.google.com/app/apikey'
    });
  }

  try {
    const { system, messages, max_tokens } = req.body;

    const contents = (messages || []).map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }]
    }));

    const body = {
      system_instruction: {
        parts: [{ text: system || 'Sei un assistente nutrizionale clinico per dietisti italiani.' }]
      },
      contents,
      generationConfig: {
        maxOutputTokens: max_tokens || 1024,
        temperature: 0.7
      }
    };

    // Try models in order: 1.5-flash (free tier), then 1.0-pro as fallback
    const MODELS = [
      'gemini-1.5-flash',
      'gemini-1.5-flash-8b',
      'gemini-1.0-pro'
    ];

    let lastError = null;
    for (const model of MODELS) {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });
        const data = await response.json();

        if (response.ok && data.candidates?.[0]?.content?.parts?.[0]?.text) {
          const text = data.candidates[0].content.parts[0].text;
          return res.status(200).json({
            content: [{ type: 'text', text }],
            model,
            usage: {
              input_tokens: data.usageMetadata?.promptTokenCount || 0,
              output_tokens: data.usageMetadata?.candidatesTokenCount || 0
            }
          });
        }

        // If quota exceeded, try next model
        const errMsg = data.error?.message || '';
        lastError = errMsg;
        if (!errMsg.includes('quota') && !errMsg.includes('RESOURCE_EXHAUSTED') && !errMsg.includes('not found')) {
          // Non-quota error (e.g. bad key) — no point retrying
          return res.status(400).json({ error: errMsg });
        }
        console.warn(`Model ${model} failed (quota/not found): ${errMsg}`);
      } catch(e) {
        lastError = e.message;
      }
    }

    // All models failed
    return res.status(429).json({
      error: `Quota Gemini esaurita su tutti i modelli disponibili. Verifica il tuo piano su https://ai.dev/rate-limit oppure crea una nuova chiave API su https://aistudio.google.com/app/apikey con un progetto Google Cloud diverso. Dettaglio: ${lastError}`
    });

  } catch (err) {
    console.error('Gemini proxy error:', err);
    return res.status(500).json({ error: 'Errore server: ' + err.message });
  }
}
