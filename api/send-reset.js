// api/send-reset.js — Password recovery via Resend (bypasses Supabase email)
// Env vars: SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY

const SUPABASE_URL = 'https://hvdwqowkhutfsdpiubxe.supabase.co';

// Rate limiter: max 3 reset per email ogni 15 minuti (previene spam)
const _resetRl = new Map(); // email → { n, t }
const RESET_MAX = 3;
const RESET_WIN = 15 * 60_000;

function checkResetRateLimit(email) {
  const now = Date.now();
  const e = _resetRl.get(email);
  if (!e || now - e.t > RESET_WIN) { _resetRl.set(email, { n: 1, t: now }); return true; }
  if (e.n >= RESET_MAX) return false;
  e.n++; return true;
}

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

  if (!checkResetRateLimit(email)) {
    return res.status(429).json({ error: 'Troppe richieste. Riprova tra 15 minuti.' });
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
      from: 'DietPlan Pro <gestione@app.dietplan-pro.com>',
      to: email,
      subject: 'Reimposta la tua password – DietPlan Pro',
      html: `<!DOCTYPE html>
<html lang="it">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F0FDF4;font-family:Arial,Helvetica,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F0FDF4;padding:40px 16px">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px">

        <!-- HEADER -->
        <tr><td bgcolor="#0F766E" style="background-color:#0F766E;border-radius:16px 16px 0 0;padding:32px 40px;text-align:center">
          <div style="font-size:28px;font-weight:800;color:#ffffff;letter-spacing:-0.5px">🥗 DietPlan Pro</div>
          <div style="font-size:13px;color:#ffffff;opacity:0.85;margin-top:4px">Piattaforma per dietisti professionisti</div>
        </td></tr>

        <!-- BODY -->
        <tr><td style="background:#ffffff;padding:40px;border-left:1px solid #D1FAE5;border-right:1px solid #D1FAE5;text-align:center">
          <h1 style="margin:0 0 8px;font-size:22px;color:#064E3B;font-weight:700;text-align:center">Recupero password</h1>
          <p style="margin:0 0 28px;font-size:15px;color:#374151;line-height:1.6;text-align:center">
            Abbiamo ricevuto una richiesta di reimpostazione della password per il tuo account DietPlan Pro.<br>
            Clicca sul pulsante qui sotto per scegliere una nuova password.
          </p>

          <!-- CTA BUTTON -->
          <table cellpadding="0" cellspacing="0" style="margin:0 auto 28px">
            <tr><td align="center" bgcolor="#0F766E" style="background-color:#0F766E;border-radius:10px">
              <a href="${action_link}" style="display:inline-block;padding:14px 36px;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;letter-spacing:0.2px">
                🔐 Reimposta password
              </a>
            </td></tr>
          </table>

          <!-- DIVIDER -->
          <hr style="border:none;border-top:1px solid #D1FAE5;margin:0 0 24px">

          <!-- LINK FALLBACK -->
          <p style="margin:0 0 8px;font-size:13px;color:#6B7280">Se il pulsante non funziona, copia e incolla questo link nel browser:</p>
          <p style="margin:0 0 24px;font-size:12px;color:#0F766E;word-break:break-all">${action_link}</p>

          <!-- WARNINGS -->
          <table cellpadding="0" cellspacing="0" width="100%">
            <tr><td style="background:#FEF3C7;border-left:4px solid #F59E0B;border-radius:0 8px 8px 0;padding:12px 16px">
              <p style="margin:0;font-size:13px;color:#92400E;line-height:1.5">
                ⚠️ <strong>Il link scade tra 24 ore.</strong><br>
                Se non hai richiesto il recupero password, puoi ignorare questa email — il tuo account è al sicuro.
              </p>
            </td></tr>
          </table>
        </td></tr>

        <!-- FOOTER -->
        <tr><td style="background:#F0FDF4;border:1px solid #D1FAE5;border-top:none;border-radius:0 0 16px 16px;padding:20px 40px;text-align:center">
          <p style="margin:0;font-size:12px;color:#9CA3AF;line-height:1.6">
            © ${new Date().getFullYear()} DietPlan Pro · Tutti i diritti riservati<br>
            Questa email è stata inviata automaticamente, non rispondere a questo indirizzo.
          </p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`
    })
  });

  if (!emailRes.ok) {
    const err = await emailRes.json().catch(() => ({}));
    console.error('Resend error:', err);
    return res.status(500).json({ error: 'Errore invio email. Riprova tra qualche minuto.' });
  }

  return res.status(200).json({ ok: true });
};
