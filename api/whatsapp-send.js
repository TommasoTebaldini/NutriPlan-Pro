// api/whatsapp-send.js — Invia un messaggio WhatsApp a un paziente (cartella)
// tramite l'API Meta WhatsApp Business Cloud. Vedi SEZIONE 36 di
// supabase_setup.sql per il contesto completo.
//
// Regola reale di Meta: un messaggio LIBERO (testo semplice) è consentito
// solo entro 24h dall'ultimo messaggio ricevuto dal paziente su WhatsApp
// ("finestra di servizio clienti"). Fuori da quella finestra è OBBLIGATORIO
// un messaggio "template" pre-approvato dal Business Manager — qui si usa
// il nome/lingua configurati dal dietista in Impostazioni (wa_template_name/
// wa_template_lang), passando il testo libero come primo parametro del
// template (il template va creato con un corpo tipo "{{1}}" per questo
// funzionare: personalizzare in base al template effettivamente approvato).

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://hvdwqowkhutfsdpiubxe.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const GRAPH_BASE = 'https://graph.facebook.com/v21.0';
const WINDOW_MS = 24 * 60 * 60 * 1000;

async function verifySupabaseToken(token) {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !token) return null;
  const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { Authorization: `Bearer ${token}`, apikey: SUPABASE_ANON_KEY },
  });
  if (!res.ok) return null;
  const user = await res.json();
  return user?.id ? user : null;
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

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    const user = await verifySupabaseToken(token);
    if (!user) return res.status(401).json({ error: 'Non autorizzato' });
    if (!SERVICE_ROLE_KEY) return res.status(500).json({ error: 'Configurazione server incompleta (SUPABASE_SERVICE_ROLE_KEY)' });

    const { cartella_id, testo } = req.body || {};
    const testoTrim = String(testo || '').trim();
    if (!cartella_id || !testoTrim) return res.status(400).json({ error: 'cartella_id o testo mancante' });

    const [profiles, cartelle] = await Promise.all([
      sbFetch(`profiles?id=eq.${user.id}&select=wa_phone_number_id,wa_access_token,wa_template_name,wa_template_lang`),
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
      ? (Date.now() - new Date(lastInbound[0].created_at).getTime()) < WINDOW_MS
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
    return res.status(500).json({ error: 'Errore interno: ' + e.message });
  }
}
