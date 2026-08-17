// api/whatsapp-webhook.js — Webhook Meta WhatsApp Business Cloud API + invio
// messaggi in uscita (quest'ultimo era api/whatsapp-send.js, accorpato qui
// per restare entro il limite di 12 Serverless Function per deployment del
// piano Vercel Hobby). Vedi supabase_setup.sql SEZIONE 36 per il contesto
// completo.
//
// L'URL del webhook è registrato staticamente sul portale Meta for
// Developers da ogni dietista e NON deve mai cambiare:
//   https://<dominio>/api/whatsapp-webhook?dietitian_id=<uuid>
// L'invio in uscita usa invece ?action=send, distinguibile perché Meta non
// aggiunge mai quel parametro alle proprie chiamate (solo dietitian_id +
// i parametri hub.* in verifica GET).
//
// GET  (senza action)     → verifica dell'URL richiesta da Meta (hub.challenge).
// POST (senza action)     → messaggi in arrivo + aggiornamenti di stato,
//                            firma verificata via HMAC-SHA256 sul corpo grezzo
//                            (X-Hub-Signature-256), come richiesto da Meta.
// POST ?action=send       → invia un messaggio a un paziente (chiamato dal
//                            nostro stesso client, whatsapp.html), autenticato
//                            con il JWT Supabase del dietista invece che HMAC.
//
// bodyParser è disattivato per l'intero file (serve il corpo grezzo per la
// verifica HMAC del webhook): anche il ramo ?action=send legge e fa il parse
// del corpo a mano, invece di usare req.body.

import crypto from 'node:crypto';
import { withErrorLogging, logServerError } from './_errorLog.js';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://hvdwqowkhutfsdpiubxe.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const GRAPH_BASE = 'https://graph.facebook.com/v21.0';
const SEND_WINDOW_MS = 24 * 60 * 60 * 1000;

export const config = {
  api: { bodyParser: false }, // serve il corpo grezzo per la verifica HMAC
};

async function readRawBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks);
}

async function sbFetch(path, init) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      ...(init?.body ? { 'Content-Type': 'application/json', Prefer: 'return=minimal' } : {}),
      ...init?.headers,
    },
  });
  if (!res.ok) throw new Error(`Supabase REST ${path} → HTTP ${res.status}: ${await res.text().catch(() => '')}`);
  return res.status === 204 ? null : res.json();
}

// Normalizza per un confronto tollerante (spazi, prefisso "00" vs "+", ecc.)
function normalizePhone(p) {
  return String(p || '').replace(/[^\d]/g, '').replace(/^00/, '');
}

// ═══════════════════════════════════════════════════════════════════════════
// ?action=send — invia un messaggio WhatsApp a un paziente (cartella) tramite
// l'API Meta WhatsApp Business Cloud (ex api/whatsapp-send.js).
//
// Regola reale di Meta: un messaggio LIBERO (testo semplice) è consentito
// solo entro 24h dall'ultimo messaggio ricevuto dal paziente su WhatsApp
// ("finestra di servizio clienti"). Fuori da quella finestra è OBBLIGATORIO
// un messaggio "template" pre-approvato dal Business Manager.
// ═══════════════════════════════════════════════════════════════════════════
async function verifySupabaseTokenForSend(token) {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !token) return null;
  const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { Authorization: `Bearer ${token}`, apikey: SUPABASE_ANON_KEY },
  });
  if (!res.ok) return null;
  const user = await res.json();
  return user?.id ? user : null;
}

