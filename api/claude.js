// api/claude.js — Vercel Serverless Function
// Usa Groq API (stessa chiave di gemini.js)
// Variabile: GEMINI_API_KEY

import { checkRateLimit } from './_rateLimit.js';
import { checkMonthlyQuota } from './_monthlyQuota.js';
import { recipesForMealPlan } from './_ragSearch.js';
import { callClaude } from './_anthropic.js';
import { withErrorLogging, logServerError } from './_errorLog.js';

// Public Supabase values — l'URL non è sensibile, ma l'anon key non deve avere
// un fallback hardcoded nel codice server-side (vedi verifySupabaseToken sotto).
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://hvdwqowkhutfsdpiubxe.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

const MAX_TOKENS_LIMIT = 4096;
const MAX_CONTENT_BYTES = 32768; // 32 KB per request body

// Rate limiter: distribuito su Upstash se configurato, altrimenti in memoria
// (vedi api/_rateLimit.js). 10 richieste/min per utente.
const RL_MAX = 10;
// Tetto mensile duraturo (vedi api/_monthlyQuota.js) — 10/min moltiplicato per
// un mese intero sarebbe teoricamente enorme; questo è il freno reale ai costi.
const MONTHLY_MAX = 500;

// mode:'meal-plan' — genera una bozza di piano alimentare con Claude reale
// (non Groq): l'unico punto dell'app dove il contenuto clinico generato è
// abbastanza delicato da giustificare il modello migliore invece del più
// economico. Limiti separati e più stretti (costo Anthropic più alto).
const MEAL_PLAN_RL_MAX = 5;
const MEAL_PLAN_MONTHLY_MAX = 50;

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

  if (req.body?.mode === 'meal-plan') {
    return handleMealPlan(req, res, token, user);
  }

  if (!(await checkRateLimit(user.id, { scope: 'claude', max: RL_MAX }))) {
    return res.status(429).json({ error: 'Troppe richieste. Riprova tra un minuto.' });
  }
  if (!(await checkMonthlyQuota(token, user.id, 'ai_calls', MONTHLY_MAX))) {
    return res.status(429).json({ error: `Hai raggiunto il limite di ${MONTHLY_MAX} richieste AI incluse nel piano per questo mese. Il conteggio si azzera a inizio mese.` });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({
      error: 'API Key non configurata. Aggiungi GEMINI_API_KEY in Vercel → Settings → Environment Variables. Chiave gratuita su https://console.groq.com/keys'
    });
  }

  try {
    const { system, messages, max_tokens, json_mode } = req.body;

    // Validate and sanitize inputs
    if (messages !== undefined && !Array.isArray(messages)) {
      return res.status(400).json({ error: 'Parametro messages non valido.' });
    }
    const safeMaxTokens = Math.min(Math.max(parseInt(max_tokens, 10) || 1024, 1), MAX_TOKENS_LIMIT);

    const allMessages = [];
    if (system) allMessages.push({ role: 'system', content: String(system).slice(0, 8192) });
    (messages || []).forEach(m => allMessages.push({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: String(m.content || '').slice(0, 8192)
    }));

    // json_mode=true: use 70B model first (much more reliable for structured JSON output)
    // gemma2-9b-it è stato dismesso da Groq; openai/gpt-oss-20b aggiunto come
    // ultima rete di sicurezza nel caso anche i modelli llama non siano disponibili.
    const MODELS = json_mode
      ? ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'openai/gpt-oss-20b']
      : ['llama-3.1-8b-instant', 'openai/gpt-oss-20b'];
    // Models that support response_format json_object on Groq
    const JSON_MODE_MODELS = new Set(['llama-3.3-70b-versatile', 'llama-3.1-8b-instant']);
    let lastError = null;
    let allRateLimited = true; // resta true solo se OGNI tentativo ha fallito per 429

    for (const model of MODELS) {
      try {
        const reqBody = {
          model,
          messages: allMessages,
          max_tokens: safeMaxTokens,
          temperature: 0.3
        };
        if (json_mode && JSON_MODE_MODELS.has(model)) {
          reqBody.response_format = { type: 'json_object' };
        }
        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
          },
          body: JSON.stringify(reqBody)
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

        if (response.status !== 429) allRateLimited = false;

        if (response.ok) {
          // 200 ma senza testo utilizzabile (es. modello di reasoning che ha
          // esaurito max_tokens in token di ragionamento invisibili prima di
          // produrre output) — non è un errore HTTP, va segnalato per quello che è.
          lastError = `Il modello ${model} ha risposto senza contenuto utilizzabile.`;
        } else {
          lastError = data.error?.message || `HTTP ${response.status}`;
        }
        if (response.status === 401) {
          return res.status(401).json({ error: 'Chiave API non valida. Verifica GEMINI_API_KEY su https://console.groq.com/keys' });
        }
        // Qualunque altro errore (modello deprecato/rimosso, 429, 5xx...): prova il modello successivo.

      } catch(e) {
        allRateLimited = false;
        lastError = e.message;
      }
    }

    if (allRateLimited) {
      return res.status(503).json({ error: 'Servizio AI temporaneamente sovraccarico (limite del piano gratuito Groq raggiunto). Riprova tra un minuto, oppure genera meno giorni per volta.' });
    }
    return res.status(503).json({ error: lastError || 'Servizio non disponibile' });

  } catch (err) {
    await logServerError('claude', err, req).catch(() => {});
    return res.status(500).json({ error: 'Errore server: ' + err.message });
  }
}

