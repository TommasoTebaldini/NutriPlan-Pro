// ═══════════════════════════════════════════════════════════════
// Supabase Edge Function: stripe-webhook
// Handles Stripe webhook events and updates the profiles table.
//
// Deploy: supabase functions deploy stripe-webhook
// Required env vars:
//   STRIPE_SECRET_KEY        → sk_live_...
//   STRIPE_WEBHOOK_SECRET    → whsec_...  (from Stripe Dashboard → Webhooks)
//   SUPABASE_URL             → set automatically
//   SUPABASE_SERVICE_ROLE_KEY → set automatically
//
// Stripe Webhook events to enable in Dashboard:
//   checkout.session.completed
//   checkout.session.async_payment_succeeded  (metodi di pagamento non
//     istantanei, es. bonifici/SEPA — non ancora offerti oggi, card/paypal
//     sono sincroni, ma se in futuro si aggiunge un metodo async questo
//     evento è l'unico modo di sapere che il pagamento è poi andato a buon
//     fine dopo che checkout.session.completed è arrivato con payment_status
//     ancora "unpaid")
//   checkout.session.async_payment_failed     (idem, ma pagamento fallito —
//     libera il mutex claim_fattura_checkout così il paziente può riprovare
//     subito invece di aspettare i 30 minuti di auto-espirazione)
//   customer.subscription.updated
//   customer.subscription.deleted
//   invoice.payment_failed
//   account.updated   (Stripe Connect — vedi SEZIONE 43 di supabase_setup.sql)
// ═══════════════════════════════════════════════════════════════

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@14";
import { logServerError } from "../_shared/errorLog.ts";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, { apiVersion: "2023-10-16" });

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SB_SECRET_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

// Logging errori: usa il modulo condiviso _shared/errorLog.ts (stessa tabella
// client_errors, ma con dedup di un'ora + alert email via Resend — vedi quel
// file per il contesto). Questa funzione aveva in precedenza un suo logger
// locale minimale (stesso concetto, senza alert/dedup, tag app diverso:
// "stripe-webhook" invece di "nutriplan-pro-server"); unificato qui per non
// avere due sistemi di logging paralleli nello stesso repo.

