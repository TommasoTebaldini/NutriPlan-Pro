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
| 23 | allergia_latte | ⚠️ dubbio | 2026-08-03 | Badge "EAACI 2019" non confermato: EAACI ha una guideline 2020/21 su *prevenzione* allergie, non su diagnosi/gestione APLV specifica. Fonti più specifiche: WAO/DRACMA o ESPGHAN. Da approfondire, non ancora corretto. |
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
| 42 | ipertiroidismo | ⚠️ dubbio | 2026-08-03 | Badge "ETA 2023" sovra-attribuito: solo l'indicazione "evitare iodio supplementare" è ETA-specifica, i target numerici (kcal +20-30%, proteine 1.2-1.5g/kg) sono stime di nutrizione clinica generica. Da rivedere con più tempo, non ancora corretto. |
| 43 | anoressia | ✅ verificato-corretto | 2026-08-03 | Protocollo refeeding (5-10→30-40 kcal/kg, tiamina prima) coerente con NICE/MARSIPAN/ESPEN. |
| 44 | bulimia | ✅ verificato-corretto | 2026-08-03 | NICE 2017/DSM-5, CBT-E prima linea corretto. |
| 45 | bed | ✅ verificato-corretto | 2026-08-03 | Coerente con NICE/DSM-5. |
| 46 | allergia_uova | ✅ verificato-corretto | 2026-08-03 | EAACI 2021 reale, ovomucoide/cross-reattività corretti. |
| 47 | neoplasia | ✅ verificato-corretto | 2026-08-03 | ESPEN 2021 oncologia, cachessia/EPA 2g coerenti con letteratura Fearon/ESPEN. |
| 48 | stomia | ✅ verificato-corretto | 2026-08-03 | ESPEN 2021 chirurgia GI, distinzione ileo/colostomia corretta. |
| 49 | tumore_seno | ✅ verificato-corretto | 2026-08-03 | ESPEN 2021, claim alcol/fitoestrogeni coerenti con WCRF/metanalisi 2019. |
| 50 | tumore_pancreas | ✅ verificato-corretto | 2026-08-03 | ESPEN 2021, PERT 40-80.000 UI/pasto e diabete tipo 3c corretti (nota: qui il range PERT ampio è per neoplasia/steatorrea da compressione dotto, contesto diverso da ipe — non serve armonizzare). |
| 51 | tumore_colon | ✅ verificato-corretto | 2026-08-03 | ESPEN 2021, classificazione IARC carni lavorate/rosse e immunonutrizione perioperatoria corrette. |
| 52 | diverticolosi | da fare | | |
| 53 | allergia_pesce | da fare | | |
| 54 | allergia_molluschi | da fare | | |
| 55 | allergia_frutta_secca | da fare | | |
| 56 | fibrosi_cistica | da fare | | |
| 57 | epilessia | da fare | | |
| 58 | alzheimer | da fare | | |
| 59 | gastroparesi | da fare | | |
| 60 | sla | da fare | | |
| 61 | 6fed | da fare | | |
| 62 | 4fed | da fare | | |
| 63 | cded_fase1 | da fare | | |
| 64 | cded_fase2 | da fare | | |
| 65 | cded_mant | da fare | | |
| 66 | scd | da fare | | |
| 67 | diabete_gestazionale | da fare | | |
| 68 | diabete_t1 | da fare | | |
| 69 | menopausa | da fare | | |
| 70 | sibo | da fare | | |
| 71 | allergia_arachidi | da fare | | |
| 72 | allergia_grano | da fare | | |
| 73 | allergia_sesamo | da fare | | |
| 74 | intolleranza_istamina | da fare | | |
| 75 | intolleranza_nichel | da fare | | |
| 76 | sindrome_nefrosica | da fare | | |
| 77 | pancreatite_acuta | da fare | | |
| 78 | trapianto | da fare | | |
| 79 | colite_microscopica | da fare | | |
| 80 | endometriosi | da fare | | |
| 81 | prediabete | da fare | | |
| 82 | ipercolesterolemia_familiare | da fare | | |
| 83 | psoriasi | da fare | | |
| 84 | dermatite_atopica | da fare | | |
| 85 | acne | da fare | | |
| 86 | sjogren | da fare | | |
| 87 | talassemia | da fare | | |
| 88 | favismo | da fare | | |
| 89 | wilson | da fare | | |
| 90 | lipedema | da fare | | |
| 91 | iperemesi_gravidica | da fare | | |
| 92 | sbs | da fare | | |
| 93 | addison | da fare | | |
| 94 | post_covid | da fare | | |
| 95 | emocromatosi | da fare | | |
| 96 | sclerosi_multipla | da fare | | |
| 97 | lupus | da fare | | |
| 98 | artrite_reumatoide | da fare | | |
| 99 | parkinson | da fare | | |
| 100 | vegetariana | da fare | | |
| 101 | vegana | da fare | | |
| 102 | latto_vegetariana | da fare | | |
| 103 | ovo_vegetariana | da fare | | |
| 104 | encefalopatia_epatica | da fare | | |
| 105 | tumore_testa_collo | da fare | | |
| 106 | nefropatia_diabetica | da fare | | |
| 107 | ipertrigliceridemia_severa | da fare | | |
| 108 | sindrome_refeeding | da fare | | |
| 109 | colangite_biliare_primitiva | da fare | | |
| 110 | nutrizione_preoperatoria | da fare | | |
| 111 | galattosemia | da fare | | |
| 112 | sindrome_cushing | da fare | | |
| 113 | neutropenia_oncologica | da fare | | |
| 114 | epatite_cronica | da fare | | |
| 115 | artrite_psoriasica | da fare | | |
| 116 | acalasia | da fare | | |
| 117 | celiachia_refrattaria | da fare | | |
| 118 | deficit_b12_folati | da fare | | |
| 119 | deficit_vitamina_d | da fare | | |
| 120 | dieta_fodmap | da fare | | |
| 121 | dumping_syndrome | da fare | | |
| 122 | epatite_autoimmune | da fare | | |
| 123 | ernia_iatale | da fare | | |
| 124 | iperomocisteinemia | da fare | | |
| 125 | ipoglicemia_reattiva | da fare | | |
| 126 | malassorbimento_fruttosio | da fare | | |
| 127 | ncgs | da fare | | |
| 128 | obesita_pediatrica | da fare | | |
| 129 | terapia_anticoagulante | da fare | | |
| 130 | iperparatiroidismo | da fare | | |
| 131 | sclerodermia | da fare | | |
| 132 | allergia_nichel | da fare | | |
| 133 | intestino_corto | da fare | | |
| 134 | masld_nash_avanzato | da fare | | |
| 135 | depressione_nutrizione | da fare | | |
| 136 | sonno_nutrizione | da fare | | |
| 137 | ipertensione_resistente | da fare | | |
| 138 | gravidanza_fisiologica | da fare | | |
| 139 | trapianto_renale | da fare | | |
| 140 | coronaropatia | da fare | | |
| 141 | post_infarto | da fare | | |
| 142 | fibrillazione_atriale | da fare | | |
| 143 | cardiomiopatia_dilatativa | da fare | | |
| 144 | aop | da fare | | |
| 145 | cardiomiopatia_ipertrofica | da fare | | |
| 146 | miastenia_gravis | da fare | | |
| 147 | spondilite_anchilosante | da fare | | |
| 148 | colangite_sclerosante | da fare | | |
| 149 | emicrania | da fare | | |
| 150 | autismo_nutrizione | da fare | | |
| 151 | glicogenosi_i | da fare | | |
| 152 | mastocitosi | da fare | | |
| 153 | porfiria | da fare | | |
| 154 | ipoparatiroidismo | da fare | | |
| 155 | linfangectasia | da fare | | |
| 156 | pancreatite_autoimmune | da fare | | |
| 157 | prader_willi | da fare | | |
| 158 | trapianto_midollo | da fare | | |
| 159 | mieloma | da fare | | |
| 160 | tirosinemia | da fare | | |
| 161 | msud | da fare | | |
| 162 | glomerulonefrite | da fare | | |
| 163 | ulcera_peptica | da fare | | |
| 164 | osteoartrite | da fare | | |
| 165 | tumore_polmone | da fare | | |
| 166 | tumore_prostata | da fare | | |
| 167 | tumore_stomaco | da fare | | |
| 168 | tumore_fegato | da fare | | |
| 169 | steatoepatite_alcolica | da fare | | |
| 170 | polimialgia_reumatica | da fare | | |
| 171 | iperaldosteronismo | da fare | | |
| 172 | nefropatia_iga | da fare | | |
| 173 | artrite_reattiva | da fare | | |
| 174 | acromegalia | da fare | | |
| 175 | nutrizione_anziani | da fare | | |
| 176 | fragilita | da fare | | |
| 177 | vasculite | da fare | | |
| 178 | sarcoidosi | da fare | | |
| 179 | dermatomiosite | da fare | | |
| 180 | trapianto_fegato | da fare | | |
| 181 | nutrizione_uti | da fare | | |
| 182 | nutrizione_palliativa | da fare | | |
| 183 | ipertensione_polmonare | da fare | | |
| 184 | asma_bronchiale | da fare | | |
| 185 | bronchiectasie | da fare | | |
| 186 | acidemia_metilmalonica | da fare | | |
| 187 | sindrome_down | da fare | | |
| 188 | fibrosi_polmonare | da fare | | |
| 189 | emofilia | da fare | | |
| 190 | cistinuria | da fare | | |
| 191 | sindrome_antifosfolipidi | da fare | | |
| 192 | ipercalcemia | da fare | | |
| 193 | obesita_sarcopenica | da fare | | |
| 194 | nutrizione_atleta | da fare | | |
| 195 | diarrea_cronica | da fare | | |
| 196 | digiuno_intermittente | da fare | | |
| 197 | dieta_mediterranea | da fare | | |
| 198 | nutrizione_enterale | da fare | | |
| 199 | nutrizione_parenterale | da fare | | |
| 200 | ustioni_gravi | da fare | | |
| 201 | sepsi | da fare | | |
| 202 | tumori_net | da fare | | |
| 203 | leucemia | da fare | | |
| 204 | linfoma | da fare | | |
| 205 | trapianto_cuore | da fare | | |
| 206 | rene_policistico | da fare | | |
| 207 | deficit_zinco | da fare | | |
| 208 | deficit_iodio | da fare | | |
| 209 | anemia_falciforme | da fare | | |
| 210 | abuso_alcol | da fare | | |
| 211 | distrofia_muscolare | da fare | | |
| 212 | alimentazione_complementare | da fare | | |
| 213 | sindrome_premestruale | da fare | | |
| 214 | infertilita_nutrizione | da fare | | |
| 215 | ortoressia | da fare | | |
| 216 | microbiota_intestinale | da fare | | |
| 217 | politrauma | da fare | | |
| 218 | rachitismo_osteomalacia | da fare | | |
| 219 | deficit_tiamina | da fare | | |
| 220 | celiachia_bambini | da fare | | |
| 221 | deficit_vitamina_a | da fare | | |
| 222 | deficit_vitamina_c | da fare | | |
| 223 | deficit_vitamina_e | da fare | | |
| 224 | deficit_vitamina_k | da fare | | |
| 225 | deficit_niacina | da fare | | |
| 226 | deficit_riboflavina | da fare | | |
| 227 | deficit_biotina | da fare | | |
| 228 | deficit_magnesio | da fare | | |
| 229 | deficit_calcio | da fare | | |
| 230 | deficit_rame | da fare | | |
| 231 | omocistinuria | da fare | | |
| 232 | glicogenosi_iii | da fare | | |
| 233 | glicogenosi_v | da fare | | |
| 234 | acidemia_propionica | da fare | | |
| 235 | malattia_gaucher | da fare | | |
| 236 | esofagite_eosinofila | da fare | | |
| 237 | dieta_chetogenica | da fare | | |
| 238 | dieta_dash | da fare | | |
| 239 | dieta_antiinfiammatoria | da fare | | |
| 240 | prevenzione_oncologica | da fare | | |
| 241 | cachessia_oncologica | da fare | | |
| 242 | sindrome_lisi_tumorale | da fare | | |
| 243 | artrite_idiopatica_giovanile | da fare | | |
| 244 | sport_endurance | da fare | | |
| 245 | sport_forza | da fare | | |
| 246 | lipodistrofia | da fare | | |
| 247 | sindrome_gilbert | da fare | | |
| 248 | iperfosfatemia | da fare | | |
| 249 | nutrizione_geriatrica_rsa | da fare | | |
| 250 | anemia_emolitica | da fare | | |
| 251 | allergia_soia | da fare | | |
| 252 | allergia_sedano | da fare | | |
| 253 | allergia_senape | da fare | | |
| 254 | allergia_lupino | da fare | | |
| 255 | allergia_solfiti | da fare | | |
| 256 | diabete_lada | da fare | | |
| 257 | tumore_rene | da fare | | |
| 258 | tumore_tiroide | da fare | | |
| 259 | tumore_ovaio | da fare | | |
| 260 | anemia_megaloblastica | da fare | | |
| 261 | morbo_crohn | da fare | | |
| 262 | colite_ulcerosa | da fare | | |
| 263 | ipotiroidismo | da fare | | |
| 264 | feocromocitoma | da fare | | |
| 265 | apnea_sonno | da fare | | |
| 266 | tumore_vescica | da fare | | |
| 267 | tumore_esofago | da fare | | |
| 268 | tumore_endometrio | da fare | | |
| 269 | policitemia_vera | da fare | | |
| 270 | arfid | da fare | | |
| 271 | pots | da fare | | |
| 272 | neuropatia_periferica | da fare | | |
| 273 | epatite_b_cronica | da fare | | |
| 274 | epatite_c_cronica | da fare | | |
| 275 | intolleranza_sorbitolo | da fare | | |
| 276 | huntington | da fare | | |
| 277 | prolattinoma | da fare | | |
| 278 | piaghe_decubito | da fare | | |
| 279 | bypass_gastrico | da fare | | |
| 280 | sleeve_gastrectomy | da fare | | |
| 281 | sport_squadra | da fare | | |
| 282 | sport_peso | da fare | | |
| 283 | ansia_nutrizione | da fare | | |
| 284 | ckd_stadio1_2 | da fare | | |
| 285 | burnout_nutrizionale | da fare | | |
