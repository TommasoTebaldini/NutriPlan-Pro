// api/cron.js — Vercel Serverless Function, invoked by Vercel Cron
// Consolida i 3 job giornalieri (pazienti inattivi + report settimanale,
// promemoria appuntamenti, pagamenti scaduti — prima ciascuno in un proprio
// file api/cron-*.js) in UN SOLO file. Il piano Hobby di Vercel consente al
// massimo 12 Serverless Function per deployment, e ogni file distinto sotto
// api/ ne conta una: il progetto ne aveva 18 e i deploy fallivano con
// "exceeded_serverless_functions_per_deployment" (già un problema noto in
// passato: cron-weekly-report.js era stato accorpato qui dentro per lo
// stesso motivo, vedi commento sul job inactive-patients sotto).
//
// I 3 job restano schedulati separatamente agli stessi orari di prima in
// vercel.json — ciascuna entry cron passa un diverso ?job=... in modo che
// QUESTO file sappia quale eseguire. Nessuna logica interna dei job è stata
// modificata rispetto ai file originali (cron-inactive-patients.js,
// cron-appointment-reminders.js, cron-overdue-payments.js), solo spostata
// da "export default handler" a una funzione dedicata per job.

import webpush from 'web-push';

const SUPABASE_URL = 'https://hvdwqowkhutfsdpiubxe.supabase.co';
const PATIENT_APP_URL = process.env.PATIENT_APP_URL || 'https://app.dietplan-pro.com';

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

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function ensureVapid(serviceKey, vapidPublic, vapidPrivate) {
  if (!serviceKey || !vapidPublic || !vapidPrivate) {
    throw new Error('Configurazione server mancante (SUPABASE_SERVICE_ROLE_KEY/VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY)');
  }
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:gestione@app.dietplan-pro.com', vapidPublic, vapidPrivate);
}

// ═══════════════════════════════════════════════════════════════════════════
// JOB: inactive-patients — rileva pazienti senza log nel diario alimentare da
// INACTIVE_DAYS giorni e invia un'email riepilogativa al dietista (una per
// dietista, non una per paziente). Ospita anche il report settimanale di
// aderenza (solo il lunedì, Europe/Rome): era un cron a parte
// (cron-weekly-report.js) già accorpato qui in una sessione precedente per
// lo stesso motivo di limite funzioni del piano Hobby.
// ═══════════════════════════════════════════════════════════════════════════
const INACTIVE_DAYS = 5;
const MAX_PATIENTS = 50000;
const MAX_PATIENTS_PER_DIETITIAN = 2000;

