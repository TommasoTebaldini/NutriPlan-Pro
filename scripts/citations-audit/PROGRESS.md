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

**Batch 4 (3 studi, commit `9a8c625`)**: #27 DAPA-CKD (numeri quasi tutti
corretti, solo rivista/DOI/PMID sbagliati — NEJM non Lancet); #28
farmacoterapia obesità di Shi et al. (il paper reale è stato RITIRATO E
RIPUBBLICATO nel 2024 dopo rimozione di 5 trial sovrapposti — usata la
versione corrente PMID 38582569); #29 alcol/cirrosi (autori fabbricati
"Huang Z, Chen X, Zhu M" senza riscontro reale, sostituiti con Llamosas-
Falcón et al. 2024 sul tema esatto).

**Batch 5 (4 studi, commit `5f6c605`)**: #30 screening nutrizionale
ospedaliero (Lim et al. 2012, non uno studio sui tool di screening ma
sull'impatto della malnutrizione su costi/degenza/mortalità a 3 anni);
#31 fruttosio (Taskinen/Packard/Borén, ma il vero paper è *Nutrients*
2019 non Cell Metabolism 2022, e non riporta le soglie numeriche precise
fabbricate); #32 probiotici (vera umbrella review classifica TUTTA
l'evidenza come credibilità di Classe IV, la più bassa — dettaglio di
cautela assente nella versione fabbricata); #33 food insecurity/obesità
(Franklin et al. 2012, non 2022 — l'associazione reale è più forte nelle
donne, e la partecipazione a programmi di assistenza alimentare potrebbe
PEGGIORARE gli esiti, dato controintuitivo assente nel fabbricato).

**Batch 6 (3 studi, commit `1974817`)**: #34 zinco (Wessells & Brown 2012
è una STIMA di prevalenza da dati FAO, non un trial sugli effetti della
supplementazione — le percentuali di efficacia fabbricate su diarrea/
polmonite non appartenevano a questa citazione); #36 dieta mediterranea/
MASLD (trial CENTRAL, Gepner et al., *J Hepatol* 2019, non *Hepatology*
2023 — la riduzione del grasso epatico è risultata il MECCANISMO dei
benefici cardiometabolici, non solo un effetto collaterale); #37 linee
guida BDA per IBS (McKenzie et al. 2016 — il low FODMAP è raccomandazione
di SECONDA linea, non prima scelta).

**Batch 7 (3 studi, commit `2fe21a6`)**: #38 dieta e salute mentale
(Firth et al., vero articolo è una clinical review *BMJ* 2020 senza
effect size aggregati, non una meta-analisi *Lancet Psychiatry* come
fabbricato); #39 B12 vegetariani/vegani (Pawlak et al. 2014, non 2023 —
range di prevalenza molto ampi per forte eterogeneità tra studi, non un
singolo dato affidabile); #40 magnesio/T2D-CV (gli autori fabbricati
Barbagallo/Veronese/Dominguez hanno un vero paper *Nutrients* 2022 ma è
un EDITORIALE, non una meta-analisi dose-risposta — sostituito con la
vera meta-analisi di Fang et al., *BMC Medicine* 2016).

**Batch 8 (2 studi, commit `aadbcf9`)**: #42 calcio e rischio CV (gli
autori fabbricati Bolland/Avenell/Baron hanno davvero pubblicato insieme,
ma su un tema diverso e più critico — supplementi di calcio SENZA
vitamina D associati a +30% di rischio di infarto miocardico, *BMJ*
2010 — non uno studio di efficacia sulla prevenzione delle fratture);
#44 UPF e salute mentale (Lane et al., vero paper *Nutrients* 2022 non
PLOS Medicine — 15 dei 17 studi inclusi sono cross-sezionali, limitando
fortemente le conclusioni causali).

**Batch 9 (2 studi, commit `0113266`)**: #45 flavan-3-oli e pressione
(Ottaviani et al., vero studio EPIC-Norfolk *Scientific Reports* 2020 —
studio CROSS-SEZIONALE, non un RCT o network meta-analysis come
fabbricato); #46 PROT-AGE apporto proteico anziani (Bauer/Biolo/
Cederholm et al. 2013, non 2022 — gli autori dichiarano ESPLICITAMENTE
che l'evidenza non è sufficiente per raccomandazioni su distribuzione
nei pasti/timing, contrariamente a consigli spesso presentati altrove
come "basati su PROT-AGE").

**Batch 10 (2 studi, commit `2463f10`)**: #48 selenio/tiroide (Ventura et
al., vero articolo *Int J Endocrinology* 2017, non Nutrients — review
narrativa senza meta-analisi quantitativa come fabbricato); #49
collagene/vitamina C (Shaw et al. 2017, *AJCN* — lo studio meccanicistico
originale del campo, un trial crossover su SOLI 8 uomini che misura
marcatori ematici, non una meta-analisi su esiti clinici come fabbricato).

**Batch 11 (2 studi, commit `974fcba`)**: #51 vitamina D/mortalità (Keum
et al. 2019, *Ann Oncol* — riduce la mortalità ONCOLOGICA ma non
l'incidenza del cancro; un'altra meta-analisi indipendente più ampia su
mortalità per TUTTE le cause non ha trovato alcun effetto significativo);
#52 digiuno intermittente vs restrizione calorica continua (Cioffi et
al. 2018, *J Transl Med* — nessuna differenza significativa sulla
perdita di peso tra i due approcci).

