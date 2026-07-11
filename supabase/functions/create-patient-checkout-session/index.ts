// ═══════════════════════════════════════════════════════════════
// Supabase Edge Function: create-patient-checkout-session
// Creates a Stripe Checkout Session for a patient (€5,99/mese).
//
// Deploy: supabase functions deploy create-patient-checkout-session
// Required env vars (Supabase Dashboard → Edge Functions → Secrets):
//   STRIPE_SECRET_KEY          → sk_live_...
//   STRIPE_PATIENT_PRICE_MONTHLY → price_... (€5,99/mese recurring)
// ═══════════════════════════════════════════════════════════════

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@14";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return new Response("Unauthorized", { status: 401 });

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: userErr } = await supabase.auth.getUser();
    if (userErr || !user) return new Response("Unauthorized", { status: 401, headers: corsHeaders });

    // Only patients can subscribe here
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("stripe_customer_id, role")
      .eq("id", user.id)
      .maybeSingle();

    if (profile?.role === "dietitian") {
      return new Response(JSON.stringify({ error: "Use the dietitian checkout" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const priceId = Deno.env.get("STRIPE_PATIENT_PRICE_MONTHLY");
    if (!priceId) {
      return new Response(JSON.stringify({ error: "Patient price not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, { apiVersion: "2023-10-16" });

    // Get or create Stripe customer
    let customerId = profile?.stripe_customer_id;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        metadata: { supabase_uid: user.id, role: "patient" },
      });
      customerId = customer.id;
      await supabaseAdmin.from("profiles").update({ stripe_customer_id: customerId }).eq("id", user.id);
    }

    const origin = req.headers.get("origin") || "https://nutri-patient-app.vercel.app";

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      client_reference_id: user.id,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${origin}/abbonamento?success=1`,
      cancel_url:  `${origin}/abbonamento?cancelled=1`,
      subscription_data: {
        metadata: { supabase_uid: user.id, role: "patient" },
        trial_period_days: 7,
      },
      allow_promotion_codes: true,
    });

    return new Response(JSON.stringify({ url: session.url }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    console.error("create-patient-checkout-session error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