function inactivePatientsEmailHtml({ dietitianName, rows }) {
  const items = rows.map(r => `<li style="margin-bottom:6px"><b>${r.name}</b> — ${r.everLogged ? `nessun diario negli ultimi ${INACTIVE_DAYS} giorni` : 'nessun diario ancora registrato'}</li>`).join('');
  return `<!DOCTYPE html>
<html lang="it">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F0FDF4;font-family:Arial,Helvetica,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F0FDF4;padding:40px 16px">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px">
        <tr><td bgcolor="#0F766E" style="background-color:#0F766E;border-radius:16px 16px 0 0;padding:32px 40px;text-align:center">
          <div style="font-size:28px;font-weight:800;color:#ffffff;letter-spacing:-0.5px">🥗 DietPlan Pro</div>
          <div style="font-size:13px;color:#ffffff;opacity:0.85;margin-top:4px">Piattaforma per dietisti professionisti</div>
        </td></tr>
        <tr><td style="background:#ffffff;padding:40px;border-left:1px solid #D1FAE5;border-right:1px solid #D1FAE5">
          <h1 style="margin:0 0 8px;font-size:20px;color:#064E3B;font-weight:700">Pazienti da ricontattare</h1>
          <p style="margin:0 0 20px;font-size:14px;color:#374151;line-height:1.6">
            Ciao ${dietitianName}, questi pazienti non registrano nel diario alimentare da almeno ${INACTIVE_DAYS} giorni:
          </p>
          <ul style="margin:0 0 24px;padding-left:20px;font-size:14px;color:#374151;line-height:1.7">${items}</ul>
          <p style="margin:0;font-size:12px;color:#94A3B8">Email automatica giornaliera — nessuna azione richiesta se non vuoi ricontattarli.</p>
        </td></tr>
        <tr><td style="background:#F8FAFC;border-radius:0 0 16px 16px;padding:20px 40px;text-align:center;border:1px solid #D1FAE5;border-top:none">
          <p style="margin:0;font-size:11px;color:#94A3B8">DietPlan Pro</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

async function runWeeklyReport(serviceKey) {
  const vapidPublic = process.env.VAPID_PUBLIC_KEY;
  const vapidPrivate = process.env.VAPID_PRIVATE_KEY;
  if (!vapidPublic || !vapidPrivate) return { skipped: 'VAPID non configurate' };
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:gestione@app.dietplan-pro.com', vapidPublic, vapidPrivate);

  const subsAll = await sbFetch('dietitian_push_subscriptions?select=user_id,endpoint,p256dh,auth', serviceKey);
  if (!subsAll?.length) return { dietitians: 0, sent: 0 };
  const subsByDietitian = new Map();
  for (const s of subsAll) {
    const list = subsByDietitian.get(s.user_id) || [];
    list.push(s);
    subsByDietitian.set(s.user_id, list);
  }

  const cutoffDate = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
  let sent = 0;

  for (const [dietitianId, subs] of subsByDietitian) {
    const rels = await sbFetch(
      `patient_dietitian?select=patient_id&dietitian_id=eq.${dietitianId}&limit=${MAX_PATIENTS_PER_DIETITIAN}`,
      serviceKey,
    );
    const patientIds = [...new Set((rels || []).map(r => r.patient_id).filter(Boolean))];
    if (!patientIds.length) continue;

    const logs = await sbFetch(
      `food_logs?select=user_id,date&user_id=in.(${patientIds.join(',')})&date=gte.${cutoffDate}&limit=10000`,
      serviceKey,
    );
    const daysByPatient = new Map();
    for (const l of logs || []) {
      if (!daysByPatient.has(l.user_id)) daysByPatient.set(l.user_id, new Set());
      daysByPatient.get(l.user_id).add(l.date);
    }
    const active = patientIds.filter(id => (daysByPatient.get(id)?.size || 0) >= 1).length;
    const silent = patientIds.length - active;
    const avgDays = patientIds.length
      ? Math.round(patientIds.reduce((s, id) => s + (daysByPatient.get(id)?.size || 0), 0) / patientIds.length * 10) / 10
      : 0;

    const payload = JSON.stringify({
      title: '📊 Report settimanale pazienti',
      body: `${active}/${patientIds.length} pazienti attivi negli ultimi 7 giorni` +
        (silent ? ` — ${silent} senza alcun diario` : ' — nessun paziente silente 🎉') +
        `. Media: ${avgDays} giorni di diario/paziente.`,
      url: '/analytics.html',
    });

    let delivered = false;
    for (const sub of subs) {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload,
        );
        delivered = true;
      } catch {
        // 404/410 = subscription scaduta/revocata: best-effort, si ignora
      }
    }
    if (delivered) sent++;
  }

  return { dietitians: subsByDietitian.size, sent };
}

async function jobInactivePatients() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const resendKey = process.env.RESEND_API_KEY;
  if (!serviceKey || !resendKey) {
    throw new Error('Configurazione server mancante (SUPABASE_SERVICE_ROLE_KEY/RESEND_API_KEY)');
  }

  const links = (await sbFetch('patient_dietitian?select=patient_id,dietitian_id,cartella_id', serviceKey)).slice(0, MAX_PATIENTS);
  if (!links.length) return { ok: true, checked: 0, inactive: 0, emailsSent: 0 };

  const cartellaIds = [...new Set(links.map(l => l.cartella_id).filter(Boolean))];
  const dietitianIds = [...new Set(links.map(l => l.dietitian_id))];
  const patientIds = [...new Set(links.map(l => l.patient_id).filter(Boolean))];

  const cartellaById = new Map();
  const dietitianById = new Map();
  for (const b of chunk(cartellaIds, 150)) {
    (await sbFetch(`cartelle?select=id,nome&id=in.(${b.join(',')})`, serviceKey)).forEach(c => cartellaById.set(c.id, c));
  }
  for (const b of chunk(dietitianIds, 150)) {
    (await sbFetch(`profiles?select=id,email,nome,cognome&id=in.(${b.join(',')})`, serviceKey)).forEach(d => dietitianById.set(d.id, d));
  }

  const cutoffDate = new Date(Date.now() - INACTIVE_DAYS * 86400000).toISOString().slice(0, 10);

  const activeSet = new Set();
  const everSet = new Set();
  for (const b of chunk(patientIds, 150)) {
    const inList = b.join(',');
    const [recent, ever] = await Promise.all([
      sbFetch(`food_logs?select=user_id&user_id=in.(${inList})&date=gte.${cutoffDate}&limit=100000`, serviceKey),
      sbFetch(`food_logs?select=user_id&user_id=in.(${inList})&limit=100000`, serviceKey),
    ]);
    recent.forEach(r => activeSet.add(r.user_id));
    ever.forEach(r => everSet.add(r.user_id));
  }

  const inactiveByDietitian = new Map();
  for (const link of links) {
    if (activeSet.has(link.patient_id)) continue;
    const name = cartellaById.get(link.cartella_id)?.nome || 'Paziente';
    const rows = inactiveByDietitian.get(link.dietitian_id) || [];
    rows.push({ name, everLogged: everSet.has(link.patient_id) });
    inactiveByDietitian.set(link.dietitian_id, rows);
  }

  let emailsSent = 0;
  for (const [dietitianId, rows] of inactiveByDietitian) {
    const dietitian = dietitianById.get(dietitianId);
    if (!dietitian?.email) continue;
    const dietitianName = dietitian.nome || dietitian.email;
    try {
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: 'DietPlan Pro <gestione@app.dietplan-pro.com>',
          to: dietitian.email,
          subject: `${rows.length} paziente${rows.length === 1 ? '' : 'i'} da ricontattare – DietPlan Pro`,
          html: inactivePatientsEmailHtml({ dietitianName, rows }),
        }),
      });
      emailsSent++;
    } catch {
      // best-effort: un fallimento di invio per un dietista non deve bloccare gli altri
    }
  }

  let weeklyReport = null;
  const weekday = new Date().toLocaleDateString('en-US', { timeZone: 'Europe/Rome', weekday: 'short' });
  if (weekday === 'Mon') {
    try {
      weeklyReport = await runWeeklyReport(serviceKey);
    } catch (e) {
      weeklyReport = { error: e.message };
    }
  }

  return {
    ok: true,
    checked: links.length,
    inactive: [...inactiveByDietitian.values()].reduce((s, r) => s + r.length, 0),
    emailsSent,
    weeklyReport,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// JOB: appointment-reminders — promemoria per gli appuntamenti del giorno
// successivo, su due canali indipendenti (push dietista + push paziente).
// ═══════════════════════════════════════════════════════════════════════════
const MAX_APPOINTMENTS = 5000;

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

async function jobAppointmentReminders() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const vapidPublic = process.env.VAPID_PUBLIC_KEY;
  const vapidPrivate = process.env.VAPID_PRIVATE_KEY;
  ensureVapid(serviceKey, vapidPublic, vapidPrivate);

  const now = new Date();
  const windowEnd = new Date(now.getTime() + 48 * 60 * 60 * 1000);

  const appts = await sbFetch(
    `appointments?select=id,patient_id,dietitian_id,title,appointment_date,notes,status,reminder_sent_at,patient_reminder_sent_at` +
      `&status=neq.cancelled` +
      `&or=(reminder_sent_at.is.null,patient_reminder_sent_at.is.null)` +
      `&appointment_date=gte.${now.toISOString()}&appointment_date=lte.${windowEnd.toISOString()}` +
      `&order=appointment_date.asc&limit=${MAX_APPOINTMENTS}`,
    serviceKey,
  );
  if (!appts || !appts.length) return { ok: true, checked: 0, dietitiansNotified: 0, patientsNotified: 0 };

  const userIds = [...new Set([...appts.map(a => a.patient_id), ...appts.map(a => a.dietitian_id)])];
  const profiles = await sbFetch(`profiles?select=id,first_name,last_name,full_name,nome,cognome&id=in.(${userIds.join(',')})`, serviceKey);
  const profileById = new Map(profiles.map(p => [p.id, p]));
  function displayName(id) {
    const p = profileById.get(id);
    if (!p) return 'Paziente';
    return [p.first_name, p.last_name].filter(Boolean).join(' ') || p.full_name || [p.nome, p.cognome].filter(Boolean).join(' ') || 'Paziente';
  }

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
    if (!subs || !subs.length) continue;

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
          await sbFetch(`dietitian_push_subscriptions?id=eq.${sub.id}`, serviceKey, { method: 'DELETE' }).catch(() => {});
        }
      }
    }

    if (sentToAtLeastOneDevice) {
      dietitiansNotified++;
      dietitianSentApptIds.push(...list.map(a => a.id));
    }
  }

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
      // best-effort: verrà ritentato al prossimo run finché resta nella finestra 48h
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

  return {
    ok: true, checked: appts.length,
    dietitiansNotified, dietitianAppointmentsMarkedSent: dietitianSentApptIds.length,
    patientsNotified, patientAppointmentsMarkedSent: patientSentApptIds.length,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// JOB: overdue-payments — promemoria push al dietista per le fatture scadute
// e non ancora pagate.
// ═══════════════════════════════════════════════════════════════════════════
const MAX_FATTURE = 2000;
const RESEND_AFTER_DAYS = 14;

function euro(n) {
  return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(n || 0);
}

async function jobOverduePayments() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const vapidPublic = process.env.VAPID_PUBLIC_KEY;
  const vapidPrivate = process.env.VAPID_PRIVATE_KEY;
  ensureVapid(serviceKey, vapidPublic, vapidPrivate);

  const today = new Date().toISOString().slice(0, 10);
  const resendCutoff = new Date(Date.now() - RESEND_AFTER_DAYS * 24 * 3600 * 1000).toISOString();

  const fatture = await sbFetch(
    `fatture?select=id,dietitian_id,patient_name,importo,scadenza,overdue_reminder_sent_at` +
      `&stato=eq.da_pagare` +
      `&scadenza=lt.${today}` +
      `&or=(overdue_reminder_sent_at.is.null,overdue_reminder_sent_at.lt.${resendCutoff})` +
      `&order=scadenza.asc&limit=${MAX_FATTURE}`,
    serviceKey,
  );
  if (!fatture || !fatture.length) return { ok: true, checked: 0, dietitiansNotified: 0 };

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
    if (!subs || !subs.length) continue;

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

  return { ok: true, checked: fatture.length, dietitiansNotified, fattureMarkedSent: sentFatturaIds.length };
}

// ═══════════════════════════════════════════════════════════════════════════
export default async function handler(req, res) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.authorization || '';
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: 'Non autorizzato' });
  }

  const job = req.query.job;
  try {
    if (job === 'inactive-patients') return res.status(200).json(await jobInactivePatients());
    if (job === 'appointment-reminders') return res.status(200).json(await jobAppointmentReminders());
    if (job === 'overdue-payments') return res.status(200).json(await jobOverduePayments());
    return res.status(400).json({ error: 'Parametro ?job mancante o sconosciuto (attesi: inactive-patients, appointment-reminders, overdue-payments)' });
  } catch (err) {
    console.error(`cron (job=${job}) error:`, err);
    return res.status(500).json({ error: 'Errore server: ' + err.message });
  }
}
