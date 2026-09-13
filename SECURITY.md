# Security Policy

NutriPlan Pro gestisce dati clinici di pazienti (cartelle, valutazioni, esami
biochimici) e dati di pagamento dei professionisti che lo usano. Prendiamo
sul serio qualunque segnalazione di vulnerabilità.

## Versioni supportate

Non pubblichiamo versioni numerate: il progetto è deployato in continuo
dal branch `main`. Le patch di sicurezza vengono applicate direttamente in
produzione appena verificate, non retroportate su versioni precedenti.

## Segnalare una vulnerabilità

Se scopri una vulnerabilità di sicurezza (accesso non autorizzato a dati di
un altro utente/paziente, bypass di autenticazione, XSS, SQL injection,
esposizione di credenziali o simili):

1. **Non aprire una issue pubblica su GitHub.** Una vulnerabilità nei dati
   clinici resa pubblica prima di essere corretta espone i pazienti reali.
2. Scrivi a **security@nutriplanpro.it** descrivendo: cosa hai trovato, come
   riprodurlo, e l'impatto stimato (es. quali dati sono esposti).
3. Riceverai una conferma di ricezione entro **3 giorni lavorativi**.
4. Ti terremo aggiornato sullo stato della correzione; per vulnerabilità che
   coinvolgono dati clinici puntiamo a una mitigazione entro **7 giorni**
   dalla conferma.
5. Ti chiediamo di non divulgare pubblicamente i dettagli finché la
   correzione non è in produzione e i dati eventualmente esposti non sono
   stati messi in sicurezza.

Segnalazioni relative a dipendenze di terze parti (`npm audit`) sono
benvenute ma a priorità più bassa se non sfruttabili direttamente contro
questa applicazione.
