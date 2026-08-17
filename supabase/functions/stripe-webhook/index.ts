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
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
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
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId = session.client_reference_id; // Supabase user UUID
        const subscriptionId = session.subscription as string;
        const fatturaId = session.metadata?.fattura_id;

        if (fatturaId) {
          // Pagamento diretto paziente→dietista di una singola fattura
          // (SEZIONE 43) — flusso "payment" one-time, distinto dagli
          // abbonamenti ricorrenti gestiti sotto.
          await supabase.from("fatture").update({
            stato: "pagato",
            stripe_checkout_session_id: session.id,
            stripe_payment_intent_id: session.payment_intent as string,
            pagato_online_at: new Date().toISOString(),
          }).eq("id", fatturaId);

          console.log(`Fattura ${fatturaId} pagata online (session ${session.id})`);
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
