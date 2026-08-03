// api/_anthropic.js — chiamata diretta all'API Anthropic (Claude reale, non
// Groq). Prefisso `_`: non è una function Vercel a sé, solo un modulo
// importato da api/claude.js per il branch mode:'meal-plan'.
//
// Usato SOLO per il generatore di piani alimentari (contenuto clinico più
// delicato, unico punto dove vogliamo il modello migliore invece del più
// economico) — tutto il resto dell'app resta su Groq via api/gemini.js /
// api/claude.js in modalità normale.
//
// Richiede la env var ANTHROPIC_API_KEY su Vercel (oggi esiste solo nei
// secrets Supabase di Diet-Plan-Pro-app-claude — va aggiunta qui a parte).

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';
const DEFAULT_MODEL = 'claude-sonnet-5';

/**
 * @param {object} opts
 * @param {string} opts.system      system prompt
 * @param {string} opts.userMessage messaggio utente (singolo turno, non serve history qui)
 * @param {number} [opts.maxTokens]
 * @param {string} [opts.model]
 * @returns {Promise<{ok:boolean, text?:string, error?:string, status?:number}>}
 */
export async function callClaude({ system, userMessage, maxTokens = 2048, model = DEFAULT_MODEL }) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { ok: false, status: 500, error: 'ANTHROPIC_API_KEY non configurata su Vercel.' };
  }

  try {
    const response = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': ANTHROPIC_VERSION,
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        system: String(system || '').slice(0, 16384),
        messages: [{ role: 'user', content: String(userMessage || '').slice(0, 8192) }],
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      return { ok: false, status: response.status, error: data?.error?.message || `HTTP ${response.status}` };
    }

    const text = data?.content?.find(b => b.type === 'text')?.text || '';
    if (!text) {
      return { ok: false, status: 502, error: 'Risposta Claude senza contenuto testuale.' };
    }

    return { ok: true, text, usage: data.usage || {}, model };
  } catch (err) {
    return { ok: false, status: 503, error: err.message };
  }
}
