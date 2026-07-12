// api/cron-appointment-reminders.js — Vercel Serverless Function, invoked by Vercel Cron
// Promemoria automatico per gli appuntamenti del giorno successivo, su due
// canali INDIPENDENTI (nessuno dei due dipende dall'altro per essere inviato):
//
//   1. Notifica push al DIETISTA sul proprio dispositivo (PWA NutriPlan-Pro)
//      — aiuta a organizzare la giornata.
//   2. Notifica push al PAZIENTE sul proprio dispositivo (PWA Diet-Plan-Pro-
//      app-claude, dominio separato) — pensata per ridurre i no-show, che
//      era l'obiettivo originale di questa automazione.
//
// Nessuno dei due passa da Resend/email: mandare un'email per appuntamento,
// moltiplicata per tutti i dietisti/pazienti della piattaforma, avrebbe
// potuto significare migliaia di email/giorno al crescere della base utenti.
//
// Il canale paziente riusa un endpoint già esistente ma finora MAI chiamato
// da nessuna parte del codice (Diet-Plan-Pro-app-claude/api/send-push.js) —
// non serve alcuna nuova infrastruttura lato paziente: quell'endpoint legge
// già push_subscriptions e ha già le proprie chiavi VAPID configurate nel
// suo progetto Vercel. Qui basta chiamarlo con la stessa
// SUPABASE_SERVICE_ROLE_KEY già in uso per le query dirette (i due progetti
// condividono lo stesso Supabase, quindi lo stesso service role secret —
// verificarlo comunque su Vercel: se sono state generate chiavi diverse per
// errore, questa chiamata risponderebbe 401).
//
// Setup (una tantum):
//   1. Eseguire manualmente su Supabase: SEZIONI 20, 24, 25 di
//      supabase_setup.sql
//   2. Vercel (progetto NutriPlan-Pro) → Environment Variables:
//      - VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY (canale dietista, vedi
//        SEZIONE 24 — NON rigenerare dopo il primo setup)
//      - PATIENT_APP_URL (opzionale, default https://app.dietplan-pro.com)
//   3. Ogni dietista attiva le notifiche da Impostazioni → Notifiche e
//      Strumenti; ogni paziente le attiva dalla propria app (già presente,
//      usata oggi per farmaci/pasti/acqua/pesata).
//
// Chi non ha mai attivato le notifiche push (dietista o paziente) sul
// proprio canale semplicemente non riceve nulla per quel canale in questo
// run — nessun fallback email, per non reintrodurre il problema di volume
// che questa automazione vuole risolvere. I due canali sono tracciati con
// due colonne separate (reminder_sent_at / patient_reminder_sent_at) così
// un canale non ancora "sent" viene ritentato al prossimo run anche se
// l'altro è già andato a buon fine.

import webpush from 'web-push';

const SUPABASE_URL = 'https://hvdwqowkhutfsdpiubxe.supabase.co';
const PATIENT_APP_URL = process.env.PATIENT_APP_URL || 'https://app.dietplan-pro.com';
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

function formatGiornoOra(dateIso) {
  return new Date(dateIso).toLocaleString('it-IT', { timeZone: 'Europe/Rome', weekday: 'long', hour: '2-digit', minute: '2-digit' });
}

