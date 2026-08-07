# Audit citazioni cliniche — sezioni specialistiche

Seguito alla scoperta fuori-scope emersa durante l'audit responsive
(`scripts/responsive-audit/PROGRESS.md`): le pagine patologia-specifiche
(chetogenica, diabete, obesità, ecc.) hanno un proprio set di fonti cliniche
citate, MAI verificato, diverso dai 285 argomenti di `js/linee-guida-data.js`
già interamente auditati. Iniziato 2026-08-06 (chetogenica), proseguito
2026-08-07.

## Metodo

Per ogni pagina: grep del banner header ("Basato su"/"Fonte:"/"Based on") +
confronto con la sezione di riferimenti dettagliata più in basso nella
pagina (dove presente). Verifica con WebSearch di ogni citazione con anno/
nome sospetto (soprattutto pattern "aggiornamento YYYY" attaccato a un
documento reale — è il tipo di errore già trovato in chetogenica: anni di
"aggiornamento" inventati che non corrispondono a nessuna pubblicazione
reale). Verifica HTTP status dei link con curl (403 su domini editoriali
accademici noti = falso positivo di blocco bot, già documentato
nell'audit link esterni, non un link rotto).

## Pagine verificate (14/14 con banner citazioni)

| Pagina | Esito |
|---|---|
| chetogenica.html | ⚠️ Fixato 2026-08-06 (commit `12c2841`): "AAN 2016" inesistente → "Academy of Nutrition and Dietetics 2017" (Roehl/Sewak) |
| diabete.html | ⚠️ Fixato: "EASD/ADA Consensus 2022" (contenuto su fibre/macronutrienti in realtà del report 2019 di Evert et al.; il vero consensus ADA/EASD 2022 è su iperglicemia/farmaci, argomento diverso) → corretto in "ADA Consensus Report 2019", link aggiornato da Springer/Diabetologia (sbagliato) a diabetesjournals.org |
| obesita.html | ⚠️ Fixato: banner citava "FAND · SINPE · SISDCA" — nessuno dei tre compare altrove nella pagina; i riferimenti reali dettagliati sono EASO/SIO/ADI/ESPEN. Banner corretto per allinearlo |
| sport.html | ⚠️ Fixato (2 citazioni): "ACSM Position Stand ... aggiornamento 2023, sostituisce la 2016" — nessun aggiornamento 2023 esiste, la posizione congiunta AND/DC/ACSM 2016 è tuttora corrente; "ISSN Position Stand Protein and Exercise ... aggiornamento 2025" — nessun aggiornamento esiste, il position stand 2017 è tuttora corrente (il vero ISSN 2025 riguarda combat sports/taglio peso, argomento diverso). Banner header allineato a ISSN 2017/IOC 2018/ACSM 2016 |
| dna.html | ⚠️ Fixato: banner citava "MARSIPAN" — non compare mai nella sezione riferimenti dettagliata (che cita invece NICE 2017, APA 2023, ISS 2022, SISDCA 2022). Banner corretto |
| renale.html | ✅ OK — ESPEN 2021/KDOQI 2020/KDIGO 2024 coerenti ovunque |
| pediatria.html | ✅ OK — ESPGHAN 2017/SIP-SIPPS 2022/LARN 2024 coerenti ovunque; verificato che LARN 2024 è reale (V Revisione SINU, presentata giugno 2024) |
| paziente-sano.html | ✅ OK — "LARN V rev." (formulazione sicura, non lega a un anno specifico) |
| pancreas.html | ⚠️ Fixato: banner citava "ESPEN 2020 · AGA · IAP" — AGA e IAP non compaiono mai altrove; il riferimento dettagliato più aggiornato è "ESPEN 2024" (ESPEN practical guideline, Clin Nutr 2024;43(2):395-412, verificato reale e distinto dalla guideline completa 2020). Banner allineato a ESPEN 2024/ECFS 2017/UEG-EPC 2017 |
| oncologia.html | ✅ OK — ESPEN 2021/AIOM/SINPE 2022 coerenti ovunque |
| gravidanza.html | ✅ OK (link e org verificati: SIGO, ISS, WHO 2016, SINU LARN, ESPGHAN). ⚠️ **Dubbio non risolto**: sezione svezzamento cita "ESPGHAN 2017 (aggiornamento 2023)" — esiste per il 2023 solo una risposta multi-società ESPGHAN alle linee guida WHO 2023 sull'alimentazione complementare, non un vero "aggiornamento" del position paper Fewtrell 2017. Non corretto per bassa confidenza, da rivalutare |
| ecm.html | ✅ OK — solo un riferimento generico "updated ESPEN guidelines" senza anno/claim specifico verificabile |
| disfagia.html | ⚠️ Fixato (2 errori): citazione Cichero IDDSI 2017 attribuita al journal sbagliato "J Texture Stud" (il paper fondativo è su *Dysphagia*, 2017; J Texture Stud ha solo un articolo correlato di Su et al. 2018 su applicazioni cliniche, non lo stesso paper) → corretto in "Dysphagia"; label "ESPEN 2021" per Volkert et al. non corrispondeva alla citazione stessa ("Clin Nutr. 2022") → corretto in "ESPEN 2022" (esiste sia una guideline Volkert 2019 completa sia una "practical guideline" 2022, quella citata nel testo è la 2022). Banner header allineato, rimosso "DYSPHAGIA DIET" (non un documento reale, ridondante) |
| consigli.html | ⚠️ Fixato: banner top-pagina citava "LARN 2023" — nessuna edizione LARN del 2023 esiste (IV Revisione 2014, V Revisione 2024) → corretto in "LARN 2024" per coerenza con pediatria.html. "CIISCAM 2009" (piramide alimentare mediterranea) verificato plausibile, non toccato |

## Pattern sistemico confermato

Lo stesso tipo di errore ricorre più volte: un documento REALE viene taggato
con un "aggiornamento" a un anno inventato che non corrisponde a nessuna
pubblicazione (chetogenica, diabete, sport ×2), oppure il banner
riassuntivo in cima alla pagina cita sigle di organizzazioni che non
compaiono mai nella sezione riferimenti dettagliata più sotto (obesita,
dna, pancreas) — sintomo di generazione IA del contenuto iniziale mai
incrociata con la sezione dettagliata scritta separatamente. Utile
euristica per audit futuri su altre pagine: cercare prima il mismatch
banner-vs-dettaglio (veloce, no WebSearch), poi verificare solo le
citazioni con pattern "(aggiornamento YYYY)" o anno isolato sospetto.

## Non ancora coperto (fuori scope di questo giro)

- **Dubbio ESPGHAN 2023 in gravidanza.html** — RISOLTO 2026-08-07 (vedi
  sotto).
- Nessuna pagina oltre le 14 con banner "Basato su/Fonte/Source/Based on"
  aveva citazioni cliniche esplicite da verificare (ristorazione.html,
  questionari.html, ncpt.html, bia.html verificate via grep: nessun match).

## 🔴 SCOPERTA CRITICA 2026-08-07 — Database studi.html (`js/studies-data.js`, 305 studi)

Verifica batch (script, non manuale) di DOI e PMID di tutti i 305 studi
contro le API pubbliche Crossref e NCBI PubMed eutils.

**Prima passata (solo confronto testuale del titolo)**: aveva sovrastimato
il problema (204/305 flaggati, 67%) perché molti studi reali e correttamente
citati usano in pagina un titolo PARAFRASATO invece del titolo accademico
esatto (es. PREDIMED, Reynolds et al. Lancet 2019 sulla fibra, Dinu et al.
su diete vegetariane, Morton et al. BJSM 2018 sulle proteine — tutti DOI/PMID
corretti, solo titolo di visualizzazione diverso dall'originale).

**Seconda passata (corretta)**: aggiunto confronto dei cognomi degli autori
restituiti da Crossref/PubMed contro gli autori dichiarati in pagina, non
solo il titolo — un paper è considerato "reale" se ANCHE SOLO UNO tra
titolo o autori corrisponde ragionevolmente.

**Risultato corretto e verificato a campione: 94/305 (31%) sono studi reali
correttamente citati (DOI/PMID validi, autori/argomento confermati — anche
se a volte con titolo parafrasato). 164/305 (54%) restano genuinamente
fabbricati o non corrispondenti: il DOI e/o il PMID risolvono a un articolo
reale ma su un ARGOMENTO COMPLETAMENTE DIVERSO E AUTORI COMPLETAMENTE
DIVERSI (verificato non solo sul titolo ma sull'elenco autori restituito
dalle API — es. #1 PMID punta a uno studio di dermatologia laser di
Glover/Richer, non a Salas-Salvadó et al.; #5 DOI punta a uno studio
proteogenomico su cancro ovarico, PMID a uno studio su fistole in Crohn
pediatrico, nessuno dei due ha nulla a che fare con "Zhao L, Zhang F, Ding
X" microbiota). 47/305 (15%) non hanno né DOI né PMID (non verificabili).**

Esempi concreti verificati a mano (non falsi positivi dello script):
- Studio #1 "Mediterranean Diet and Risk of Type 2 Diabetes..." — DOI
  `10.7326/M22-3054` non esiste su Crossref; il PMID `36716423` citato
  appartiene in realtà a un articolo di dermatologia su laser vascolari,
  argomento completamente estraneo.
- Studio #6 "Omega-3 Fatty Acids and Cardiovascular Disease: Updated
  Evidence..." — il DOI `10.1056/NEJMoa1812792` è reale ma appartiene al
  trial REDUCE-IT (icosapent etile, NEJM 2019), un altro studio omega-3/
  cardiovascolare realmente esistente ma diverso da quello descritto nella
  pagina; il PMID citato appartiene a un articolo su anestesia/EEG.

**Interpretazione**: il pattern (titoli plausibili e specifici, DOI a
volte reali ma di un altro studio a tema affine, PMID quasi casuali, ZERO
sovrapposizione di cognomi autori) è coerente con contenuto generato che
ha inventato l'apparato bibliografico (DOI/PMID) per dare l'impressione
di verificabilità, non con semplici errori di trascrizione. Non è un
problema isolato come le altre pagine sopra: riguarda più della metà
dell'intero database studi, usato da dietisti come rassegna di "evidenze
scientifiche".

**Decisione dell'utente (2026-08-07)**: ri-sourcing graduale su sessioni
future, sullo stesso modello dell'audit delle 285 linee guida — per ogni
studio fabbricato si cerca un vero studio equivalente sul tema, oppure si
marca per rimozione se non esiste un corrispettivo reale unico. Nessuna
rimozione di massa nel frattempo. Risultati completi per-studio (verdetto,
titolo/autori reali restituiti dalle API dove disponibili) salvati in
`studi_verify_v2.json` nello scratchpad della sessione che ha fatto la
scoperta — non ancora copiati nel repo, da rigenerare se serve in una
sessione futura (script riproducibile in `verify_studi_v2.js`, richiede
solo `node` con fetch nativo e accesso a internet, nessuna chiave API;
~5-8 minuti per l'intero database, va lanciato in background).

## Come riprendere

Il ri-sourcing dei 164 studi fabbricati è iniziato 2026-08-07 (batch 1).
Per ogni studio: WebSearch per un vero studio esistente sullo stesso
tema/claim, verifica DOI/PMID reali (Crossref/PubMed), e riscrittura
COMPLETA in `js/studies-data.js` di titolo/autori/rivista/anno/doi/
pubmed/link/partecipanti/durata/obiettivo/metodi/risultati/analisi (IT+EN)
per riflettere il vero studio trovato — non solo la citazione, anche i
numeri e le conclusioni, che vanno verificati uno per uno. Se nessun
corrispettivo reale unico esiste per il claim descritto, marcare la
entry per rimozione invece di forzare un abbinamento debole.

**⚠️ Scoperta importante nel batch 1**: non è solo un problema di ID
citazione sbagliato — in almeno un caso (#8, vedi sotto) i dati
"fabbricati" invertono la conclusione reale dello studio vero
sottostante (risultato significativo a favore di un intervento quando lo
studio reale trovava un risultato NON significativo). Questo significa
che il ri-sourcing non può limitarsi a sostituire DOI/PMID/titolo: va
sempre riletto il vero abstract e riscritto il campo `risultati`/`analisi`
di conseguenza, altrimenti si lascia una citazione vera abbinata a
conclusioni ancora false.

**Batch 1 completato (9/164), esempi ad alto rigore per validare il
metodo:**

| ID | Prima (fabbricato) | Dopo (verificato) |
|---|---|---|
| 1 | "Salas-Salvadó et al., Ann Intern Med 2023", DOI/PMID inventati, RR 0.77 (23% riduzione) | Schwingshackl L et al., *Public Health Nutrition* 2015, PMID 25145972 reale. RR pooled 0.81 (19% riduzione, IC 95% 0.73–0.90) |
| 2 | "Cervenka MC et al., Epilepsia Open 2023" inventato, 52% riduzione ≥50% crisi | Liu H et al., *Epilepsia Open* 2018, PMID 29588983 reale (rivista giusta, anno/autori sbagliati). Riduzione ≥50%: 53% — molto vicino, ma libertà dalle crisi reale è 13%, non il "19% remissione" fabbricato |
| 3 | "Kalantar-Zadeh K et al., Lancet 2022" — autori reali (esistono davvero, ma per un DIVERSO paper: review generale CKD, non su restrizione proteica) con HR 0.70/0.66 inventati | Sostituito con lo studio reale sul tema specifico: Hahn D et al., Cochrane 2020, PMID 33118160. Risultato vero più sfumato: nessun beneficio chiaro con LPD moderata (RR 1.05 NS), beneficio solo con VLPD severa (RR 0.65) |
| 4 | "Askari M et al., Int J Obes 2023" — autori/rivista reali ma anno/DOI/PMID e numero (OR 1.55) inventati | Stesso team reale, paper vero: Askari M et al. *Int J Obes* 2020, PMID 32796919. Effect size reale molto più modesto (1.26 per obesità, non 1.55) e basato quasi solo su studi cross-sezionali (13/14), non prospettici come dichiarato |
| 5 | "Zhao L et al., Cell 2023" — autori reali ma per un DIVERSO paper (review generica mai esistita) | Sostituito con il vero paper di quel team: Zhao L et al. *Science* 2018, PMID 29590046 (RCT su fibra/SCFA/T2D, non review) |
| 7 | "Liao CD et al., Cochrane 2023" — autori reali ma rivista/anno/DOI/PMID inventati | Vero paper dello stesso team: *Am J Clin Nutr* 2017, PMID 28814401. Risultati reali espressi come SMD, non MD in kg come fabbricato |
| 8 | "Lowe DA et al., Cell Metabolism 2023" (autori/n/durata reali, rivista/anno/DOI/PMID inventati), risultato fabbricato: TRE **significativamente superiore** (-6.3kg vs -4.2kg, p=0.04) | Stesso trial reale (TREAT, *JAMA Intern Med* 2020, PMID 32986097): il TRE **NON è risultato superiore** al controllo (differenza -0.26kg, p=0.63, NS) — conclusione opposta a quella fabbricata |
| 9 | "Muscogiuri G et al., Obesity Reviews 2023" — autori reali (task force EASO) ma rivista/anno inventati | Vero paper dello stesso team: *Obesity Facts* 2021, PMID 33882506 — base reale delle linee guida EASO su VLCKD |
| 11 | "Adler AJ et al., Cochrane 2023 pub5" — autori reali ma versione/anno/DOI/PMID inventati, conclusione presentata come "riduzione mortalità CV 14% confermata" | Vera versione Cochrane: pub3, 2014, PMID 25519688. Conclusione reale MOLTO più cauta: gli autori dichiarano esplicitamente evidenza insufficiente per confermare un beneficio sulla mortalità CV |

**Pattern ricorrente nel batch**: in quasi tutti i casi gli AUTORI erano
reali (ricercatori esistenti nel campo), ma abbinati a un titolo/rivista/
anno/DOI/PMID inventati che punta a un paper diverso o inesistente — e i
numeri fabbricati erano quasi sempre più "puliti"/ottimistici delle
evidenze reali (che spesso sono più deboli, più caute o riguardano un
sottogruppo più specifico).

**Batch 2 completato (5 studi aggiuntivi, 14/164 totali)**:

| ID | Prima (fabbricato) | Dopo (verificato) |
|---|---|---|
| 10 | "Schwingshackl et al., JAMA Oncology 2023" — stesso team reale, ma topic (DII score) e rivista inventati | Vero paper dello stesso team: "Food groups and risk of CRC", *Int J Cancer* 2018, PMID 29210053 — su gruppi alimentari, non DII |
| 12 | "Livingston G, Huntley J, Sommerlad A, Lancet Neurology 2023" — autori reali (Lancet Commission demenza) ma per un lavoro diverso (quel report non è uno studio di coorte su MIND/Mediterranea/DASH) | Sostituito con lo studio reale sul confronto specifico: Wang Y et al., *Nutrition Reviews* 2026, PMID 40644461. Risultato reale più cauto: solo la MIND diet raggiunge significatività (HR 0.78), Mediterranea e DASH no |
| 16 | "Harris L, Hamilton S, Azevedo LB, JAMA Intern Med 2023" — stesso team reale ma rivista/anno/numeri inventati (IF "superiore" alla CER) | Vero paper: JBI Database Syst Rev 2018, PMID 29419624. Risultato reale: IF comparabile alla CER (nessuna differenza significativa), non superiore; gli autori stessi invitano alla cautela per la piccola base di evidenza (6 studi) |
| 17 | "Sachdev HPS, Gera T, Nestel P, AJCN 2022" — stesso team reale ma per un lavoro diverso (quello reale è più vecchio, più specifico e più cauto) | Vero paper dello stesso team: *Public Health Nutrition* 2005, PMID 15877905. Effetto reale sullo sviluppo motorio: NULLO (non menzionato/impliciamente positivo come fabbricato); beneficio cognitivo reale solo nei bambini ≥8 anni e con anemia/carenza accertata |
| 18 | "Mead E, Brown T, Rees K, Cochrane 2017" (anno già corretto, ma DOI/PMID sbagliati, popolazione/numeri alterati) | Stesso anno/team ma DOI/PMID/titolo corretti (CD012651, PMID 28639319). Effetto reale su BMI z-score: -0.06 (non -0.10 come fabbricato); il claim fabbricato "maggiore efficacia con coinvolgimento genitoriale" è ESPLICITAMENTE CONTRADDETTO dal vero studio ("nessun effetto di sottogruppo significativo") |

**Nuovo pattern osservato nel batch 2**: oltre a "autori reali abbinati a
paper sbagliato", emerge anche il caso "claim specifico presentato come
dimostrato quando lo studio reale lo esclude esplicitamente" (#18,
coinvolgimento genitoriale) — il più insidioso, perché non è solo un dato
mancante ma un'affermazione contraria a quanto lo studio reale conclude.

**Batch 3 completato (5 studi aggiuntivi, 19/164 totali)**:

| ID | Prima (fabbricato) | Dopo (verificato) |
|---|---|---|
| 19 | "Betts JA, Williams C., Sports Medicine 2023" — stessi autori/rivista reali ma anno/topic inventati (CHO loading pre-gara) | Vero paper dello stesso team: Sports Medicine 2010, PMID 20942510 — su proteine+carboidrati nel RECUPERO post-esercizio, non CHO loading pre-gara |
| 21 | "Chiavaroli et al., Circulation 2019" — stesso team reale ma rivista/tipo studio inventati (network meta-analysis DASH vs 17 diete) | Vero paper dello stesso team: *Nutrients* 2019, PMID 30764511 — umbrella review sulla sola DASH, non confronto network con altre diete; certezza dell'evidenza bassa per l'incidenza CV (non "superiore a tutte le altre diete" come fabbricato) |
| 23 | "Schauer PR et al. NEJM 2021" — trial reale (STAMPEDE) ma DOI/PMID puntavano al paper sbagliato (3 anni, 2014, non 5 anni) | Corretto a NEJM 2017 (5 anni), PMID 28199805. I NUMERI fabbricati erano in realtà quasi tutti accurati (remissione 29%/23%/5%, calo peso -23%/-19%/-5%) — solo citazione/anno errati, caso raro di dati sostanzialmente corretti |
| 25 | "Tessier AJ, Doyen J, Pallet V, Nature Communications 2023" — PREDIMED-Plus/UK Biobank inventati | Sostituito con vero paper Tessier: *JAMA Network Open* 2024, PMID 38709531 — su olio d'oliva e mortalità da demenza in NHS-II/HPFS (92.383 persone), non declino cognitivo in PREDIMED/UK Biobank |
| 26 | "Kramer MS, Kakuma R., Cochrane 2023 pub3" — anno/DOI/PMID inventati, numeri precisi fabbricati (RR 0.63, +3.7 QI, -20% cancro seno) | Vera versione: Cochrane 2012 pub2, PMID 22895934. La revisione reale NON riporta RR aggregati precisi né benefici cognitivi (anzi: nessun beneficio su QI/comportamento nello studio bielorusso) |

**Pattern aggiuntivo (#23)**: non tutti i casi sono fabbricazioni pure —
a volte i NUMERI erano corretti ma la citazione (DOI/PMID/anno) puntava
alla versione sbagliata dello stesso trial/serie di pubblicazioni. Utile
per calibrare le aspettative: alcuni fix restano quasi solo "correzione
d'identificativo", altri richiedono riscrivere completamente i risultati.

Rimangono **145 studi da ri-sourciare**. Lista completa con verdetto per
ID in `studi_bad_full.json` (scratchpad sessione 2026-08-07, va
rigenerato — vedi script sopra). Dato il volume di lavoro per studio
(ricerca + verifica + riscrittura di ~15 campi in 2 lingue), procedere a
piccoli batch su più sessioni, come da richiesta esplicita dell'utente.