**Batch 12 (2 studi, commit `10ee042`)**: #53 diete plant-based e
rischio CV (sostituito con Satija et al., *JACC* 2017 — solo la versione
di QUALITÀ della dieta plant-based [hPDI] riduce il rischio coronarico,
una versione ricca di cereali raffinati/dolci ancora "vegetale" [uPDI]
aumenta il rischio); #54 proteine e massa muscolare anziani (sostituito
con Whaikid & Piaseu 2024 — il beneficio su massa/forza NON si traduce
in miglioramento della performance fisica funzionale in questa
meta-analisi).

**Batch 13 (2 studi, commit `b94733f`)**: #55 fibra e cancro colon-retto
(Aune et al. 2011, *BMJ* — dato robusto confermato, RR 0.90 per 10g/die);
#57 epidemiologia dell'anemia (Chaparro & Suchdev 2019 — il contributo
della carenza di ferro all'anemia VARIA sostanzialmente per area
geografica e carico infettivo, non è automaticamente sinonimo di
carenza di ferro ovunque).

**Batch 14 (2 studi, commit `781284b`)**: #58 dieta mediterranea e
cognizione (Samieri/Okereke et al. 2013, *J Nutr* — associata a miglior
stato cognitivo generale ma NON a un rallentamento del declino cognitivo
nel tempo, distinzione esplicita nel titolo stesso dello studio reale);
#60 acido folico e difetti del tubo neurale (Copp/Stanier/Greene 2013,
*Lancet Neurology* — review ampia su genetica/sviluppo/chirurgia fetale,
non solo efficacia della supplementazione come fabbricato).

**Batch 15 (2 studi, commit `b1602ff`)**: #61 magnesio/glicemia
(Veronese et al. 2016, *Eur J Clin Nutr* — RCT di SUPPLEMENTAZIONE,
distinto dallo studio osservazionale sull'apporto dietetico già coperto
al #40); #62 flavanoli e prevenzione CV (Heiss/Keen/Kelm, *Eur Heart J*
2010 — basato su ENDPOINT SURROGATI, non su eventi clinici duri come
talvolta presentato).

**Batch 16 (2 studi, commit `0e6c94e`)**: #63 carenza di B12
(Green/Allen/Bjørke-Monsen, *Nat Rev Dis Primers* 2017 — il range di
prevalenza della carenza subclinica, 2.5-26%, ha rilevanza clinica
"non chiara" secondo gli stessi autori); #64 bevande zuccherate e T2D
(Imamura et al., *BMJ* 2015 — dato controintuitivo: le bevande
dolcificate ARTIFICIALMENTE mostravano un'associazione grezza col T2D
perfino più alta di quelle zuccherate, attribuita dagli autori a
causalità inversa, non a un vero effetto dannoso).

**Batch 17 (2 studi, commit `6f0da12`)**: #65 sodio nello scompenso
cardiaco (Kalogeropoulos et al., *Circ Heart Fail* 2020 — trial PILOTA
DI FATTIBILITÀ su soli 27 pazienti, non una meta-analisi su 4200 come
fabbricato); #66 tè verde e mortalità (Zhao LG et al., *J Epidemiol*
2017 — associazione debole/borderline con mortalità totale, assente per
mortalità oncologica specificamente, contrariamente alla narrativa
comune).

**Batch 18 (2 studi, commit `8e803f9`)**: #68 GBD rischi dietetici
(Afshin et al./GBD 2017 Collaborators, *Lancet* 2019 — il sodio elevato
è il singolo fattore dietetico con più morti attribuite a livello
globale, 3 milioni, davanti a carenza di cereali integrali e frutta);
#69 zinco e raffreddore (la vera Cochrane review sui fabbricati autori
"Singh M, Das RR" fu RITIRATA nel 2015 per errori/plagio — sostituita
con la revisione Cochrane attuale, Nault et al. 2024, che la rimpiazza).

**Batch 19 (1 studio, commit `ec2acf2`)**: #71 allattamento e
neurosviluppo (Victora et al., vera Lancet Breastfeeding Series 2016,
non 2022 — nessuna associazione trovata con asma/allergie, pressione o
colesterolo, contrariamente ad affermazioni più ampie talvolta fatte).

**Batch 20 (1 studio, commit `6b090ef`)**: #72 UPF e mortalità (Kliemann
et al., vero studio di coorte EPIC, *Lancet Planetary Health* 2023 —
riguarda specificamente il rischio ONCOLOGICO a 25 sedi tumorali, non la
mortalità generale/altre patologie come generalizzato).

**Batch 21 (2 studi, commit `8232225`)**: #67 dieta e PCOS (Barrea et
al., *Nutrients* 2019 — studio caso-controllo, non revisione sistematica
multi-pattern); #70 dieta e NAFLD/MASLD (Romero-Gomez/Zelber-Sagi/
Trenell, *J Hepatol* 2017 — review narrativa, non network meta-analisi
con ranking numerico).