async function handleSend(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    const user = await verifySupabaseTokenForSend(token);
    if (!user) return res.status(401).json({ error: 'Non autorizzato' });
    if (!SERVICE_ROLE_KEY) return res.status(500).json({ error: 'Configurazione server incompleta (SUPABASE_SERVICE_ROLE_KEY)' });

    const raw = await readRawBody(req);
    let body = {};
    try { body = JSON.parse(raw.toString('utf8') || '{}'); } catch { /* body malformato → validato sotto come mancante */ }
    const { cartella_id, testo } = body;
    const testoTrim = String(testo || '').trim();
    if (!cartella_id || !testoTrim) return res.status(400).json({ error: 'cartella_id o testo mancante' });

    const [profiles, cartelle] = await Promise.all([
      sbFetch(`dietitian_credentials?id=eq.${user.id}&select=wa_phone_number_id,wa_access_token,wa_template_name,wa_template_lang`),
      sbFetch(`cartelle?id=eq.${cartella_id}&user_id=eq.${user.id}&select=id,telefono`),
    ]);
    const prof = profiles?.[0];
    const cart = cartelle?.[0];

    if (!cart) return res.status(404).json({ error: 'Paziente non trovato' });
    if (!cart.telefono) return res.status(400).json({ error: 'Nessun numero di telefono su questo paziente — aggiungilo nella scheda paziente.' });
    if (!prof?.wa_phone_number_id || !prof?.wa_access_token) {
      return res.status(400).json({ error: 'Collega WhatsApp Business in Impostazioni → WhatsApp Business.' });
    }

    const waPhone = cart.telefono.replace(/[^\d+]/g, '');

    const lastInbound = await sbFetch(
      `whatsapp_messages?dietitian_id=eq.${user.id}&wa_phone=eq.${encodeURIComponent(waPhone)}&direction=eq.in&order=created_at.desc&limit=1&select=created_at`
    );
    const withinWindow = lastInbound?.[0]?.created_at
      ? (Date.now() - new Date(lastInbound[0].created_at).getTime()) < SEND_WINDOW_MS
      : false;

    let graphBody;
    if (withinWindow) {
      graphBody = {
        messaging_product: 'whatsapp', to: waPhone, type: 'text',
        text: { body: testoTrim.slice(0, 4096) },
      };
    } else {
      if (!prof.wa_template_name) {
        return res.status(400).json({
          error: 'Sono passate più di 24h dall\'ultimo messaggio del paziente: serve un template WhatsApp approvato. Configuralo in Impostazioni → WhatsApp Business.',
        });
      }
      graphBody = {
        messaging_product: 'whatsapp', to: waPhone, type: 'template',
        template: {
          name: prof.wa_template_name,
          language: { code: prof.wa_template_lang || 'it' },
          components: [{ type: 'body', parameters: [{ type: 'text', text: testoTrim.slice(0, 1024) }] }],
        },
      };
    }

    const waRes = await fetch(`${GRAPH_BASE}/${prof.wa_phone_number_id}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${prof.wa_access_token}` },
      body: JSON.stringify(graphBody),
    });
    const waBody = await waRes.json().catch(() => ({}));
    if (!waRes.ok) {
      return res.status(502).json({ error: 'Invio WhatsApp fallito: ' + (waBody?.error?.message || waRes.status) });
    }

    const waMessageId = waBody?.messages?.[0]?.id || null;
    await sbFetch('whatsapp_messages', {
      method: 'POST',
      body: JSON.stringify({
        dietitian_id: user.id, cartella_id, wa_phone: waPhone, direction: 'out',
        body: testoTrim, wa_message_id: waMessageId, status: 'sent',
      }),
    });

    return res.status(200).json({ ok: true, mode: withinWindow ? 'text' : 'template', wa_message_id: waMessageId });
  } catch (e) {
    await logServerError('whatsapp-webhook:send', e, req).catch(() => {});
    return res.status(500).json({ error: 'Errore interno: ' + e.message });
  }
}

// ═══════════════════════════════════════════════════════════════════════════
async function handler(req, res) {
  if (req.query.action === 'send') return handleSend(req, res);

  const dietitianId = req.query.dietitian_id;
  if (!dietitianId) return res.status(400).json({ error: 'dietitian_id mancante' });
  if (!SERVICE_ROLE_KEY) return res.status(500).json({ error: 'Configurazione server incompleta' });

  if (req.method === 'GET') {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];
    const profiles = await sbFetch(`dietitian_credentials?id=eq.${dietitianId}&select=wa_webhook_verify_token`);
    const expected = profiles?.[0]?.wa_webhook_verify_token;
    if (mode === 'subscribe' && expected && token === expected) {
      res.setHeader('Content-Type', 'text/plain');
      return res.status(200).send(String(challenge || ''));
    }
    return res.status(403).json({ error: 'Verifica fallita' });
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const raw = await readRawBody(req);

    const profiles = await sbFetch(`dietitian_credentials?id=eq.${dietitianId}&select=wa_app_secret`);
    const appSecret = profiles?.[0]?.wa_app_secret;
    if (appSecret) {
      const signature = req.headers['x-hub-signature-256'] || '';
      const expectedSig = 'sha256=' + crypto.createHmac('sha256', appSecret).update(raw).digest('hex');
      const sigBuf = Buffer.from(signature);
      const expBuf = Buffer.from(expectedSig);
      if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
        return res.status(401).json({ error: 'Firma non valida' });
      }
    }
    // Se wa_app_secret non è configurato, la richiesta viene comunque accettata
    // (per non bloccare il setup iniziale) ma senza garanzia di autenticità —
    // consigliato impostarlo appena creato l'App Meta.

    const body = JSON.parse(raw.toString('utf8') || '{}');
    const changes = (body.entry || []).flatMap(e => e.changes || []);

    for (const change of changes) {
      const value = change.value || {};

      for (const msg of value.messages || []) {
        const wa_phone = msg.from;
        const bodyText = msg.text?.body || (msg.type ? `[${msg.type}]` : null);
        let cartella_id = null;
        try {
          const norm = normalizePhone(wa_phone);
          const matches = await sbFetch(`cartelle?user_id=eq.${dietitianId}&telefono=not.is.null&select=id,telefono`);
          const found = (matches || []).find(c => normalizePhone(c.telefono).endsWith(norm.slice(-9)));
          cartella_id = found?.id || null;
        } catch { /* matching best-effort, non bloccante */ }

        await sbFetch('whatsapp_messages', {
          method: 'POST',
          body: JSON.stringify({
            dietitian_id: dietitianId, cartella_id, wa_phone, direction: 'in',
            body: bodyText, wa_message_id: msg.id,
          }),
        });
      }

      for (const status of value.statuses || []) {
        if (!status.id) continue;
        await sbFetch(`whatsapp_messages?wa_message_id=eq.${status.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ status: status.status }),
        }).catch(() => {}); // può non trovare la riga se non ancora scritta, non bloccante
      }
    }

    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error('whatsapp-webhook error:', e);
    await logServerError('whatsapp-webhook', e, req).catch(() => {});
    return res.status(200).json({ ok: true }); // Meta ripete l'invio su errore: rispondere 200 comunque per evitare loop di retry infiniti su un bug nostro
  }
}

export default withErrorLogging('whatsapp-webhook', handler);
