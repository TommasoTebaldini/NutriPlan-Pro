// Supabase Edge Function: generate-giornale
//
// Genera mensilmente "Il Giornale del Dietista": recupera studi REALI da
// PubMed/MEDLINE (le revisioni Cochrane sono incluse perché indicizzate come
// rivista "Cochrane Database Syst Rev") per due sezioni:
//   - parte_dietetica: terapie nutrizionali, integratori, studi di efficacia
//   - parte_altro: scoperte mediche generali dalle riviste generaliste top-tier
// L'IA (Gemini -> Groq -> Claude, stesso fallback di analyze-food-diary) viene
// usata SOLO per riassumere in italiano il contenuto REALE degli abstract
// forniti — mai per generare contenuto dalla propria conoscenza. Ogni voce
// pubblicata riporta rivista/data/url presi da PubMed (mai dall'output
// dell'AI) e un link diretto alla pagina originale per verifica manuale.
//
// Auth: doppio percorso —
//   1) pg_cron mensile (SEZIONE 112 di supabase_setup.sql) via pg_net, con
//      header Authorization: Bearer <secret da Supabase Vault>
//   2) dietista con profiles.is_admin=true, tramite il proprio JWT (pulsante
//      "Genera ora"/bozza in giornale.html)
//
// Setup:
//   supabase secrets set GIORNALE_CRON_SECRET=<valore da vault.decrypted_secrets, vedi SEZIONE 112>
//   (chiavi AI già configurate per le altre funzioni: GEMINI_API_KEY/GROQ_API_KEY/ANTHROPIC_API_KEY)
// Deploy:
//   supabase functions deploy generate-giornale --no-verify-jwt

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { logServerError } from '../_shared/errorLog.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })
}

const MESI_IT = ['Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno', 'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre']

// ── PubMed E-utilities ──────────────────────────────────────────────────────
const EUTILS = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils'

interface PubMedArticle {
  pmid: string
  titolo_originale: string
  rivista: string
  data_pubblicazione: string
  tipo_studio: string
  abstract: string
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// NCBI limita a 3 richieste/secondo senza API key — le due sezioni (dietetica
// e altro), ciascuna con esearch + [efetch,esummary in parallelo] (+ un
// eventuale retry esearch se la query stretta rende <3 risultati), possono
// facilmente sforare quel limite nella stessa manciata di secondi. Ritenta
// con backoff crescente sui soli 429 (rate limit), non su altri errori.
async function fetchPubMed(url: string): Promise<Response> {
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(url)
    if (res.status !== 429) return res
    await sleep(500 * (attempt + 1))
  }
  return fetch(url)
}

async function esearch(term: string, mindate: string, maxdate: string, retmax: number): Promise<string[]> {
  const url = `${EUTILS}/esearch.fcgi?db=pubmed&retmode=json&sort=relevance&datetype=pdat&mindate=${mindate}&maxdate=${maxdate}&retmax=${retmax}&term=${encodeURIComponent(term)}`
  const res = await fetchPubMed(url)
  if (!res.ok) throw new Error(`PubMed esearch error ${res.status}`)
  const data = await res.json() as { esearchresult?: { idlist?: string[] } }
  return data.esearchresult?.idlist ?? []
}

function stripTags(s: string): string {
  return s.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, ' ').trim()
}

