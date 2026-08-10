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

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, { apiVersion: "2023-10-16" });

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

// Logga su client_errors (stessa tabella usata lato client, vedi
// supabase_setup.sql sezione "schema_migrations + client_errors") così un
// webhook Stripe che fallisce non passa inosservato — prima di questo, un
// errore qui finiva solo nei log Deno, mai controllati proattivamente.
async function logServerError(message: string, stack?: string) {
  try {
    await supabase.from("client_errors").insert({
      app: "stripe-webhook",
      level: "error",
      message: String(message).slice(0, 2000),
      stack: stack ? String(stack).slice(0, 4000) : null,
    });
  } catch (_e) { /* silenzioso: non deve mai far fallire la risposta al webhook */ }
}

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
    await logServerError("Webhook signature failed: " + err.message);
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
            stripe_customer_id: session.customer as string,
            stripe_subscription_id: subscriptionId,
          }).eq("id", userId);

          console.log(`User ${userId} → pro until ${expiresAt}`);
        }
        break;
      }

      // ── Stripe Connect: stato onboarding del dietista aggiornato ──
      case "account.updated": {
        const account = event.data.object as Stripe.Account;
        await supabase.from("profiles").update({
          stripe_connect_charges_enabled: !!account.charges_enabled,
        }).eq("stripe_connect_account_id", account.id);
        break;
      }

      // ── Subscription renewed or changed ──
      case "customer.subscription.updated": {
        const sub = event.data.object as Stripe.Subscription;
        const userId = sub.metadata?.supabase_uid;
        const expiresAt = new Date(sub.current_period_end * 1000).toISOString();
        const plan = sub.status === "active" || sub.status === "trialing" ? "pro" : "free";

        if (userId) {
          await supabase.from("profiles").update({
            subscription_plan: plan,
            subscription_expires_at: plan === "pro" ? expiresAt : null,
          }).eq("id", userId);
        } else {
          // Fallback: find by stripe_subscription_id
          await supabase.from("profiles").update({
            subscription_plan: plan,
            subscription_expires_at: plan === "pro" ? expiresAt : null,
          }).eq("stripe_subscription_id", sub.id);
        }
        break;
      }

      // ── Subscription cancelled ──
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        const userId = sub.metadata?.supabase_uid;

        if (userId) {
          await supabase.from("profiles").update({
            subscription_plan: "free",
            subscription_expires_at: null,
          }).eq("id", userId);
        } else {
          await supabase.from("profiles").update({
            subscription_plan: "free",
            subscription_expires_at: null,
          }).eq("stripe_subscription_id", sub.id);
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
    await logServerError("Handler error (" + event.type + "): " + err.message, err.stack);
    return new Response(`Handler Error: ${err.message}`, { status: 500 });
  }

  return new Response(JSON.stringify({ received: true }), {
    headers: { "Content-Type": "application/json" },
  });
});