export default withErrorLogging('claude', handler);

// ─────────────────────────────────────────────────────────────────────────
// mode:'meal-plan' — genera una bozza di piano alimentare (Claude reale).
// Il piano NON viene salvato da questo endpoint: torna al dietista come
// bozza JSON, che la revisiona/modifica in UI e la salva lei stessa (client,
// tabelle patient_diets/diet_meals già esistenti — stesso schema/RLS usati
// da Diet-Plan-Pro-app-claude, progetto Supabase condiviso). Nessun piano
// generato da AI raggiunge il paziente senza revisione umana.
// ─────────────────────────────────────────────────────────────────────────

const MEAL_TYPES = ['colazione', 'spuntino_mattina', 'pranzo', 'spuntino_pomeriggio', 'cena'];

async function isDietitian(token, userId) {
  if (!SUPABASE_ANON_KEY) return false;
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${userId}&select=role`, {
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return false;
    const rows = await res.json();
    return rows?.[0]?.role === 'dietitian';
  } catch {
    return false;
  }
}

// Un collaboratore di studio genera bozze piano per le cartelle del titolare,
// non le proprie: senza risolvere l'id del titolare, fetchPatientContext
// interrogava cartelle con user_id=eq.<id del collaboratore> e trovava sempre
// zero righe ("Paziente non trovato") anche se le policy RLS gli
// consentirebbero l'accesso via get_studio_owner(auth.uid()). Stessa logica
// di get_studio_owner() in supabase_setup.sql (vedi anche api/whatsapp-webhook.js).
async function resolveStudioOwner(token, userId) {
  if (!SUPABASE_ANON_KEY) return userId;
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/studio_collaborators?collaborator_id=eq.${userId}&select=titolare_id&limit=1`,
      { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` } }
    );
    if (!res.ok) return userId;
    const rows = await res.json();
    return rows?.[0]?.titolare_id || userId;
  } catch {
    return userId;
  }
}

async function fetchPatientContext(token, dietitianUserId, patientId) {
  // Esami e nota clinica aggiunti perché il piano deve poter reagire a dati
  // di laboratorio recenti (es. LDL alto → meno grassi saturi) e a indicazioni
  // libere del dietista (es. obiettivi specifici, preferenze) — prima il
  // generatore vedeva solo tag+peso, ignorando tutto il resto della cartella.
  const [cartRes, biaRes, esamiRes] = await Promise.all([
    fetch(`${SUPABASE_URL}/rest/v1/cartelle?id=eq.${patientId}&user_id=eq.${dietitianUserId}&select=nome,ddn,sesso,tags,note`, {
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` },
    }),
    fetch(`${SUPABASE_URL}/rest/v1/bia_records?cartella_id=eq.${patientId}&select=peso&order=data_misura.desc&limit=1`, {
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` },
    }),
    fetch(`${SUPABASE_URL}/rest/v1/esami_biochimici?cartella_id=eq.${patientId}&select=tipo,valore,unita,data_esame&order=data_esame.desc&limit=8`, {
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` },
    }),
  ]);
  const cart = (await cartRes.json())?.[0];
  const bia = (await biaRes.json())?.[0];
  const esami = await esamiRes.json();
  return cart ? { ...cart, peso: bia?.peso, esami: Array.isArray(esami) ? esami : [] } : null;
}

function extractJson(text) {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try { return JSON.parse(match[0]); } catch { return null; }
}

