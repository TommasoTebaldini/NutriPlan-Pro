// Supabase Edge Function: analyze-food-diary
// Analizza la foto del diario alimentare (cartaceo o di un pasto) caricata dal
// dietista nella cartella paziente, ed estrae per ogni alimento riconosciuto
// sia i macronutrienti sia i micronutrienti principali — a differenza di
// analyze-meal (usata dall'app paziente), pensata per un uso clinico da parte
// del dietista, non per un conteggio calorico rapido lato paziente. Stesso
// pattern di provider fallback (Gemini -> Groq -> Claude) e di auth/rate-limit
// di analyze-meal, ma è una funzione separata: modificare il contratto di
// analyze-meal avrebbe rischiato di rompere l'app paziente già funzionante.
//
// Setup:
//   supabase secrets set GEMINI_API_KEY=<tua_chiave_gemini>
//   (opzionale) supabase secrets set GROQ_API_KEY=<tua_chiave_groq>
//   (opzionale) supabase secrets set ANTHROPIC_API_KEY=<tua_chiave_claude>
//
// Deploy:
//   supabase functions deploy analyze-food-diary

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

// Per-user, in-memory, per-instance rate limiter — stesso pattern di
// analyze-meal (Diet-Plan-Pro-app-claude/supabase/functions/_shared/rateLimit.ts),
// duplicato qui perché è una funzione self-contained in un repo diverso.
interface RateEntry { n: number; t: number }
function createRateLimiter(maxRequests: number, windowMs: number) {
  const hits = new Map<string, RateEntry>()
  return {
    allow(key: string): boolean {
      const now = Date.now()
      const entry = hits.get(key)
      if (!entry || now - entry.t > windowMs) { hits.set(key, { n: 1, t: now }); return true }
      if (entry.n >= maxRequests) return false
      entry.n++
      return true
    },
    prune() {
      if (hits.size < 500) return
      const cutoff = Date.now() - windowMs
      for (const [k, v] of hits) if (v.t < cutoff) hits.delete(k)
    },
  }
}
const rateLimiter = createRateLimiter(10, 60_000)

const PROMPT = `Sei un dietista clinico italiano. Analizza la foto del diario alimentare (può essere una pagina scritta a mano con i pasti del giorno, oppure una foto di un pasto) e identifica tutti gli alimenti descritti o visibili, con le relative quantità.
Rispondi SOLO con un JSON valido (nessun testo prima o dopo) nel formato:
{
  "foods": [
    {
      "name": "nome alimento in italiano",
      "grams": 150,
      "kcal_100g": 250,
      "proteins_100g": 10,
      "carbs_100g": 30,
      "sugars_100g": 5,
      "fats_100g": 8,
      "saturatedFat_100g": 2,
      "fiber_100g": 2,
      "calcium_100g": 50,
      "iron_100g": 1.2,
      "magnesium_100g": 20,
      "potassium_100g": 300,
      "sodium_100g": 100,
      "zinc_100g": 1,
      "folate_100g": 20,
      "selenium_100g": 5,
      "cholesterol_100g": 10
    }
  ],
  "meal_description": "descrizione breve del contenuto del diario/pasto",
  "confidence": "alta|media|bassa"
}
Tutti i valori nutrizionali sono per 100g di alimento, usa i valori del database CREA italiano. Se la foto è una pagina di diario scritta a mano con più pasti, elenca TUTTI gli alimenti di TUTTI i pasti del giorno in un unico array "foods". Stima le quantità in base a quanto scritto/visibile; se non è specificata una quantità, usa una porzione standard plausibile.`

