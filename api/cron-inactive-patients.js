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

const SUPABASE_URL = 'https://hvdwqowkhutfsdpiubxe.supabase.co';
const INACTIVE_DAYS = 5;
const MAX_PATIENTS = 500; // backstop: evita run troppo lunghi su installazioni enormi
const CONCURRENCY = 10;

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
  const items = rows.map(r => `<li style="margin-bottom:6px"><b>${r.name}</b> — ${r.daysAgo === null ? 'nessun log alimentare registrato' : `ultimo log ${r.daysAgo} giorni fa`}</li>`).join('');
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
    const links = await sbFetch('patient_dietitian?select=patient_id,dietitian_id,cartella_id', serviceKey);
    const limited = links.slice(0, MAX_PATIENTS);
    if (!limited.length) return res.status(200).json({ ok: true, checked: 0, inactive: 0, emailsSent: 0 });

    const cartellaIds = [...new Set(limited.map(l => l.cartella_id).filter(Boolean))];
    const dietitianIds = [...new Set(limited.map(l => l.dietitian_id))];

    const [cartelle, dietitians] = await Promise.all([
      cartellaIds.length ? sbFetch(`cartelle?select=id,nome&id=in.(${cartellaIds.join(',')})`, serviceKey) : [],
      sbFetch(`profiles?select=id,email,nome,cognome&id=in.(${dietitianIds.join(',')})`, serviceKey),
    ]);
    const cartellaById = new Map(cartelle.map(c => [c.id, c]));
    const dietitianById = new Map(dietitians.map(d => [d.id, d]));

    const cutoff = Date.now() - INACTIVE_DAYS * 24 * 60 * 60 * 1000;
    const inactiveByDietitian = new Map(); // dietitian_id → rows[]

    for (const batch of chunk(limited, CONCURRENCY)) {
      await Promise.all(batch.map(async link => {
        let lastLog;
        try {
          const logs = await sbFetch(
            `food_logs?select=created_at&user_id=eq.${link.patient_id}&order=created_at.desc&limit=1`,
            serviceKey,
          );
          lastLog = logs[0]?.created_at || null;
        } catch {
          return; // food_logs irraggiungibile per questo utente: salta, non bloccare l'intero run
        }
        const lastTs = lastLog ? new Date(lastLog).getTime() : null;
        const isInactive = lastTs === null || lastTs < cutoff;
        if (!isInactive) return;

        const daysAgo = lastTs === null ? null : Math.floor((Date.now() - lastTs) / (24 * 60 * 60 * 1000));
        const name = cartellaById.get(link.cartella_id)?.nome || 'Paziente';
        const rows = inactiveByDietitian.get(link.dietitian_id) || [];
        rows.push({ name, daysAgo });
        inactiveByDietitian.set(link.dietitian_id, rows);
      }));
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

    return res.status(200).json({
      ok: true,
      checked: limited.length,
      inactive: [...inactiveByDietitian.values()].reduce((s, r) => s + r.length, 0),
      emailsSent,
    });
  } catch (err) {
    console.error('cron-inactive-patients error:', err);
    return res.status(500).json({ error: 'Errore server: ' + err.message });
  }
}
