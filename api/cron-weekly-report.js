// api/cron-weekly-report.js — Vercel Serverless Function, invocata da Vercel
// Cron ogni lunedì mattina (vedi vercel.json). Report settimanale di aderenza
// per OGNI dietista che ha attivato le notifiche push (SEZIONE 24): quanti
// pazienti hanno compilato il diario negli ultimi 7 giorni, quanti sono
// completamente silenti, con link ad analytics.html per i dettagli.
//
// Canale: SOLO push al dietista (stessa infrastruttura del promemoria
// appuntamenti — dietitian_push_subscriptions + VAPID). Niente email, per la
// stessa ragione di volume documentata in cron-appointment-reminders.js: chi
// non ha attivato le push semplicemente non riceve il report.
//
// I dati letti sono di Diet-Plan-Pro-app-claude (food_logs) sullo stesso
// progetto Supabase condiviso, come già fa cron-inactive-patients.js.

import webpush from 'web-push';

const SUPABASE_URL = 'https://hvdwqowkhutfsdpiubxe.supabase.co';
const MAX_PATIENTS_PER_DIETITIAN = 500;

async function sbFetch(path, serviceKey) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
  });
  if (!res.ok) throw new Error(`Supabase REST ${path} → HTTP ${res.status}: ${await res.text().catch(() => '')}`);
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
    return res.status(500).json({ error: 'Configurazione server mancante' });
  }
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:gestione@app.dietplan-pro.com', vapidPublic, vapidPrivate);

  try {
    // Solo i dietisti raggiungibili: quelli con almeno una subscription push.
    const subsAll = await sbFetch('dietitian_push_subscriptions?select=user_id,endpoint,p256dh,auth', serviceKey);
    if (!subsAll?.length) return res.status(200).json({ ok: true, dietitians: 0, sent: 0 });
    const subsByDietitian = new Map();
    for (const s of subsAll) {
      const list = subsByDietitian.get(s.user_id) || [];
      list.push(s);
      subsByDietitian.set(s.user_id, list);
    }

    const cutoff = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
    let sent = 0;

    for (const [dietitianId, subs] of subsByDietitian) {
      const rels = await sbFetch(
        `patient_dietitian?select=patient_id&dietitian_id=eq.${dietitianId}&limit=${MAX_PATIENTS_PER_DIETITIAN}`,
        serviceKey,
      );
      const patientIds = [...new Set((rels || []).map(r => r.patient_id).filter(Boolean))];
      if (!patientIds.length) continue; // nessun paziente collegato: report inutile

      // Un'unica query aggregata per dietista (no N+1): giorni distinti con
      // almeno un log alimentare per paziente negli ultimi 7 giorni.
      const logs = await sbFetch(
        `food_logs?select=user_id,date&user_id=in.(${patientIds.join(',')})&date=gte.${cutoff}&limit=10000`,
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
          // (la pulizia avviene alla prossima ri-iscrizione del dietista).
        }
      }
      if (delivered) sent++;
    }

    return res.status(200).json({ ok: true, dietitians: subsByDietitian.size, sent });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
