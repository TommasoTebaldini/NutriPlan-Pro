# Setup Stripe + PayPal — Guida Completa

Questa guida ti permette di attivare i pagamenti automatici (carta di credito **e PayPal**) su NutriPlan Pro e sull'app pazienti in circa 30-40 minuti. Il codice è già pronto — tutti i passi sotto sono azioni che devi fare TU (serve il tuo login/documenti, io non posso farle al posto tuo). Seguili in ordine.

**Nota:** PayPal non richiede un account/integrazione separata — Stripe lo gestisce come un metodo di pagamento in più dentro lo stesso Checkout (stesso flusso, stesso webhook, stesso codice). Basta abilitarlo nel Dashboard Stripe (punto 8).

---

## 1. Crea l'account Stripe

1. Vai su [stripe.com](https://stripe.com) → crea account con la tua email
2. Completa la verifica identità (documenti + IBAN)
3. Attiva il **Live mode** (non usare Test mode in produzione)

---

## 2. Crea i prodotti/prezzi

Nel dashboard Stripe → **Prodotti** → **Aggiungi prodotto**:

### Sito Dietisti — Piano Mensile
- Nome: `NutriPlan Pro — Mensile (Dietisti)`
- Prezzo: **€35,00 / mese** (ricorrente, mensile)
- Copia l'ID → tipo `price_xxxxxxxxxx` → salva come `STRIPE_PRICE_MONTHLY`

### Sito Dietisti — Piano Annuale
- Nome: `NutriPlan Pro — Annuale (Dietisti)`
- Prezzo: **€350,00 / anno** (ricorrente, annuale)
- Copia l'ID → salva come `STRIPE_PRICE_ANNUAL`

### App Pazienti — Piano Mensile
- Nome: `NutriPlan App — Pro Mensile (Pazienti)`
- Prezzo: **€5,99 / mese** (ricorrente, mensile)
- Copia l'ID → salva come `STRIPE_PATIENT_PRICE_MONTHLY`

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
supabase functions deploy create-patient-checkout-session
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
supabase secrets set STRIPE_PATIENT_PRICE_MONTHLY=price_...
```

`SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` sono già disponibili automaticamente nelle edge functions.

---

## 7. Configura il Webhook Stripe

1. Stripe Dashboard → **Sviluppatori** → **Webhook** → **Aggiungi endpoint**
2. URL endpoint: `https://<tuo-progetto>.supabase.co/functions/v1/stripe-webhook`
   - (trovi l'URL base su Supabase → Edge Functions → il tuo progetto)
3. Seleziona questi eventi:
   - `checkout.session.completed`
   - `checkout.session.async_payment_succeeded` (metodi di pagamento non istantanei tipo bonifico/SEPA — non offerti oggi, ma se in futuro si abilitano il webhook li gestisce già)
   - `checkout.session.async_payment_failed`
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

## 8. Abilita PayPal

Il codice (`create-checkout-session` e `create-patient-checkout-session`) chiede già a Stripe sia `card` che `paypal` come metodi di pagamento — ma PayPal va attivato lato Stripe prima che compaia davvero nel Checkout:

1. Stripe Dashboard → **Impostazioni** → **Metodi di pagamento** (o **Payment methods**)
2. Trova **PayPal** nella lista → **Attiva**
3. Stripe di solito abilita da sola i pagamenti **ricorrenti** con PayPal quando lo attivi, ma per policy/restrizioni regionali potrebbe non farlo in automatico: se dopo il test finale (punto 11) il pulsante PayPal non appare nel Checkout in modalità abbonamento, vai su Stripe Dashboard → cerca "PayPal recurring payments" nelle impostazioni del metodo di pagamento e abilitalo manualmente
4. Nessuna chiave/secret aggiuntiva da configurare — PayPal passa dallo stesso `STRIPE_SECRET_KEY` e dallo stesso webhook già impostato ai punti precedenti

---

## 9. Configura il Billing Portal Stripe

1. Stripe Dashboard → **Impostazioni** → **Portale clienti**
2. Attiva: cancellazione abbonamento, aggiornamento metodi di pagamento, download fatture
3. Salva

---

## 10. Pubblica il sito

Carica tutti i file HTML/CSS/JS su hosting (Netlify, Vercel, GitHub Pages, ecc.).

Il dominio finale sarà nel formato `https://tuosito.com` — le Edge Functions già usano l'`origin` della richiesta per i redirect, quindi non serve cambiare nulla nel codice.

---

## 11. Test finale

1. Apri `abbonamento.html` sul sito pubblicato
2. Accedi con un account dietista
3. Clicca **Inizia Prova Gratuita** → verifica che ti porti su Stripe Checkout e che sia selezionabile sia **Carta** che **PayPal**
4. Per la carta usa quella di test Stripe: `4242 4242 4242 4242`, qualsiasi scadenza futura, qualsiasi CVV. Per PayPal usa un account sandbox PayPal se Stripe è ancora in test mode, oppure un pagamento reale minimo se sei già in live mode
5. Dopo il pagamento, verifica che il profilo in Supabase abbia `subscription_plan = 'pro'`
6. Verifica che le sezioni Pro (AI, BIA, Ricette, ecc.) diventino visibili in sidebar
7. Ripeti lo stesso test dal lato app pazienti (`create-patient-checkout-session`) dopo aver attivato il flag app (vedi sezione "Attivazione pagamenti" sotto)

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

---

## Attivazione pagamenti — App Pazienti

Quando sei pronto ad attivare i pagamenti nell'app pazienti (`Diet-Plan-Pro-app-claude`):

1. Apri `src/hooks/useSubscription.js`
2. Cambia `export const PAYMENTS_ACTIVE = false` → `export const PAYMENTS_ACTIVE = true`
3. Il link "Abbonamento" appare automaticamente nel menu
4. Il paywall `ProGate` si attiva su statistiche, attività avanzata, ecc.
5. Il webhook esistente (`stripe-webhook`) gestisce già i pagamenti pazienti — nessuna modifica necessaria

Aggiungere il secret:
```bash
supabase secrets set STRIPE_PATIENT_PRICE_MONTHLY=price_...
supabase functions deploy create-patient-checkout-session
```

⚠️ Stesso discorso del sito: flippa questo flag solo a setup Stripe completo (punti 1-9 sopra), altrimenti il pulsante "Abbonati" nell'app fallisce.

## Attivazione pagamenti — Sito Dietisti

1. Apri `js/payments-config.js` nel sito NutriPlan-Pro (unico file, usato sia da `abbonamento.html` che da `patient-portal.html` — non serve toccare altri file)
2. Cambia `const PAYMENTS_ACTIVE = false;` → `const PAYMENTS_ACTIVE = true;`
3. Il banner "in arrivo" sparisce, il pulsante di abbonamento e il toggle mensile/annuale tornano visibili
4. Il gate Free/Pro si attiva automaticamente sia per il dietista (sidebar) sia per il paziente collegato (portale)

⚠️ Non flippare questo flag finché non hai completato TUTTI i punti 1-9 sopra (account Stripe live, prodotti, secrets, migrazione SQL, edge functions deployate, webhook, PayPal) — altrimenti il pulsante "Abbonati" porterà a un errore invece che al checkout.

---

## 12. Pagamento diretto paziente→dietista (Stripe Connect)

Diverso dall'abbonamento SaaS sopra: qui i soldi di una singola **fattura**
(tab Pagamenti → Fatture, `pagamenti.html`) vanno direttamente sul conto
Stripe del dietista, non sul conto della piattaforma — la piattaforma
trattiene solo il **5%** di commissione (deciso in sessione, modificabile
cambiando `PLATFORM_FEE_PCT` in `create-invoice-checkout-session/index.ts`).
Richiede **Stripe Connect**, non solo Checkout — un prerequisito in più
rispetto ai punti 1-11.

1. Stripe Dashboard → **Connect** → **Impostazioni** → attiva Connect (se non
   già attivo). Tipo di account: **Express**.
2. Deploy delle 2 nuove edge functions + redeploy del webhook esteso:
```bash
supabase functions deploy stripe-connect-onboarding
supabase functions deploy create-invoice-checkout-session
supabase functions deploy stripe-webhook
```
3. Nessun nuovo secret: entrambe le funzioni riusano `STRIPE_SECRET_KEY` già
   configurato.
4. Aggiungi l'evento **`account.updated`** al webhook esistente (Stripe
   Dashboard → Webhook → il tuo endpoint → **Aggiungi evento**) — serve per
   sapere quando un dietista ha completato l'onboarding Connect
   (`charges_enabled`).
5. Esegui in Supabase SQL Editor la SEZIONE 43 di `supabase_setup.sql`
   (colonne `stripe_connect_*` su `profiles`, `stripe_checkout_session_id`/
   `stripe_payment_intent_id`/`pagato_online_at` su `fatture`, policy di
   lettura paziente su `fatture`).
6. Test: da `pagamenti.html` (account dietista) clicca **Attiva pagamenti
   online**, completa l'onboarding Express Stripe (dati di test in test
   mode). Poi da un account paziente collegato, apri `/pagamenti` nell'app e
   verifica che una fattura non pagata mostri il pulsante **Paga ora** e che
   dopo il pagamento risulti "pagato" sia in Supabase sia in
   `pagamenti.html`.

⚠️ Finché un dietista non completa l'onboarding Connect
(`stripe_connect_charges_enabled = true`), i suoi pazienti vedono comunque le
fatture in `/pagamenti` ma il pulsante "Paga ora" restituisce un errore
esplicito invece di un checkout — è un comportamento voluto (l'elenco fatture
resta utile anche senza pagamento online), non un bug.
