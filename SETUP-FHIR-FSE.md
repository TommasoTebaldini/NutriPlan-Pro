# Connettore HL7 FHIR — FSE 2.0: Stato e Setup

## Cosa c'era prima, cosa c'è ora

**Prima**: `js/fse.js` — un modulo che genera un documento CDA R2 compilato a mano dal dietista in un modal, un paziente alla volta, da firmare digitalmente e caricare manualmente sul portale FSE della Regione. Resta al suo posto (serve comunque per i *documenti* firmati, che in FSE 2.0 restano in formato CDA2).

**Ora, in aggiunta**: un flusso automatico per i *dati strutturati* (che in FSE 2.0 viaggiano in HL7 FHIR, non CDA):

- `js/fhir-terminology.js` — mappa i 17 tipi di esame e i 24 tag patologia realmente usati nell'app sui codici LOINC/SNOMED CT corrispondenti.
- `js/fhir-export.js` — costruisce risorse FHIR R4 vere (Patient, Practitioner, Observation, Condition, Procedure, NutritionOrder) e le assembla in un Bundle per paziente.
- **SEZIONE 51** di `supabase_setup.sql` — tabella `fhir_export_queue` + trigger di database: ogni volta che cambia un dato clinico rilevante (tag/patologia, esame, BIA, piano) la cartella viene segnata automaticamente come "da risincronizzare". Nessuna azione manuale del dietista.
- `api/cron.js` (`?job=fhir-sync`, ogni 6 ore) — svuota la coda: per ogni cartella pending ricostruisce il Bundle FHIR aggiornato e lo invia al Gateway FSE.

Questa è la differenza tra "export puntuale" e "flusso continuo": prima serviva un'azione manuale per ogni singolo invio, ora ogni scrittura clinica rilevante genera automaticamente un aggiornamento in coda.

## Cosa manca perché sia operativo — e perché non posso completarlo da codice

Il job `fhir-sync` **costruisce e valida** il Bundle ad ogni esecuzione (verificabile fin da subito, vedi sotto), ma **non lo invia** finché non sono configurate `FSE_GATEWAY_URL` e `FSE_GATEWAY_TOKEN` — perché quell'endpoint non esiste finché non hai completato una registrazione formale con la Regione. Non è una questione tecnica risolvibile scrivendo altro codice: è un processo amministrativo che deve fare la struttura/il professionista, io non ho — e non posso ottenere — le credenziali.

Dalle specifiche tecniche FSE 2.0 (versione Regione Toscana, rappresentativa dello standard nazionale), il percorso è:

1. **Adesione all'Avviso regionale** per i fornitori di software privati (ogni Regione pubblica il proprio; il tuo cliente/struttura target determina quale).
2. **Registrazione su Sogei CA** — l'infrastruttura di certificazione usata per FSE 2.0. Dopo l'adesione, il rappresentante della struttura riceve via email (da `noreply.fse_support@sogei.it`) le credenziali per registrare te come fornitore software con ruolo di *Certificate Manager*.
3. **Test in ambiente Stage** — l'ambiente di test regionale per la verifica tecnica del software prima dell'ammissione in produzione. È qui che andrebbe puntato `FSE_GATEWAY_URL` per un primo collaudo reale.
4. **Ammissione in produzione** — solo dopo il superamento dei test Stage.

Finché non hai fatto almeno il punto 1-2 con una Regione/struttura specifica, non esiste un URL reale a cui il job possa collegarsi — è per questo che l'invio resta esplicitamente disattivato (nessun URL hardcoded, nessun finto successo).

## Come verificare fin da subito che la generazione FHIR sia corretta

Non serve aspettare le credenziali per controllare che i Bundle generati siano strutturalmente corretti:

```bash
node -e "
import('./api/_fhir.js').then(({ loadFhirModules }) => {
  const { buildBundleForCartella, validateBundleStructure } = loadFhirModules();
  const bundle = buildBundleForCartella({ /* dati di test */ });
  console.log(JSON.stringify(validateBundleStructure(bundle), null, 2));
});
"
```

`validateBundleStructure()` controlla i vincoli strutturali minimi di un Bundle FHIR R4 (resourceType, fullUrl, riferimenti interni risolvibili) — non è un test contro il Gateway reale (nessuno strumento locale può sostituirlo), ma intercetta bug di generazione prima ancora di avere le credenziali.

Puoi anche eseguire il job stesso in modalità "dry run" semplicemente **non** impostando `FSE_GATEWAY_URL`: la risposta del job (`{ ok, checked, built, sent, failed, gatewayConfigured }`) mostra quanti Bundle sono stati costruiti e validati con successo, senza inviare nulla.

## Quando avrai le credenziali Stage

1. Imposta su Vercel:
   - `FSE_GATEWAY_URL` — endpoint dell'ambiente Stage fornito dalla Regione
   - `FSE_GATEWAY_TOKEN` — se il Gateway usa un bearer token; se invece richiede mutua TLS con certificato client (comune per Sogei CA), il job in `api/cron.js` andrà esteso per quello — non è la stessa cosa di un semplice header Authorization, dimmelo quando ci arrivi così lo implemento correttamente.
2. Esegui `?job=fhir-sync` manualmente una prima volta (con l'header `Authorization: Bearer <CRON_SECRET>`) e controlla la risposta.
3. Solo a quel punto ha senso parlare di "test con il Gateway regionale" in senso stretto.

## Estendere la mappatura LOINC/SNOMED

`js/fhir-terminology.js` mappa esattamente i valori oggi selezionabili in UI (`#esame-tipo` in pazienti.html, `PREDEFINED_TAGS`). Se aggiungi un nuovo tipo di esame o un nuovo tag patologia altrove nell'app, **aggiungilo anche lì** — altrimenti quel dato specifico viene semplicemente escluso dal Bundle (comportamento voluto: meglio omettere un dato non mappato che trasmettere un codice sbagliato). `FhirTerminology.findUnmapped()` aiuta a individuare i disallineamenti.

## Cosa NON è ancora incluso

- Invio effettivo (bloccato sulle credenziali, vedi sopra).
- Autenticazione mutua TLS/certificato client, se richiesta dal Gateway specifico (da implementare quando noto).
- Retry/backoff oltre al singolo tentativo per esecuzione del cron (un fallimento resta `status='failed'` con l'errore in `last_error`; va deciso se e come re-accodarlo automaticamente).
- Copertura di `note_specialistiche` e delle pagine specialistiche per patologia (disfagia, diabete, ecc.) nel Bundle — oggi la coda si attiva solo su cartelle/esami_biochimici/bia_records/piani. Estendibile aggiungendo quelle tabelle al loop della SEZIONE 51 quando serve.
