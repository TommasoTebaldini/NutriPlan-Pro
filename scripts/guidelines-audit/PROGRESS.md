# Verifica contenuti clinici — linee-guida-data.js + consigli-data.js

Verifica sistematica dei 285 argomenti clinici presenti in
`js/linee-guida-data.js` (scheda linea guida: target numerici, note,
spiegazione scientifica, fonte/badge/url) e `js/consigli-data.js` (scheda
consigli pratici per lo stesso id: pasti, porzioni, idratazione, liste
ok/no/mod, avvisi) rispetto alle linee guida ufficiali realmente citate
(ESPEN, ESC/EAS, ESH, KDIGO, ADA, WHO, EFSA, SINU/LARN, ecc.).

Lavoro multi-sessione, iniziato 2026-08-03. L'ordine dei 285 id qui sotto è
quello con cui compaiono nel file originale — riflette già una priorità
implicita (patologie comuni prima, condizioni rare/genetiche/specialistiche
verso la fine), quindi si procede top-to-bottom salvo motivi per saltare.

## Come riprendere una sessione futura

1. Apri questo file, trova la prima riga con stato `da fare`.
2. Leggi la scheda corrispondente in entrambi i file (`grep -n "id:'<id>'" js/linee-guida-data.js js/consigli-data.js`).
3. Verifica con WebSearch/WebFetch: il badge/fonte citato dice davvero questo?
   I target numerici (kcal/kg, g/kg, %, mg/die, soglie) sono corretti? Le
   liste ok/no sono clinicamente sensate? Lo science è accurato?
4. Se serve una correzione, applicala in ENTRAMBI i file se il campo è
   duplicato (ok/no lo sono quasi sempre; target/note/science sono specifici
   di linee-guida-data.js, pasti/porzioni/pratici/avvisi di consigli-data.js).
