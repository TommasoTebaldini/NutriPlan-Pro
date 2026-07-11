// ═══════════════════════════════════════════════════════════════
// Supabase Edge Function: create-checkout-session
// Creates a Stripe Checkout Session for the authenticated user.
//
// Deploy: supabase functions deploy create-checkout-session
// Required env vars (set in Supabase Dashboard → Edge Functions → Secrets):
//   STRIPE_SECRET_KEY     → sk_live_...
//   STRIPE_PRICE_MONTHLY  → price_... (€35/mese recurring)
//   STRIPE_PRICE_ANNUAL   → price_... (€350/anno recurring)
// ═══════════════════════════════════════════════════════════════

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@14";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // 1. Authenticate the user via Supabase
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return new Response("Unauthorized", { status: 401 });

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: userErr } = await supabase.auth.getUser();
    if (userErr || !user) return new Response("Unauthorized", { status: 401, headers: corsHeaders });

    // 2. Parse request body
    const { plan } = await req.json(); // plan: 'monthly' | 'annual'
    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, { apiVersion: "2023-10-16" });

    const priceId = plan === "annual"
      ? Deno.env.get("STRIPE_PRICE_ANNUAL")
      : Deno.env.get("STRIPE_PRICE_MONTHLY");

    if (!priceId) {
      return new Response(JSON.stringify({ error: "Price not configured" }), { status: 500, headers: corsHeaders });
    }

    // 3. Get or create Stripe customer
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("stripe_customer_id")
      .eq("id", user.id)
      .maybeSingle();

    let customerId = profile?.stripe_customer_id;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        metadata: { supabase_uid: user.id },
      });
      customerId = customer.id;
      await supabaseAdmin.from("profiles").update({ stripe_customer_id: customerId }).eq("id", user.id);
    }

    // 4. Determine success URL (use request origin or fallback)
    const origin = req.headers.get("origin") || "https://nutriplan-pro.vercel.app";

    // 5. Create Stripe Checkout Session
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      client_reference_id: user.id,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${origin}/abbonamento.html?success=1`,
      cancel_url:  `${origin}/abbonamento.html?cancelled=1`,
      subscription_data: {
        metadata: { supabase_uid: user.id },
        trial_period_days: 14, // 14-day free trial
      },
      allow_promotion_codes: true,
      billing_address_collection: "auto",
    });

    return new Response(JSON.stringify({ url: session.url }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    console.error("create-checkout-session error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