**Batch 22 (2 studi, commit `5066c8e`)**: #73 linee guida ESPEN terapia
intensiva (DOI/PMID corretti alla vera pubblicazione 2023 — è la
versione "pratica" abbreviata della guideline 2019, contenuto
sostanzialmente accurato); #75 creatina e performance (Lanhers et al.,
*Sports Medicine* 2015, non European Journal of Sport Science 2023 —
specifico su arti inferiori, 60 RCT, effect size reali 0.24-0.34).

**Batch 23 (2 studi, commit `422f7ef` e precedente)**: #80 alcol e carico
di malattia globale (GBD 2016 Alcohol Collaborators, *Lancet* 2018 — il
livello di consumo che minimizza il danno complessivo è zero, ma le cause
di morte alcol-correlate variano molto per età); #81 restrizione calorica
CALERIE (Kraus et al., *Lancet Diabetes Endocrinol* 2019).

**Batch 24 (1 studio, commit `422f7ef`)**: #85 calcio e densità minerale
ossea (Tai/Leung/Grey/Reid/Bolland, *BMJ* 2015, non 2022 — gli stessi
autori concludono che l'aumento di DMO misurato è improbabile si traduca
in una riduzione clinicamente significativa del rischio di frattura,
coerente con altri studi scettici sul calcio dello stesso gruppo).

**Batch 25 (9 studi, commit `691289a`, `df18fcd`, `a58674d`, `ee555b5`,
`c752bda`)**: #76 dieta e MICI (Hou/Abraham/El-Serag, *Am J Gastroenterol*
2011 — revisione sistematica QUALITATIVA di 19 studi, non una
meta-analisi quantitativa con OR pooled); #77 probiotici e diabete
(Miraghajani/Zaghian/Dehkohneh et al., *Probiotics Antimicrob Proteins*
2019 — piccolo RCT, n=48, su latte di soia probiotico e nefropatia
diabetica, non una network meta-analisi su T2D generico); #78 qualità
carboidrati (Moslehi/Golzarand/Mirmiran et al., *Obes Res Clin Pract*
2023 — nella coorte TLGS la qualità proteica predice l'incidenza di
fenotipi metabolicamente non sani meglio della sola qualità dei
carboidrati); #79 EAT-Lancet e mortalità (Cacau/De Carli et al.,
*Nutrients* 2021 — è lo studio di sviluppo/validazione del Planetary
Health Diet Index, non uno studio di esito su mortalità); #82 DASH vs
Mediterranea (Altorf-van der Kuil/Engberink et al., *PLoS ONE* 2010 —
revisione su proteine alimentari e pressione, non un confronto diretto
tra pattern dietetici); #83 dieta e cancro WCRF (Clinton/Giovannucci/
Hursting, *J Nutr* 2020 — commentario sul Third Expert Report 2018, non
una nuova meta-analisi 2023 di 8.000 studi); #84 omega-3 e infiammazione
(Calder PC, *Br J Clin Pharmacol* 2013 — efficacia condizione-specifica,
dimostrata per artrite reumatoide, inconsistente per IBD/asma, richiede
dosi >2g/die); #86 UPF e diabete tipo 2 (Chen/Khandpur/Desjardins et al.,
*Diabetes Care* 2023 — 3 coorti USA + meta-analisi, con scomposizione per
sottocategoria: bevande zuccherate/carni processate dannose, cereali/pane
integrale/yogurt UPF neutri o protettivi); #87 cereali integrali e
ipertensione (Kashino/Eguchi/Miki et al., *Nutrients* 2020 — l'outcome
reale è l'ipertensione incidente, non il cancro colorettale come
riportato nella versione fabbricata; campione piccolo, 944 soggetti).

**Totale progressivo (prima del batch 26): 72/164 studi ri-sourciati (~44%).**

## 🔴 Rigenerazione elenco fabbricati (2026-08-08) — `verify_studi_v3.cjs`

`studi_bad_full.json`/`verify_studi_v2.js` (scratchpad sessione 2026-08-07)
non erano più disponibili in questa sessione. Riscritto da zero un
verificatore equivalente in `scripts/citations-audit/verify_studi_v3.cjs`
(stessa metodologia: confronto titolo — Jaccard sui termini >3 caratteri,
soglia 0.5 — E confronto cognomi autori contro Crossref/PubMed, "reale" se
titolo O autori corrispondono). Rilanciato su tutti i 305 studi:

**Risultato: 158 reali, 100 fabbricati, 47 senza DOI/PMID.** La differenza
rispetto al conteggio precedente (94 reali/164 fabbricati prima dei batch,
attesi 166/92 dopo i 72 fix) è dovuta a differenze di soglia tra
l'euristica v2 (persa) e v3 (nuova) — non un regresso: nessuno dei 72 ID
già corretti nei batch 1-25 compare nel nuovo elenco fabbricati. Spot-check
manuale di 4 ID del nuovo elenco (41, 50, 74, 88) confermato: DOI/PMID
risolvono a paper del tutto estranei (COVID/NAFLD, TRAF3IP2/insulino-
resistenza, sindrome metabolica colazione, piombo/eritropoietina) — non
falsi positivi dello script. File completo: `studi_bad_v3.json` (gitignored,
va rigenerato ad ogni sessione con `node scripts/citations-audit/verify_studi_v3.cjs`,
~5 min, richiede internet).

