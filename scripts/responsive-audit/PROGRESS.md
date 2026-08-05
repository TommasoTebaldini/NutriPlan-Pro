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

## Stato — Lotto 3/6 (completato 2026-08-05)

| Pagina | Tablet | Mobile | Note |
|---|---|---|---|
| ecm.html | ✅ | ✅ | Link inline `ecm.agenas.it` e `asand.it` verificati 200 OK con curl (rilevante: l'utente ha chiesto esplicitamente di controllare i "corsi ECM") |
| gdpr.html | ✅ | ✅ | Tabella mostrava "Caricamento..." in entrambi i formati — probabile falso positivo di timing, non un bug di layout; menu a tab e card si adattano correttamente |
| gravidanza.html | ✅ | ✅ | Campi form e menu a tab si impilano correttamente |
| impostazioni.html | ✅ | ✅ | Griglia temi (8 swatch colore) si riorganizza 7→3→1 colonne, selettore lingua si adatta bene |
| index.html | — | — | È un redirect/rewrite ad app.html (stesso contenuto, stesso URL finale) — già coperto in Lotto 1 (⚠️ tabella alimenti tagliata, vedi riga app.html) |
| integratori.html | ✅ | ✅ | Card categorie (62 prodotti/10 categorie) si impilano bene |
| linee-guida.html | ✅ | ✅ | Layout OK. **Nota importante non di formattazione**: vedi sezione "Scoperta: cache 7 giorni sui file dati" sotto |
| moduli.html | ✅ | ✅ | Barra tab (5 moduli) scorre orizzontalmente con frecce ◀▶ visibili — buon pattern, coerente con database.html |

### Scoperta: cache 7 giorni sui file dati JS (fuori scope formattazione, ma rilevante)

Durante il test di `linee-guida.html` è emerso che `vercel.json` imposta
`Cache-Control: public, max-age=604800, stale-while-revalidate=86400` su
**tutti** i file `/js/*.js`, incluse le fonti dati cliniche
(`linee-guida-data.min.js`, `consigli-data.min.js`, `ricette-db.min.js`),
**senza alcun cache-busting** (nessuna query string di versione o hash nel
nome file). Le pagine HTML invece sono correttamente `no-cache,
must-revalidate` (si aggiornano sempre).

Verificato che il contenuto attualmente sul server è corretto e aggiornato
(confermato via fetch diretto `no-store` e lettura del file `.min.js`
deployato). **Non è un bug oggi**, ma è un rischio concreto per il futuro:
qualunque correzione ai dati clinici (es. un'altra revisione delle 285
patologie) non sarà visibile a un browser con cache calda per fino a 7
giorni dopo il deploy, perché il nome del file JS non cambia mai. Da
valutare se aggiungere un parametro di versione (es.
`linee-guida-data.min.js?v=2`) o un hash nel nome file ad ogni build, così
il browser scarica sempre l'ultima versione subito dopo un deploy.
Segnalato all'utente, non corretto autonomamente (è una scelta di
configurazione del deploy).

## Stato — Lotto 4/6 (completato 2026-08-05)

| Pagina | Tablet | Mobile | Note |
|---|---|---|---|
| ncpt.html | ✅ | ✅ | Stepper 4 fasi e form si adattano bene (tour di benvenuto presente al primo accesso, non un bug) |
| obesita.html | ✅ | ✅ | Menu 6 tab si riorganizza su 2 righe |
| oncologia.html | ✅ | ✅ | Menu 7 tab si riorganizza su 2 righe |
| pagamenti.html | ✅ | ✅ | Card statistiche mostrava "—" nei test — probabile falso positivo di timing (stesso pattern di analytics.html), da riverificare con calma se si vuole certezza |
| pancreas.html | ✅ | ✅ | — |
| patient-portal.html | ✅ | ⚠️ | **Bug confermato via JS** (non falso positivo): la barra dei 10 tab (`.pp-tab-bar`) ha `overflow-x:hidden` con contenuto largo 724px in uno spazio di 358px su mobile — 5 tab su 10 (Privacy, Statistiche, Macro, Attività, Progressi) sono completamente irraggiungibili dal paziente su telefono, nessuno scroll o a-capo. Su tablet (768px) invece tutti i 10 tab entrano correttamente (verificato: scrollWidth=clientWidth=736px). **Rilevante**: è il portale rivolto al paziente, verosimilmente usato spesso da telefono |
| patient-view.html | ✅ | ✅ | Richiede parametri URL (id documento) per mostrare contenuto reale; testato solo lo stato "Nessun documento", che è centrato e leggibile su entrambi i formati — non verificabile a fondo senza un link reale con documento |
| patologie.html | ✅ | ✅ | Griglia 13 sezioni specialistiche e card diete (285 schemi) si riorganizzano bene; badge fonte (es. "ESPEN 2023" per Diabete) qui appartengono a un dataset diverso da linee-guida.html (schemi dietetici, non linee guida) — non confuso con la scoperta cache sopra |

## Stato — Lotto 5/6: paziente-sano, pazienti, pediatria, piano-app-pazienti, privacy, profilo-pubblico, questionari, renale

*(da fare)*

## Stato — Lotto 6/6: ricette, ristorazione, sport, studi, termini, valutazione, visita, whatsapp

*(da fare)*
