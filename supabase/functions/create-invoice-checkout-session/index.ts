// ═══════════════════════════════════════════════════════════════
// Supabase Edge Function: create-invoice-checkout-session
// Crea una Stripe Checkout Session (pagamento singolo, non ricorrente) per
// una fattura specifica del dietista collegato — chiamata dall'app paziente
// (Diet-Plan-Pro-app-claude). I soldi vanno al conto Stripe Connect del
// dietista (destination charge), meno il 5% di commissione piattaforma
// (application_fee_amount) — vedi supabase_setup.sql SEZIONE 43 per il
// contesto/decisione.
//
// Deploy: supabase functions deploy create-invoice-checkout-session
// Required env vars (Supabase Dashboard → Edge Functions → Secrets):
//   STRIPE_SECRET_KEY → sk_live_...
// ═══════════════════════════════════════════════════════════════

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@14";
import { logServerError } from "../_shared/errorLog.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const PLATFORM_FEE_PCT = 0.05; // 5% — decisione utente 2026-08-10, vedi SEZIONE 43

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405, headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return new Response("Unauthorized", { status: 401, headers: corsHeaders });

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user }, error: userErr } = await supabase.auth.getUser();
    if (userErr || !user) return new Response("Unauthorized", { status: 401, headers: corsHeaders });

    const body = await req.json().catch(() => ({}));
    const fatturaId = body?.fatturaId;
    if (!fatturaId || typeof fatturaId !== "string") {
      return new Response(JSON.stringify({ error: "Parametro fatturaId mancante." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: fattura, error: fatturaErr } = await supabaseAdmin
      .from("fatture")
      .select("id, dietitian_id, patient_id, patient_name, tipo_visita, importo, stato")
      .eq("id", fatturaId)
      .maybeSingle();
    if (fatturaErr) throw fatturaErr;
    if (!fattura) {
      return new Response(JSON.stringify({ error: "Fattura non trovata." }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    // Difesa in profondità: la RLS del client (patient_id = auth.uid()) è già
    // una barriera, ma qui usiamo la service role, quindi il controllo va
    // rifatto esplicitamente prima di creare qualunque sessione di pagamento.
    if (fattura.patient_id !== user.id) {
      return new Response(JSON.stringify({ error: "Non autorizzato a pagare questa fattura." }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (fattura.stato === "pagato") {
      return new Response(JSON.stringify({ error: "Questa fattura risulta già pagata." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!(fattura.importo > 0)) {
      return new Response(JSON.stringify({ error: "Importo fattura non valido." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: dietitianProfile, error: dietErr } = await supabaseAdmin
      .from("profiles")
      .select("stripe_connect_account_id, stripe_connect_charges_enabled")
      .eq("id", fattura.dietitian_id)
      .maybeSingle();
    if (dietErr) throw dietErr;
    if (!dietitianProfile?.stripe_connect_account_id || !dietitianProfile.stripe_connect_charges_enabled) {
      return new Response(JSON.stringify({ error: "Il tuo dietista non ha ancora attivato i pagamenti online per questa fattura." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, { apiVersion: "2023-10-16" });

    const amountCents = Math.round(fattura.importo * 100);
    const feeCents = Math.round(amountCents * PLATFORM_FEE_PCT);
    const origin = req.headers.get("origin") || "https://app.dietplan-pro.com";

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      client_reference_id: user.id,
      customer_email: user.email,
      payment_method_types: ["card", "paypal"],
      line_items: [{
        price_data: {
          currency: "eur",
          product_data: { name: fattura.tipo_visita || "Prestazione nutrizionale" },
          unit_amount: amountCents,
        },
        quantity: 1,
      }],
      payment_intent_data: {
        application_fee_amount: feeCents,
        transfer_data: { destination: dietitianProfile.stripe_connect_account_id },
        metadata: { fattura_id: fatturaId, supabase_patient_uid: user.id },
      },
      metadata: { fattura_id: fatturaId, kind: "invoice_payment" },
      success_url: `${origin}/pagamenti?paid=1`,
      cancel_url: `${origin}/pagamenti?cancelled=1`,
    });

    return new Response(JSON.stringify({ url: session.url }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    console.error("create-invoice-checkout-session error:", err);
    await logServerError("create-invoice-checkout-session", err).catch(() => {});
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
