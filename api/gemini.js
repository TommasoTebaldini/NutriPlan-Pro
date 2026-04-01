// api/gemini.js — Vercel Serverless Function
// Proxy per Google Gemini API (gratuita, 1500 richieste/giorno con Gemini 1.5 Flash)
// Setup: Vercel Dashboard → Settings → Environment Variables → GEMINI_API_KEY
// Ottieni la chiave GRATIS su: https://aistudio.google.com/app/apikey

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({
      error: 'GEMINI_API_KEY non configurata. Vai su Vercel Dashboard → Settings → Environment Variables e aggiungi GEMINI_API_KEY. Ottieni la chiave gratis su https://aistudio.google.com/app/apikey'
    });
  }

  try {
    const { system, messages, max_tokens } = req.body;

    // Build Gemini contents from messages
    const contents = [];

    // Add conversation history
    for (const msg of messages) {
      const role = msg.role === 'assistant' ? 'model' : 'user';
      contents.push({ role, parts: [{ text: msg.content }] });
    }

    const body = {
      system_instruction: {
        parts: [{ text: system || 'Sei un assistente nutrizionale clinico per dietisti italiani.' }]
      },
      contents,
      generationConfig: {
        maxOutputTokens: max_tokens || 1024,
        temperature: 0.7,
        topP: 0.9
      },
      safetySettings: [
        { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' }
      ]
    };

    const model = 'gemini-1.5-flash-latest';
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    const data = await response.json();

    if (!response.ok) {
      const errMsg = data.error?.message || 'Errore API Gemini';
      console.error('Gemini API error:', data.error);
      return res.status(response.status).json({ error: errMsg });
    }

    // Extract text from Gemini response
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    if (!text) {
      return res.status(500).json({ error: 'Nessuna risposta da Gemini' });
    }

    // Return in format compatible with Claude API response format
    return res.status(200).json({
      content: [{ type: 'text', text }],
      model,
      usage: {
        input_tokens: data.usageMetadata?.promptTokenCount || 0,
        output_tokens: data.usageMetadata?.candidatesTokenCount || 0
      }
    });

  } catch (err) {
    console.error('Gemini proxy error:', err);
    return res.status(500).json({ error: 'Errore server: ' + err.message });
  }
}
