// supabase/functions/_shared/errorLog.ts — equivalente Deno di api/_errorLog.js
// (funzioni Vercel). Stessa tabella client_errors, stessa logica di alert
// email via Resend con dedup di un'ora. Vedi api/_errorLog.js per il contesto
// completo sul perché esiste (era il gap più concreto del logger in-house:
// nessuna copertura server-side, nessun alert).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const FROM_ADDRESS = 'DietPlan Pro <gestione@app.dietplan-pro.com>';

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

async function sendAlertEmail(fnName: string, message: string) {
  const resendKey = Deno.env.get('RESEND_API_KEY');
  const to = Deno.env.get('ADMIN_ALERT_EMAIL');
  if (!resendKey || !to) return; // alert opzionale: se non configurato, si salta senza errore
  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: FROM_ADDRESS,
      to,
      subject: `⚠️ Errore server — ${fnName}`,
      html: `<p>Nuovo errore in produzione nella Edge Function <b>${escapeHtml(fnName)}</b>:</p>
<pre style="white-space:pre-wrap;background:#F1F5F9;padding:12px;border-radius:8px;font-size:13px">${escapeHtml(message)}</pre>
<p style="color:#6B7280;font-size:12px">Dettagli completi in Admin → Log errori. Non riceverai un'altra email per lo stesso errore nella prossima ora.</p>`,
    }),
  });
}

// Registra un errore server-side su client_errors + eventuale alert email.
// Va sempre chiamata con `.catch(() => {})`: un logger di errori non deve mai
// generare altri errori né bloccare la risposta.
export async function logServerError(fnName: string, err: unknown) {
  const url = Deno.env.get('SUPABASE_URL') ?? '';
  const key = Deno.env.get('SB_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  if (!url || !key) return;
  const sb = createClient(url, key);

  const message = String((err as { message?: string })?.message ?? err ?? 'Errore sconosciuto').slice(0, 2000);
  const stack = (err as { stack?: string })?.stack ? String((err as { stack?: string }).stack).slice(0, 4000) : null;

  let shouldAlert = true;
  try {
    const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { data: existing } = await sb.from('client_errors').select('id')
      .eq('app', 'nutriplan-pro-server').eq('page_url', fnName).eq('message', message)
      .gte('created_at', since).limit(1);
    shouldAlert = !existing || existing.length === 0;
  } catch { /* best-effort: se il check di dedup fallisce, si allerta comunque */ }

  await sb.from('client_errors').insert({
    app: 'nutriplan-pro-server',
    level: 'server_error',
    message,
    stack,
    page_url: fnName, // riuso della colonna "pagina" per il nome della funzione: niente URL lato server
  });

  if (shouldAlert) await sendAlertEmail(fnName, message).catch(() => {});
}
