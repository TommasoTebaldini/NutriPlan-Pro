// supabase/functions/_shared/stripeHelpers.ts — helper comuni alle edge
// function Stripe (checkout dietista/paziente/fattura, connect, portal,
// webhook). Prima duplicati identici in ogni file: corsHeaders, il blocco
// "leggi o crea customer Stripe", e la risposta di errore col messaggio
// interno esposto al client. Trovato da code review 2026-08-29 — rischio
// concreto di dimenticare un fix in una delle copie, come già quasi
// successo col fallback SB_PUBLISHABLE_KEY/SB_SECRET_KEY (commit 16cbd53).

import type Stripe from "https://esm.sh/stripe@14";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { logServerError } from "./errorLog.ts";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Legge lo stripe_customer_id esistente, altrimenti ne crea uno nuovo su
// Stripe e lo "reclama" atomicamente via RPC claim_stripe_customer_id
// (SEZIONE 97 di supabase_setup.sql). In precedenza: leggi, se assente crea
// su Stripe, upsert INCONDIZIONATO — due richieste concorrenti per lo stesso
// utente (doppio click, due tab) potevano creare due customer Stripe
// distinti, col secondo upsert che sovrascriveva in silenzio il primo
// (customer orfano su Stripe, stato imprevedibile). L'RPC fa un UPSERT con
// COALESCE lato DB: vince sempre il primo customer_id scritto, mai un blind
// overwrite — il customer "perdente" resta orfano (nessun costo, nessuna
// sottoscrizione collegata) ma da qui in avanti tutte le richieste
// convergono su un unico id canonico.
export async function getOrCreateStripeCustomer(
  stripe: Stripe,
  supabaseAdmin: SupabaseClient,
  userId: string,
  email: string | undefined,
  extraMetadata: Record<string, string> = {},
): Promise<string> {
  const { data: paymentCreds } = await supabaseAdmin
    .from("user_payment_credentials")
    .select("stripe_customer_id")
    .eq("id", userId)
    .maybeSingle();

  if (paymentCreds?.stripe_customer_id) return paymentCreds.stripe_customer_id;

  const customer = await stripe.customers.create({
    email,
    metadata: { supabase_uid: userId, ...extraMetadata },
  });

  const { data: canonicalId, error } = await supabaseAdmin.rpc("claim_stripe_customer_id", {
    p_user_id: userId,
    p_customer_id: customer.id,
  });
  if (error) throw error;
  return (canonicalId as string) || customer.id;
}

// Risposta di errore generica per il chiamante: il messaggio reale (che può
// contenere dettagli interni Stripe/Postgres — nomi tabella, price id,
// vincoli violati) viene sempre loggato via logServerError, MAI restituito
// nel body della risposta. Da usare solo nel catch-all di ogni function: i
// messaggi applicativi intenzionali (es. "Fattura non trovata", "Questa
// fattura risulta già pagata") restano risposte dirette, non passano da qui.
export async function errorResponse(fnName: string, err: unknown, extraHeaders: Record<string, string> = {}) {
  console.error(`${fnName} error:`, err);
  await logServerError(fnName, err).catch(() => {});
  return new Response(JSON.stringify({ error: "Errore interno, riprova più tardi." }), {
    status: 500,
    headers: { ...corsHeaders, ...extraHeaders, "Content-Type": "application/json" },
  });
}