async function efetchAbstracts(pmids: string[]): Promise<Map<string, { titolo: string; abstract: string; tipo_studio: string }>> {
  const out = new Map<string, { titolo: string; abstract: string; tipo_studio: string }>()
  if (!pmids.length) return out
  const url = `${EUTILS}/efetch.fcgi?db=pubmed&rettype=abstract&retmode=xml&id=${pmids.join(',')}`
  const res = await fetchPubMed(url)
  if (!res.ok) throw new Error(`PubMed efetch error ${res.status}`)
  const xml = await res.text()
  const blocks = xml.split('<PubmedArticle>').slice(1)
  for (const block of blocks) {
    const pmidMatch = block.match(/<PMID[^>]*>(\d+)<\/PMID>/)
    if (!pmidMatch) continue
    const pmid = pmidMatch[1]
    const titleMatch = block.match(/<ArticleTitle[^>]*>([\s\S]*?)<\/ArticleTitle>/)
    const titolo = titleMatch ? stripTags(titleMatch[1]) : ''
    const abstractMatches = [...block.matchAll(/<AbstractText[^>]*>([\s\S]*?)<\/AbstractText>/g)]
    const abstract = abstractMatches.map(m => stripTags(m[1])).join(' ')
    const pubTypeMatches = [...block.matchAll(/<PublicationType[^>]*>([\s\S]*?)<\/PublicationType>/g)]
    const tipo_studio = pubTypeMatches.map(m => stripTags(m[1])).filter(t => t !== 'Journal Article').join(', ')
    out.set(pmid, { titolo, abstract, tipo_studio })
  }
  return out
}

async function esummary(pmids: string[]): Promise<Map<string, { rivista: string; data_pubblicazione: string }>> {
  const out = new Map<string, { rivista: string; data_pubblicazione: string }>()
  if (!pmids.length) return out
  const url = `${EUTILS}/esummary.fcgi?db=pubmed&retmode=json&id=${pmids.join(',')}`
  const res = await fetchPubMed(url)
  if (!res.ok) throw new Error(`PubMed esummary error ${res.status}`)
  const data = await res.json() as { result?: Record<string, { fulljournalname?: string; pubdate?: string }> }
  for (const pmid of pmids) {
    const r = data.result?.[pmid]
    if (r) out.set(pmid, { rivista: r.fulljournalname || '', data_pubblicazione: r.pubdate || '' })
  }
  return out
}

// Cerca su PubMed; se la query ristretta (con filtro tipo-studio) rende meno
// di 3 risultati per il mese in questione, riprova senza quel filtro invece
// di pubblicare una sezione vuota o quasi.
async function fetchPubMedArticles(term: string, mindate: string, maxdate: string, retmax: number): Promise<PubMedArticle[]> {
  let pmids = await esearch(term, mindate, maxdate, retmax)
  if (pmids.length < 3) {
    const broadTerm = term.replace(/ AND \([^)]*Publication Type[^)]*\)/i, '')
    if (broadTerm !== term) pmids = await esearch(broadTerm, mindate, maxdate, retmax)
  }
  if (!pmids.length) return []
  const [abstracts, summaries] = await Promise.all([efetchAbstracts(pmids), esummary(pmids)])
  return pmids
    .map(pmid => {
      const a = abstracts.get(pmid)
      const s = summaries.get(pmid)
      return {
        pmid,
        titolo_originale: a?.titolo || '',
        rivista: s?.rivista || '',
        data_pubblicazione: s?.data_pubblicazione || '',
        tipo_studio: a?.tipo_studio || '',
        abstract: a?.abstract || '',
      }
    })
    .filter(a => a.abstract && a.titolo_originale) // scarta voci senza contenuto reale da riassumere
}