async function sendPatientPush(patientId, title, body, serviceKey) {
  const res = await fetch(`${PATIENT_APP_URL}/api/send-push`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${serviceKey}` },
    body: JSON.stringify({ userId: patientId, title, body, url: '/appuntamenti', tag: 'appointment-reminder' }),
  });
  if (!res.ok) throw new Error(`send-push HTTP ${res.status}: ${await res.text().catch(() => '')}`);
  return res.json();
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

    // OR: prendi un appuntamento se ALMENO UNO dei due canali non è ancora
    // stato notificato — l'altro canale, se già inviato, viene semplicemente
    // saltato più sotto grazie ai controlli su reminder_sent_at/patient_reminder_sent_at.
    const appts = await sbFetch(
      `appointments?select=id,patient_id,dietitian_id,title,appointment_date,notes,status,reminder_sent_at,patient_reminder_sent_at` +
        `&status=neq.cancelled` +
        `&or=(reminder_sent_at.is.null,patient_reminder_sent_at.is.null)` +
        `&appointment_date=gte.${now.toISOString()}&appointment_date=lte.${windowEnd.toISOString()}` +
        `&order=appointment_date.asc&limit=${MAX_APPOINTMENTS}`,
      serviceKey,
    );
    if (!appts || !appts.length) return res.status(200).json({ ok: true, checked: 0, dietitiansNotified: 0, patientsNotified: 0 });

    const userIds = [...new Set([...appts.map(a => a.patient_id), ...appts.map(a => a.dietitian_id)])];
    const profiles = await sbFetch(`profiles?select=id,first_name,last_name,full_name,nome,cognome&id=in.(${userIds.join(',')})`, serviceKey);
    const profileById = new Map(profiles.map(p => [p.id, p]));
    function displayName(id) {
      const p = profileById.get(id);
      if (!p) return 'Paziente';
      return [p.first_name, p.last_name].filter(Boolean).join(' ') || p.full_name || [p.nome, p.cognome].filter(Boolean).join(' ') || 'Paziente';
    }

    // ── Canale 1: push al dietista, raggruppata per dietista (un solo invio
    // anche con più appuntamenti nella finestra, per non spammarlo) ──
    const dietitianSentApptIds = [];
    const forDietitian = appts.filter(a => !a.reminder_sent_at);
    const byDietitian = new Map();
    for (const a of forDietitian) {
      const list = byDietitian.get(a.dietitian_id) || [];
      list.push(a);
      byDietitian.set(a.dietitian_id, list);
    }

    let dietitiansNotified = 0;
    for (const [dietitianId, list] of byDietitian) {
      const subs = await sbFetch(`dietitian_push_subscriptions?select=id,endpoint,p256dh,auth&user_id=eq.${dietitianId}`, serviceKey);
      if (!subs || !subs.length) continue; // dietista senza notifiche push attive: nessun invio

      const body = list.length === 1
        ? `${displayName(list[0].patient_id)} alle ${formatOra(list[0].appointment_date)}`
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
        dietitianSentApptIds.push(...list.map(a => a.id));
      }
    }

    // ── Canale 2: push al paziente, uno per appuntamento (riduzione no-show) ──
    const patientSentApptIds = [];
    const forPatient = appts.filter(a => !a.patient_reminder_sent_at);
    let patientsNotified = 0;
    for (const a of forPatient) {
      try {
        await sendPatientPush(
          a.patient_id,
          '📅 Promemoria appuntamento',
          `Hai un appuntamento con ${displayName(a.dietitian_id)} ${formatGiornoOra(a.appointment_date)}`,
          serviceKey,
        );
        patientsNotified++;
        patientSentApptIds.push(a.id);
      } catch {
        // best-effort: niente subscription attiva o endpoint irraggiungibile,
        // non bloccare gli altri pazienti — verrà ritentato al prossimo run
        // finché l'appuntamento resta nella finestra delle 48h.
      }
    }

    const nowIso = new Date().toISOString();
    if (dietitianSentApptIds.length) {
      await sbFetch(`appointments?id=in.(${dietitianSentApptIds.join(',')})`, serviceKey, {
        method: 'PATCH', body: JSON.stringify({ reminder_sent_at: nowIso }),
      });
    }
    if (patientSentApptIds.length) {
      await sbFetch(`appointments?id=in.(${patientSentApptIds.join(',')})`, serviceKey, {
        method: 'PATCH', body: JSON.stringify({ patient_reminder_sent_at: nowIso }),
      });
    }

    return res.status(200).json({
      ok: true, checked: appts.length,
      dietitiansNotified, dietitianAppointmentsMarkedSent: dietitianSentApptIds.length,
      patientsNotified, patientAppointmentsMarkedSent: patientSentApptIds.length,
    });
  } catch (err) {
    console.error('cron-appointment-reminders error:', err);
    return res.status(500).json({ error: 'Errore server: ' + err.message });
  }
}
