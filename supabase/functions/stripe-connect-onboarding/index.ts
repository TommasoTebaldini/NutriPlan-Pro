// ═══════════════════════════════════════════════════════════════
// Supabase Edge Function: stripe-connect-onboarding
// Crea (se non esiste già) l'account Stripe Connect Express del dietista e
// restituisce l'URL di onboarding (Stripe-hosted). Necessario prima che un
// paziente possa pagargli una fattura direttamente — vedi
// create-invoice-checkout-session, che verifica stripe_connect_charges_enabled
// prima di creare una sessione di pagamento.
//
// Chiamabile anche più volte: se l'account esiste già ma l'onboarding non è
// stato completato (charges_enabled ancora false), genera un nuovo Account
// Link per riprenderlo da dove era rimasto — Stripe scade gli Account Link
// dopo pochi minuti, non sono riutilizzabili.
//
// Deploy: supabase functions deploy stripe-connect-onboarding
// Required env vars (Supabase Dashboard → Edge Functions → Secrets):
//   STRIPE_SECRET_KEY → sk_live_...  (stessa chiave delle altre funzioni Stripe)
// ═══════════════════════════════════════════════════════════════

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@14";
import { logServerError } from "../_shared/errorLog.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return new Response("Unauthorized", { status: 401, headers: corsHeaders });

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SB_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user }, error: userErr } = await supabase.auth.getUser();
    if (userErr || !user) return new Response("Unauthorized", { status: 401, headers: corsHeaders });

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SB_SECRET_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
    const { data: profile, error: profErr } = await supabaseAdmin
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();
    if (profErr) throw profErr;
    if (profile?.role !== "dietitian") {
      return new Response(JSON.stringify({ error: "Solo un account dietista può attivare i pagamenti online." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: credentials, error: credErr } = await supabaseAdmin
      .from("dietitian_credentials")
      .select("stripe_connect_account_id")
      .eq("id", user.id)
      .maybeSingle();
    if (credErr) throw credErr;

    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, { apiVersion: "2023-10-16" });

    let accountId = credentials?.stripe_connect_account_id as string | null;
    if (!accountId) {
      const account = await stripe.accounts.create({
        type: "express",
        country: "IT",
        email: user.email,
        capabilities: {
          card_payments: { requested: true },
          transfers: { requested: true },
        },
        business_type: "individual",
        metadata: { supabase_uid: user.id },
      });
      accountId = account.id;
      await supabaseAdmin.from("dietitian_credentials").upsert({ id: user.id, stripe_connect_account_id: accountId });
    }

    const origin = req.headers.get("origin") || "https://nutriplan-pro.vercel.app";
    const accountLink = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: `${origin}/pagamenti.html?connect=refresh`,
      return_url: `${origin}/pagamenti.html?connect=return`,
      type: "account_onboarding",
    });

    return new Response(JSON.stringify({ url: accountLink.url }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    console.error("stripe-connect-onboarding error:", err);
    await logServerError("stripe-connect-onboarding", err).catch(() => {});
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
