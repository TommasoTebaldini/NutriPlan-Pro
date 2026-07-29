// ═══════════════════════════════════════════════════
// PAYMENTS_ACTIVE — unica fonte di verità per tutto il sito NutriPlan-Pro.
// Va caricato (script deferred) da OGNI pagina che deve sapere se Stripe è
// live: abbonamento.html (checkout dietista) e patient-portal.html (gate
// lato paziente basato sul piano del proprio dietista collegato).
//
// Flip a true SOLO dopo aver completato SETUP-STRIPE.md per intero: account
// Stripe live, prodotti/prezzi creati, migrazione SQL eseguita, le 4 edge
// function deployate, i secret impostati, il webhook registrato E PayPal
// abilitato nel Dashboard Stripe (Impostazioni → Metodi di pagamento).
// Stesso pattern/nome di PAYMENTS_ACTIVE già usato in Diet-Plan-Pro-app-claude
// (src/hooks/useSubscription.js) — sono due flag indipendenti (sito vs app),
// vanno flippati entrambi quando si va live su entrambi i fronti.
// ═══════════════════════════════════════════════════
const PAYMENTS_ACTIVE = false;
