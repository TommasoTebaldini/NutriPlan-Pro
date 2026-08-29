// ═══════════════════════════════════════════════════════════════
// Supabase Edge Function: stripe-portal
// Redirects authenticated user to the Stripe Customer Portal
// so they can manage/cancel their subscription.
//
// Deploy: supabase functions deploy stripe-portal
// Required env vars:
//   STRIPE_SECRET_KEY → sk_live_...
// ═══════════════════════════════════════════════════════════════

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@14";
import { corsHeaders, errorResponse } from "../_shared/stripeHelpers.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return new Response("Unauthorized", { status: 401 });

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SB_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return new Response("Unauthorized", { status: 401, headers: corsHeaders });

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SB_SECRET_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
    const { data: paymentCreds } = await supabaseAdmin
      .from("user_payment_credentials")
      .select("stripe_customer_id")
      .eq("id", user.id)
      .maybeSingle();

    if (!paymentCreds?.stripe_customer_id) {
      return new Response(JSON.stringify({ error: "No subscription found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, { apiVersion: "2023-10-16" });
    const origin = req.headers.get("origin") || "https://nutriplan-pro.vercel.app";

    const portalSession = await stripe.billingPortal.sessions.create({
      customer: paymentCreds.stripe_customer_id,
      return_url: `${origin}/abbonamento.html`,
    });

    return new Response(JSON.stringify({ url: portalSession.url }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    return await errorResponse("stripe-portal", err);
  }
});
