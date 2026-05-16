# Setup Stripe — Guida Completa

Questa guida ti permette di attivare i pagamenti automatici su NutriPlan Pro in circa 30 minuti.

---

## 1. Crea l'account Stripe

1. Vai su [stripe.com](https://stripe.com) → crea account con la tua email
2. Completa la verifica identità (documenti + IBAN)
3. Attiva il **Live mode** (non usare Test mode in produzione)

---

## 2. Crea i prodotti/prezzi

Nel dashboard Stripe → **Prodotti** → **Aggiungi prodotto**:

### Piano Mensile
- Nome: `NutriPlan Pro — Mensile`
- Prezzo: **€35,00 / mese** (ricorrente, mensile)
- Copia l'ID → tipo `price_xxxxxxxxxx` → salva come `STRIPE_PRICE_MONTHLY`

### Piano Annuale
- Nome: `NutriPlan Pro — Annuale`
- Prezzo: **€350,00 / anno** (ricorrente, annuale)
- Copia l'ID → salva come `STRIPE_PRICE_ANNUAL`

---

## 3. Copia le chiavi API

Stripe Dashboard → **Sviluppatori** → **Chiavi API**:

- `sk_live_...` → questa è `STRIPE_SECRET_KEY`
- `pk_live_...` → questa è la chiave pubblica (non serve per le edge functions)

---

## 4. Esegui la migrazione SQL su Supabase

1. Vai su [supabase.com](https://supabase.com) → il tuo progetto → **SQL Editor**
2. Apri il file `supabase/migrations/001_add_subscription.sql`
3. Copia tutto il contenuto e incollalo nell'editor → **Run**

Verifica che nella tabella `profiles` siano apparse le colonne:
- `subscription_plan` (default: `free`)
- `subscription_expires_at`
- `stripe_customer_id`
- `stripe_subscription_id`

---

## 5. Deploy delle Edge Functions

Installa Supabase CLI se non ce l'hai:
```bash
npm install -g supabase
supabase login
```

Dal terminale nella cartella del progetto:
```bash
supabase functions deploy create-checkout-session
supabase functions deploy stripe-webhook
supabase functions deploy stripe-portal
```

---

## 6. Imposta i Secrets (variabili d'ambiente)

Nel dashboard Supabase → **Edge Functions** → **Secrets** (oppure via CLI):

```bash
supabase secrets set STRIPE_SECRET_KEY=sk_live_...
supabase secrets set STRIPE_PRICE_MONTHLY=price_...
supabase secrets set STRIPE_PRICE_ANNUAL=price_...
```

`SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` sono già disponibili automaticamente nelle edge functions.

---

## 7. Configura il Webhook Stripe

1. Stripe Dashboard → **Sviluppatori** → **Webhook** → **Aggiungi endpoint**
2. URL endpoint: `https://<tuo-progetto>.supabase.co/functions/v1/stripe-webhook`
   - (trovi l'URL base su Supabase → Edge Functions → il tuo progetto)
3. Seleziona questi eventi:
   - `checkout.session.completed`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.payment_failed`
4. Clicca **Aggiungi endpoint**
5. Apri il webhook appena creato → copia il **Webhook signing secret** (`whsec_...`)
6. Aggiungilo ai secrets Supabase:
```bash
supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_...
```

---

## 8. Configura il Billing Portal Stripe

1. Stripe Dashboard → **Impostazioni** → **Portale clienti**
2. Attiva: cancellazione abbonamento, aggiornamento metodi di pagamento, download fatture
3. Salva

---

## 9. Pubblica il sito

Carica tutti i file HTML/CSS/JS su hosting (Netlify, Vercel, GitHub Pages, ecc.).

Il dominio finale sarà nel formato `https://tuosito.com` — le Edge Functions già usano l'`origin` della richiesta per i redirect, quindi non serve cambiare nulla nel codice.

---

## 10. Test finale

1. Apri `abbonamento.html` sul sito pubblicato
2. Accedi con un account dietista
3. Clicca **Inizia Prova Gratuita** → verifica che ti porti su Stripe Checkout
4. Usa la carta di test Stripe: `4242 4242 4242 4242`, qualsiasi scadenza futura, qualsiasi CVV
5. Dopo il pagamento, verifica che il profilo in Supabase abbia `subscription_plan = 'pro'`
6. Verifica che le sezioni Pro (AI, BIA, Ricette, ecc.) diventino visibili in sidebar

---

## Struttura del sistema

```
Utente clicca "Abbonati"
  → abbonamento.html chiama /functions/v1/create-checkout-session
  → Edge Function crea sessione Stripe Checkout
  → Utente paga su Stripe
  → Stripe invia evento checkout.session.completed al webhook
  → /functions/v1/stripe-webhook aggiorna profiles: subscription_plan='pro'
  → Utente torna su abbonamento.html?success=1
  → utils.js legge subscription_plan='pro' e sblocca sidebar
```

---

## Sezioni specialistiche (approvazione manuale)

Le sezioni cliniche avanzate (Diabete, Renale, DCA, ecc.) richiedono:
1. Piano Pro attivo (gestito automaticamente da Stripe)
2. Abilitazione manuale dall'admin in `admin.html` → bottone **🔧 Sezioni**

Anche se un utente paga, le sezioni specialistiche rimangono bloccate finché non le abiliti tu.
