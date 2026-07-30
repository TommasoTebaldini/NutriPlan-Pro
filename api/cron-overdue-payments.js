// api/cron-overdue-payments.js — Vercel Serverless Function, invoked by Vercel Cron
// Promemoria push al DIETISTA per le fatture scadute e non ancora pagate
// (feature #5, seconda metà — la prima metà, i promemoria appuntamento, è
// già coperta da api/cron-appointment-reminders.js).
//
// Stessa filosofia/canale di quel cron: solo push al dietista, MAI email/SMS
// (costo per invio che crescerebbe con la base utenti — vedi commento in
// cron-appointment-reminders.js). Non avvisa il paziente: un sollecito di
// pagamento automatico al paziente andrebbe scritto con più cura del tono
// (rischio di sembrare aggressivo) — resta una scelta del dietista se e come
// contattarlo, questo cron si limita a ricordarglielo.
//
// Setup (una tantum):
//   1. Eseguire su Supabase: SEZIONE 34 di supabase_setup.sql
//   2. Registrare il cron su vercel.json (schedule giornaliera)
//   3. Riusa le stesse VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY già configurate
//      per cron-appointment-reminders.js — nessuna nuova chiave necessaria.

import webpush from 'web-push';

const SUPABASE_URL = 'https://hvdwqowkhutfsdpiubxe.supabase.co';
const MAX_FATTURE = 2000; // backstop di sicurezza, non un cap funzionale realistico
const RESEND_AFTER_DAYS = 14; // se resta scaduta a lungo, un secondo promemoria dopo N giorni di silenzio

async function sbFetch(path, serviceKey, init) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      ...(init?.body ? { 'Content-Type': 'application/json', Prefer: 'return=minimal' } : {}),
      ...init?.headers,
    },
  });
  if (!res.ok) throw new Error(`Supabase REST ${path} → HTTP ${res.status}: ${await res.text().catch(() => '')}`);
  return res.status === 204 ? null : res.json();
}

function euro(n) {
  return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(n || 0);
}

export default async function handler(req, res) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.authorization || '';
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: 'Non autorizzato' });
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const vapidPublic = process.env.VAPID_PUBLIC_KEY;
  const vapidPrivate = process.env.VAPID_PRIVATE_KEY;
  if (!serviceKey || !vapidPublic || !vapidPrivate) {
    return res.status(500).json({ error: 'Configurazione server mancante (SUPABASE_SERVICE_ROLE_KEY/VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY)' });
  }
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:gestione@app.dietplan-pro.com', vapidPublic, vapidPrivate);

  try {
    const today = new Date().toISOString().slice(0, 10);
    const resendCutoff = new Date(Date.now() - RESEND_AFTER_DAYS * 24 * 3600 * 1000).toISOString();

    // Fatture scadute, non pagate, MAI notificate oppure notificate più di
    // RESEND_AFTER_DAYS giorni fa (per non ripetere l'avviso ogni giorno).
    const fatture = await sbFetch(
      `fatture?select=id,dietitian_id,patient_name,importo,scadenza,overdue_reminder_sent_at` +
        `&stato=eq.da_pagare` +
        `&scadenza=lt.${today}` +
        `&or=(overdue_reminder_sent_at.is.null,overdue_reminder_sent_at.lt.${resendCutoff})` +
        `&order=scadenza.asc&limit=${MAX_FATTURE}`,
      serviceKey,
    );
    if (!fatture || !fatture.length) return res.status(200).json({ ok: true, checked: 0, dietitiansNotified: 0 });

    const byDietitian = new Map();
    for (const f of fatture) {
      const list = byDietitian.get(f.dietitian_id) || [];
      list.push(f);
      byDietitian.set(f.dietitian_id, list);
    }

    let dietitiansNotified = 0;
    const sentFatturaIds = [];
    for (const [dietitianId, list] of byDietitian) {
      const subs = await sbFetch(`dietitian_push_subscriptions?select=id,endpoint,p256dh,auth&user_id=eq.${dietitianId}`, serviceKey);
      if (!subs || !subs.length) continue; // dietista senza notifiche push attive: nessun invio

      const totale = list.reduce((s, f) => s + (f.importo || 0), 0);
      const body = list.length === 1
        ? `${list[0].patient_name || 'Un paziente'} — ${euro(list[0].importo)}, scaduta il ${new Date(list[0].scadenza).toLocaleDateString('it-IT')}`
        : `${list.length} fatture scadute per un totale di ${euro(totale)}`;
      const payload = JSON.stringify({
        title: list.length === 1 ? '💶 Pagamento scaduto' : `💶 ${list.length} pagamenti scaduti`,
        body,
        url: '/pagamenti.html',
      });

      let sentToAtLeastOneDevice = false;
      for (const sub of subs) {
        try {
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            payload,
          );
          sentToAtLeastOneDevice = true;
        } catch (e) {
          if (e.statusCode === 404 || e.statusCode === 410) {
            await sbFetch(`dietitian_push_subscriptions?id=eq.${sub.id}`, serviceKey, { method: 'DELETE' }).catch(() => {});
          }
        }
      }

      if (sentToAtLeastOneDevice) {
        dietitiansNotified++;
        sentFatturaIds.push(...list.map(f => f.id));
      }
    }

    if (sentFatturaIds.length) {
      await sbFetch(`fatture?id=in.(${sentFatturaIds.join(',')})`, serviceKey, {
        method: 'PATCH', body: JSON.stringify({ overdue_reminder_sent_at: new Date().toISOString() }),
      });
    }

    return res.status(200).json({ ok: true, checked: fatture.length, dietitiansNotified, fattureMarkedSent: sentFatturaIds.length });
  } catch (err) {
    console.error('cron-overdue-payments error:', err);
    return res.status(500).json({ error: 'Errore server: ' + err.message });
  }
}