**Nuovo totale fabbricati confermato: 100/305.** ID completi: 41, 50, 74,
88, 89, 90, 91, 92, 93, 94, 95, 96, 97, 98, 99, 101, 102, 103, 104, 105,
106, 108, 109, 110, 111, 112, 113, 114, 115, 116, 117, 118, 119, 120, 121,
122, 123, 124, 125, 126, 127, 128, 129, 130, 131, 132, 134, 135, 136, 137,
138, 139, 141, 143, 144, 145, 146, 147, 148, 150, 151, 152, 153, 154, 155,
156, 157, 158, 159, 160, 161, 162, 163, 164, 165, 166, 167, 168, 169, 170,
171, 172, 173, 174, 175, 176, 177, 178, 179, 180, 181, 182, 183, 188, 193,
194, 195, 211, 214, 221.

**Batch 26 (10 studi, sessione 2026-08-08)**: #41 dieta mediterranea in
gravidanza (Martínez-Galiano et al. fabbricato → Xu J et al., *Adv Nutr*
2024, PMID 38042258 — solo GDM e SGA confermati da RCT, gli altri esiti
[ipertensione, preeclampsia, pretermine, basso peso, IUGR] solo da coorti
osservazionali, distinzione assente nel fabbricato che presentava tutto
come ugualmente supportato); #50 DASH e ipertensione (Filippou CD et al.
— autori reali, DOI/PMID fabbricati puntavano a documenti estranei →
vero paper dello stesso team, *Adv Nutr* 2020, PMID 32330233 — valuta la
SOLA dieta DASH, effetto molto più modesto [-3.2/-2.5 mmHg] del network
di 7 pattern dietetici fabbricato [-11.2 mmHg]); #74 sonno e dieta (Frank
S et al. inventato → Godos J et al., *Sleep Med Rev* 2021, PMID 33549913
— revisione NARRATIVA di 29 studi cross-sezionali, nessun dato numerico
reale su +385kcal/grelina/leptina come fabbricato); #88 PREDIMED-Plus
(outcome MACE a 7.5 anni fabbricato appartiene in realtà al trial
PREDIMED ORIGINALE 2013 → sostituito con Salas-Salvadó/Díaz-López et al.,
*Diabetes Care* 2019, PMID 30389673 — vero outcome primario PREDIMED-Plus
a 1 anno è perdita di peso/fattori di rischio CV, n=626 non 7.447); #89
microbiota e T2D (autori fabbricati "Bhatt DL/AS/SH" → Houghton D et al.,
*Diabetologia* 2018, PMID 29754286 — base di evidenza reale molto più
piccola, 8 studi/395 partecipanti non 52 RCT/28.000+; HbA1c migliora ma
glicemia a digiuno no, nessun genere batterico specifico cambia in modo
significativo); #90 proteine e massa muscolare anziani (stesso team reale
Morton RW ma anno/DOI sbagliati → *BJSM* 2018, PMID 28698222 — riguarda
adulti sani in generale, non anziani; la meta-regressione mostra che il
beneficio sulla FFM si RIDUCE con l'età, opposto alla narrativa fabbricata
su "resistenza anabolica" negli over-65); #91 sodio e pressione (Filippini
T et al. — vero paper dello stesso team, *Circulation* 2021, PMID
33586450, non JAMA Intern Med 2022 — relazione lineare confermata, ma
SENZA evidenza di effetto età/sesso-specifico, a differenza del claim
fabbricato); #92 vitamina D e mortalità (sostituito con il vero trial
VITAL di Manson JE, *NEJM* 2019, PMID 30415629 — nessuna riduzione
significativa di cancro invasivo [HR 0.96] né eventi CV [HR 0.97]; il
claim fabbricato "riduzione 12% mortalità cancro, RR 0.88 significativo"
non regge, il vero HR 0.83 è al limite della significatività); #93 diete
plant-based e rischio CV (Hemler EC fabbricato, Hu FB reale ma per altro
paper → Satija A, Hu FB, *Trends Cardiovasc Med* 2018, PMID 29496410 —
REVISIONE NARRATIVA non meta-analisi con effect size pooled; messaggio
chiave reale: solo il pattern vegetale di ALTA qualità [hPDI] riduce il
rischio CV, un pattern vegetale di bassa qualità [uPDI] lo aumenta); #94
probiotici e IBS (autori Ford/Harris/Lacy/Quigley/Moayyedi ESATTAMENTE
reali, ma rivista/anno sbagliati → *Aliment Pharmacol Ther* 2018, PMID
30294792 — il risultato pooled robusto reale riguarda la RIFAXIMINA
[antibiotico, RR 0.84], non i probiotici multi-ceppo come fabbricato; per
i probiotici gli autori dichiarano evidenza troppo eterogenea per un
effetto di classe affidabile).

