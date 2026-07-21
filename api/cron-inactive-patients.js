// api/cron-inactive-patients.js — Vercel Serverless Function, invoked by Vercel Cron
// Automazione follow-up: rileva pazienti senza log nel diario alimentare da
// INACTIVE_DAYS giorni e invia un'email riepilogativa al dietista (una per
// dietista, non una per paziente — evita spam se ha molti pazienti inattivi).
//
// Setup (una tantum):
//   1. vercel.json → "crons" già configurato per girare una volta al giorno
//   2. Vercel → Settings → Environment Variables:
//      - CRON_SECRET (valore a scelta, es. una stringa casuale lunga)
//        Vercel invia automaticamente questo valore come Bearer token nelle
//        richieste cron — impedisce che chiunque trovi l'URL e lo triggeri.
//      - SUPABASE_SERVICE_ROLE_KEY (già richiesta da api/send-reset.js)
//      - RESEND_API_KEY (già richiesta da api/send-reset.js)
//
// food_logs è una tabella di Diet-Plan-Pro-app-claude (non in
// supabase_setup.sql) ma vive sullo stesso progetto Supabase condiviso —
// interrogabile qui con la service role key esattamente come qualunque altra.
//
// QUESTO CRON OSPITA ANCHE IL REPORT SETTIMANALE DI ADERENZA (solo il lunedì,
// Europe/Rome): era un endpoint separato (api/cron-weekly-report.js) ma il
// piano Hobby di Vercel consente max 12 serverless function e max 2 cron per
// progetto — accorpato qui invece che pagare il Pro. Il report è una push al
// dietista (dietitian_push_subscriptions + VAPID, stessa infrastruttura del
// promemoria appuntamenti): attivi/silenti negli ultimi 7 giorni + media
// giorni di diario, con link ad analytics.html. Niente email, per la stessa
// ragione di volume documentata sotto. Richiede in più VAPID_PUBLIC_KEY /
// VAPID_PRIVATE_KEY (già configurate per i promemoria appuntamenti).

import webpush from 'web-push';

const SUPABASE_URL = 'https://hvdwqowkhutfsdpiubxe.supabase.co';
const INACTIVE_DAYS = 5;
// Backstop di sicurezza contro loop anomali, NON un cap funzionale: grazie alle
// query aggregate a blocchi il cron processa comodamente decine di migliaia di
// pazienti per run. Alzabile ancora se la base cresce.
const MAX_PATIENTS = 50000;

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function sbFetch(path, serviceKey) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
  });
  if (!res.ok) throw new Error(`Supabase REST ${path} → HTTP ${res.status}`);
  return res.json();
}

function emailHtml({ dietitianName, rows }) {
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

// ── Report settimanale di aderenza (solo lunedì) ────────────────────────────
const MAX_PATIENTS_PER_DIETITIAN = 2000; // headroom: un singolo dietista non arriva a tanti pazienti

async function runWeeklyReport(serviceKey) {
  const vapidPublic = process.env.VAPID_PUBLIC_KEY;
  const vapidPrivate = process.env.VAPID_PRIVATE_KEY;
  if (!vapidPublic || !vapidPrivate) return { skipped: 'VAPID non configurate' };
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:gestione@app.dietplan-pro.com', vapidPublic, vapidPrivate);

  // Solo i dietisti raggiungibili: quelli con almeno una subscription push.
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
    if (!patientIds.length) continue; // nessun paziente collegato: report inutile

    // Un'unica query aggregata per dietista (no N+1): giorni distinti con
    // almeno un log alimentare per paziente negli ultimi 7 giorni.
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

export default async function handler(req, res) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.authorization || '';
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: 'Non autorizzato' });
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const resendKey = process.env.RESEND_API_KEY;
  if (!serviceKey || !resendKey) {
    return res.status(500).json({ error: 'Configurazione server mancante (SUPABASE_SERVICE_ROLE_KEY/RESEND_API_KEY)' });
  }

  try {
    // Nessun cap a 500: si processano TUTTI i collegamenti (backstop alto solo
    // per sicurezza contro loop anomali). La scalabilità viene dal NON fare più
    // una query per paziente (N+1), ma poche query aggregate a blocchi sotto.
    const links = (await sbFetch('patient_dietitian?select=patient_id,dietitian_id,cartella_id', serviceKey)).slice(0, MAX_PATIENTS);
    if (!links.length) return res.status(200).json({ ok: true, checked: 0, inactive: 0, emailsSent: 0 });

    const cartellaIds = [...new Set(links.map(l => l.cartella_id).filter(Boolean))];
    const dietitianIds = [...new Set(links.map(l => l.dietitian_id))];
    const patientIds = [...new Set(links.map(l => l.patient_id).filter(Boolean))];

    // Metadati (cartelle+dietisti) richiesti a blocchi: un IN list gigante può
    // superare il limite di lunghezza URL su installazioni grandi.
    const cartellaById = new Map();
    const dietitianById = new Map();
    for (const b of chunk(cartellaIds, 150)) {
      (await sbFetch(`cartelle?select=id,nome&id=in.(${b.join(',')})`, serviceKey)).forEach(c => cartellaById.set(c.id, c));
    }
    for (const b of chunk(dietitianIds, 150)) {
      (await sbFetch(`profiles?select=id,email,nome,cognome&id=in.(${b.join(',')})`, serviceKey)).forEach(d => dietitianById.set(d.id, d));
    }

    const cutoffDate = new Date(Date.now() - INACTIVE_DAYS * 86400000).toISOString().slice(0, 10);

    // Chi ha loggato NELLA finestra (attivo) e chi ha loggato ALMENO UNA VOLTA:
    // due query per blocco di ~150 pazienti invece di una per paziente.
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

    // Un paziente è inattivo se non ha loggato nella finestra. Raggruppa per
    // dietista (una sola email per dietista, anche con molti pazienti inattivi).
    const inactiveByDietitian = new Map(); // dietitian_id → rows[]
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
            html: emailHtml({ dietitianName, rows }),
          }),
        });
        emailsSent++;
      } catch {
        // best-effort: un fallimento di invio per un dietista non deve bloccare gli altri
      }
    }

    // Report settimanale: solo il lunedì (fuso Europe/Rome, il cron gira in UTC)
    let weeklyReport = null;
    const weekday = new Date().toLocaleDateString('en-US', { timeZone: 'Europe/Rome', weekday: 'short' });
    if (weekday === 'Mon') {
      try {
        weeklyReport = await runWeeklyReport(serviceKey);
      } catch (e) {
        weeklyReport = { error: e.message }; // non deve far fallire il follow-up inattivi
      }
    }

    return res.status(200).json({
      ok: true,
      checked: links.length,
      inactive: [...inactiveByDietitian.values()].reduce((s, r) => s + r.length, 0),
      emailsSent,
      weeklyReport,
    });
  } catch (err) {
    console.error('cron-inactive-patients error:', err);
    return res.status(500).json({ error: 'Errore server: ' + err.message });
  }
}
