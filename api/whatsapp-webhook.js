// api/whatsapp-webhook.js — Webhook Meta WhatsApp Business Cloud API.
// Vedi supabase_setup.sql SEZIONE 36 per il contesto completo.
//
// Ogni dietista crea il proprio App Meta for Developers + numero WhatsApp
// Business (nessun tenant condiviso, stesso principio di FIC/Sistema TS: le
// credenziali sono sempre "porta il tuo account"). Il dietista configura sul
// portale Meta un UNICO webhook URL per il proprio App, con un query param
// che identifica la sua riga profilo:
//   https://<dominio>/api/whatsapp-webhook?dietitian_id=<uuid>
//
// GET  → verifica dell'URL richiesta da Meta (hub.challenge).
// POST → messaggi in arrivo + aggiornamenti di stato dei messaggi inviati.
//        Firma verificata con l'App Secret del dietista (wa_app_secret) via
//        HMAC-SHA256 sull'header X-Hub-Signature-256, come richiesto da Meta.

import crypto from 'node:crypto';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://hvdwqowkhutfsdpiubxe.supabase.co';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

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
  if (!res.ok) throw new Error(`Supabase REST ${path} → HTTP ${res.status}`);
  return res.status === 204 ? null : res.json();
}

// Normalizza per un confronto tollerante (spazi, prefisso "00" vs "+", ecc.)
function normalizePhone(p) {
  return String(p || '').replace(/[^\d]/g, '').replace(/^00/, '');
}

export default async function handler(req, res) {
  const dietitianId = req.query.dietitian_id;
  if (!dietitianId) return res.status(400).json({ error: 'dietitian_id mancante' });
  if (!SERVICE_ROLE_KEY) return res.status(500).json({ error: 'Configurazione server incompleta' });

  if (req.method === 'GET') {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];
    const profiles = await sbFetch(`profiles?id=eq.${dietitianId}&select=wa_webhook_verify_token`);
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

    const profiles = await sbFetch(`profiles?id=eq.${dietitianId}&select=wa_app_secret`);
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
    return res.status(200).json({ ok: true }); // Meta ripete l'invio su errore: rispondere 200 comunque per evitare loop di retry infiniti su un bug nostro
  }
}
