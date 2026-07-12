// api/cron-appointment-reminders.js — Vercel Serverless Function, invoked by Vercel Cron
// Promemoria automatico: notifica push al DIETISTA sul proprio dispositivo
// (PWA installata) per gli appuntamenti del giorno successivo — invece di
// un'email al paziente via Resend. Scelta deliberata (vedi discussione):
// mandare un'email per appuntamento, moltiplicata per tutti i dietisti sulla
// piattaforma, avrebbe potuto significare migliaia di email/giorno al
// crescere della base utenti — scomodo e costoso su Resend. La notifica push
// non passa da nessun servizio email, un solo invio per dietista per run
// (raggruppato), e sfrutta l'infrastruttura PWA già esistente.
//
// Setup (una tantum):
//   1. Eseguire manualmente su Supabase: SEZIONE 24 di supabase_setup.sql
//      (tabella dietitian_push_subscriptions)
//   2. Vercel → Settings → Environment Variables:
//      - VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY (genera una coppia con
//        `node -e "console.log(require('web-push').generateVAPIDKeys())"`
//        — UNA SOLA VOLTA, non rigenerare più dopo che i dietisti si sono
//        iscritti: invaliderebbe tutte le subscription esistenti)
//      - VAPID_SUBJECT (opzionale, default 'mailto:gestione@app.dietplan-pro.com')
//   3. Ogni dietista deve attivare le notifiche da Impostazioni → Notifiche
//      e Strumenti (richiede un dispositivo/browser con permesso concesso —
//      su ogni dispositivo separatamente).
//
// Un dietista che non ha mai attivato le notifiche push semplicemente non
// riceve nulla per questo run — nessun fallback email, per non reintrodurre
// il problema di volume che questa modifica vuole risolvere.

import webpush from 'web-push';

const SUPABASE_URL = 'https://hvdwqowkhutfsdpiubxe.supabase.co';
const MAX_APPOINTMENTS = 1000; // backstop: evita run troppo lunghi su installazioni enormi

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

function formatOra(dateIso) {
  return new Date(dateIso).toLocaleString('it-IT', { timeZone: 'Europe/Rome', hour: '2-digit', minute: '2-digit' });
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
    const now = new Date();
    const windowEnd = new Date(now.getTime() + 48 * 60 * 60 * 1000);

    const appts = await sbFetch(
      `appointments?select=id,patient_id,dietitian_id,title,appointment_date,notes,status,reminder_sent_at` +
        `&status=neq.cancelled&reminder_sent_at=is.null` +
        `&appointment_date=gte.${now.toISOString()}&appointment_date=lte.${windowEnd.toISOString()}` +
        `&order=appointment_date.asc&limit=${MAX_APPOINTMENTS}`,
      serviceKey,
    );
    if (!appts || !appts.length) return res.status(200).json({ ok: true, checked: 0, dietitiansNotified: 0 });

    const byDietitian = new Map();
    for (const a of appts) {
      const list = byDietitian.get(a.dietitian_id) || [];
      list.push(a);
      byDietitian.set(a.dietitian_id, list);
    }

    const patientIds = [...new Set(appts.map(a => a.patient_id))];
    const profiles = await sbFetch(`profiles?select=id,first_name,last_name,full_name,nome,cognome&id=in.(${patientIds.join(',')})`, serviceKey);
    const profileById = new Map(profiles.map(p => [p.id, p]));
    function displayName(p) {
      if (!p) return 'Paziente';
      return [p.first_name, p.last_name].filter(Boolean).join(' ') || p.full_name || [p.nome, p.cognome].filter(Boolean).join(' ') || 'Paziente';
    }

    let dietitiansNotified = 0;
    const sentApptIds = [];

    for (const [dietitianId, list] of byDietitian) {
      const subs = await sbFetch(`dietitian_push_subscriptions?select=id,endpoint,p256dh,auth&user_id=eq.${dietitianId}`, serviceKey);
      if (!subs || !subs.length) continue; // dietista senza notifiche push attive: nessun invio, nessun fallback email

      const body = list.length === 1
        ? `${displayName(profileById.get(list[0].patient_id))} alle ${formatOra(list[0].appointment_date)}`
        : `${list.length} appuntamenti nelle prossime ore, il primo alle ${formatOra(list[0].appointment_date)}`;
      const payload = JSON.stringify({
        title: list.length === 1 ? '📅 Promemoria appuntamento' : `📅 ${list.length} appuntamenti in arrivo`,
        body,
        url: '/agenda.html',
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
            // Subscription scaduta/revocata lato browser: ripulisci per non ritentare invano.
            await sbFetch(`dietitian_push_subscriptions?id=eq.${sub.id}`, serviceKey, { method: 'DELETE' }).catch(() => {});
          }
          // altri errori: best-effort, non bloccare gli altri dispositivi/dietisti
        }
      }

      if (sentToAtLeastOneDevice) {
        dietitiansNotified++;
        sentApptIds.push(...list.map(a => a.id));
      }
    }

    if (sentApptIds.length) {
      const nowIso = new Date().toISOString();
      await sbFetch(`appointments?id=in.(${sentApptIds.join(',')})`, serviceKey, {
        method: 'PATCH',
        body: JSON.stringify({ reminder_sent_at: nowIso }),
      });
    }

    return res.status(200).json({ ok: true, checked: appts.length, dietitiansNotified, appointmentsMarkedSent: sentApptIds.length });
  } catch (err) {
    console.error('cron-appointment-reminders error:', err);
    return res.status(500).json({ error: 'Errore server: ' + err.message });
  }
}