async function callGemini(imageBase64: string, mediaType: string) {
  const key = Deno.env.get('GEMINI_API_KEY')
  if (!key) throw new Error('GEMINI_API_KEY non configurata nel server Supabase')
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent?key=${key}`
  const body = {
    contents: [{ parts: [{ text: PROMPT }, { inlineData: { mimeType: mediaType, data: imageBase64 } }] }],
    generationConfig: { temperature: 0.2, maxOutputTokens: 2048, responseMimeType: 'application/json' },
  }
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error((err as { error?: { message?: string } })?.error?.message || `Gemini error ${res.status}`)
  }
  const data = await res.json() as { candidates?: { content?: { parts?: { text?: string }[] } }[] }
  return data.candidates?.[0]?.content?.parts?.[0]?.text || ''
}

async function callGroq(imageBase64: string, mediaType: string): Promise<string> {
  const key = Deno.env.get('GROQ_API_KEY')
  if (!key) throw new Error('GROQ_API_KEY non configurata')
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: 'meta-llama/llama-4-scout-17b-16e-instruct',
      messages: [{ role: 'user', content: [{ type: 'text', text: PROMPT }, { type: 'image_url', image_url: { url: `data:${mediaType};base64,${imageBase64}` } }] }],
      max_tokens: 2048,
      temperature: 0.2,
    }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error((err as { error?: { message?: string } })?.error?.message || `Groq error ${res.status}`)
  }
  const data = await res.json() as { choices?: { message?: { content?: string } }[] }
  return data.choices?.[0]?.message?.content || ''
}

async function callClaude(imageBase64: string, mediaType: string) {
  const key = Deno.env.get('ANTHROPIC_API_KEY')
  if (!key) throw new Error('ANTHROPIC_API_KEY non configurata nel server Supabase')
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2048,
      system: PROMPT,
      messages: [{ role: 'user', content: [{ type: 'image', source: { type: 'base64', media_type: mediaType, data: imageBase64 } }, { type: 'text', text: 'Analizza questo diario alimentare.' }] }],
    }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error((err as { error?: { message?: string } })?.error?.message || `Claude error ${res.status}`)
  }
  const data = await res.json() as { content?: { text?: string }[] }
  return data.content?.[0]?.text || ''
}

function num(v: unknown, decimals = 0): number {
  const f = typeof v === 'number' ? v : parseFloat(String(v ?? 0))
  const safe = Number.isFinite(f) ? Math.max(0, f) : 0
  const factor = 10 ** decimals
  return Math.round(safe * factor) / factor
}

function parseResponse(text: string) {
  const match = text.match(/\{[\s\S]*\}/)
  if (!match) throw new Error('Risposta AI non valida')
  const parsed = JSON.parse(match[0]) as {
    foods?: Record<string, unknown>[]
    meal_description?: string
    confidence?: string
  }
  if (!Array.isArray(parsed.foods)) throw new Error('Formato risposta non valido')
  return {
    foods: parsed.foods.map(f => ({
      name: (f.name as string) || 'Alimento',
      grams: Math.max(1, Math.round(num(f.grams) || 100)),
      kcal_100g: num(f.kcal_100g),
      proteins_100g: num(f.proteins_100g, 1),
      carbs_100g: num(f.carbs_100g, 1),
      sugars_100g: num(f.sugars_100g, 1),
      fats_100g: num(f.fats_100g, 1),
      saturatedFat_100g: num(f.saturatedFat_100g, 1),
      fiber_100g: num(f.fiber_100g, 1),
      calcium_100g: num(f.calcium_100g),
      iron_100g: num(f.iron_100g, 1),
      magnesium_100g: num(f.magnesium_100g),
      potassium_100g: num(f.potassium_100g),
      sodium_100g: num(f.sodium_100g),
      zinc_100g: num(f.zinc_100g, 1),
      folate_100g: num(f.folate_100g),
      selenium_100g: num(f.selenium_100g),
      cholesterol_100g: num(f.cholesterol_100g),
    })),
    description: parsed.meal_description || '',
    confidence: parsed.confidence || 'media',
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return json({ error: 'Non autorizzato' }, 401)

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SB_PUBLISHABLE_KEY') ?? Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    { global: { headers: { Authorization: authHeader } } },
  )
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return json({ error: 'Non autorizzato' }, 401)

  rateLimiter.prune()
  if (!rateLimiter.allow(user.id)) {
    return json({ error: 'Troppe richieste, riprova tra un minuto.' }, 429)
  }

  let body: { image?: string; mediaType?: string }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Payload non valido' }, 400)
  }

  const { image, mediaType = 'image/jpeg' } = body
  if (!image) return json({ error: 'Immagine mancante' }, 400)

  const hasGemini = !!Deno.env.get('GEMINI_API_KEY')
  const hasGroq   = !!Deno.env.get('GROQ_API_KEY')
  const hasClaude = !!Deno.env.get('ANTHROPIC_API_KEY')

  if (!hasGemini && !hasGroq && !hasClaude) {
    return json({ error: 'Nessuna chiave AI configurata. Aggiungi GEMINI_API_KEY o GROQ_API_KEY nei segreti Supabase.' }, 500)
  }

  const providers: Array<() => Promise<string>> = []
  if (hasGemini) providers.push(() => callGemini(image, mediaType))
  if (hasGroq)   providers.push(() => callGroq(image, mediaType))
  if (hasClaude) providers.push(() => callClaude(image, mediaType))

  let text = ''
  let lastError = ''
  for (const call of providers) {
    try { text = await call(); break } catch (e) { lastError = (e as Error).message }
  }
  if (!text) return json({ error: lastError || 'Errore AI' }, 500)

  try {
    return json(parseResponse(text))
  } catch (e) {
    return json({ error: (e as Error).message }, 500)
  }
})
