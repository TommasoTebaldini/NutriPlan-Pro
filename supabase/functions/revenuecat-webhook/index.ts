// ═══════════════════════════════════════════════════════════════
// Supabase Edge Function: revenuecat-webhook
// Riceve gli eventi RevenueCat (abbonamento Pro nell'app pazienti nativa,
// iOS/Android via StoreKit/Play Billing) e aggiorna la stessa coppia di
// colonne che stripe-webhook aggiorna per il canale web — profiles.
// subscription_plan / subscription_expires_at restano l'unica fonte di
// verità per useSubscription() lato client, indipendentemente dal canale
// di pagamento che l'ha aggiornata (SubscriptionPage.jsx nell'app pazienti
// sceglie Stripe o RevenueCat in base a Capacitor.isNativePlatform(), vedi
// src/lib/revenuecat.js in quel repo).
//
// A differenza di Stripe, qui NON serve una tabella di mapping tipo
// user_payment_credentials: l'app configura RevenueCat con
// appUserID = uid Supabase (vedi initRevenueCat), quindi event.app_user_id
// arriva già come uuid utilizzabile direttamente su profiles.id.
//
// Deploy:
//   supabase functions deploy revenuecat-webhook --no-verify-jwt
//   (--no-verify-jwt è necessario: RevenueCat manda un suo Authorization
//   header statico, non un JWT Supabase — col controllo JWT di default
//   attivo la richiesta verrebbe rifiutata prima ancora di arrivare qui)
//
// Required env vars:
//   REVENUECAT_WEBHOOK_AUTH    → stringa a scelta, la stessa va incollata
//                                 in RevenueCat → Project settings →
//                                 Integrations → Webhooks → Authorization
//                                 header value
//   SUPABASE_URL               → set automaticamente
//   SUPABASE_SERVICE_ROLE_KEY  → set automaticamente
//
// Eventi gestiti (RevenueCat li manda tutti allo stesso endpoint, il tipo
// è in event.type):
//   INITIAL_PURCHASE, RENEWAL, UNCANCELLATION, NON_RENEWING_PURCHASE,
//   PRODUCT_CHANGE  → pro fino a event.expiration_at_ms
//   EXPIRATION                                     → free, nessuna scadenza
//   CANCELLATION    → auto-rinnovo disattivato ma l'entitlement resta
//                      attivo fino alla scadenza già pagata (come quando un
//                      utente Stripe disdice ma mantiene l'accesso fino a
//                      current_period_end) — non tocca profiles, arriverà
//                      comunque un EXPIRATION quando l'accesso finisce
//                      davvero.
//   BILLING_ISSUE   → RevenueCat gestisce da solo il grace period; non
//                      tocca profiles finché non arriva EXPIRATION.
//   TEST            → usato dal pulsante "Send test event" in dashboard,
//                      risponde 200 senza fare nulla.
// ═══════════════════════════════════════════════════════════════

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { logServerError } from "../_shared/errorLog.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SB_SECRET_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

const PRO_EVENT_TYPES = new Set([
  "INITIAL_PURCHASE",
  "RENEWAL",
  "UNCANCELLATION",
  "NON_RENEWING_PURCHASE",
  "PRODUCT_CHANGE",
]);

interface RevenueCatEvent {
  type: string;
  app_user_id: string;
  entitlement_ids?: string[];
  expiration_at_ms?: number | null;
  environment?: string;
}

serve(async (req) => {
  // RevenueCat non firma il payload come Stripe (HMAC) — verifica invece
  // per uguaglianza esatta dell'Authorization header configurato in
  // dashboard. Confronto diretto va bene qui: non è un segreto derivato da
  // firmare/verificare crittograficamente, è letteralmente la stessa
  // stringa su entrambi i lati.
  const auth = req.headers.get("authorization");
  const expected = Deno.env.get("REVENUECAT_WEBHOOK_AUTH");
  if (!expected || auth !== expected) {
    return new Response("Unauthorized", { status: 401 });
  }

  let body: { event: RevenueCatEvent };
  try {
    body = await req.json();
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const event = body?.event;
  if (!event?.type) return new Response("Missing event", { status: 400 });

  console.log("RevenueCat event:", event.type, event.app_user_id);

  if (event.type === "TEST") {
    return new Response(JSON.stringify({ received: true }), { status: 200 });
  }

  const userId = event.app_user_id;
  if (!userId) {
    await logServerError("revenuecat-webhook", new Error(
      `${event.type}: evento senza app_user_id`
    )).catch(() => {});
    return new Response(JSON.stringify({ received: true }), { status: 200 });
  }

  try {
    if (PRO_EVENT_TYPES.has(event.type)) {
      // entitlement_ids dovrebbe sempre includere PRO_ENTITLEMENT_ID
      // ('pro', vedi src/lib/revenuecat.js nel repo app pazienti) se
      // l'Entitlement in dashboard RevenueCat è configurato correttamente —
      // controllo difensivo: se un domani si aggiungono altri entitlement
      // (es. una skin/feature non legata all'abbonamento) un loro evento
      // non deve promuovere l'utente a Pro per errore.
      if (event.entitlement_ids && !event.entitlement_ids.includes("pro")) {
        console.log(`${event.type}: entitlement_ids ${JSON.stringify(event.entitlement_ids)} non include 'pro', ignorato`);
      } else {
        const expiresAt = event.expiration_at_ms ? new Date(event.expiration_at_ms).toISOString() : null;
        await supabase.from("profiles").update({
          subscription_plan: "pro",
          subscription_expires_at: expiresAt,
        }).eq("id", userId);
        console.log(`User ${userId} → pro until ${expiresAt} (${event.type})`);
      }
    } else if (event.type === "EXPIRATION") {
      await supabase.from("profiles").update({
        subscription_plan: "free",
        subscription_expires_at: null,
      }).eq("id", userId);
      console.log(`User ${userId} → free (EXPIRATION)`);
    } else {
      // CANCELLATION, BILLING_ISSUE, e qualunque evento futuro non ancora
      // gestito esplicitamente: nessuna modifica a profiles, solo log.
      console.log(`${event.type}: nessuna azione su profiles per user ${userId}`);
    }
  } catch (err) {
    console.error("Handler error:", err);
    const logErr = err instanceof Error ? err : new Error(String(err));
    await logServerError("revenuecat-webhook", new Error(`[${event.type}] ${logErr.message}`)).catch(() => {});
    return new Response(`Handler Error: ${logErr.message}`, { status: 500 });
  }

  return new Response(JSON.stringify({ received: true }), {
    headers: { "Content-Type": "application/json" },
  });
});
