// supabase/functions/alert-client-error/index.ts — chiude l'ultimo buco
// dell'osservabilità "in-house" (client_errors + api/_errorLog.js +
// supabase/functions/_shared/errorLog.ts): finora solo gli errori SERVER
// (Vercel functions, Edge Functions) generavano un alert email — gli errori
// JS non gestiti lato client (window.onerror / unhandledrejection, la
// stragrande maggioranza dei bug reali su 51+43 pagine) venivano scritti
// silenziosamente su client_errors e visti solo aprendo Admin → Log errori a
// mano. Invocata da un trigger AFTER INSERT ON client_errors (vedi SEZIONE
// 126 in supabase_setup.sql) via pg_net.http_post, con lo stesso pattern di
// secret dedicato in Vault già usato da notify_on_event_webhook (SEZIONE 75)
// — mai una JWT/service key in chiaro nella definizione del trigger.
//
// Deploy: supabase functions deploy alert-client-error --no-verify-jwt
// (chiamata da pg_net con un secret custom, non un vero JWT Supabase).
// Secret da impostare dopo il deploy: CLIENT_ERROR_ALERT_TOKEN (generato da
// SEZIONE 126, va copiato da Vault), più RESEND_API_KEY/ADMIN_ALERT_EMAIL
// (già usati da _shared/errorLog.ts per gli alert server-side, se già
// configurati per quello non serve rifarlo qui).

const FROM_ADDRESS = 'DietPlan Pro <gestione@app.dietplan-pro.com>';

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

Deno.serve(async (req: Request) => {
  const expectedToken = Deno.env.get('CLIENT_ERROR_ALERT_TOKEN');
  const authHeader = req.headers.get('Authorization') || '';
  if (!expectedToken || authHeader !== `Bearer ${expectedToken}`) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 });
  }

  let body: { app?: string; level?: string; message?: string; stack?: string; page_url?: string; user_agent?: string; user_email?: string };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'invalid body' }), { status: 400 });
  }

  const resendKey = Deno.env.get('RESEND_API_KEY');
  const to = Deno.env.get('ADMIN_ALERT_EMAIL');
  // Alert best-effort: se Resend non è configurato, l'errore è comunque già
  // su client_errors (la riga che ha fatto scattare questo trigger) — qui si
  // salta silenziosamente invece di far fallire l'insert che ha invocato.
  if (!resendKey || !to) return new Response(JSON.stringify({ skipped: 'no resend config' }), { status: 200 });

  const app = body.app || '?';
  const message = String(body.message || '(nessun messaggio)').slice(0, 2000);
  const stack = body.stack ? String(body.stack).slice(0, 4000) : null;

  try {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: FROM_ADDRESS,
        to,
        subject: `⚠️ Errore client — ${app}`,
        html: `<p>Nuovo errore JS non gestito in produzione, app <b>${escapeHtml(app)}</b>:</p>
<pre style="white-space:pre-wrap;background:#F1F5F9;padding:12px;border-radius:8px;font-size:13px">${escapeHtml(message)}</pre>
${body.page_url ? `<p>Pagina: <code>${escapeHtml(body.page_url)}</code></p>` : ''}
${stack ? `<details><summary>Stack trace</summary><pre style="white-space:pre-wrap;font-size:11px">${escapeHtml(stack)}</pre></details>` : ''}
<p style="color:#6B7280;font-size:12px">Dettagli completi (user agent, utente) in Admin → Log errori. Non riceverai un'altra email per lo stesso errore nella prossima ora.</p>`,
      }),
    });
  } catch {
    // best-effort: un fallimento dell'invio email non deve mai propagarsi
  }

  return new Response(JSON.stringify({ ok: true }), { status: 200 });
});