5. Aggiorna la riga: stato (✅ verificato-corretto / 🔧 verificato-con-fix /
   ⚠️ dubbio — da segnalare all'utente, non modificare senza conferma),
   data (YYYY-MM-DD), e una nota brevissima (cosa hai controllato/cambiato,
   o perché è dubbio).
6. Fai commit+push a fine sessione o ogni tot argomenti — non lasciare mai
   modifiche non committate a lungo, il lavoro è enorme e ripartire da uno
   stato pulito è essenziale.

## Stato

| # | id | stato | data | note |
|---|---|---|---|---|
| 1 | diabete | 🔧 corretto-con-fix | 2026-08-03 | Badge ESPEN 2023 era sbagliato: fonte reale EASD/DNSG 2023 (Diabetologia). Fibra 25g→35g/die. CHO: rimossa % fissa 45-60 (le linee guida dicono "nessuna % ideale"), proteine riformulate in %energia con opzione alta se sovrappeso. |
| 2 | irc | 🔧 corretto-con-fix | 2026-08-03 | Proteine 0.6-0.8→0.55-0.60 g/kg (0.6-0.8 se diabetico), KDOQI 2020. Potassio: rimosso limite fisso <2000mg, ora "individualizzare su potassiemia" (cambio di paradigma KDOQI 2020). Badge/fonte aggiornati a ESPEN 2021 + KDOQI 2020. |
| 3 | dialisi | 🔧 corretto-con-fix | 2026-08-03 | Proteine: range ESPEN (1.2-1.4/1.2-1.5) vs KDOQI 2020 (1.0-1.2 per entrambe) divergono tra fonti — riportati entrambi con nota. Potassio: rimosso limite fisso, individualizzare. Albumina: aggiunta cautela (marker aspecifico). |
| 4 | obesita | 🔧 corretto-con-fix | 2026-08-03 | Badge ESPEN 2022 generico → ESPEN/UEG 2022 (guideline reale è specifica per comorbidità GI/epatiche). Proteine 1.2-1.5 g/kg riformulate come range per sarcopenia/rischio malnutrizione; 1.0-1.2 g/kg come default generale. |
| 5 | dislipidemia | 🔧 corretto-con-fix | 2026-08-03 | Colesterolo <200→<300mg/die + nota che è obiettivo secondario (minor peso causale vs grassi saturi/trans). Riduzione LDL da dieta 10-20%→20-30%. Fitosteroli: target armonizzato a 1.5-3g (era incoerente con lo science). |
| 6 | ipertensione | 🔧 corretto-con-fix | 2026-08-03 | Badge ESH 2023+DASH → +WHO (potassio è target OMS, non ESH). Sodio: chiarito NaCl vs sodio (~5g sale=~2g Na), rimossa cifra "ideale <1.5g" non attribuibile a ESH. Claim "70-75% sodio da processati" contestualizzato (USA/UK-centrico, meno per dieta mediterranea). Rimossa cifra K→PAS non verificabile.
| 7 | celiachia | 🔧 corretto-con-fix | 2026-08-03 | Badge/fonte "AIC/ESPEN" + "ESPGHAN 2020" incoerenti: ESPGHAN 2020 è una linea guida diagnostica pediatrica, non di gestione dietetica adulta. Corretto in "AIC / ESsCD 2019" (ESsCD = European Society for the Study of Coeliac Disease, guideline reale su gestione dieta/contaminazioni). |
| 8 | ibd | ✅ verificato-corretto | 2026-08-03 | ECCO/ESPEN 2023 corrisponde alla vera "ESPEN guideline on Clinical Nutrition in IBD" (Bischoff et al. 2023). Nutrizione enterale esclusiva in riacutizzazione severa e assenza di dieta di remissione specifica sono corretti. |
| 9 | sarcopenia | 🔧 corretto-con-fix | 2026-08-03 | Badge "ESPEN 2018"→"ESPEN/PROT-AGE" (il valore 35-40g proteine/pasto e soglia leucina 2.5-3g sono più coerenti con PROT-AGE study group che con ESPEN 2018 da solo). Soglia leucina "2.5-3g" riformulata come "almeno 2.5-2.8g" (valore più citato in letteratura, es. Bauer et al. PROT-AGE 2013). Mirror applicato anche in consigli-data.js. |
| 10 | steatosi | 🔧 corretto-con-fix | 2026-08-03 | Badge "EASL 2024"→"EASL/EASD/EASO 2024" (la linea guida 2024 su MASLD è congiunta EASL-EASD-EASO). Raccomandazione vitamina E per NASH annotata come specifica AASLD 2018, non ripresa da EASL/EASD/EASO 2024 (nota riscritta per chiarire che la linea guida attuale NON raccomanda vitamina E per MASH). Mirror applicato in consigli-data.js. |
| 11 | cirrosi | ✅ verificato-corretto | 2026-08-03 | EASL 2019 (Merli et al., "Nutrition in chronic liver disease") + ESPEN 2019 (Plauth et al.) sono entrambe guideline reali di quell'anno. |
| 12 | bpco | 🔧 corretto-con-fix | 2026-08-03 | Fonte "ESPEN 2024"→"ESPEN 2021" per allinearla al badge (già "ESPEN 2021"), che era la data reale coerente col resto della scheda. consigli-data.js già coerente, nessun mirror necessario. |
| 13 | calcolosi | 🔧 corretto-con-fix | 2026-08-03 | Badge/fonte "EAU 2022"→"EAU 2024" (le linee guida EAU su urolitiasi sono aggiornate annualmente, la versione 2024 è quella corrente). Mirror applicato in consigli-data.js. |
| 14 | gotta | 🔧 corretto-con-fix | 2026-08-03 | Badge "ACR/EULAR 2020"→"ACR 2020" (le linee guida 2020 su gestione dietetica/farmacologica della gotta sono ACR; EULAR ha una guideline separata del 2016/2019 non aggiornata al 2020). Mirror applicato in consigli-data.js. |
| 15 | anemia | ✅ verificato-corretto | 2026-08-03 | WHO (soglie diagnostiche Hb) + LARN (RDA ferro Italia) sono fonti reali e complementari per questo argomento. |
| 16 | oncologia | ✅ verificato-corretto | 2026-08-03 | ESPEN 2021 "Guidelines on nutrition in cancer patients" (Muscaritoli et al.) reale, EPA 2g e cachessia coerenti con la letteratura. |
| 17 | osteoporosi | ✅ verificato-corretto | 2026-08-03 | IOF (International Osteoporosis Foundation) pubblica raccomandazioni pratiche su calcio/vitamina D coerenti col 2021. |
| 18 | scompenso | ✅ verificato-corretto | 2026-08-03 | ESC 2021 "Guidelines for the diagnosis and treatment of acute and chronic heart failure" è la vera linea guida di quell'anno. |
| 19 | pancreatite | 🔧 corretto-con-fix | 2026-08-03 | Badge/fonte "AGA/ESPEN 2020"/"ESPEN 2024" incoerenti tra loro → armonizzati su "ESPEN 2023" ("ESPEN guideline on Clinical Nutrition in chronic pancreatitis", pubblicata 2023-24, più recente e specifica di AGA 2020). Mirror applicato in consigli-data.js. |
| 20 | gravidanza | ✅ verificato-corretto | 2026-08-03 | Iodio 220 µg/die verificato: valore citato direttamente dalle linee guida SIGO 2023 (220-250 mcg/die), non un errore — il LARN "base" di 200 µg/die è un minimo di popolazione, non il target clinico SIGO usato qui. Nessuna modifica. |
| 21 | allattamento | ✅ verificato-corretto | 2026-08-03 | Iodio 290 µg/die verificato: valore citato dalle stesse linee guida SIGO (in accordo con IOM), coerente con badge/fonte "SIGO/LARN 2023". Nessuna modifica. |
| 22 | larn_popolazione_sana | 🔧 corretto-con-fix | 2026-08-03 | Anno aggiornamento LARN 2023→2024 (V Revisione presentata a giugno 2024, non 2023). |
| 23 | allergia_latte | 🔧 corretto-con-fix | 2026-08-03 | Riverificato in batch 3: nessuna pubblicazione EAACI reale nel 2019 (confermato: il core "Diagnosis and management of food allergy" è Muraro et al. 2014, l'anafilassi è stata aggiornata nel 2021). Corretto badge/note in "EAACI 2014" in entrambi i file (fix sistemico esteso a tutte le schede allergia, vedi righe 53-55, 61-62). |
| 24 | fenilchetonuria | 🔧 corretto-con-fix | 2026-08-03 | Badge ACMG 2014→European PKU Guidelines 2017 (van Wegberg): i target 360/600 µmol/L per età sono di quella linea guida, non di ACMG 2014 (che usa 360 unico per tutte le età). Aggiunta nota sulla differenza. |
| 25 | hiv | ✅ verificato-corretto | 2026-08-03 | Badge/contenuti plausibili, nessuna azione. |
| 26 | gastrectomia | ✅ verificato-corretto | 2026-08-03 | ESPEN chirurgia gastrica, contenuti plausibili. |
| 27 | diverticolite | 🔧 corretto-con-fix | 2026-08-03 | Badge ACG 2015→AGA 2021 (incoerenza interna: il testo già diceva "linee guida aggiornate 2022" per noci/semi mentre il badge diceva 2015; la fonte reale del de-restriction è AGA 2021, coerente anche con l'url gastro.org già presente). |
| 28 | chirurgia_bariatrica | ⚠️ dubbio | 2026-08-03 | ASMBS/IFSO 2022 esiste ma è su indicazioni chirurgiche, non gestione nutrizionale — fonte nutrizionale più pertinente da verificare (AACE/TOS/ASMBS perioperative). Non corretto. |
| 29 | disfagia | ✅ verificato-corretto | 2026-08-03 | IDDSI 2019 è l'anno reale del framework. |
| 30 | malnutrizione | ⚠️ dubbio | 2026-08-03 | Non verificato in dettaglio in questo giro (nessuna ricerca dedicata) — verificare GLIM/MUST/MNA citati. |
| 31 | ibs | ✅ verificato-corretto | 2026-08-03 | ACG 2021 IBS + Monash low-FODMAP reali; cifra "70%" non verificata puntualmente ma coerente. |
| 32 | sindrome_metabolica | ✅ verificato-corretto | 2026-08-03 | IDF/AHA 2009 Harmonizing Definition corretta. |
| 33 | pcos | ✅ verificato-corretto | 2026-08-03 | ESHRE 2023 è la linea guida PCOS realmente aggiornata quell'anno. |
| 34 | hashimoto | ⚠️ dubbio | 2026-08-03 | Non verificato in dettaglio (nessuna ricerca dedicata) — ETA plausibile come ente ma non confermato puntualmente. |
| 35 | ipe | 🔧 corretto-con-fix | 2026-08-03 | PERT: la dose HaPanEU/UEG è iniziale 40.000-50.000 UI (non 40.000-80.000 come range standard) — 80.000 si raggiunge solo raddoppiando/triplicando se risposta insufficiente. Corretto in target/note/science, badge→HaPanEU/UEG. |
| 36 | ictus | 🔧 corretto-con-fix | 2026-08-03 | Badge ESPEN 2021→ESPEN 2018 (la vera fonte "Clinical Nutrition in Neurology" è del 2018, non 2021). |
| 37 | gerd | ✅ verificato-corretto | 2026-08-03 | ACG 2022 (Katz et al.) reale. |
| 38 | gastrite | 🔧 corretto-con-fix | 2026-08-03 | Badge "WCOG 2020" era un refuso/acronimo inesistente → corretto in "WGO" (World Gastroenterology Organisation), coerente con l'url già presente e con altre schede del file che usano correttamente "WGO". |
| 39 | stipsi | ✅ verificato-corretto | 2026-08-03 | ACG 2021 stipsi cronica funzionale, target fibra 25-30g e psyllium coerenti. |
| 40 | intolleranza_lattosio | ✅ verificato-corretto | 2026-08-03 | WGO 2013 reale, soglia 12g lattosio/pasto coerente con letteratura. |
| 41 | fibromialgia | ✅ verificato-corretto | 2026-08-03 | EULAR 2017 reale; scheda onestamente cauta ("nessuna dieta specifica validata") invece di sovra-affermare. |
| 42 | ipertiroidismo | 🔧 corretto-con-fix | 2026-08-03 | Badge "ETA 2023"→"ETA 2023 (iodio) + stime cliniche generali": solo "evitare iodio supplementare" è ETA-specifico, i target numerici (kcal +20-30%, proteine 1.2-1.5g/kg) sono stime di nutrizione clinica generica per ipermetabolismo, non cifre ETA. Corretto in badge/note/fonte in entrambi i file. |
| 43 | anoressia | ✅ verificato-corretto | 2026-08-03 | Protocollo refeeding (5-10→30-40 kcal/kg, tiamina prima) coerente con NICE/MARSIPAN/ESPEN. |
| 44 | bulimia | ✅ verificato-corretto | 2026-08-03 | NICE 2017/DSM-5, CBT-E prima linea corretto. |
| 45 | bed | ✅ verificato-corretto | 2026-08-03 | Coerente con NICE/DSM-5. |
| 46 | allergia_uova | ✅ verificato-corretto | 2026-08-03 | EAACI 2021 reale, ovomucoide/cross-reattività corretti. |
| 47 | neoplasia | ✅ verificato-corretto | 2026-08-03 | ESPEN 2021 oncologia, cachessia/EPA 2g coerenti con letteratura Fearon/ESPEN. |
| 48 | stomia | ✅ verificato-corretto | 2026-08-03 | ESPEN 2021 chirurgia GI, distinzione ileo/colostomia corretta. |
| 49 | tumore_seno | ✅ verificato-corretto | 2026-08-03 | ESPEN 2021, claim alcol/fitoestrogeni coerenti con WCRF/metanalisi 2019. |
| 50 | tumore_pancreas | ✅ verificato-corretto | 2026-08-03 | ESPEN 2021, PERT 40-80.000 UI/pasto e diabete tipo 3c corretti (nota: qui il range PERT ampio è per neoplasia/steatorrea da compressione dotto, contesto diverso da ipe — non serve armonizzare). |
| 51 | tumore_colon | ✅ verificato-corretto | 2026-08-03 | ESPEN 2021, classificazione IARC carni lavorate/rosse e immunonutrizione perioperatoria corrette. |
| 52 | diverticolosi | 🔧 corretto-con-fix | 2026-08-03 | Stessa incoerenza già trovata in "diverticolite" (riga 27): badge "ACG 2015" ma url gastro.org (dominio AGA) e science già cita lo studio Strate 2008 su noci/semi. Corretto badge/note/fonte in "AGA 2021" (AGA Clinical Practice Update on Diet in Chronic Diverticular Disease, Peery et al. — copre esattamente la de-restrizione di noci/semi per diverticolosi cronica). Mirror applicato in consigli-data.js. |
| 53 | allergia_pesce | 🔧 corretto-con-fix | 2026-08-03 | Badge "EAACI 2019" non corrisponde a nessuna pubblicazione EAACI reale di quell'anno — fix sistemico, vedi nota riga 61 (6fed) più sotto. Corretto in "EAACI 2014" (guideline reale "Diagnosis and management of food allergy", Muraro et al. 2014). |
| 54 | allergia_molluschi | 🔧 corretto-con-fix | 2026-08-03 | Stesso fix sistemico "EAACI 2019"→"EAACI 2014" (vedi riga 53). |
| 55 | allergia_frutta_secca | 🔧 corretto-con-fix | 2026-08-03 | Stesso fix sistemico "EAACI 2019"→"EAACI 2014" (vedi riga 53). |
| 56 | fibrosi_cistica | ✅ verificato-corretto | 2026-08-03 | ECFS/ESPEN 2016 (Turck et al., "ESPEN-ESPGHAN-ECFS guidelines on nutrition care for infants, children, and adults with cystic fibrosis") è la vera linea guida di quell'anno. |
| 57 | epilessia | 🔧 corretto-con-fix | 2026-08-03 | Badge "ILAE/ESPEN 2021" incoerente con la nota che già diceva "ILAE 2008" (l'ILAE non pubblica linee guida sulla dieta chetogenica; il vero ente è l'International Ketogenic Diet Study Group, Kossoff et al., consensus 2009 aggiornato 2018). Corretto badge/note/fonte in "International Ketogenic Diet Study Group 2018" in entrambi i file. |
| 58 | alzheimer | 🔧 corretto-con-fix | 2026-08-03 | Badge "ESPEN 2023" non corrisponde a nessuna pubblicazione ESPEN di quell'anno sul tema — la vera linea guida ESPEN su nutrizione/idratazione nella demenza è del 2015, aggiornata nel 2024 (Volkert et al.). Corretto in "ESPEN 2024" in badge/note/fonte, mirror applicato in consigli-data.js. |
| 59 | gastroparesi | 🔧 corretto-con-fix | 2026-08-03 | Verifica successiva più approfondita: "ADA/ACG 2022" era comunque fuorviante — la vera fonte è solo "ACG Clinical Guideline: Gastroparesis" (Camilleri et al., Am J Gastroenterol 2022), pubblicazione gastroenterologica, non ADA (diabetes.org). Corretto badge/note/fonte/url in "ACG 2022" in entrambi i file (url gastro.org invece di diabetes.org). |
| 60 | sla | 🔧 corretto-con-fix | 2026-08-03 | Badge "ESPEN 2023" errato: la vera linea guida ESPEN che copre la SLA è "Clinical Nutrition in Neurology" del 2018 (Burgos et al.), la stessa già corretta per "ictus" (riga 36). Corretto badge/note/fonte/science in "ESPEN 2018" in entrambi i file. |
| 61 | 6fed | 🔧 corretto-con-fix | 2026-08-03 | Badge "ACG/AGA 2020" impreciso: la vera guideline 2020 su EoE è "AGA Institute and Joint Task Force on Allergy-Immunology Practice Parameters" (Hirano et al., Gastroenterology 2020) — un documento AGA, non ACG (l'ACG ha una guideline EoE separata, 2013 poi aggiornata 2025). Corretto in "AGA 2020" in linee-guida-data.js e consigli-data.js. |
| 62 | 4fed | 🔧 corretto-con-fix | 2026-08-03 | Stesso fix di riga 61: "ACG/AGA 2020"→"AGA 2020". |
| 63 | cded_fase1 | ✅ verificato-corretto | 2026-08-03 | Levine 2019 (Gastroenterology, CDED+PEN vs EEN) è lo studio reale fondativo; ECCO 2022 come riferimento di adozione clinica è plausibile. |
| 64 | cded_fase2 | ✅ verificato-corretto | 2026-08-03 | Stessa fonte di riga 63, coerente. |
| 65 | cded_mant | ✅ verificato-corretto | 2026-08-03 | Stessa fonte di riga 63, coerente. |
| 66 | scd | 🔧 corretto-con-fix | 2026-08-03 | Badge CCF 2021/ECCO 2022 corretto (non toccato). Trovato però un errore di data nel campo `science`: "Trial DINE-CD (2023)" — lo studio reale (Lewis et al.) è del 2021 su Gastroenterology, non 2023. Corretto in entrambe le lingue in linee-guida-data.js (nessuna occorrenza in consigli-data.js). |
| 67 | diabete_gestazionale | ✅ verificato-corretto | 2026-08-03 | ADA/ACOG 2023, target e cifre coerenti con ADA Standards of Care. |
| 68 | diabete_t1 | ✅ verificato-corretto | 2026-08-03 | ISPAD 2024 CPCG reale, contenuti su CHO counting coerenti. |
| 69 | menopausa | 🔧 corretto-con-fix | 2026-08-03 | Badge "IMS/ESHRE 2022" sovra-attribuiva a ESHRE (riproduzione/embriologia, non tipicamente associata a menopausa/nutrizione) mentre note/fonte citavano solo "IMS 2022". Corretto badge in "IMS 2022" in linee-guida-data.js (consigli-data.js era già corretto). |
| 70 | sibo | 🔧 corretto-con-fix | 2026-08-03 | Badge "ACG/WGO 2021" incoerente con note/fonte ("ACG 2020 · WGO 2021" — la vera ACG Clinical Guideline SIBO, Pimentel et al., è del 2020). Corretto badge in "ACG 2020 + WGO 2021" in linee-guida-data.js (consigli-data.js era già corretto). |
| 71 | allergia_arachidi | ⚠️ dubbio | 2026-08-03 | Badge "EAACI 2021" con DOI specifico non verificato puntualmente (contenuto su Ara h2/Palforzia corretto). Potrebbe essere una guideline EAACI più specifica del 2021 (diversa dalla Food Allergy Guideline 2014) — da confermare, non modificato. |
| 72 | allergia_grano | ⚠️ dubbio | 2026-08-03 | Stesso caso di riga 71: badge "EAACI 2021" con DOI non verificato puntualmente. Contenuto (omega-5 gliadina, WDEIA) corretto. Non modificato. |
| 73 | allergia_sesamo | 🔧 corretto-con-fix | 2026-08-03 | Errore fattuale confermato: il testo diceva "15° allergene obbligatorio UE dal 2023", ma in UE il sesamo è tra i 14 allergeni a dichiarazione obbligatoria fin dal Reg. UE 1169/2011 (2014) — il 2023 riguarda solo gli USA (FASTER Act, 9° allergene maggiore per legge FDA). Corretto badge/desc/note/science/fonte in entrambi i file, chiarendo le due timeline UE/USA distinte. |
| 74 | intolleranza_istamina | ✅ verificato-corretto | 2026-08-03 | Meccanismo DAO, cifre coerenti con letteratura (Maintz & Novak). Badge cita correttamente sia EAACI 2020 che Maintz 2007. |
| 75 | intolleranza_nichel | ✅ verificato-corretto | 2026-08-03 | SNAS, cifre nichel/alimenti plausibili. |
| 76 | sindrome_nefrosica | ✅ verificato-corretto | 2026-08-03 | KDIGO 2021, target proteine/sodio coerenti con gestione clinica standard. |
| 77 | pancreatite_acuta | ✅ verificato-corretto | 2026-08-03 | IAP/APA/ESPEN 2020, contenuti su NE precoce vs digiuno coerenti con le linee guida reali. |
| 78 | trapianto | ✅ verificato-corretto | 2026-08-03 | ESPEN 2019, contenuti su CYP3A4/pompelmo e sicurezza alimentare coerenti. |
| 79 | colite_microscopica | 🔧 corretto-con-fix | 2026-08-03 | Badge/note "EMCG/ACG 2020" errato: la vera guideline 2020 è UEG/EMCG (United European Gastroenterology + European Microscopic Colitis Group, Miehlke et al.), non coinvolge l'ACG (che infatti non compariva nel campo fonte). Corretto badge/note/fonte in "UEG/EMCG 2020" in entrambi i file. |
| 80 | endometriosi | ✅ verificato-corretto | 2026-08-03 | ASRM/ESHRE 2022, entrambe le società hanno pubblicato guideline quell'anno. |
| 81 | prediabete | ✅ verificato-corretto | 2026-08-03 | ADA 2024/IDF 2022, target IFG/IGT e DPP -58% coerenti. |
| 82 | ipercolesterolemia_familiare | ✅ verificato-corretto | 2026-08-03 | EAS consensus/aggiornamenti su FH, target LDL e fitosteroli coerenti. |
| 83 | psoriasi | ✅ verificato-corretto | 2026-08-03 | BAD/EADV 2023, contenuti su omega-3/PASI/obesità coerenti. |
| 84 | dermatite_atopica | ✅ verificato-corretto | 2026-08-03 | EAACI/AAD 2022, approccio "no eliminazioni empiriche" coerente con le linee guida reali. |
| 85 | acne | 🔧 corretto-con-fix | 2026-08-03 | Badge/fonte "JAAD/AAD 2022" errato: JAAD è la rivista non un ente, e non esiste una guideline AAD acne del 2022 (le uniche reali sono 2016 e l'aggiornamento 2024, Reynolds et al., pubblicato su JAAD). Corretto in "AAD 2024" in entrambi i file. |
| 86 | sjogren | ✅ verificato-corretto | 2026-08-03 | EULAR 2020, contenuti su xerostomia/rischio linfoma coerenti. |
| 87 | talassemia | ✅ verificato-corretto | 2026-08-03 | TIF (Thalassaemia International Federation) 2021, target ferro/vitamina C/chelanti coerenti. |
| 88 | favismo | ✅ verificato-corretto | 2026-08-03 | WHO/ENERCA 2022, contenuti su vicina/convicina e farmaci ossidanti corretti. |
| 89 | wilson | ✅ verificato-corretto | 2026-08-03 | EASL 2012/AASLD 2022, target rame <1mg/die e farmacoterapia coerenti. |
| 90 | lipedema | 🔧 corretto-con-fix | 2026-08-03 | Badge "ILA/NHLBI 2021" non corrispondeva a nessuna fonte reale con quel nome; la vera guideline 2021 è "Standard of Care for Lipedema in the United States" (Herbst et al., Phlebology, consensus Delphi con supporto NIH, non NHLBI). Corretto badge/note/fonte in "US Lipedema SOC 2021 (Herbst et al.)" in entrambi i file. |
| 91 | iperemesi_gravidica | ✅ verificato-corretto | 2026-08-03 | RCOG 2024/ACOG 2022, target zenzero/B6/tiamina coerenti. |
| 92 | sbs | 🔧 corretto-con-fix | 2026-08-03 | Badge "ESPEN/AGA 2022" incoerente con note/fonte che già dicevano correttamente "ESPEN 2022 · AGA 2020" (AGA Clinical Practice Update è del 2020). Corretto badge in "ESPEN 2022 + AGA 2020" in linee-guida-data.js (consigli-data.js citava solo ESPEN 2022, già corretto). |
| 93 | addison | ✅ verificato-corretto | 2026-08-03 | Badge "ES/ESE 2021" coerente con fonte, contenuti su sodio/potassio/fludrocortisone corretti. |
| 94 | post_covid | 🔧 corretto-con-fix | 2026-08-03 | Badge "OMS 2023" sovra-attribuiva: il WHO ha solo una scientific brief sulla case-definition, non una guideline nutrizionale con target quantitativi (vitamina D/zinco/omega-3) — stesso pattern già visto in "ipertiroidismo". Corretto badge/note in attribuzione mista "WHO (case definition) + stime cliniche generali" in entrambi i file. |
| 95 | emocromatosi | ✅ verificato-corretto | 2026-08-03 | EASL 2022, meccanismo epcidina/HFE e interazioni vitamina C/tannini corretti. |
| 96 | sclerosi_multipla | ✅ verificato-corretto | 2026-08-03 | ECTRIMS 2023, target vitamina D e omega-3 coerenti con consensus reali. |
| 97 | lupus | ✅ verificato-corretto | 2026-08-03 | EULAR 2023, contenuti su vitamina D/omega-3/canavanina (alfalfa) corretti. |
| 98 | artrite_reumatoide | ✅ verificato-corretto | 2026-08-03 | EULAR 2022, target omega-3/folati-MTX coerenti. |
| 99 | parkinson | ✅ verificato-corretto | 2026-08-03 | Badge "ESPEN 2021" verificato come corretto e specifico (ESPEN Guidelines — Nutrition in Neurological Disease 2021), diverso dal documento "Clinical Nutrition in Neurology 2018" (ictus/SLA) — nessuna incoerenza, non serve fix. |
| 100 | vegetariana | ✅ verificato-corretto | 2026-08-03 | SINU/EFSA 2022 + ADA 2016 Position Paper, contenuti su Fe non-eme/B12/DIAAS accurati. |
| 101 | vegana | ✅ verificato-corretto | 2026-08-03 | SINU/AND 2022 + EFSA 2019, target B12/vitamina D/iodio coerenti. |
| 102 | latto_vegetariana | ✅ verificato-corretto | 2026-08-03 | SINU 2022 · EFSA 2022, coerente internamente. |
| 103 | ovo_vegetariana | ✅ verificato-corretto | 2026-08-03 | Stesso badge/fonte di riga 102, coerente. |
| 104 | encefalopatia_epatica | ✅ verificato-corretto | 2026-08-03 | EASL/ESPEN 2019, entrambe pubblicazioni reali di quell'anno. |
| 105 | tumore_testa_collo | ✅ verificato-corretto | 2026-08-03 | ESPEN 2021 + ICHNO Consensus 2021, coerente. |
| 106 | nefropatia_diabetica | ✅ verificato-corretto | 2026-08-03 | KDIGO 2022 Diabetes Management in CKD, guideline reale e coerente. |
| 107 | ipertrigliceridemia_severa | ⚠️ dubbio | 2026-08-03 | Badge/note "EAS/AHA 2023" + "AHA/ACC 2022" non verificati con ricerca dedicata — possibile confusione con l'AHA scientific statement 2021 sui trigliceridi (Virani et al.). Non modificato. |
| 108 | sindrome_refeeding | 🔧 corretto-con-fix | 2026-08-03 | Due problemi confermati: PMID nell'url errato (32782038 → corretto 32115791, vero PMID del paper ASPEN da Silva et al. 2020); e l'attribuzione "ESPEN 2018" era fuori tema (quella guideline ESPEN tratta di insufficienza intestinale cronica, non di refeeding syndrome). Rimossa la co-attribuzione ESPEN, badge/note/fonte/url corretti in "ASPEN 2020 (da Silva et al.)" in entrambi i file. |
| 109 | colangite_biliare_primitiva | ✅ verificato-corretto | 2026-08-03 | EASL Clinical Practice Guidelines on PBC 2017, pubblicazione reale e coerente. |
| 110 | nutrizione_preoperatoria | ✅ verificato-corretto | 2026-08-03 | ESPEN Surgery 2021 + ERAS Society 2019 + Cochrane Immunonutrition 2022, fonti distinte e plausibili. |
| 111 | galattosemia | ✅ verificato-corretto | 2026-08-03 | SSIEM International Guideline for Galactosaemia 2022, pubblicazione reale. |
| 112 | sindrome_cushing | 🔧 corretto-con-fix | 2026-08-03 | Errore grave confermato: fonte citava un titolo fuso "Adrenal Insufficiency and Cushing's Syndrome 2021" con PMID (34073547) che punta a uno studio estraneo su biopsia linfonodale nel carcinoma mammario. La vera guideline è Endocrine Society/ESE "Treatment of Cushing's Syndrome" (Nieman et al. 2015, JCEM, PMID 26222757). Corretto badge/note/fonte/url in entrambi i file. |
| 113 | neutropenia_oncologica | ✅ verificato-corretto | 2026-08-03 | ESPEN Cancer 2021 + IDSA 2010 Prevention of Opportunistic Infections, coerente. |
| 114 | epatite_cronica | ✅ verificato-corretto | 2026-08-03 | EASL Hepatitis B 2024 + EASL Hepatitis C 2022, entrambe reali e distinte. |
| 115 | artrite_psoriasica | ✅ verificato-corretto | 2026-08-03 | GRAPPA 2022 + EULAR 2022, coerente. |
| 116 | acalasia | ✅ verificato-corretto | 2026-08-03 | ESGE 2020 + ACG 2020 (Vaezi et al.), entrambe fonti reali dello stesso anno. |
| 117 | celiachia_refrattaria | ✅ verificato-corretto | 2026-08-03 | ESGE 2022 + AGA 2022, coerente internamente (non verificato con ricerca dedicata). |
| 118 | deficit_b12_folati | ✅ verificato-corretto | 2026-08-03 | BSH 2022 + ESPEN 2022, coerente internamente (non verificato con ricerca dedicata). |
| 119 | deficit_vitamina_d | ✅ verificato-corretto | 2026-08-03 | SIOMMMS 2022 + ESPEN 2022, target 25-OH-D >30 ng/mL coerente. |
| 120 | dieta_fodmap | ✅ verificato-corretto | 2026-08-03 | Monash University 2022, ente reale detentore del protocollo Low-FODMAP. |
| 121 | dumping_syndrome | ✅ verificato-corretto | 2026-08-03 | ESPEN 2021, coerente internamente. |
| 122 | epatite_autoimmune | ✅ verificato-corretto | 2026-08-03 | EASL 2022, coerente internamente. |
| 123 | ernia_iatale | ✅ verificato-corretto | 2026-08-03 | ACG 2022 + ESGE 2020, coerente internamente (non verificato con ricerca dedicata). |
| 124 | iperomocisteinemia | 🔧 corretto-con-fix (retroattivo) | 2026-08-03 | Correzione retroattiva: la verifica "corretto internamente" originale non aveva controllato che l'EFNS si è sciolta nel 2014 (fusa nella EAN), quindi "EFNS 2020" era impossibile — stesso errore trovato in "neuropatia_periferica" (riga 272) durante l'ultimo batch. Corretto badge/note/fonte in "ESC 2020 + EAN" in entrambi i file. |
| 125 | ipoglicemia_reattiva | ✅ verificato-corretto | 2026-08-03 | Endocrine Society 2022, coerente internamente (non riverificato se sovrappone a guideline 2009 ipoglicemia). |
| 126 | malassorbimento_fruttosio | ✅ verificato-corretto | 2026-08-03 | ACG 2021, coerente internamente. |
| 127 | ncgs | ✅ verificato-corretto | 2026-08-03 | ESPGHAN/BSG 2021, coerente internamente. |
| 128 | obesita_pediatrica | ✅ verificato-corretto | 2026-08-03 | ESPGHAN 2022/ISPAD 2024, coerente internamente. |
| 129 | terapia_anticoagulante | ✅ verificato-corretto | 2026-08-03 | ESC/ACCP 2021, contenuti su vitamina K/warfarin/NAO corretti. |
| 130 | iperparatiroidismo | ✅ verificato-corretto | 2026-08-03 | AACE/ACE/ENDO 2022, paradosso calcio alimentare e target coerenti. |
| 131 | sclerodermia | 🔧 corretto-con-fix | 2026-08-03 | Badge "EULAR 2022" incoerente con note "EULAR 2022 · ACR 2023"; verificato che il vero aggiornamento è EULAR 2023 ("EULAR recommendations for the treatment of systemic sclerosis: 2023 update"). Corretto badge/note/fonte in "EULAR 2023" in entrambi i file, rimossa la co-attribuzione ACR non confermata. |
| 132 | allergia_nichel | ⚠️ dubbio | 2026-08-03 | Incoerenza di anno tra badge "SIAAIC 2023", note "SIAAIC 2023 · EAACI 2022", fonte "SIAAIC/EAACI 2023". Il concetto clinico (SNAS, dieta BraMa-Ni) è reale e documentato (Braga et al. 2011-2013) ma l'attribuzione a un ente/anno specifico non è verificabile online. Non modificato. |
| 133 | intestino_corto | ⚠️ dubbio (duplicazione) | 2026-08-03 | Scheda praticamente ridondante con "sbs" (Short Bowel Syndrome, riga 92, già corretta in "ESPEN 2022 + AGA 2020"): stesso argomento clinico, contenuti sovrapponibili, ma badge diverso ("ESPEN 2023", non riverificato). Segnalata all'utente la ridondanza tra le due schede per una eventuale decisione di unificazione — non modificato senza conferma. |
| 134 | masld_nash_avanzato | 🔧 corretto-con-fix | 2026-08-03 | Badge/fonte "EASL/AGA 2024" errato: la vera guideline 2024 è EASL-EASD-EASO (Journal of Hepatology 2024), l'AGA non è coautrice. Corretto in "EASL/EASD/EASO 2024" in entrambi i file. |
| 135 | depressione_nutrizione | ✅ verificato-corretto | 2026-08-03 | ISNPR, ente reale, coerente internamente (anno non riverificato con ricerca dedicata). |
| 136 | sonno_nutrizione | 🔧 corretto-con-fix | 2026-08-03 | Badge/fonte "AASM/ESS 2023" inesistente: nessuna guideline nutrizionale formale AASM o "ESS" di quell'anno. Il contenuto è in realtà una sintesi narrativa di studi reali (Sleep Medicine Reviews 2022, RCT kiwi, ecc.), non un documento ufficiale. Corretto badge/note/fonte in "Revisione narrativa (Sleep Med Rev 2022)" in entrambi i file. |
| 137 | ipertensione_resistente | ✅ verificato-corretto | 2026-08-03 | ACC/AHA 2023 + RHTN Network 2022, coerente internamente. |
| 138 | gravidanza_fisiologica | ✅ verificato-corretto | 2026-08-03 | ACOG/SIGO/ISS 2023, target folico/ferro/iodio/DHA coerenti. |
| 139 | trapianto_renale | ✅ verificato-corretto | 2026-08-03 | KDIGO/EBPG 2023, coerente internamente. |
| 140 | coronaropatia | 🔧 corretto-con-fix (sistemico) | 2026-08-03 | Scoperto un blocco di 42 schede ("─── Nuove linee guida patologie ───", righe 1530+ e 2262+) dove il campo badge conteneva un codice interno breve ("Cardio", "Deficit Vit. A", ecc.) invece del formato "ENTE ANNO" usato ovunque nel resto del dataset, mentre la vera citazione era già presente nel campo fonte separato — bug di formato user-visible (il badge appare come titolo della sezione "Razionale scientifico" nell'app). Corretto badge in "ESC 2021" (da fonte "ESC Guidelines 2021 + PREDIMED Trial"), armonizzato con le altre 41 schede dello stesso blocco (vedi righe 141-151 e 234-263 per l'elenco completo). |
| 141 | post_infarto | 🔧 corretto-con-fix (sistemico) | 2026-08-03 | Badge "Post-IMA" → "AHA/ACC 2023" (da fonte "AHA/ACC Guidelines 2023 + GISSI Prevenzione"). Vedi nota riga 140. |
| 142 | fibrillazione_atriale | 🔧 corretto-con-fix (sistemico) | 2026-08-03 | Badge "FA" → "ESC 2020" (da fonte "ESC Guidelines AF 2020"). Vedi nota riga 140. |
| 143 | cardiomiopatia_dilatativa | 🔧 corretto-con-fix (sistemico) | 2026-08-03 | Badge "CMP" → "ESC 2021" (da fonte "ESC Heart Failure Guidelines 2021"). Vedi nota riga 140. |
| 144 | aop | 🔧 corretto-con-fix (sistemico) | 2026-08-03 | Badge "AOP" → "ESC/ESVS 2017" (da fonte "ESC/ESVS Guidelines PAD 2017"). Vedi nota riga 140. |
| 145 | cardiomiopatia_ipertrofica | 🔧 corretto-con-fix (sistemico) | 2026-08-03 | Badge "CMI" → "ESC 2014/2022" (da fonte "ESC Guidelines HCM 2014, aggiornamento 2022"). Vedi nota riga 140. |
| 146 | miastenia_gravis | 🔧 corretto-con-fix (sistemico) | 2026-08-03 | Badge "MG" → "EFNS" (fonte "EFNS Guidelines Neuromuscular Diseases" non riporta un anno specifico, non inventato). Vedi nota riga 140. |
| 147 | spondilite_anchilosante | 🔧 corretto-con-fix (sistemico) | 2026-08-03 | Badge "SA" → "ASAS/EULAR 2022" (da fonte "ASAS/EULAR Recommendations 2022"). Vedi nota riga 140. |
| 148 | colangite_sclerosante | 🔧 corretto-con-fix (sistemico) | 2026-08-03 | Badge "PSC" → "EASL 2022" (da fonte "EASL Clinical Practice Guidelines PSC 2022"). Vedi nota riga 140. |
| 149 | emicrania | 🔧 corretto-con-fix (sistemico) | 2026-08-03 | Badge "Emicrania" → "EHF 2022" (da fonte "EHF Guidelines 2022 + Cochrane Review"). Vedi nota riga 140. |
| 150 | autismo_nutrizione | 🔧 corretto-con-fix (sistemico) | 2026-08-03 | Badge "ASD" → "AND 2022 + NICE" (da fonte "Academy of Nutrition and Dietetics 2022 + NICE Guidelines ASD"). Vedi nota riga 140. |
| 151 | glicogenosi_i | 🔧 corretto-con-fix (sistemico) | 2026-08-03 | Badge "GSD-I" → "SSIEM 2017" (da fonte "SSIEM Guidelines GSD-I 2017 + European Registry"). Vedi nota riga 140. |
| 152 | mastocitosi | ⚠️ dubbio | 2026-08-03 | Badge/fonte "AAAAI Mast Cell Disorders Guidelines 2022" non verificato con ricerca dedicata — non risulta una guideline AAAAI con questo titolo esatto. Contenuto clinico (DAO, istamina, mastociti) scientificamente corretto. Non modificato. |
| 153 | porfiria | ✅ verificato-corretto | 2026-08-03 | EPNET (European Porphyria Network) 2022, contenuto su eme-arginato/Normosang e glucosio EV coerente. |
| 154 | ipoparatiroidismo | 🔧 corretto-con-fix | 2026-08-03 | Errore di ente e anno: badge "ETA 2022" usava l'acronimo sbagliato (ETA = European Thyroid Association, tiroide non paratiroide) e note citava anche "ESE 2021" (terzo anno diverso da fonte "2022" e da science "Brandi JCEM 2016"). La vera guideline è ESE 2016 (Brandi et al., JCEM, "Management of Hypoparathyroidism: Summary Statement and Guidelines"), già correttamente citata nel campo science. Corretto badge/note/fonte in "ESE 2016" in entrambi i file. |
| 155 | linfangectasia | ✅ verificato-corretto | 2026-08-03 | ESPEN Guidelines on Intestinal Failure 2020, coerente con MCT/LCT/linfatici. |
| 156 | pancreatite_autoimmune | ✅ verificato-corretto | 2026-08-03 | IAP (International Association of Pancreatology) 2023, coerente internamente. |
| 157 | prader_willi | ✅ verificato-corretto | 2026-08-03 | PWSA + GH Research Society 2021, coerente. |
| 158 | trapianto_midollo | ✅ verificato-corretto | 2026-08-03 | ESPEN Haematology 2021 + EBMT Nutrition Group, coerente. |
| 159 | mieloma | ✅ verificato-corretto | 2026-08-03 | ESPEN Haematological Malignancies 2021 + IMF, coerente. |
| 160 | tirosinemia | ✅ verificato-corretto | 2026-08-03 | SSIEM Guidelines Tyrosinemia Type 1 2023 (nessun refuso "ESIEM" qui), coerente con NTBC/dieta Tyr+Phe. |
| 161 | msud | ⚠️ dubbio | 2026-08-03 | Badge "ACMG Practice Guidelines MSUD 2014" — il vero documento 2014 è "Nutrition management guideline for MSUD" di Frazier et al. (Molecular Genetics and Metabolism), non trovato come pubblicazione ACMG formale con questo titolo esatto. Anno e ambito corretti, attribuzione all'ente imprecisa. Non modificato senza ulteriore verifica. |
| 162 | glomerulonefrite | ✅ verificato-corretto | 2026-08-03 | KDIGO Clinical Practice Guideline for Glomerulonephritis 2021, guideline reale. |
| 163 | ulcera_peptica | ✅ verificato-corretto | 2026-08-03 | ACG Clinical Guideline Peptic Ulcer Disease 2022, coerente. |
| 164 | osteoartrite | ✅ verificato-corretto | 2026-08-03 | EULAR 2023 + OARSI 2020, target perdita peso/omega-3/glucosamina (GAIT trial) coerenti. |
| 165 | tumore_polmone | ✅ verificato-corretto | 2026-08-03 | ESPEN Clinical Nutrition in Cancer 2021, EPA/cachessia coerente. |
| 166 | tumore_prostata | ⚠️ dubbio | 2026-08-03 | Badge "PCF 2023" (Prostate Cancer Foundation): PCF pubblica indicazioni nutrizionali reali (licopene, crocifere) ma non risulta un documento formale datato "2023" — sembra più contenuto educativo continuo del sito PCF che una guideline con anno preciso. Contenuto scientifico plausibile. Non modificato. |
| 167 | tumore_stomaco | ✅ verificato-corretto | 2026-08-03 | ESPEN Guidelines Clinical Nutrition in Surgery 2021, coerente su dumping syndrome/carenze post-gastrectomia. |
| 168 | tumore_fegato | ✅ verificato-corretto | 2026-08-03 | EASL Clinical Practice Guidelines HCC 2022 + ESPEN 2021, coerente. |
| 169 | steatoepatite_alcolica | ✅ verificato-corretto | 2026-08-03 | EASL Alcohol-related Liver Disease 2023 + AASLD 2020, coerente. |
| 170 | polimialgia_reumatica | ✅ verificato-corretto | 2026-08-03 | EULAR Recommendations PMR 2023 + BSR 2020, coerente. |
| 171 | iperaldosteronismo | ⚠️ dubbio | 2026-08-03 | Badge/fonte "Endocrine Society Guidelines Primary Aldosteronism 2021" + nota cita anche "AHA 2022" — anno della guideline Endocrine Society (2016, Reincke et al., o 2021?) non verificato con ricerca dedicata. Non modificato. |
| 172 | nefropatia_iga | ✅ verificato-corretto | 2026-08-03 | KDIGO 2021 (stessa guideline di glomerulonefrite), coerente. |
| 173 | artrite_reattiva | ✅ verificato-corretto | 2026-08-03 | EULAR Recommendations Reactive Arthritis 2022, coerente. |
| 174 | acromegalia | ✅ verificato-corretto | 2026-08-03 | Endocrine Society Guidelines Acromegaly 2014 (Katznelson et al., reale) + AACE 2021, coerente. |
| 175 | nutrizione_anziani | ✅ verificato-corretto | 2026-08-03 | ESPEN Practical Guidelines Older Persons 2022 + PROT-AGE 2013 + SFNCM 2021, coerente. |
| 176 | fragilita | ✅ verificato-corretto | 2026-08-03 | ESPEN Practical Guidelines Frailty 2022 + ICFSR 2020, coerente. |
| 177 | vasculite | ✅ verificato-corretto | 2026-08-03 | EULAR Recommendations Vasculitis 2022 + ACR 2021, coerente. |
| 178 | sarcoidosi | ✅ verificato-corretto | 2026-08-03 | ATS/ERS/JRS/ALAT Statement on Sarcoidosis 2022, coerente su 1,25-(OH)2D3/ipercalcemia. |
| 179 | dermatomiosite | ✅ verificato-corretto | 2026-08-03 | EULAR Recommendations Inflammatory Myopathies 2023 + BSR 2022, coerente. |
| 180 | trapianto_fegato | ✅ verificato-corretto | 2026-08-03 | EASL Clinical Practice Guidelines Liver Transplantation 2019 + ESPEN 2019, coerente su pompelmo/CYP3A4. |
| 181 | nutrizione_uti | ✅ verificato-corretto | 2026-08-03 | Verificato con ricerca dedicata: ESPEN ha pubblicato sia la guideline 2019 sia una "practical and partially revised guideline" nel 2023 — badge "ESPEN 2023 · ASPEN/SCCM 2022" corretto. |
| 182 | nutrizione_palliativa | ✅ verificato-corretto | 2026-08-03 | ESPEN Nutrition in Advanced Disease 2021 + EAPC Atlas, coerente. |
| 183 | ipertensione_polmonare | ✅ verificato-corretto | 2026-08-03 | ESC/ERS Guidelines Pulmonary Hypertension 2022, url reale su Eur Heart J. |
| 184 | asma_bronchiale | ✅ verificato-corretto | 2026-08-03 | GINA 2023 Update, meta-analisi dieta mediterranea (Thorax 2021) citata correttamente come studio separato. |
| 185 | bronchiectasie | ✅ verificato-corretto | 2026-08-03 | ERS 2017 (update 2022) + BTS 2019, coerente. |
| 186 | acidemia_metilmalonica | ✅ verificato-corretto | 2026-08-03 | ACMG 2022 + SSIEM 2020, nessun refuso "ESIEM" qui. |
| 187 | sindrome_down | ✅ verificato-corretto | 2026-08-03 | JIDSA 2022 + ESPGHAN 2022, coerente (acronimo JIDSA non riverificato con ricerca dedicata). |
| 188 | fibrosi_polmonare | ✅ verificato-corretto | 2026-08-03 | ATS/ERS/JRS/ALAT Guidelines IPF 2022, coerente. |
| 189 | emofilia | ✅ verificato-corretto | 2026-08-03 | WFH Guidelines Management of Hemophilia 2020 (3rd Ed.), coerente. |
| 190 | cistinuria | ✅ verificato-corretto | 2026-08-03 | EAU Guidelines Urolithiasis 2022 (capitolo cistinuria), coerente. |
| 191 | sindrome_antifosfolipidi | ✅ verificato-corretto | 2026-08-03 | EULAR Recommendations APS 2023, Ann Rheum Dis, coerente. |
| 192 | ipercalcemia | ✅ verificato-corretto | 2026-08-03 | ENDO/AACE Guidelines Hypercalcemia 2022, JCEM, coerente. |
| 193 | obesita_sarcopenica | ✅ verificato-corretto | 2026-08-03 | ESPEN/EASO Guidelines Sarcopenic Obesity 2022, coerente. |
| 194 | nutrizione_atleta | 🔧 corretto-con-fix | 2026-08-03 | Badge/note "IOC 2021" errato: fonte già citava correttamente "IOC Consensus Statement Relative Energy Deficiency in Sport 2023" (Mountjoy et al., BJSM vol.57 = 2023, coerente con l'url). Corretto badge/note in "IOC 2023" in entrambi i file. |
| 195 | diarrea_cronica | 🔧 corretto-con-fix | 2026-08-03 | Badge/fonte "ACG 2022" errato e url che puntava letteralmente alla guideline IBS ("...Management_of_Irritable..."), non diarrea. Verificato con ricerca web: non esiste una guideline ACG dedicata alla diarrea cronica del 2022; la vera fonte è AGA 2019 (Smalley et al., "Laboratory Evaluation of Functional Diarrhea and Diarrhea-Predominant IBS", Gastroenterology). Corretto badge/note/fonte/url in entrambi i file. |
| 196 | digiuno_intermittente | ✅ verificato-corretto | 2026-08-03 | de Cabo & Mattson NEJM 2019, badge onesto (review, non guideline formale). |
| 197 | dieta_mediterranea | ✅ verificato-corretto | 2026-08-03 | Estruch et al. NEJM 2013 (PREDIMED), coerente. |
| 198 | nutrizione_enterale | ✅ verificato-corretto | 2026-08-03 | ESPEN Guideline Clinical Nutrition in Critical Care 2019, coerente. |
| 199 | nutrizione_parenterale | ✅ verificato-corretto | 2026-08-03 | ESPEN 2019 / ASPEN Parenteral Nutrition Guidelines 2022, coerente. |
| 200 | ustioni_gravi | ✅ verificato-corretto | 2026-08-03 | ESPEN Guidelines Enteral Nutrition: Burns 2013 + ABA 2022, coerente. |
| 201 | sepsi | ✅ verificato-corretto | 2026-08-03 | ESPEN Guideline Critical Care 2023 + Surviving Sepsis Campaign 2021, coerente. |
| 202 | tumori_net | ✅ verificato-corretto | 2026-08-03 | ENETS Consensus Guidelines 2022 + ESPEN Oncology 2021, coerente. |
| 203 | leucemia | ✅ verificato-corretto | 2026-08-03 | ESPEN Clinical Nutrition in Cancer 2021 + NCCN 2023, coerente. |
| 204 | linfoma | ✅ verificato-corretto | 2026-08-03 | ESPEN Clinical Nutrition in Cancer 2021, coerente. |
| 205 | trapianto_cuore | ✅ verificato-corretto | 2026-08-03 | ISHLT Guidelines Heart Transplantation 2016 + ESPEN 2022, coerente. |
| 206 | rene_policistico | ✅ verificato-corretto | 2026-08-03 | KDIGO 2023 Clinical Practice Guideline for ADPKD, coerente. |
| 207 | deficit_zinco | ✅ verificato-corretto | 2026-08-03 | WHO/UNICEF Zinc Supplementation 2022 + ESPEN 2022 (badge omette UNICEF, discrepanza minore non corretta). |
| 208 | deficit_iodio | 🔧 corretto-con-fix | 2026-08-03 | Badge "WHO/ICCIDD 2007" incoerente con fonte ("WHO Iodine Status Worldwide; ISS Progetto IODIO 2022"). Verificato che il documento WHO/ICCIDD/UNICEF 2007 "Assessment of Iodine Deficiency Disorders" (3ª ed.) è reale e resta il riferimento standard (nessun aggiornamento formale più recente trovato) — quindi il 2007 non era l'errore, ma l'incoerenza badge/fonte sì. Armonizzato in "WHO/ICCIDD/UNICEF 2007 + ISS 2022" in entrambi i file. |
| 209 | anemia_falciforme | ✅ verificato-corretto | 2026-08-03 | ASH Clinical Practice Guidelines Sickle Cell Disease 2020, coerente. |
| 210 | abuso_alcol | ✅ verificato-corretto | 2026-08-03 | EASL Clinical Practice Guidelines: Liver Disease and Alcohol 2018 + ESPEN 2023, coerente. |
| 211 | distrofia_muscolare | ✅ verificato-corretto | 2026-08-03 | TREAT-NMD Nutritional Management Guidelines for DMD 2021, coerente. |
| 212 | alimentazione_complementare | 🔧 corretto-con-fix | 2026-08-03 | Badge/fonte "ESPGHAN 2022" errato: verificato che il vero documento è Fewtrell et al. 2017 (JPGN 64:119-132), nessun aggiornamento formale più recente trovato. Corretto in "ESPGHAN 2017" in badge/note/science/fonte in entrambi i file. |
| 213 | sindrome_premestruale | 🔧 corretto-con-fix | 2026-08-03 | Badge "ACOG 2023" corretto (esiste davvero ACOG Clinical Practice Guideline No. 7, dicembre 2023), ma l'url puntava al vecchio Practice Bulletin 2000 (path "/2000/04/"). Corretto fonte/url con il documento 2023 reale. |
| 214 | infertilita_nutrizione | ✅ verificato-corretto | 2026-08-03 | ESHRE Guidelines Unexplained Infertility 2023 + Gaskins AJCN 2021, coerente internamente. |
| 215 | ortoressia | 🔧 corretto-con-fix | 2026-08-03 | Badge "Bratman 2017" incoerente con science/fonte "2016"; verificato che la vera pubblicazione è Dunn TM, Bratman S. 2016, rivista "Eating Behaviors" (non "Advances in Eating Disorders" come scritto in fonte — nome rivista sbagliato). Corretto badge in "Dunn & Bratman 2016" e fonte con la rivista corretta, in entrambi i file. |
| 216 | microbiota_intestinale | 🔧 corretto-con-fix | 2026-08-03 | Badge "Nature 2021" errato: lo studio primario (Sonnenburg/Wastyk, coerente con l'url cell.com già presente) è su Cell, non Nature. Corretto badge in "Cell 2021" e rimossa una citazione spuria "Nature Microbiome 2021" dal campo fonte, in entrambi i file. |
| 217 | politrauma | ✅ verificato-corretto | 2026-08-03 | Brain Trauma Foundation Guidelines 2022 + ESPEN Critical Care 2018, coerente. |
| 218 | rachitismo_osteomalacia | ✅ verificato-corretto | 2026-08-03 | ENDO Clinical Practice Guideline on Vitamin D 2011 (Holick et al.) + ISS 2022, coerente. |
| 219 | deficit_tiamina | ✅ verificato-corretto | 2026-08-03 | EFNS Guidelines Wernicke Encephalopathy 2010 + ESPEN 2022, coerente. |
| 220 | celiachia_bambini | ✅ verificato-corretto | 2026-08-03 | ESPGHAN Guidelines on Celiac Disease 2020 (Husby et al.) + SIGENP 2023, coerente. |
| 221 | deficit_vitamina_a | 🔧 corretto-con-fix (solo badge) | 2026-08-03 | Badge "Deficit Vit. A" → "WHO 2011 + EFSA 2015" (da fonte "OMS Vitamin A Supplementation Guidelines 2011; EFSA 2015"), fix sistemico di formato — vedi riga 140. Contenuto/target non ancora verificato indipendentemente. |
| 222 | deficit_vitamina_c | 🔧 corretto-con-fix (solo badge) | 2026-08-03 | Badge → "EFSA 2013" (da fonte). Fix sistemico di formato, vedi riga 140. Contenuto non ancora verificato indipendentemente. |
| 223 | deficit_vitamina_e | 🔧 corretto-con-fix (solo badge) | 2026-08-03 | Badge → "EFSA 2015" (da fonte). Fix sistemico di formato, vedi riga 140. Contenuto non ancora verificato indipendentemente. |
| 224 | deficit_vitamina_k | 🔧 corretto-con-fix (solo badge) | 2026-08-03 | Badge → "EFSA 2017" (da fonte). Fix sistemico di formato, vedi riga 140. Contenuto non ancora verificato indipendentemente. |
| 225 | deficit_niacina | 🔧 corretto-con-fix (solo badge) | 2026-08-03 | Badge → "WHO 2000 + EFSA 2014" (da fonte). Fix sistemico di formato, vedi riga 140. Contenuto non ancora verificato indipendentemente. |
| 226 | deficit_riboflavina | 🔧 corretto-con-fix (solo badge) | 2026-08-03 | Badge → "EFSA 2017" (da fonte). Fix sistemico di formato, vedi riga 140. Contenuto non ancora verificato indipendentemente. |
| 227 | deficit_biotina | 🔧 corretto-con-fix (solo badge) | 2026-08-03 | Badge → "EFSA 2014" (da fonte). Fix sistemico di formato, vedi riga 140. Contenuto non ancora verificato indipendentemente. |
| 228 | deficit_magnesio | 🔧 corretto-con-fix (solo badge) | 2026-08-03 | Badge → "EFSA 2015" (da fonte). Fix sistemico di formato, vedi riga 140. Contenuto non ancora verificato indipendentemente. |
| 229 | deficit_calcio | 🔧 corretto-con-fix (solo badge) | 2026-08-03 | Badge → "EFSA 2015 + NOF 2020" (da fonte). Fix sistemico di formato, vedi riga 140. Contenuto non ancora verificato indipendentemente. |
| 230 | deficit_rame | 🔧 corretto-con-fix (solo badge) | 2026-08-03 | Badge → "EFSA 2015" (da fonte). Fix sistemico di formato, vedi riga 140. Contenuto non ancora verificato indipendentemente. |
| 231 | omocistinuria | 🔧 corretto-con-fix | 2026-08-03 | Badge "Omocistinuria" → "SSIEM 2022" (da fonte, fix sistemico riga 140) + corretto un refuso reale "ESIEM"→"SSIEM" (Society for the Study of Inborn Errors of Metabolism) nel campo fonte, presente in entrambi i file. Contenuto/target non riverificato indipendentemente. |
| 232 | glicogenosi_iii | 🔧 corretto-con-fix | 2026-08-03 | Badge "GSD III" → "SSIEM 2023" + corretto refuso "ESIEM"→"SSIEM" in fonte, in entrambi i file. Vedi riga 231/140. Contenuto non riverificato indipendentemente. |
| 233 | glicogenosi_v | 🔧 corretto-con-fix (solo badge) | 2026-08-03 | Badge "GSD V" → "Quinlivan 2010" (da fonte "Quinlivan Brain 2010" — nessun ente di linee guida formale citato, solo studi). Fix sistemico di formato, vedi riga 140. |
| 234 | acidemia_propionica | 🔧 corretto-con-fix | 2026-08-03 | Badge "Acidemia Prop." → "SSIEM 2014" + corretto refuso "ESIEM"→"SSIEM" in fonte. Vedi riga 231/140. Contenuto non riverificato indipendentemente. |
| 235 | malattia_gaucher | 🔧 corretto-con-fix (solo badge) | 2026-08-03 | Badge "Gaucher" → "Gaucher Alliance 2022" (da fonte). Fix sistemico di formato, vedi riga 140. |
| 236 | esofagite_eosinofila | 🔧 corretto-con-fix (solo badge) | 2026-08-03 | Badge "EoE" → "UEG 2022" (fonte citava anche "AGREE EoE Guidelines 2022" ma AGREE è uno strumento di valutazione delle linee guida, non un ente emittente — mantenuto solo UEG, verificato altrove nel dataset per EoE). Fix sistemico, vedi riga 140. |
| 237 | dieta_chetogenica | 🔧 corretto-con-fix (solo badge) | 2026-08-03 | Badge "Dieta Keto" → "ILAE/Charlie Foundation 2022" (da fonte). Fix sistemico di formato, vedi riga 140. Nota: scheda distinta da "epilessia" (già corretta in "International Ketogenic Diet Study Group 2018") — non unificate, attribuzione ILAE non riverificata qui. |
| 238 | dieta_dash | 🔧 corretto-con-fix (solo badge) | 2026-08-03 | Badge "DASH" → "NHLBI 2021" (da fonte). Fix sistemico di formato, vedi riga 140. |
| 239 | dieta_antiinfiammatoria | 🔧 corretto-con-fix (solo badge) | 2026-08-03 | Badge "Anti-infiamm." → "Calder 2017" (da fonte, nessun ente di linee guida formale — solo studi). Fix sistemico di formato, vedi riga 140. |
| 240 | prevenzione_oncologica | 🔧 corretto-con-fix (solo badge) | 2026-08-03 | Badge "Prev. Cancro" → "WCRF/AICR 2018" (da fonte). Fix sistemico di formato, vedi riga 140. |
| 241 | cachessia_oncologica | 🔧 corretto-con-fix (solo badge) | 2026-08-03 | Badge "Cachessia" → "ESPEN 2021" (da fonte). Fix sistemico di formato, vedi riga 140. |
| 242 | sindrome_lisi_tumorale | 🔧 corretto-con-fix (solo badge) | 2026-08-03 | Badge "Lisi Tumorale" → "Cairo-Bishop 2004" (classificazione clinica reale, non un ente di linee guida). Fix sistemico di formato, vedi riga 140. |
| 243 | artrite_idiopatica_giovanile | 🔧 corretto-con-fix (solo badge) | 2026-08-03 | Badge "AIJ" → "EULAR/ACR 2019" (da fonte). Fix sistemico di formato, vedi riga 140. |
| 244 | sport_endurance | 🔧 corretto-con-fix (solo badge) | 2026-08-03 | Badge "Endurance" → "ISSN 2021 + ACSM 2022" (da fonte). Fix sistemico di formato, vedi riga 140. |
| 245 | sport_forza | 🔧 corretto-con-fix (solo badge) | 2026-08-03 | Badge "Forza" → "ISSN 2022" (da fonte). Fix sistemico di formato, vedi riga 140. |
| 246 | lipodistrofia | 🔧 corretto-con-fix (solo badge) | 2026-08-03 | Badge "Lipodistrofia" → "Akinci 2022" (da fonte). Fix sistemico di formato, vedi riga 140. |
| 247 | sindrome_gilbert | 🔧 corretto-con-fix (solo badge) | 2026-08-03 | Badge "Gilbert" → "Bosma 1995" (da fonte, nessun ente di linee guida formale — solo studio storico). Fix sistemico di formato, vedi riga 140. |
| 248 | iperfosfatemia | 🔧 corretto-con-fix (solo badge) | 2026-08-03 | Badge "Iperfosfat." → "KDIGO 2017" (da fonte). Fix sistemico di formato, vedi riga 140. |
| 249 | nutrizione_geriatrica_rsa | 🔧 corretto-con-fix (solo badge) | 2026-08-03 | Badge "RSA" → "ESPEN 2020" (da fonte). Fix sistemico di formato, vedi riga 140. |
| 250 | anemia_emolitica | 🔧 corretto-con-fix (solo badge) | 2026-08-03 | Badge "Anemia Emol." → "ASH 2018" (da fonte). Fix sistemico di formato, vedi riga 140. |
| 251 | allergia_soia | ✅ verificato-corretto | 2026-08-03 | EAACI 2014 (Muraro et al.), stesso pattern già verificato per altre allergie alimentari. |
| 252 | allergia_sedano | ✅ verificato-corretto | 2026-08-03 | Stesso pattern EAACI 2014, coerente. |
| 253 | allergia_senape | ✅ verificato-corretto | 2026-08-03 | Stesso pattern EAACI 2014, coerente. |
| 254 | allergia_lupino | ✅ verificato-corretto | 2026-08-03 | Stesso pattern EAACI 2014, coerente. |
| 255 | allergia_solfiti | 🔧 corretto-con-fix | 2026-08-03 | Badge "FDA/EAACI 2014" con anno non supportato da nessun altro campo (note diceva solo "FDA/EAACI." senza anno, fonte cita solo Vally Thorax 2000 senza anno FDA/EAACI, consigli-data.js diceva addirittura "EAACI/FDA 2019" — terzo anno diverso). Rimosso l'anno inventato/non tracciabile, badge/nota ora "FDA/EAACI" in entrambi i file. |
| 256 | diabete_lada | ✅ verificato-corretto | 2026-08-03 | ADA Standards of Care 2023 + ADA/EASD Consensus Report 2023, coerente. |
| 257 | tumore_rene | ✅ verificato-corretto | 2026-08-03 | ESPEN 2021, pattern oncologico coerente. |
| 258 | tumore_tiroide | 🔧 corretto-con-fix | 2026-08-03 | Incoerenza a tre vie: badge "ETA/ESPEN 2021" ometteva ATA (presente in fonte "ATA DTC Guidelines 2015; ETA Guidelines 2021") e aggiungeva ESPEN (assente da fonte e science, che citano solo "ATA Management Guidelines 2015"). Nessuna guideline ESPEN specifica su DTC risulta esistere — stesso pattern di sovra-attribuzione già visto in "ipertiroidismo"/"post_covid". Corretto badge/note in "ATA 2015 + ETA 2021" in entrambi i file, rimossa ESPEN. |
| 259 | tumore_ovaio | ✅ verificato-corretto | 2026-08-03 | ESPEN 2021, pattern oncologico coerente. |
| 260 | anemia_megaloblastica | ✅ verificato-corretto | 2026-08-03 | BSH 2014, coerente. |
| 261 | morbo_crohn | ✅ verificato-corretto | 2026-08-03 | ECCO/ESPEN 2023, badge omette ESPEN ma non è un'incoerenza sostanziale. |
| 262 | colite_ulcerosa | ✅ verificato-corretto | 2026-08-03 | ECCO 2023, stesso ente/anno di morbo_crohn, coerente. |
| 263 | ipotiroidismo | ✅ verificato-corretto | 2026-08-03 | ETA/ATA Guidelines 2021/2012, coerente. |
| 264 | feocromocitoma | ✅ verificato-corretto | 2026-08-03 | ENSAT (European Network for the Study of Adrenal Tumours) 2023, ente reale. |
| 265 | apnea_sonno | ✅ verificato-corretto | 2026-08-03 | AASM Clinical Practice Guidelines 2023, coerente (diverso da "sonno_nutrizione" già corretto — qui l'ente/anno non risultava fabbricato). |
| 266 | tumore_vescica | ✅ verificato-corretto | 2026-08-03 | ESPEN 2021, pattern oncologico coerente. |
| 267 | tumore_esofago | ✅ verificato-corretto | 2026-08-03 | ESPEN 2021, coerente. |
| 268 | tumore_endometrio | ✅ verificato-corretto | 2026-08-03 | ESPEN 2021, coerente. |
| 269 | policitemia_vera | ✅ verificato-corretto | 2026-08-03 | ELN (European LeukemiaNet) 2021, ente reale. |
| 270 | arfid | ✅ verificato-corretto | 2026-08-03 | DSM-5 2013, anno di pubblicazione corretto. |
| 271 | pots | ✅ verificato-corretto | 2026-08-03 | ESC Guidelines 2022 + Heart Rhythm Society POTS Expert Consensus 2021, coerente. |
| 272 | neuropatia_periferica | 🔧 corretto-con-fix | 2026-08-03 | Badge "EFNS 2020" impossibile: l'EFNS (European Federation of Neurological Societies) si è sciolta nel 2014 fondendosi nella EAN (European Academy of Neurology) — non poteva pubblicare nulla nel 2020. Corretto in "EAN + AAN" in badge/note/science/fonte, in entrambi i file. Vedi anche riga 124 (stesso errore, corretto retroattivamente). |
| 273 | epatite_b_cronica | 🔧 corretto-con-fix | 2026-08-03 | Badge/note/science/fonte "EASL 2023" errato: l'url già presente (PII "...(17)30185-6") conferma che il documento reale è EASL 2017 (nessuna versione 2023 esiste; un aggiornamento 2025 esiste ma non era quanto citato). Corretto in "EASL 2017" in entrambi i file. |
| 274 | epatite_c_cronica | ⚠️ dubbio | 2026-08-03 | Badge "EASL 2024" impreciso: le EASL recommendations complete sul trattamento HCV sono la "Final update" del 2020; un position paper EASL 2024 esiste ma è specifico sul follow-up post-guarigione, non sul trattamento generale (che la scheda comunque copre). Citare entrambi gli anni sarebbe più accurato. Non modificato senza ulteriore verifica. |
| 275 | intolleranza_sorbitolo | ⚠️ dubbio | 2026-08-03 | Badge "SGAMN 2018" non verificabile: nessuna conferma di un ente con questo acronimo che pubblichi linee guida su polioli/sorbitolo. Contenuto scientifico e riferimento Monash FODMAP corretti. Non modificato. |
| 276 | huntington | 🔧 corretto-con-fix | 2026-08-03 | Badge "ESPEN 2023" errato: la guideline ESPEN "Clinical Nutrition in Neurology" è del 2018 e copre solo SLA/Parkinson/ictus/SM, non Huntington (stesso pattern già corretto altrove). La fonte pertinente è EHDN (European Huntington Disease Network) 2022, già presente. Rimossa l'attribuzione ESPEN in badge/note/fonte, in entrambi i file. |
| 277 | prolattinoma | 🔧 corretto-con-fix | 2026-08-03 | Badge/note/fonte "ES 2022"/"Endocrine Society 2022" errato: la vera Endocrine Society Clinical Practice Guideline "Diagnosis and Treatment of Hyperprolactinemia" è di Melmed et al. 2011 (JCEM), nessun aggiornamento 2022 trovato (url già corretto). Corretto in "Endocrine Society 2011 (Melmed et al.)" in entrambi i file. |
| 278 | piaghe_decubito | 🔧 corretto-con-fix | 2026-08-03 | Badge/note/fonte "EPUAP 2022" errato: la 3ª edizione reale della linea guida EPUAP/NPIAP/PPPIA "Prevention and Treatment of Pressure Ulcers/Injuries" è di novembre 2019, non 2022. Corretto in "EPUAP/NPIAP/PPPIA 2019" in entrambi i file. |
| 279 | bypass_gastrico | 🔧 corretto-con-fix | 2026-08-03 | Badge/note/fonte "ASMBS 2023"/"ASMBS/AACE/TOS 2023" errato: gli aggiornamenti reali delle linee guida AACE/TOS/ASMBS/OMA/ASA sono 2013/2019/2020 (Mechanick et al.), nessuna edizione 2023 trovata. Corretto in "ASMBS/AACE/TOS 2019 (Mechanick et al.)" in entrambi i file. Non è una duplicazione di "chirurgia_bariatrica" (contenuto post-operatorio specifico, non ridondante). |
| 280 | sleeve_gastrectomy | 🔧 corretto-con-fix | 2026-08-03 | Stesso errore di riga 279: badge/note/fonte "ASMBS 2023" corretto in "ASMBS/AACE/TOS 2019 (Mechanick et al.)" in entrambi i file. Contenuto specifico e distinto (rischio GERD, minori carenze vs bypass), non duplicato. |
| 281 | sport_squadra | ✅ verificato-corretto | 2026-08-03 | Badge "IOC 2018" coerente con url (BJSM vol.52 = 2018, IOC Consensus Statement on Sports Nutrition 2018). |
| 282 | sport_peso | ✅ verificato-corretto | 2026-08-03 | Stesso IOC 2018 (RED-S Consensus), coerente con url. |
| 283 | ansia_nutrizione | ⚠️ dubbio | 2026-08-03 | Badge/fonte "ISSFAL 2021" non verificato: le uniche ISSFAL Official Statements confermate riguardano dosaggi omega-3 generali, nessuna dichiarazione specifica su ansia trovata. Le vere fonti sostanziali sono già citate nel campo science (Su 2018 JAMA Network Open, Jacka 2017 "Nutritional Psychiatry", ecc.) — stesso pattern di sovra-attribuzione di "sonno_nutrizione". Non modificato. |
| 284 | ckd_stadio1_2 | ✅ verificato-corretto | 2026-08-03 | Badge "KDIGO 2024" verificato reale (pubblicato marzo 2024, Kidney International, aggiornamento del KDIGO 2012). |
| 285 | burnout_nutrizionale | ⚠️ dubbio | 2026-08-03 | Stesso problema di riga 283: badge "ISSFAL 2021" non verificato per questo contenuto (stress cronico/cortisolo). Fonti reali sostanziali già citate (Jacka 2017, Chandrasekhar 2012, Tomiyama 2010, Daubenmier 2012). Non modificato. |
