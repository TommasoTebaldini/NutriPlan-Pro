// api/ai-scribe.js — Vercel Serverless Function
// "AI Scribe": riceve l'audio di una seduta (registrata con consenso esplicito
// del paziente, richiesto lato client prima di avviare la registrazione),
// lo trascrive con Whisper (via Groq, stessa chiave/account di api/claude.js
// e api/gemini.js — GEMINI_API_KEY) e genera una nota clinica strutturata in
// formato SOAP con lo stesso modello Llama usato altrove nel repo.
//
// Privacy by design: l'audio arriva in memoria, viene inoltrato a Groq per
// la trascrizione e SCARTATO subito dopo — non viene mai scritto su disco,
// storage o DB da questa funzione. Solo il testo trascritto e la nota SOAP
// generata vengono restituiti al client, che decide se salvarli in cartella
// clinica (note_specialistiche).

export const config = {
  api: { bodyParser: { sizeLimit: '12mb' } }, // audio compresso (webm/opus) di una seduta breve
};

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://hvdwqowkhutfsdpiubxe.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const MAX_AUDIO_BYTES = 10 * 1024 * 1024; // ~10MB decodificati, abbondante per una seduta di 20-30 min in opus

// Rate limit più severo del solito: la trascrizione costa molto di più di un
// singolo prompt di chat.
const _rl = new Map();
const RL_MAX = 6;
const RL_WIN = 60_000;
function rateLimit(userId) {
  const now = Date.now();
  const e = _rl.get(userId);
  if (!e || now - e.t > RL_WIN) { _rl.set(userId, { n: 1, t: now }); return true; }
  if (e.n >= RL_MAX) return false;
  e.n++; return true;
}

const _tkCache = new Map();
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
    if (_tkCache.size > 200) { for (const [k, v] of _tkCache) if (v.exp < now) _tkCache.delete(k); }
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

async function trascriviAudio(buffer, mimeType, apiKey) {
  const form = new FormData();
  form.append('file', new Blob([buffer], { type: mimeType || 'audio/webm' }), 'seduta.webm');
  form.append('model', 'whisper-large-v3');
  form.append('language', 'it');
  form.append('response_format', 'json');
  const res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || `Trascrizione fallita (HTTP ${res.status})`);
  return data.text || '';
}

const SOAP_SYSTEM_PROMPT = `Sei un assistente per dietisti/nutrizionisti italiani. Ricevi la trascrizione grezza di una seduta con un paziente e devi produrre una nota clinica in formato SOAP, in italiano, basandoti SOLO su quanto detto nella trascrizione (non inventare dati non menzionati). Rispondi in JSON con esattamente questi campi:
{
  "soggettivo": "ciò che il paziente riferisce (sintomi, abitudini, difficoltà, percezioni) — testo libero",
  "obiettivo": "misure/dati oggettivi menzionati nella seduta (peso, misure, esami, aderenza osservabile) — testo libero, 'Non menzionato nella seduta' se assente",
  "valutazione": "la tua sintesi clinica della situazione del paziente basata su quanto discusso",
  "piano": "azioni/prossimi passi concordati o suggeriti durante la seduta"
}
Se la trascrizione è troppo breve o non contiene informazioni sufficienti per un campo, scrivi "Non emerso dalla trascrizione" per quel campo invece di inventare contenuto.`;

async function generaNotaSOAP(transcript, apiKey) {
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      messages: [
        { role: 'system', content: SOAP_SYSTEM_PROMPT },
        { role: 'user', content: `Trascrizione della seduta:\n\n${transcript.slice(0, 12000)}` },
      ],
      max_tokens: 1500,
      temperature: 0.2,
      response_format: { type: 'json_object' },
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || `Generazione nota fallita (HTTP ${res.status})`);
  const raw = data.choices?.[0]?.message?.content || '{}';
  try {
    return JSON.parse(raw);
  } catch {
    return { soggettivo: raw, obiettivo: '', valutazione: '', piano: '' };
  }
}

export default async function handler(req, res) {
  setCorsHeaders(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const authHeader = req.headers.authorization || '';
  if (!authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Non autorizzato: token mancante.' });
  }
  const user = await verifySupabaseToken(authHeader.slice(7));
  if (!user?.id) return res.status(401).json({ error: 'Non autorizzato: sessione non valida.' });

  if (!rateLimit(user.id)) {
    return res.status(429).json({ error: 'Troppe richieste. Riprova tra un minuto.' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'API Key non configurata (GEMINI_API_KEY).' });
  }

  try {
    const { audioBase64, mimeType, consentAcquired } = req.body || {};
    if (!consentAcquired) {
      return res.status(400).json({ error: 'Consenso alla registrazione non confermato dal client.' });
    }
    if (!audioBase64 || typeof audioBase64 !== 'string') {
      return res.status(400).json({ error: 'Audio mancante.' });
    }

    let buffer;
    try {
      buffer = Buffer.from(audioBase64, 'base64');
    } catch {
      return res.status(400).json({ error: 'Audio non decodificabile.' });
    }
    if (buffer.length === 0 || buffer.length > MAX_AUDIO_BYTES) {
      return res.status(413).json({ error: 'Audio troppo grande o vuoto (max ~10MB).' });
    }

    const transcript = await trascriviAudio(buffer, mimeType, apiKey);
    // buffer non viene più referenziato dopo questo punto — nessuna
    // persistenza, nessuna copia scritta su disco/storage.
    if (!transcript.trim()) {
      return res.status(200).json({ transcript: '', soap: null, warning: 'Nessun parlato riconosciuto nella registrazione.' });
    }

    const soap = await generaNotaSOAP(transcript, apiKey);
    return res.status(200).json({ transcript, soap });
  } catch (err) {
    console.error('ai-scribe error:', err);
    return res.status(500).json({ error: 'Errore server: ' + err.message });
  }
}