**Batch 27 (10 studi, sessione 2026-08-08)**: #95 low-FODMAP e IBS
(Staudacher HM autrice reale ma DOI/PMID fabbricati estranei → Black CJ,
Staudacher HM, Ford AC, *Gut* 2022, PMID 34376515 — network meta-analisi
non Cochrane, 13 RCT/944 partecipanti non 14/1.900+; solo sintomi globali
e gonfiore significativi, non l'alterazione dell'alvo); #96 celiachia e
guarigione mucosale (nessun vero paper del team fabbricato Kabbani/Vanga/
Leffler su questo tema specifico → Szakács Z et al., *PLOS ONE* 2017,
PMID 29095937, unico vero meta-analisi sul claim esatto — tassi di
guarigione reali molto più bassi negli adulti [24%, non 34-79%
fabbricato], durata dieta NON predittiva); #97 digiuno intermittente vs
CCR (distinto dal Cioffi 2018 già usato al #52 → sostituito con RCT reale
Trepanowski et al., *JAMA Intern Med* 2017, PMID 28459931 — CONTRADICE il
fabbricato: dropout ADF più alto non più basso, LDL peggiora con ADF);
#98 pattern dietetici e demenza (Aridi/Walker/Wright autori reali ma vero
paper è *Nutrients* 2017 non 2023, PMID 28657600 — REVISIONE QUALITATIVA
solo su dieta mediterranea, nessun RR/HR pooled per MIND/DASH/dieta
occidentale come fabbricato); #99 ferro orale vs EV (Camaschella C., vero
paper è la review narrativa NEJM 2015, PMID 25946282, non una
meta-analisi di 43 RCT — nessun effect size pooled reale per le cifre
fabbricate); #101 supplementazione NAFLD/MASLD (Younossi/Zelber-Sagi
autori reali ma vero paper è una review su STILE DI VITA, *Nat Rev
Gastroenterol Hepatol* 2023, PMID 37402873, non una meta-analisi di 120
RCT su supplementi specifici); #102 dieta mediterranea e mortalità (DOI
fabbricato inesistente → Soltani/Jayedi/Shab-Bidar/Becerra-Tomás/
Salas-Salvadó, *Adv Nutr* 2019, PMID 31111871 — RR reale 0.90 per 2 punti
score con eterogeneità ALTA I²=81.1%, non menzionata nel fabbricato); #103
UPF e cancro (Lane MM fabbricato con DOI/PMID estranei → Chang K, Gunter
MJ et al., coorte UK Biobank, *eClinicalMedicine* 2023, PMID 36880051 —
solo il cancro OVARICO mostra incidenza significativamente aumentata
[+19%], non colorettale/mammario/pancreatico come generalizzato nel
fabbricato); #104 proteine e sarcopenia (Dent/Morley/Cruz-Jentoft autori
reali ma vero documento è una linea guida di CONSENSUS GRADE, *J Nutr
Health Aging* 2018, PMID 30498820, non una meta-analisi di 68 RCT —
raccomandazione FORTE solo per esercizio, CONDIZIONALE per proteina); #105
low-FODMAP e IBS, secondo studio distinto da #95 (Schumann D et al., vero
paper *Nutrition* 2018, PMID 29129233, non Cochrane 2023 — 9 RCT/596
partecipanti non 24/2.800+, effetti in SMD non percentuali per sottotipo).

**Batch 28 (10 studi, sessione 2026-08-08)**: #106 omega-3 e fibrillazione
atriale (Gencer/Djousse/Al-Ramady et al. — autori reali, DOI/PMID
fabbricati inesistenti → vero paper *Circulation* 2021, PMID 34612056:
caso raro, i numeri centrali erano quasi tutti accurati, solo
citazione/conteggio RCT sbagliati [7 reali non 13]); #108 time-restricted
eating (Cienfuegos S fabbricato come primo autore → vero primo autore è
Varady KA, *Annual Review of Nutrition* 2021, PMID 34633860 — REVISIONE
NARRATIVA su tutto il digiuno intermittente ADF+5:2+TRE, non una
meta-analisi quantitativa di 29 RCT sulla sola TRE); #109 fibra e
diversità microbiota (Dahl WJ fabbricato → So D et al., *Am J Clin Nutr*
2018, PMID 29757343 — CONTRADICE il fabbricato: NESSUN effetto
significativo su alfa-diversità, solo su Bifidobacterium/Lactobacillus);
#110 sodio e outcome CV (Filippini T fabbricato, verificato che non ha un
secondo vero paper su questo outcome distinto dal #91 → sostituito con
Zhu Y et al., *BMC Cardiovasc Disord* 2018, PMID 30340541, autori
realmente diversi — effetto reale SPECIFICO sull'ictus, NESSUN effetto
su mortalità cardiaca/totale); #111 diete plant-based e T2D (Qian F, Hu
FB — vero paper è *JAMA Intern Med* 2019 non 2023, PMID 31329220 — NON è
un confronto vegano/vegetariano vs onnivoro come fabbricato, ma un
punteggio continuo PDI/hPDI/uPDI su 18 gruppi alimentari); #112
probiotici e IBD (Kaur L et al. — vera Cochrane review copre SOLO
induzione remissione in colite ulcerosa attiva, *Cochrane* 2020, PMID
32128795, non mantenimento/Crohn's/IBD generico come fabbricato, che
mescolava dati da più review Cochrane distinte; evidenza reale di
certezza bassa/molto bassa); #113 creatina e sarcopenia (Lanhers C
fabbricato, distinto dal vero Lanhers già usato al #75 → Chilibeck PD et
al., *Open Access J Sports Med* 2017, PMID 29138605 — la cifra +1.37kg
massa magra è reale, ma forza in kg assoluti/handgrip/TUG/sicurezza
renale CKD sono tutte aggiunte inventate); #114 low-FODMAP e IBS, terzo
studio distinto nel database dopo #95 e #105 (Moayyedi/Quigley/Lacy
parziali reali → ACG Monograph on Management of IBS, *Am J Gastroenterol*
2018, PMID 29950604 — RR/NNT fabbricato è reale ma qualità evidenza
dichiarata MOLTO BASSA dagli autori, non "prima scelta" come implicito);
#115 aderenza GFD e QoL in celiachia (Silvester JA autrice reale → vero
studio *J Hum Nutr Diet* 2016, PMID 25891988 — STUDIO TRASVERSALE su 222
pazienti, non revisione sistematica di 48 studi; impatto QoL concentrato
nel dominio sociale); #116 DASH e pressione (Chiavaroli L fabbricato,
verificato che il suo unico vero paper è l'umbrella review già usata al
#21, quindi non riusabile → sostituito con Guo R et al. su DASH
MODIFICATA, *Frontiers in Nutrition* 2021, PMID 34557511, gruppo di
ricerca diverso — effetto pressorio reale più modesto).

