// api/_errorLog.js — Logging centralizzato degli errori delle funzioni server
// (Vercel) sulla stessa tabella `client_errors` già usata dal logger
// client-side in js/utils.js (vedi commento lì: "sostituto leggero di un
// servizio esterno tipo Sentry, nessun costo/account terzo"). Qui estendiamo
// la stessa filosofia al lato server, che finora non scriveva da nessuna
// parte in caso di errore — vedi Analisi Scalabilità: una Edge Function
// rimasta rotta per settimane senza che nessuno se ne accorgesse è esattamente
// il tipo di buco che questo file chiude.
//
// In più, a differenza del logger client, invia un alert email best-effort
// via Resend (stessa infrastruttura già usata da send-reset.js/cron.js) la
// prima volta che un dato errore compare in un'ora — non ad ogni occorrenza,
// per non floodare la casella su un errore ripetuto in loop.
//
// Env richieste: SUPABASE_ANON_KEY (insert pubblico via policy
// "client_errors_insert_any", nessun privilegio elevato necessario).
// Env opzionali per l'alert: RESEND_API_KEY, ADMIN_ALERT_EMAIL — se assenti,
// l'errore viene comunque loggato su client_errors, solo senza email.

const SUPABASE_URL = 'https://hvdwqowkhutfsdpiubxe.supabase.co';
const FROM_ADDRESS = 'DietPlan Pro <gestione@app.dietplan-pro.com>';

function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

async function sendAlertEmail(fnName, message) {
  const resendKey = process.env.RESEND_API_KEY;
  const to = process.env.ADMIN_ALERT_EMAIL;
  if (!resendKey || !to) return; // alert opzionale: se non configurato, si salta senza errore
  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: FROM_ADDRESS,
      to,
      subject: `⚠️ Errore server — ${fnName}`,
      html: `<p>Nuovo errore in produzione nella funzione <b>${escapeHtml(fnName)}</b>:</p>
<pre style="white-space:pre-wrap;background:#F1F5F9;padding:12px;border-radius:8px;font-size:13px">${escapeHtml(message)}</pre>
<p style="color:#6B7280;font-size:12px">Dettagli completi (stack, user agent) in Admin → Log errori. Non riceverai un'altra email per lo stesso errore nella prossima ora.</p>`,
    }),
  });
}

// Registra un errore server-side su client_errors + eventuale alert email.
// Va sempre chiamata con `.catch(() => {})` dal chiamante (o awaitata dentro
// un try/catch a parte): un logger di errori non deve mai generare altri
// errori né rallentare/bloccare la risposta all'utente.
export async function logServerError(fnName, err, req) {
  const anonKey = process.env.SUPABASE_ANON_KEY;
  if (!anonKey) return;

  const message = String(err?.message || err || 'Errore sconosciuto').slice(0, 2000);
  const stack = err?.stack ? String(err.stack).slice(0, 4000) : null;
  const headers = { apikey: anonKey, Authorization: `Bearer ${anonKey}`, 'Content-Type': 'application/json' };

  let shouldAlert = true;
  try {
    const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const qs = `select=id&app=eq.nutriplan-pro-server&page_url=eq.${encodeURIComponent(fnName)}&message=eq.${encodeURIComponent(message)}&created_at=gte.${since}&limit=1`;
    const checkRes = await fetch(`${SUPABASE_URL}/rest/v1/client_errors?${qs}`, { headers });
    if (checkRes.ok) shouldAlert = (await checkRes.json()).length === 0;
  } catch { /* best-effort: se il check di dedup fallisce, si allerta comunque */ }

  await fetch(`${SUPABASE_URL}/rest/v1/client_errors`, {
    method: 'POST',
    headers: { ...headers, Prefer: 'return=minimal' },
    body: JSON.stringify({
      app: 'nutriplan-pro-server',
      level: 'server_error',
      message,
      stack,
      page_url: fnName, // riuso della colonna "pagina" per il nome della funzione: niente URL lato server
      user_agent: req?.headers?.['user-agent'] || null,
    }),
  });

  if (shouldAlert) await sendAlertEmail(fnName, message).catch(() => {});
}

// Safety net: avvolge un handler Vercel per catturare qualunque eccezione/
// rejection non gestita esplicitamente all'interno (es. errori di rete non
// intercettati) e rispondere comunque 500 invece di far fallire la funzione
// in modo silenzioso. Non sostituisce i try/catch già presenti nei singoli
// handler — quelli vanno comunque istruiti a chiamare logServerError prima
// di rispondere, questa è solo la rete di sicurezza per ciò che sfugge.
export function withErrorLogging(fnName, handler) {
  return async function wrapped(req, res) {
    try {
      return await handler(req, res);
    } catch (err) {
      await logServerError(fnName, err, req).catch(() => {});
      if (!res.headersSent) res.status(500).json({ error: 'Errore interno del server.' });
    }
  };
}