// ── Riassunto AI (SOLO organizzazione/traduzione del testo reale fornito) ──
const SUMMARY_PROMPT_HEADER = `Sei un redattore scientifico che scrive per "Il Giornale del Dietista", una rassegna mensile per professionisti della nutrizione. Ti fornisco una lista di studi scientifici REALI (titolo, rivista, data, tipo di studio, abstract) recuperati da PubMed/MEDLINE.

Per OGNI studio della lista, in italiano:
1. "titolo_it": traduci il titolo fedelmente (non reinterpretare, non aggiungere).
2. "riassunto": 3-5 frasi che riassumono SOLO obiettivo, metodo e risultato principale COME SCRITTI nell'abstract fornito. Vietato aggiungere numeri, percentuali, nomi di prodotti o conclusioni non presenti nel testo fornito.
3. "rilevanza_clinica": 1-2 frasi su perché può interessare un dietista, basate SOLO su quanto affermato nello studio stesso — non dare tu consigli clinici.

REGOLE ASSOLUTE:
- Se l'abstract fornito e' troppo corto o poco informativo, scrivi in "riassunto" testualmente: "Abstract non sufficiente per un riassunto dettagliato - consulta lo studio originale al link." invece di inventare contenuto.
- Non citare MAI studi che non sono nella lista fornita, non inventare PMID.
- Rispondi SOLO con un array JSON valido (nessun testo prima o dopo), un oggetto per studio, STESSO ORDINE della lista, con anche il campo "pmid" (invariato) per l'abbinamento.

STUDI:
`

function buildSummaryPrompt(articles: PubMedArticle[]): string {
  const list = articles.map(a =>
    `PMID ${a.pmid} | ${a.rivista} | ${a.data_pubblicazione} | ${a.tipo_studio}\nTitolo: ${a.titolo_originale}\nAbstract: ${a.abstract.slice(0, 3000)}`
  ).join('\n\n---\n\n')
  return SUMMARY_PROMPT_HEADER + list
}

