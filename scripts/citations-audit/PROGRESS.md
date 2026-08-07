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

Il ri-sourcing dei 164 studi fabbricati è iniziato 2026-08-07 (batch 1,
vedi tabella sotto). Per ogni studio del batch: WebSearch per un vero
studio esistente sullo stesso tema/claim, verifica DOI/PMID reali, e
aggiornamento conservativo di titolo/autori/rivista/anno/doi/pubmed/link
in `js/studies-data.js` — SOLO se i campi risultati/metodi/analisi del
JSON restano compatibili col vero studio trovato (altrimenti vanno
riscritti anch'essi per riflettere i risultati reali, non solo la
citazione). Se nessun corrispettivo reale unico esiste per il claim
descritto, marcare la entry per rimozione invece di forzare un
abbinamento debole.