**Totale progressivo: 30/100 studi fabbricati corretti (batch 26-27-28),
restano 70 da ri-sourciare** sull'elenco confermato di 100 fabbricati (41,
50, 74, 88-99, 101-116 ora tutti corretti). ID ancora da fare: 117, 118,
119, 120, 121, 122, 123, 124, 125, 126, 127, 128, 129, 130, 131, 132, 134,
135, 136, 137, 138, 139, 141, 143, 144, 145, 146, 147, 148, 150, 151, 152,
153, 154, 155, 156, 157, 158, 159, 160, 161, 162, 163, 164, 165, 166, 167,
168, 169, 170, 171, 172, 173, 174, 175, 176, 177, 178, 179, 180, 181, 182,
183, 188, 193, 194, 195, 211, 214, 221. Dato il volume di lavoro per
studio (ricerca + verifica + riscrittura di ~15 campi in 2 lingue),
procedere a piccoli batch su più sessioni, come da richiesta esplicita
dell'utente. Metodo aggiornato: lanciare `node
scripts/citations-audit/verify_studi_v3.cjs` a inizio sessione se serve
ri-verificare (l'elenco ID sopra è già aggiornato e riutilizzabile senza
rilanciare lo script, finché non si sospetta un regresso).

**Pattern nuovo osservato nei batch 27-28**: più volte lo stesso claim
generico (DASH, low-FODMAP/IBS, sodio/CV, creatina) appare PIÙ VOLTE nel
database con autori "fabbricati" diversi ma tema identico — quando
l'autore fabbricato è reale ma ha un solo vero paper già usato altrove
nel dataset, serve cercare un SECONDO studio reale distinto (di altri
autori) sullo stesso claim, non riusare la stessa fonte due volte. Prima
di chiudere un ID, controllare sempre se il tema è già stato coperto da
un ID precedente nel database.

**Batch 29 (9 studi corretti + 1 flaggato per rimozione, sessione
2026-08-08)**: #117 nutrizione in menopausa (Stachowiak et al. — vero
paper è *Przegląd Menopauzalny* 2015, PMID 26327890, REVISIONE
NARRATIVA di fisiopatologia, zero dati quantitativi su calcio/vitamina
D/fitoestrogeni/K2 come fabbricato); #118 supporto nutrizionale in BPCO
(Ferreira/Brooks/White/Goldstein autori esattamente reali, ma vera
versione è pub3/2012 non pub4/2022, PMID 23235577 — beneficio reale
specifico dei pazienti MALNUTRITI, 6MWT +40m ma NON significativo tra
gruppi); #119 dieta mediterranea e decadimento cognitivo (STESSI autori
Aridi/Walker/Wright del #98, verificato che hanno un solo vero paper già
usato lì → secondo studio reale di gruppo diverso, Nucci D et al.,
*Aging Clin Exp Res* 2024, PMID 38519775, OR 0.73 per Alzheimer non HR
0.77, nessuna analisi dose-risposta/APOE4 pooled come fabbricato); #120
interventi nutrizionali in gravidanza (Zerfu/Ayele — vero paper è
*Nutrition Journal* 2013, PMID 23368953, SINTESI QUALITATIVA di 17
studi, nessuna delle percentuali precise fabbricate ha riscontro); #121
diete plant-based e rischio CV (Dinu/Sofi — vero paper *Crit Rev Food
Sci Nutr* 2017, PMID 26853923, non 2023 — coincidenza parziale: il 25%
di riduzione cardiopatia ischemica nei vegetariani è reale, ma IMA/
mortalità CV nei vegani e riduzione diabete 23% sono inventati); #122
fibra e stipsi cronica (Christodoulides/Dimidi — vero paper *Aliment
Pharmacol Ther* 2016, PMID 27170558, 7 RCT/287 partecipanti non 20/
1.800+, gli autori stessi segnalano rischio di bias ALTO, tono opposto
alla certezza clinica fabbricata); #124 UPF e mortalità totale
(citazione fabbricata "et al. (coorti)" già sospetta di per sé →
sostituito con Fang Z et al., *BMJ* 2024, PMID 38719536, Nurses' Health
Study + HPFS — effetto reale +4% mortalità totale non +12%, NESSUNA
associazione significativa con mortalità CV/oncologica specificamente,
distinto da #72 e #103 già nel database); #125 pattern dietetici e MASLD
(Eslam/Sanyal/George — vero paper è il CONSENSUS STATEMENT fondativo
sulla nomenclatura MAFLD, *Gastroenterology* 2020, PMID 32044314,
puramente definitorio, zero dati su pattern dietetici); #126 nutrizione
e Hashimoto (Ihnatowicz/Drywień — vero paper *Ann Agric Environ Med*
2020, PMID 32588591, REVISIONE NARRATIVA qualitativa, nessuna cifra
percentuale di riduzione anticorpale ha riscontro).

**#123 omega-3 in pediatria — FLAGGATO PER RIMOZIONE, non sostituito**:
gli autori fabbricati "Wierzbicka E, Wlodarek D" non hanno un vero paper
su questo tema; il claim è un amalgama di almeno 4 filoni di ricerca
reali ma completamente distinti (DHA formula/IQ, omega-3/ADHD, omega-3
prenatale/asma, PCR in obesità pediatrica), ciascuno con autori/riviste/
numeri propri — nessuna singola vera meta-analisi copre 0-18 anni con
tutti questi outcome insieme. Forzare una sostituzione con una sola
fonte travisirebbe lo scope. Lasciato invariato (ancora fabbricato) in
attesa di decisione esplicita dell'utente su rimozione vs riscrittura in
più schede mirate (vedi nota metodologica "se nessun corrispettivo
reale unico esiste, marcare per rimozione invece di forzare un
abbinamento debole").

**Batch 30 (10 studi, sessione 2026-08-08)**: #127 carenza di ferro e
anemia (Pasricha SR fabbricato come meta-analisi 87 studi/850.000 donne
→ vero paper della stessa autrice: *The Lancet* 2021 [Seminar], PMID
33285139, REVISIONE NARRATIVA, nessuna cifra di prevalenza pooled);
#128 dieta mediterranea e salute mentale (Parletta N — vero è il trial
HELFIMED originale 2017/2019, PMID 29215971, SINGOLO RCT su 152
partecipanti, non meta-analisi di 32 RCT); #129 vitamina D e outcome
cardiometabolici (nessuna meta-analisi combinata VITAL+D-Health+ViDA
esiste → Kuznia/Zhu et al., *Ageing Res Rev* 2023, PMID 37004841, che
include realmente Scragg R — ma riguarda SOLO mortalità oncologica,
beneficio reale condizionato al dosaggio giornaliero non a bolo); #130
TRE 16:8 e rischio CV, terzo studio fabbricato con Cioffi/Evangelista/
Ponzo (dopo il #52) → il loro vero secondo paper, Pellegrini et al.,
*Rev Endocr Metab Disord* 2020, PMID 31808043 — 11 studi perlopiù
Ramadan-based, non 29 RCT su 16:8 strutturato, effetti reali molto più
modesti; #131 omega-3 e cancro (Nindrea et al. — vero paper copre SOLO
cancro al seno in popolazioni asiatiche, *Asian Pac J Cancer Prev* 2019,
PMID 30803190, non 5 tumori/68 studi come fabbricato); #132 proteine e
massa muscolare anziani (Liao CD — STESSO autore del #16, nessun secondo
paper reale → sostituito con Nunes EA et al., *J Cachexia Sarcopenia
Muscle* 2022, PMID 35187864, effect size reali molto più modesti [SMD
0.22]); #134 diete plant-based ed esiti a lungo termine (Dinu/Sofi —
STESSI autori del #121, nessun secondo paper genuino → Quek J et al.,
*Front Cardiovasc Med* 2021, PMID 34805312, solo esiti cardiovascolari,
scoperta chiave: dieta vegetale di bassa qualità AUMENTA la mortalità
CV); #135 fibra e cancro colorettale (Zhu/Sun/Qi/Zhong/Miao — vero
paper riguarda SOLO legumi, non fibra totale, *Scientific Reports* 2015,
PMID 25739376, distinto dal classico Aune et al. già al #55); #136
sodio e pressione (He/Li/MacGregor — vera Cochrane review classica 2013,
PMID 23558162, 34 RCT/3.230 non 133/12.200+, NESSUN dato mortalità CV,
distinta da #91 e #110); #137 microbiota e T2D (Gurung et al. — vero
paper *EBioMedicine* 2020, PMID 31901868, revisione TASSONOMICA di 42
studi: Bacteroides classificato come PROTETTIVO nella fonte reale,
INVERTITO nel fabbricato che lo presentava come di rischio — errore di
contenuto, non solo di citazione; distinto da #89).

**Totale progressivo: 49/100 studi fabbricati corretti (batch 26-30),
1 flaggato per rimozione (#123, non ancora rimosso), restano 50 da
ri-sourciare.** ID ancora da fare: 138, 139, 141, 143, 144, 145, 146,
147, 148, 150, 151, 152, 153, 154, 155, 156, 157, 158, 159, 160, 161,
162, 163, 164, 165, 166, 167, 168, 169, 170, 171, 172, 173, 174, 175,
176, 177, 178, 179, 180, 181, 182, 183, 188, 193, 194, 195, 211, 214,
221 (+ #123 da decidere).

**Pattern confermato nel batch 30**: la maggior parte degli autori
fabbricati continua a essere ricercatori esattamente reali del campo,
con citazione (DOI/PMID/anno/rivista) inventata — ma con crescente
frequenza il vero paper copre uno SCOPE molto più stretto del claim
fabbricato (es. #131 solo seno non 5 tumori, #135 solo legumi non fibra
totale, #136 solo PA non mortalità). In un caso (#137) l'errore va oltre
la citazione: un dato di contenuto (Bacteroides protettivo vs di rischio)
è stato letteralmente invertito rispetto alla fonte reale.

**Batch 31 (10 studi, sessione 2026-08-09/10, commit da fare)**: #138 PCOS
e dieta (Szczuko et al. fabbricato → Juhász AE et al., *Reprod Health*
2024, PMID 38388374, network meta-analisi 19 RCT/727 donne: DASH prima
scelta su HOMA-IR/insulina/trigliceridi, metformina superiore su
testosterone/LDL — outcome-specifico, non generico "efficace su tutto"
come il fabbricato); #139 iperuricemia/gotta (Yokose/McCormick/Choi
fabbricato → Wen ZY et al., *Front Nutr* 2024, PMID 38481974, n=163.192,
conferma che conta il PATTERN alimentare complessivo non il singolo
alimento purinico); #141 creatina (Lanhers/Pereira/Naughton — autori
REALI con 2 meta-analisi genuine, usata quella su arti superiori 2017,
PMID 27328852 — claim originali su anziani/sarcopenia/cognizione/
sicurezza renale NON coperti da questa fonte, rimossi senza sostituzione
forzata); #143 dieta ipoproteica CKD (Kalantar-Zadeh et al. fabbricato,
nessun match trovato → sostituito con Cochrane review Hahn/Hodson/Fouque
2020, PMID 33118160 — claim su chetoanaloghi e SGLT2i NON coperti,
rimossi); #144 calcio+vitamina D e fratture (autori dichiarati Zhao JG
et al. REALI ma citazione sbagliata: non Cochrane 2022 ma JAMA 2017,
PMID 29279934 — risultato opposto al fabbricato: calcio/vitamina D NON
riducono le fratture in community-dwelling, nessun beneficio significativo
trovato); #145 dieta mediterranea e declino cognitivo (Charisis/HELIAD
fabbricato — i lavori HELIAD reali sono coorti singole non meta-analisi
di 22 studi → sostituito con García-Casares N et al., *J Clin Med* 2021,
PMID 34682764, effect size reali più modesti RR 0.89-0.91 vs il 33-53%
di riduzione rischio dichiarato); #146 VLCKD e diabete tipo 2 (Muscogiuri
et al. — autrice REALE, vero paper è una guida pratica clinica *J Transl
Med* 2019, PMID 31665015, non uno studio con cifre di remissione DM2 —
riscritto come guida alle 3 fasi VLCKD invece di forzare numeri di
remissione inesistenti nella fonte); #147 probiotici multi-indicazione
(Bafeta/Koh/Riveros/Ravaud fabbricato — il vero paper di Bafeta A. è
sulla qualità del reporting degli harm negli RCT su microbiota, *Ann
Intern Med* 2018, tema diverso → sostituito con umbrella review più
recente e pertinente, Hoang/Kim, *Nutr Rev* 2026, PMID 42289829, 128
revisioni sintetizzate); #148 dieta mediterranea e CV (PREDIMED-Plus
"5-year results" 2024 fabbricato — quell'esito a 5 anni sugli eventi CV
maggiori non risulta ancora pubblicato → sostituito con i veri risultati
PREDIMED-Plus a 1 anno su peso/sindrome metabolica, Salas-Salvadó et al.,
*Diabetes Care* 2019, PMID 30389673, n=626); #150 chirurgia bariatrica e
nutrizione (Mechanick/AACE-TOS-ASMBS 2023 fabbricato — le vere linee
guida Mechanick esistono ma dietro paywall senza numeri verificabili in
accesso libero → sostituito con altre linee guida ASMBS reali e verificabili,
Parrott J et al., *Surg Obes Relat Dis* 2017, PMID 28392254).

**Nota metodologica batch 31**: un file di lavoro `batch31_input.json`
(mai committato) lasciato da una sessione precedente conteneva
l'estrazione grezza delle 10 schede ancora fabbricate — NON un batch già
ri-sourciato, come inizialmente sospettato. Verificato e confermato via
PubMed eutils che i DOI/PMID lì presenti erano ancora quelli fabbricati
originali (puntano a paper completamente estranei: chimica dei polimeri,
dermatologia, odontoiatria, ecc.), poi scartato. Tutti i 10 studi sono
stati ri-sourciati da zero con verifica PubMed eutils indipendente di
ogni DOI/PMID proposto (sia dai fork agent sia nel lavoro diretto), prima
di applicare le modifiche al file sorgente — nessuna sostituzione
applicata senza verifica autonoma del match titolo/autori/rivista.

**Totale progressivo: 59/100 studi fabbricati corretti (batch 26-31),
1 flaggato per rimozione (#123, non ancora rimosso), restano 40 da
ri-sourciare.** ID ancora da fare: 151, 152, 153, 154, 155, 156, 157,
158, 159, 160, 161, 162, 163, 164, 165, 166, 167, 168, 169, 170, 171,
172, 173, 174, 175, 176, 177, 178, 179, 180, 181, 182, 183, 188, 193,
194, 195, 211, 214, 221 (+ #123 da decidere).