async function callGemini(prompt: string): Promise<string> {
  const key = Deno.env.get('GEMINI_API_KEY')
  if (!key) throw new Error('GEMINI_API_KEY non configurata')
  // Google ha sostituito le vecchie chiavi "AIza" (Standard key, passate via
  // ?key= in query string) con le nuove "auth key" (prefisso "AQ."), che
  // vanno passate come header x-goog-api-key — le richieste con ?key= su una
  // auth key falliscono con un errore generico "Expected OAuth 2 access
  // token...". Le Standard key sono rifiutate del tutto da settembre 2026.
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent`
  const body = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { maxOutputTokens: 4096, responseMimeType: 'application/json' },
  }
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key }, body: JSON.stringify(body) })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error((err as { error?: { message?: string } })?.error?.message || `Gemini error ${res.status}`)
  }
  const data = await res.json() as { candidates?: { content?: { parts?: { text?: string }[] } }[] }
  return data.candidates?.[0]?.content?.parts?.[0]?.text || ''
}

async function callGroq(prompt: string): Promise<string> {
  const key = Deno.env.get('GROQ_API_KEY')
  if (!key) throw new Error('GROQ_API_KEY non configurata')
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: 'meta-llama/llama-4-scout-17b-16e-instruct',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 4096,
      temperature: 0.15,
    }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error((err as { error?: { message?: string } })?.error?.message || `Groq error ${res.status}`)
  }
  const data = await res.json() as { choices?: { message?: { content?: string } }[] }
  return data.choices?.[0]?.message?.content || ''
}

async function callClaude(prompt: string): Promise<string> {
  const key = Deno.env.get('ANTHROPIC_API_KEY')
  if (!key) throw new Error('ANTHROPIC_API_KEY non configurata')
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 4096,
      messages: [{ role: 'user', content: prompt }],
    }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error((err as { error?: { message?: string } })?.error?.message || `Claude error ${res.status}`)
  }
  const data = await res.json() as { content?: { text?: string }[] }
  return data.content?.[0]?.text || ''
}

async function summarizeArticles(articles: PubMedArticle[]): Promise<{ items: Record<string, unknown>[]; provider: string }> {
  if (!articles.length) return { items: [], provider: '' }
  const prompt = buildSummaryPrompt(articles)

  const hasGemini = !!Deno.env.get('GEMINI_API_KEY')
  const hasGroq = !!Deno.env.get('GROQ_API_KEY')
  const hasClaude = !!Deno.env.get('ANTHROPIC_API_KEY')
  const providers: Array<[string, () => Promise<string>]> = []
  if (hasGemini) providers.push(['gemini', () => callGemini(prompt)])
  if (hasGroq) providers.push(['groq', () => callGroq(prompt)])
  if (hasClaude) providers.push(['claude', () => callClaude(prompt)])
  if (!providers.length) throw new Error('Nessuna chiave AI configurata (GEMINI_API_KEY/GROQ_API_KEY/ANTHROPIC_API_KEY)')

  let text = ''
  let usedProvider = ''
  let lastError = ''
  for (const [name, call] of providers) {
    try {
      text = await call()
      if (text) { usedProvider = name; break }
      lastError = 'Risposta AI vuota'
    } catch (e) { lastError = (e as Error).message }
  }
  if (!text) throw new Error(lastError || 'Errore AI: tutti i provider hanno fallito')

  const match = text.match(/\[[\s\S]*\]/)
  if (!match) throw new Error('Risposta AI non in formato JSON valido')
  const parsed = JSON.parse(match[0]) as Record<string, unknown>[]

  // Ogni campo oggettivo (titolo originale, rivista, data, url) viene preso
  // SEMPRE dai dati PubMed recuperati da noi, mai dall'output dell'AI — e un
  // pmid restituito dall'AI ma non presente nella lista fornita viene scartato
  // per intero: garanzia strutturale che non finisca in pagina uno studio che
  // l'AI ha inventato invece di riassumere.
  const byPmid = new Map(articles.map(a => [a.pmid, a]))
  const items = parsed
    .map(p => {
      const pmid = String((p as { pmid?: unknown }).pmid ?? '')
      const src = byPmid.get(pmid)
      if (!src) return null
      return {
        pmid,
        titolo_originale: src.titolo_originale,
        titolo_it: (p as { titolo_it?: string }).titolo_it || src.titolo_originale,
        rivista: src.rivista,
        data_pubblicazione: src.data_pubblicazione,
        tipo_studio: src.tipo_studio,
        url: `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`,
        riassunto: (p as { riassunto?: string }).riassunto || '',
        rilevanza_clinica: (p as { rilevanza_clinica?: string }).rilevanza_clinica || '',
      }
    })
    .filter((x): x is Record<string, unknown> => x !== null)

  return { items, provider: usedProvider }
}

// ── Query PubMed per le due sezioni ─────────────────────────────────────────
const TERM_DIETETICA = '(dietary supplements[MeSH Terms] OR nutrition therapy[MeSH Terms] OR "diet therapy"[MeSH Terms] OR supplement*[Title] OR nutraceutical*[Title/Abstract]) AND (Randomized Controlled Trial[Publication Type] OR Meta-Analysis[Publication Type] OR Systematic Review[Publication Type] OR Practice Guideline[Publication Type])'
const TERM_ALTRO = '("N Engl J Med"[Journal] OR "Lancet"[Journal] OR "JAMA"[Journal] OR "BMJ"[Journal] OR "Nat Med"[Journal]) AND (Randomized Controlled Trial[Publication Type] OR Meta-Analysis[Publication Type] OR Practice Guideline[Publication Type])'

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
  const serviceKey = Deno.env.get('SB_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  const sbService = createClient(supabaseUrl, serviceKey)

  // ── Auth: secret di cron OPPURE dietista admin ──
  const cronSecret = Deno.env.get('GIORNALE_CRON_SECRET')
  const authHeader = req.headers.get('Authorization') || ''
  const bearer = authHeader.replace(/^Bearer\s+/i, '')

  let isAuthorized = !!cronSecret && bearer === cronSecret
  if (!isAuthorized && bearer) {
    const sbUser = createClient(
      supabaseUrl,
      Deno.env.get('SB_PUBLISHABLE_KEY') ?? Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } },
    )
    const { data: { user } } = await sbUser.auth.getUser()
    if (user) {
      const { data: profile } = await sbService.from('profiles').select('is_admin').eq('id', user.id).maybeSingle()
      isAuthorized = profile?.is_admin === true
    }
  }
  if (!isAuthorized) return json({ error: 'Non autorizzato' }, 401)

  let body: { mese?: string } = {}
  try { body = await req.json() } catch { /* body vuoto: normale per la chiamata da cron */ }

  // Mese target: quello passato esplicitamente (rigenerazione manuale) oppure
  // il mese appena concluso (default per il cron mensile e per "Genera ora").
  let mese: string
  if (body.mese && /^\d{4}-\d{2}-01$/.test(body.mese)) {
    mese = body.mese
  } else {
    const now = new Date()
    const prev = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1))
    mese = prev.toISOString().slice(0, 10)
  }
  const [y, m] = mese.split('-').map(Number)
  const mindate = `${y}/${String(m).padStart(2, '0')}/01`
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate()
  const maxdate = `${y}/${String(m).padStart(2, '0')}/${String(lastDay).padStart(2, '0')}`

  const { data: existing } = await sbService.from('giornale_numeri').select('id, stato').eq('mese', mese).maybeSingle()
  if (existing?.stato === 'pubblicato') {
    return json({ error: `Il numero di ${MESI_IT[m - 1]} ${y} è già pubblicato. Elimina la riga in giornale_numeri prima di rigenerarlo.` }, 409)
  }

  let noteGenerazione = ''
  const providerUsati = new Set<string>()
  let parteDietetica: Record<string, unknown>[] = []
  let parteAltro: Record<string, unknown>[] = []

  try {
    const articoli = await fetchPubMedArticles(TERM_DIETETICA, mindate, maxdate, 15)
    const r = await summarizeArticles(articoli.slice(0, 8))
    parteDietetica = r.items
    if (r.provider) providerUsati.add(r.provider)
    if (!parteDietetica.length) noteGenerazione += 'Nessuno studio trovato su PubMed per la parte dietetica in questo mese. '
  } catch (e) {
    noteGenerazione += `Errore parte dietetica: ${(e as Error).message}. `
  }

  try {
    const articoli = await fetchPubMedArticles(TERM_ALTRO, mindate, maxdate, 15)
    const r = await summarizeArticles(articoli.slice(0, 8))
    parteAltro = r.items
    if (r.provider) providerUsati.add(r.provider)
    if (!parteAltro.length) noteGenerazione += 'Nessuno studio trovato su PubMed per la parte medica generale in questo mese. '
  } catch (e) {
    noteGenerazione += `Errore parte altro: ${(e as Error).message}. `
  }

  // Le due sezioni possono usare provider di fallback diversi (es. dietetica
  // -> Gemini, altro -> Groq se Gemini ha fallito solo lì): il campo deve
  // riportarli entrambi, non solo l'ultimo scritto.
  const providerUsato = [...providerUsati].join(', ')

  if (!parteDietetica.length && !parteAltro.length) {
    await logServerError('generate-giornale', noteGenerazione || 'Nessun contenuto generato').catch(() => {})
    return json({ error: noteGenerazione || 'Generazione fallita: nessun contenuto prodotto.' }, 500)
  }

  const row = {
    mese,
    stato: 'bozza',
    titolo: `Il Giornale del Dietista — ${MESI_IT[m - 1]} ${y}`,
    parte_dietetica: parteDietetica,
    parte_altro: parteAltro,
    fonte_periodo_da: mese,
    fonte_periodo_a: `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`,
    provider_ai: providerUsato || null,
    note_generazione: noteGenerazione || null,
    generato_at: new Date().toISOString(),
  }

  const result = existing
    ? await sbService.from('giornale_numeri').update(row).eq('id', existing.id).select().single()
    : await sbService.from('giornale_numeri').insert(row).select().single()

  if (result.error) {
    await logServerError('generate-giornale', result.error).catch(() => {})
    return json({ error: result.error.message }, 500)
  }

  return json({ ok: true, numero: result.data })
})
