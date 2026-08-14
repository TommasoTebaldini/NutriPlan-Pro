# Setup Login SSO (Microsoft / SAML) — Guida Completa

Il codice per il login SSO è già pronto in `index.html` (pulsanti "Accedi con Microsoft" e "Accedi con SSO aziendale" sotto "Accesso aziendale (SSO)"). Quello che manca è la **configurazione per ogni singola struttura/ospedale** che vuole usarlo — non è un'attivazione unica come Stripe, va ripetuta per ogni cliente che la richiede, perché ogni struttura ha il proprio Identity Provider (IdP).

Ci sono due percorsi indipendenti. Quasi sempre basta il primo.

---

## Percorso A — Microsoft Entra ID / Azure AD (consigliato, gratuito su ogni piano)

Copre qualunque struttura il cui Active Directory sia sincronizzato con Microsoft 365 / Entra ID — il caso più comune tra ospedali e PA italiane che usano Office 365. Non richiede upgrade del piano Supabase.

### A.1 — Registra l'app in Azure (lo fa l'IT della struttura, o tu se hai un tenant di test)

1. [portal.azure.com](https://portal.azure.com) → **Microsoft Entra ID** → **Registrazioni app** → **Nuova registrazione**
2. Nome: `NutriPlan Pro`
3. Tipi di account supportati: *Solo account in questa directory organizzativa* (single-tenant, consigliato per un ospedale)
4. URI di reindirizzamento (tipo **Web**): `https://<il-tuo-progetto>.supabase.co/auth/v1/callback`
5. Dopo la creazione, annota: **ID applicazione (client)** e **ID directory (tenant)**
6. **Certificati e segreti** → **Nuovo segreto client** → copia il **valore** (visibile una sola volta)
7. **Autorizzazioni API** → aggiungi `email`, `openid`, `profile` (di solito già presenti)

### A.2 — Configura il provider in Supabase

Dashboard Supabase del progetto → **Authentication** → **Providers** → **Azure**:
- Client ID: quello del punto A.1
- Client Secret: il valore del segreto
- Azure Tenant URL/ID: l'ID directory del punto A.1 (per limitare il login al solo tenant di quella struttura)

Salva. Da questo momento il pulsante "Accedi con Microsoft" in `index.html` funziona per chiunque abbia un account in quel tenant Azure.

### A.3 — Nota multi-cliente

Il provider Azure di Supabase è **uno solo per progetto**: se in futuro servono più tenant Microsoft distinti (più ospedali con Azure AD separati), serve gestirlo con `Azure Tenant URL` impostato al tenant specifico di un solo cliente, oppure valutare un progetto Supabase separato per cliente enterprise. Per un singolo ospedale pilota non è un problema.

---

## Percorso B — SAML 2.0 generico (ADFS on-prem, Okta, o IdP non-Microsoft)

Serve solo se la struttura NON usa Azure AD/Entra ID — es. Active Directory on-premise con ADFS, o un IdP SAML diverso.

**Richiede piano Supabase Pro o superiore** (verifica su supabase.com/pricing — al momento della stesura di questa guida è il primo piano a pagamento, non serve Enterprise).

### B.1 — Prerequisiti

- Piano Supabase Pro+ attivo sul progetto
- Supabase CLI installata (`npm i -g supabase`), versione ≥ 1.46.4
- Dall'IT della struttura: URL dei metadata SAML del loro IdP (o il file XML dei metadata), e il dominio email dei loro utenti (es. `ospedale-xyz.it`)

### B.2 — Abilita SAML per il progetto

Dashboard Supabase → **Authentication** → **Providers** → abilita **SAML 2.0** (visibile solo su piano Pro+).

### B.3 — Registra l'IdP della struttura

```bash
supabase sso add --project-ref <ref-progetto> \
  --type saml \
  --metadata-url 'https://idp.ospedale-xyz.it/saml/metadata' \
  --domains ospedale-xyz.it
```

Se l'IdP fornisce solo un file XML invece di un URL, usa `--metadata-file percorso/metadata.xml` al posto di `--metadata-url`.

### B.4 — Dai all'IT della struttura i dati del Service Provider

Recupera i metadata del lato Supabase (Service Provider):

```
https://<il-tuo-progetto>.supabase.co/auth/v1/sso/saml/metadata
```

Vanno caricati/registrati sul loro IdP come "nuova applicazione SAML":
- **Entity ID (Audience)**: `https://<il-tuo-progetto>.supabase.co/auth/v1/sso/saml/metadata`
- **ACS URL / Reply URL**: `https://<il-tuo-progetto>.supabase.co/auth/v1/sso/saml/acs`
- **NameID format**: `persistent` (consigliato) o `emailAddress`

### B.5 — Testa

Con un account del dominio registrato, dal login vai su "Accesso aziendale (SSO)" → inserisci l'email aziendale nel campo Email → **Accedi con SSO aziendale (SAML)**. Dovresti essere reindirizzato al login dell'IdP della struttura.

---

## Cosa succede al primo accesso di un nuovo utente SSO

Il comportamento è identico a una registrazione normale: viene creato un profilo con `approved = false`, e l'utente vede la schermata di attesa approvazione finché un amministratore non lo approva da `app.html`. **Non c'è auto-approvazione per gli utenti SSO** — è una scelta deliberata per non concedere accesso automaticamente solo perché qualcuno si è autenticato con successo sull'IdP della struttura. Se in futuro serve auto-approvare gli utenti di un dominio SSO verificato (utile per un rollout su decine di professionisti), è una modifica separata da valutare con te caso per caso, non qualcosa da attivare di default.

---

## Cosa NON è ancora incluso

- Provisioning automatico via SCIM (creazione/disattivazione account sincronizzata dall'IdP) — non supportato da Supabase Auth nativamente, andrebbe costruito a parte se richiesto.
- Multi-tenant Azure (più ospedali con tenant Microsoft distinti sullo stesso progetto Supabase) — vedi nota A.3.
- Mappatura di ruoli/reparti dall'IdP verso i permessi dell'app (es. "segreteria" vs "dietista" da un gruppo Azure AD) — oggi il livello di permesso resta quello assegnato manualmente in Impostazioni → Collaboratori.