async function handleMealPlan(req, res, token, user) {
  if (!(await checkRateLimit(user.id, { scope: 'meal-plan', max: MEAL_PLAN_RL_MAX }))) {
    return res.status(429).json({ error: 'Troppe richieste. Riprova tra un minuto.' });
  }
  if (!(await checkMonthlyQuota(token, user.id, 'ai_meal_plan', MEAL_PLAN_MONTHLY_MAX))) {
    return res.status(429).json({ error: `Hai raggiunto il limite di ${MEAL_PLAN_MONTHLY_MAX} bozze di piano AI incluse nel piano per questo mese.` });
  }
  if (!(await isDietitian(token, user.id))) {
    return res.status(403).json({ error: 'Funzione riservata agli account dietista.' });
  }

  const patientId = String(req.body?.patientId || '');
  if (!patientId) {
    return res.status(400).json({ error: 'Parametro patientId mancante.' });
  }

  const ownerId = await resolveStudioOwner(token, user.id);
  const patient = await fetchPatientContext(token, ownerId, patientId);
  if (!patient) {
    return res.status(404).json({ error: 'Paziente non trovato o non associato a questo account.' });
  }

  const tags = Array.isArray(patient.tags) ? patient.tags : [];
  const { guidelines, recipesByCategory } = recipesForMealPlan({ tags });

  const guidelinesText = guidelines.length
    ? guidelines.map(g => `- ${g.nome} [${g.badge || ''}]: ${g.target || ''}`).join('\n')
    : '(nessuna linea guida specifica trovata per i tag di questo paziente — usa buon senso clinico generale)';

  const recipesText = Object.entries(recipesByCategory)
    .filter(([, list]) => list.length)
    .map(([cat, list]) => `${cat}: ` + list.map(r => `"${r.nome}" (id:${r.id}, ~${r.kcal || '?'} kcal/porzione)`).join(', '))
    .join('\n');

  const esamiText = (patient.esami && patient.esami.length)
    ? patient.esami.map(e => `- ${e.tipo}: ${e.valore}${e.unita ? ' ' + e.unita : ''}${e.data_esame ? ` (${e.data_esame})` : ''}`).join('\n')
    : '(nessun esame biochimico registrato)';

  const system = `Sei un assistente per dietisti italiani. Genera UNA bozza di piano alimentare giornaliero (si applica ad ogni giorno, non è specifico per giorno della settimana) da sottoporre a revisione del dietista.

VINCOLO ASSOLUTO: usa SOLO le ricette elencate sotto (riportane id e nome esattamente come dati). Non inventare ricette o piatti non presenti nella lista. Se una categoria non ha ricette disponibili, ometti quel pasto o usa alimenti semplici generici (es. "yogurt naturale + frutta") invece di inventare un piatto strutturato.

Paziente: ${patient.nome || ''}${patient.peso ? `, peso attuale ${patient.peso} kg` : ''}${tags.length ? `, tag/patologie: ${tags.join(', ')}` : ''}.
${patient.note && patient.note !== '__altro__' ? `Note cliniche del dietista: ${patient.note}\n` : ''}
Esami biochimici recenti (tienine conto per le scelte alimentari, es. LDL/trigliceridi alti → meno grassi saturi e zuccheri semplici, glicemia/HbA1c alterata → attenzione a carico glicemico e ripartizione carboidrati):
${esamiText}

Linee guida cliniche pertinenti (fonte: dataset interno verificato):
${guidelinesText}

Ricette disponibili per categoria:
${recipesText}

Rispondi SOLO con un oggetto JSON valido (nessun testo fuori dal JSON, nessun blocco markdown), in questo formato esatto:
{
  "name": "titolo breve del piano",
  "kcal_target": <numero intero>,
  "protein_target": <numero intero, grammi>,
  "carbs_target": <numero intero, grammi>,
  "fats_target": <numero intero, grammi>,
  "meals_count": 5,
  "notes": "breve nota clinica per il dietista su come è stato costruito il piano",
  "meals": [
    { "meal_type": "colazione", "meal_order": 1, "description": "nome ricetta o alimento", "recipeId": "id ricetta o null", "kcal": <numero>, "proteins": <numero>, "carbs": <numero>, "fats": <numero> }
  ]
}
"meal_type" deve essere uno tra: ${MEAL_TYPES.join(', ')}. Includi un pasto per ciascuno dei 5 tipi.`;

  const result = await callClaude({
    system,
    userMessage: 'Genera la bozza del piano alimentare secondo le istruzioni sopra.',
    maxTokens: 2048,
  });

  if (!result.ok) {
    return res.status(result.status || 502).json({ error: 'Errore generazione piano: ' + result.error });
  }

  const plan = extractJson(result.text);
  if (!plan) {
    return res.status(502).json({ error: 'Risposta AI non in formato JSON valido. Riprova.' });
  }

  return res.status(200).json({ plan, model: result.model });
}
