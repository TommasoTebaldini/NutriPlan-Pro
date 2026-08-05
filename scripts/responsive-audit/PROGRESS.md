# Audit formattazione responsive (PC/tablet/mobile) + link esterni

Verifica sistematica di tutte le 48 pagine HTML di NutriPlan-Pro (online come
"DietPlan Pro", https://app.dietplan-pro.com/) su 3 formati, più controllo di
tutti i link esterni delle fonti cliniche. Lavoro multi-sessione, iniziato
2026-08-04.

## Metodo

- **Link esterni**: già completato (2026-08-04, commit `d93cf07`). Controllo
  HTTP status di tutti i 190 url unici in `js/linee-guida-data.js` — 1 link
  rotto trovato e corretto (eurothyroid.com), ~50 "falliti" erano falsi
  positivi di blocco bot degli editori accademici (verificato con curl/WebFetch
  browser-like).
- **Formattazione responsive**: il ridimensionamento reale della finestra
  browser (`resize_window`) NON funziona in questo ambiente — la viewport
  resta fissa (confermato via `window.innerWidth`). Soluzione: iniezione di un
  iframe con larghezza forzata (768px tablet, 390px mobile) sulla stessa
  pagina — le media query CSS si attivano correttamente dentro l'iframe
  (verificato). Cattura: screenshot normale per desktop + zoom-crop
  sull'iframe per tablet/mobile.
- **Attenzione ai falsi positivi**: alcuni valori numerici/testo possono apparire
  "vuoti" o sbiaditi nello screenshot per via del breve tempo di attesa dopo
  l'iniezione (dati caricati in modo asincrono) — non sempre indicano un bug
  reale. Da riverificare quando segnalato come "possibile falso positivo".

## Come riprendere una sessione futura

1. Trova l'ultimo lotto NON completato nella tabella sotto.
2. Riusa lo script di cattura (vedi conversazione/sessione precedente per il
   codice JS di iniezione iframe — non salvato su file, solo nella cronologia
   chat) su ciascuna pagina del lotto: screenshot desktop, poi iframe 768x700
   e 390x700 con zoom-crop.
3. Segna ogni pagina OK / ⚠️ problema trovato (con descrizione) nella tabella.
4. Commit + push a fine lotto.

## Pattern sistemico già identificato

Le tabelle con molte colonne (dati nutrizionali, elenco utenti) non hanno una
strategia responsive: su alcune pagine vengono tagliate senza scroll
orizzontale (bug), su altre (es. anamnesi.html) scrollano correttamente
(pattern da replicare). Da tenere a mente come raccomandazione generale, non
solo bug isolati per pagina.

## Stato — Lotto 1/6 (completato 2026-08-04)

| Pagina | Tablet | Mobile | Note |
|---|---|---|---|
| abbonamento.html | ✅ | ✅ | — |
| admin.html | ⚠️ | ⚠️ | Tabella "Utenti Registrati" non si adatta: colonne Admin/Registrato/Azioni tagliate fuori, nessuno scroll orizzontale |
| agenda.html | ✅ | ✅ | Notifica toast leggermente tagliata a bordo schermo (minore) |
| ai.html | ✅ | ✅ | — |
| analytics.html | ✅ | ✅ | Valori numerici mostravano "—" nei test — probabile falso positivo (attesa caricamento dati troppo corta), da riverificare con calma se si vuole certezza |
| anamnesi.html | ⚠️ | ✅ | Tablet: testo tabella sbiadito (possibile falso positivo di caricamento, da riverificare). Mobile: tabella scrolla orizzontalmente correttamente (buon pattern) |
| app.html (Piano Alimentare) | ⚠️ | ⚠️ | Tabella alimenti (Colazione ecc.): colonna "Fonte" e altre tagliate fuori, stesso problema di admin.html |
| bia.html | ✅ | ✅ | — |

## Stato — Lotto 2/6 (completato 2026-08-05)

| Pagina | Tablet | Mobile | Note |
|---|---|---|---|
| broadcast.html | ✅ | ✅ | — |
| chat.html | ✅ | ✅ | — |
| chetogenica.html | ✅ | ✅ | Cita "ILAE 2018 · AAN 2016 · ESPEN 2021" — set di fonti DIVERSO da quello in linee-guida-data.js (vedi nota sotto) |
| consigli.html | ✅ | ✅ | Conferma "285 patologie", coerente col dataset già auditato |
| database.html | ✅ | ✅ | Tabella a 16 colonne (3521 alimenti) gestita BENE: scroll orizzontale visibile con frecce ◀▶. Contraddice l'ipotesi "nessuna tabella ha strategia responsive" — il pattern è incoerente tra pagine, non assente ovunque |
| diabete.html | ✅ | ✅ | Cita "ADA 2024 · EASD · AMD-SID 2023" — set di fonti DIVERSO da linee-guida-data.js (vedi nota sotto) |
| disfagia.html | ⚠️ | ⚠️ | Tabella "Classificazione IDDSI 2019" (5 colonne) tagliata fuori, nessuno scroll — stesso bug di admin.html/app.html |
| dna.html (contenuto: DCA) | ✅ | ✅ | Nome file fuorviante (dna.html → contenuto è Disturbi Comportamento Alimentare, non genetica). Formattazione OK per il contenuto visibile; tabella "Epidemiologia" più in basso non verificata (fuori dall'area catturata) |

**Scoperta importante fuori scope (da valutare in futuro)**: le "sezioni specialistiche" (chetogenica.html, diabete.html, e probabilmente le altre pagine patologia-specifiche: disfagia, dna/DCA, ecc.) sembrano avere un **proprio contenuto clinico con fonti citate indipendenti**, DIVERSO dai 285 argomenti in `js/linee-guida-data.js` già interamente verificati. Non è stato controllato se queste fonti sono corrette — è un dataset separato mai auditato finora. Da segnalare esplicitamente all'utente, non risolvere di propria iniziativa.

## Stato — Lotto 3/6: ecm, gdpr, gravidanza, impostazioni, index, integratori, linee-guida, moduli

*(da fare)*

## Stato — Lotto 3/6: ecm, gdpr, gravidanza, impostazioni, index, integratori, linee-guida, moduli

*(da fare)*

## Stato — Lotto 4/6: ncpt, obesita, oncologia, pagamenti, pancreas, patient-portal, patient-view, patologie

*(da fare)*

## Stato — Lotto 5/6: paziente-sano, pazienti, pediatria, piano-app-pazienti, privacy, profilo-pubblico, questionari, renale

*(da fare)*

## Stato — Lotto 6/6: ricette, ristorazione, sport, studi, termini, valutazione, visita, whatsapp

*(da fare)*
