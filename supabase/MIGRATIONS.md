# 📒 Registro delle migrazioni del database

Questo è il **registro unico** di tutte le modifiche al database Supabase
(progetto `hvdwqowkhutfsdpiubxe`), condiviso dai due repository
NutriPlan-Pro (sito dietisti) e Diet-Plan-Pro-app-claude (app pazienti), che
usano **lo stesso database**.

Da ora in poi **ogni modifica al database passa da qui**, invece di aggiungere
"SEZIONE N" in fondo a `supabase_setup.sql`. Così c'è uno storico ordinato,
tracciato in git, e sai sempre cosa è stato applicato e quando.

---

## Come funziona (workflow)

Quando serve una modifica al database (nuova tabella, colonna, policy, indice…):

1. **Si crea un nuovo file** nella cartella `supabase/migrations/` con il nome:
   ```
   AAAAMMGGHHMMSS__descrizione_breve.sql
   ```
   (data e ora numeriche + due underscore + descrizione). Esempio:
   `20260721143000__aggiungi_tabella_note.sql`. Il prefisso numerico crescente
   garantisce che i file si applichino **sempre nello stesso ordine**.

2. **Il file contiene SOLO quella modifica**, scritta in modo *idempotente*
   (cioè che si può eseguire più volte senza danni): `CREATE TABLE IF NOT
   EXISTS`, `ADD COLUMN IF NOT EXISTS`, `DROP POLICY IF EXISTS` + `CREATE
   POLICY`, ecc. Ogni file inizia con un commento che spiega **cosa** fa e
   **perché**.

3. **Si applica** (vedi sotto) e **si segna nel registro** in fondo a questo file.

---

## Come applicare una migrazione

### Metodo attuale (semplice, sicuro) — SQL Editor
1. Apri Supabase → **SQL Editor**
2. Apri il file della migrazione, copia tutto il contenuto, incollalo ed esegui
3. Aggiungi una riga al **registro** in fondo a questo file (data di
   applicazione), poi committa su git

Questo è il metodo che usi già: non cambia nulla nell'esecuzione, cambia solo
che ora ogni modifica è un file ordinato e tracciato invece di finire in un
unico file gigante.

### Metodo automatico (per il futuro) — Supabase CLI
Quando avrai un ambiente di test separato dalla produzione, potrai passare a:
```powershell
supabase db push
```
che applica automaticamente **solo** le migrazioni non ancora eseguite,
tenendone traccia da solo. Richiede la password del database (Supabase →
Settings → Database). Non usarlo direttamente sulla produzione finché non hai
un ambiente di test su cui provarlo prima: per ora il metodo SQL Editor è più
sicuro e sotto il tuo controllo.

---

## ⚠️ Regola d'oro
- **Non modificare mai un file di migrazione già applicato.** Se hai sbagliato,
  crea una *nuova* migrazione che corregge. Lo storico deve restare fedele a ciò
  che è realmente successo sul database.
- Una migrazione = una modifica logica. Meglio tante piccole che una enorme.

---

## Punto di partenza (baseline)

Tutto lo schema **fino alla SEZIONE 33** di `supabase_setup.sql` (e il
corrispondente `Diet-Plan-Pro-app-claude/supabase-schema.sql`) è la **baseline**:
è già stato applicato manualmente al database di produzione. Non va ri-eseguito.
Quei due file restano come "fotografia" completa dello schema per ricreare un
database da zero se mai servisse; le modifiche **nuove** invece vivono qui, come
file di migrazione separati.

> File legacy `migrations/001_add_subscription.sql` e `002_scale_indexes.sql`:
> vecchia numerazione pre-baseline, stato di esecuzione storico. Ignorali per il
> nuovo workflow — sono già inclusi concettualmente nella baseline.

---

## Registro delle migrazioni applicate

| File migrazione | Descrizione | Applicata il | Da |
|---|---|---|---|
| _(baseline)_ | Schema completo fino a SEZIONE 33 (supabase_setup.sql) | 2026-07 (manuale) | — |
| `20260721150000__enforce_2fa_rls.sql` | Blinda la 2FA a livello RLS (policy restrittive + funzione `mfa_ok()`) | _(da applicare)_ | |
| `20260722160000__patient_audit_log.sql` | Crea `patient_audit_log` (mai creata, scrittura silenziosamente ingoiata da sempre) | _(da applicare)_ | |
| `20260722160500__consigli_custom.sql` | Crea `consigli_custom` (mai creata, consigli.html dava sempre errore 42P01) | _(da applicare)_ | |
| `20260724120000__diario_alimentare_foto.sql` | Crea `diario_alimentare_foto` (foto diario alimentare del paziente + analisi AI macro/micro, nuova sezione in pazienti.html) | _(da applicare)_ | |

> Ogni volta che applichi una nuova migrazione, aggiungi una riga qui con la
> data e chi l'ha eseguita, poi committa.