serve(async (req) => {
  const signature = req.headers.get("stripe-signature");
  const body = await req.text();

  // 1. Verify webhook signature
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature!,
      Deno.env.get("STRIPE_WEBHOOK_SECRET")!
    );
  } catch (err) {
    console.error("Webhook signature failed:", err.message);
    await logServerError("stripe-webhook", new Error("Signature verification failed: " + err.message)).catch(() => {});
    return new Response(`Webhook Error: ${err.message}`, { status: 400 });
  }

  console.log("Stripe event:", event.type);

  try {
    switch (event.type) {
      // ── Payment successful / subscription created / fattura pagata ──
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded": {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId = session.client_reference_id; // Supabase user UUID
        const subscriptionId = session.subscription as string;
        const fatturaId = session.metadata?.fattura_id;

        if (fatturaId) {
          // Pagamento diretto paziente→dietista di una singola fattura
          // (SEZIONE 43) — flusso "payment" one-time, distinto dagli
          // abbonamenti ricorrenti gestiti sotto. checkout.session.completed
          // può arrivare con payment_status ancora "unpaid" per metodi di
          // pagamento asincroni (es. bonifici) — qui accettiamo solo card/
          // paypal (sincroni), ma controlliamo comunque payment_status prima
          // di segnare la fattura come pagata: se non ancora pagato, non
          // facciamo nulla e aspettiamo async_payment_succeeded, gestito
          // sopra con lo stesso case (stessa forma di evento).
          if (session.payment_status === "paid") {
            // .eq("stato", ...) diverso da 'pagato' rende l'update idempotente:
            // se per qualunque motivo Stripe invia due volte l'evento (o due
            // sessioni concorrenti per la stessa fattura fossero comunque
            // arrivate a pagamento, vedi claim_fattura_checkout in
            // create-invoice-checkout-session), la seconda UPDATE trova 0
            // righe invece di sovrascrivere silenziosamente i dati della
            // prima transazione già registrata.
            const { data: updated } = await supabase.from("fatture").update({
              stato: "pagato",
              stripe_checkout_session_id: session.id,
              stripe_payment_intent_id: session.payment_intent as string,
              pagato_online_at: new Date().toISOString(),
              stripe_checkout_pending_at: null,
            }).eq("id", fatturaId).neq("stato", "pagato").select("id");

            if (updated && updated.length) {
              console.log(`Fattura ${fatturaId} pagata online (session ${session.id})`);
            } else {
              console.log(`Fattura ${fatturaId}: evento ${event.type} ignorato, già segnata pagata (idempotenza)`);
            }
          } else {
            console.log(`Fattura ${fatturaId}: checkout completato ma payment_status=${session.payment_status}, non ancora segnata come pagata`);
          }
        } else if (userId && subscriptionId) {
          const sub = await stripe.subscriptions.retrieve(subscriptionId);
          const expiresAt = new Date(sub.current_period_end * 1000).toISOString();

          await supabase.from("profiles").update({
            subscription_plan: "pro",
            subscription_expires_at: expiresAt,
          }).eq("id", userId);

          await supabase.from("user_payment_credentials").upsert({
            id: userId,
            stripe_customer_id: session.customer as string,
            stripe_subscription_id: subscriptionId,
          });

          console.log(`User ${userId} → pro until ${expiresAt}`);
        }
        break;
      }

      // ── Pagamento fattura fallito dopo un metodo asincrono (bonifico/SEPA)
      // ── libera subito il mutex claim_fattura_checkout invece di lasciare
      // il paziente bloccato fino all'auto-espirazione dei 30 minuti.
      case "checkout.session.async_payment_failed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const fatturaId = session.metadata?.fattura_id;
        if (fatturaId) {
          await supabase.from("fatture").update({ stripe_checkout_pending_at: null })
            .eq("id", fatturaId).neq("stato", "pagato");
          console.log(`Fattura ${fatturaId}: pagamento asincrono fallito, checkout sbloccato per un nuovo tentativo`);
        }
        break;
      }

      // ── Stripe Connect: stato onboarding del dietista aggiornato ──
      case "account.updated": {
        const account = event.data.object as Stripe.Account;
        await supabase.from("dietitian_credentials").update({
          stripe_connect_charges_enabled: !!account.charges_enabled,
        }).eq("stripe_connect_account_id", account.id);
        break;
      }

      // ── Subscription renewed or changed ──
      case "customer.subscription.updated": {
        const sub = event.data.object as Stripe.Subscription;
        let userId = sub.metadata?.supabase_uid;
        const expiresAt = new Date(sub.current_period_end * 1000).toISOString();
        const plan = sub.status === "active" || sub.status === "trialing" ? "pro" : "free";

        if (!userId) {
          // Fallback: risali all'utente tramite user_payment_credentials, dato
          // che stripe_subscription_id non vive più su profiles (SEZIONE 62).
          const { data: creds } = await supabase
            .from("user_payment_credentials")
            .select("id")
            .eq("stripe_subscription_id", sub.id)
            .maybeSingle();
          userId = creds?.id;
        }

        if (userId) {
          await supabase.from("profiles").update({
            subscription_plan: plan,
            subscription_expires_at: plan === "pro" ? expiresAt : null,
          }).eq("id", userId);
        } else {
          // Prima non veniva loggato: il profilo restava silenziosamente
          // disallineato da Stripe senza alcuna traccia negli errori server.
          await logServerError("stripe-webhook", new Error(
            `customer.subscription.updated: impossibile risolvere l'utente per subscription ${sub.id} (metadata.supabase_uid mancante e nessuna riga in user_payment_credentials)`
          )).catch(() => {});
        }
        break;
      }

      // ── Subscription cancelled ──
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        let userId = sub.metadata?.supabase_uid;

        if (!userId) {
          const { data: creds } = await supabase
            .from("user_payment_credentials")
            .select("id")
            .eq("stripe_subscription_id", sub.id)
            .maybeSingle();
          userId = creds?.id;
        }

        if (userId) {
          await supabase.from("profiles").update({
            subscription_plan: "free",
            subscription_expires_at: null,
          }).eq("id", userId);
        } else {
          await logServerError("stripe-webhook", new Error(
            `customer.subscription.deleted: impossibile risolvere l'utente per subscription ${sub.id} (metadata.supabase_uid mancante e nessuna riga in user_payment_credentials)`
          )).catch(() => {});
        }
        break;
      }

      // ── Payment failed ──
      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        // Stripe will automatically retry. After max retries it cancels → subscription.deleted handles the rest.
        console.warn("Payment failed for customer:", invoice.customer);
        break;
      }

      default:
        console.log("Unhandled event type:", event.type);
    }
  } catch (err) {
    console.error("Handler error:", err);
    const logErr = new Error(`[${event.type}] ${err.message}`);
    logErr.stack = err.stack;
    await logServerError("stripe-webhook", logErr).catch(() => {});
    return new Response(`Handler Error: ${err.message}`, { status: 500 });
  }

  return new Response(JSON.stringify({ received: true }), {
    headers: { "Content-Type": "application/json" },
  });
});
