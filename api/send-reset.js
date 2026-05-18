// api/send-reset.js — Password recovery via Resend (bypasses Supabase email)
// Env vars: SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY

const SUPABASE_URL = 'https://hvdwqowkhutfsdpiubxe.supabase.co';

export default async function handler(req, res) {
  const origin = req.headers.origin || 'https://app.dietplan-pro.com';
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const RESEND_API_KEY   = process.env.RESEND_API_KEY;

  if (!SERVICE_ROLE_KEY || !RESEND_API_KEY) {
    return res.status(500).json({ error: 'Configurazione server mancante' });
  }

  let email;
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    email = body?.email?.trim().toLowerCase();
  } catch {
    return res.status(400).json({ error: 'Corpo richiesta non valido' });
  }

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Email non valida' });
  }

  const REDIRECT_URL = origin + '/';

  // Generate recovery link via Supabase Admin API
  const linkRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/generate_link`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SERVICE_ROLE_KEY,
      'Authorization': `Bearer ${SERVICE_ROLE_KEY}`
    },
    body: JSON.stringify({
      type: 'recovery',
      email,
      options: { redirect_to: REDIRECT_URL }
    })
  });

  if (!linkRes.ok) {
    const err = await linkRes.json().catch(() => ({}));
    if (linkRes.status === 404 || err?.code === 'user_not_found') {
      return res.status(200).json({ ok: true });
    }
    return res.status(500).json({ error: 'Errore generazione link' });
  }

  const { action_link } = await linkRes.json();

  // Send email via Resend
  const emailRes = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: 'DietPlan Pro <onboarding@resend.dev>',
      to: email,
      subject: 'Reimposta la tua password – DietPlan Pro',
      html: `
        <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px">
          <h2 style="color:#0F766E;margin-bottom:8px">Recupero password</h2>
          <p style="color:#374151;margin-bottom:24px">Hai richiesto di reimpostare la password per il tuo account DietPlan Pro.</p>
          <a href="${action_link}" style="display:inline-block;background:#0F766E;color:#fff;text-decoration:none;padding:12px 28px;border-radius:8px;font-weight:600;font-size:15px">
            Reimposta password
          </a>
          <p style="color:#6B7280;font-size:13px;margin-top:24px">Il link scade tra 24 ore.<br>Se non hai fatto questa richiesta, ignora questa email.</p>
        </div>
      `
    })
  });

  if (!emailRes.ok) {
    const err = await emailRes.json().catch(() => ({}));
    console.error('Resend error:', err);
    return res.status(500).json({ error: 'Errore invio email. Riprova tra qualche minuto.' });
  }

  return res.status(200).json({ ok: true });
};
