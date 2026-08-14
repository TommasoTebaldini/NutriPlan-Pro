// fhir-terminology.js — Mappatura interna → LOINC / SNOMED CT
//
// Copre esattamente i vocabolari realmente usati dall'app (17 tipi di esame
// in pazienti.html #esame-tipo, 24 tag patologia in PREDEFINED_TAGS): non
// una mappatura teorica/generica, ma quella dei valori che un dietista può
// davvero selezionare oggi. Se un nuovo tipo di esame o tag viene aggiunto
// altrove nell'app, va aggiunto anche qui — altrimenti mapEsameToLoinc()/
// mapTagToSnomed() lo segnalano come non mappato invece di ometterlo in
// silenzio (vedi UNMAPPED_* sotto).
//
// Fonti dei codici: LOINC/SNOMED CT sono standard pubblici (loinc.org,
// snomed.org/browser). I codici qui sotto sono quelli comunemente usati
// nella pratica clinica/interoperabilità per l'esame più diffuso di quel
// tipo — dove esistono varianti (es. eGFR per formula, colesterolo LDL
// calcolato vs diretto), è annotato nel commento.

(function (global) {
  'use strict';

  // ─── Esami di laboratorio: option value di #esame-tipo → LOINC ───────────
  const LOINC_LAB_TESTS = {
    'HbA1c': { code: '4548-4', display: 'Hemoglobin A1c/Hemoglobin.total in Blood', unit: '%' },
    'Glicemia a digiuno': { code: '1558-6', display: 'Fasting glucose [Mass/volume] in Serum or Plasma', unit: 'mg/dL' },
    'Colesterolo totale': { code: '2093-3', display: 'Cholesterol [Mass/volume] in Serum or Plasma', unit: 'mg/dL' },
    // LDL calcolato (formula di Friedewald) — se il laboratorio referta un
    // valore misurato direttamente il codice corretto è 18262-6.
    'Colesterolo LDL': { code: '13457-7', display: 'Cholesterol in LDL [Mass/volume] in Serum or Plasma by calculation', unit: 'mg/dL' },
    'Colesterolo HDL': { code: '2085-9', display: 'Cholesterol in HDL [Mass/volume] in Serum or Plasma', unit: 'mg/dL' },
    'Trigliceridi': { code: '2571-8', display: 'Triglyceride [Mass/volume] in Serum or Plasma', unit: 'mg/dL' },
    'Creatinina': { code: '2160-0', display: 'Creatinine [Mass/volume] in Serum or Plasma', unit: 'mg/dL' },
    // eGFR: formula CKD-EPI 2021 (senza correzione per etnia) — se la
    // struttura referta con MDRD il codice corretto è 48642-3.
    'eGFR': { code: '62238-1', display: 'Glomerular filtration rate/1.73 sq M.predicted [Volume Rate/Area] in Serum, Plasma or Blood by Creatinine-based formula (CKD-EPI)', unit: 'mL/min/1.73m2' },
    'Albumina': { code: '1751-7', display: 'Albumin [Mass/volume] in Serum or Plasma', unit: 'g/dL' },
    'Proteina C-reattiva (PCR)': { code: '1988-5', display: 'C reactive protein [Mass/volume] in Serum or Plasma', unit: 'mg/L' },
    'Ferritina': { code: '2276-4', display: 'Ferritin [Mass/volume] in Serum or Plasma', unit: 'ng/mL' },
    'Vitamina D (25-OH)': { code: '1989-3', display: '25-hydroxyvitamin D3+25-hydroxyvitamin D2 [Mass/volume] in Serum or Plasma', unit: 'ng/mL' },
    'TSH': { code: '3016-3', display: 'Thyrotropin [Units/volume] in Serum or Plasma', unit: 'mIU/L' },
    'Sodio': { code: '2951-2', display: 'Sodium [Moles/volume] in Serum or Plasma', unit: 'mmol/L' },
    'Potassio': { code: '2823-3', display: 'Potassium [Moles/volume] in Serum or Plasma', unit: 'mmol/L' },
    'Azoto ureico (BUN)': { code: '3094-0', display: 'Urea nitrogen [Mass/volume] in Serum or Plasma', unit: 'mg/dL' },
    'Acido urico': { code: '3084-1', display: 'Urate [Mass/volume] in Serum or Plasma', unit: 'mg/dL' },
  };

  // ─── Parametri antropometrici (BIA, visite) → LOINC ───────────────────────
  const LOINC_VITALS = {
    peso: { code: '29463-7', display: 'Body weight', unit: 'kg' },
    altezza: { code: '8302-2', display: 'Body height', unit: 'cm' },
    bmi: { code: '39156-5', display: 'Body mass index (BMI) [Ratio]', unit: 'kg/m2' },
    massa_grassa_pct: { code: '41982-0', display: 'Percentage of body fat Measured', unit: '%' },
    massa_magra: { code: '73708-0', display: 'Lean body mass', unit: 'kg' },
    angolo_fase: { code: '8348-5', display: 'Body composition finding [Bioelectrical impedance]', unit: 'deg' }, // codice generico: LOINC non ha un termine dedicato per l'angolo di fase
  };

  // ─── Tag patologia (PREDEFINED_TAGS in pazienti.html) → SNOMED CT ─────────
  // kind distingue come il tag va rappresentato in FHIR:
  //   'condition' → risorsa Condition (diagnosi/problema)
  //   'procedure' → risorsa Procedure (intervento/trattamento in corso)
  //   'observation' → risorsa Observation (stato clinico, non una diagnosi)
  //   'not-clinical' → categoria applicativa interna, non un dato clinico
  //                    da trasmettere in FSE (età, sport, preferenza dietetica)
  const SNOMED_TAGS = {
    'Diabete T2':            { kind: 'condition', code: '44054006',  display: 'Diabetes mellitus type 2' },
    'Diabete T1':            { kind: 'condition', code: '46635009',  display: 'Diabetes mellitus type 1' },
    'Diabete Gestazionale':  { kind: 'condition', code: '11687002',  display: 'Gestational diabetes mellitus' },
    'Obesità':                { kind: 'condition', code: '414916001', display: 'Obesity' },
    'Sovrappeso':            { kind: 'condition', code: '238131007', display: 'Overweight' },
    'IRC/CKD':               { kind: 'condition', code: '709044004', display: 'Chronic kidney disease' },
    'Dialisi':               { kind: 'procedure', code: '265764009', display: 'Renal dialysis' },
    'Ipertensione':          { kind: 'condition', code: '38341003',  display: 'Hypertensive disorder, systemic arterial' },
    'Dislipidemia':          { kind: 'condition', code: '370992007', display: 'Dyslipidemia' },
    'Celiachia':             { kind: 'condition', code: '396331005', display: 'Celiac disease' },
    'IBD/Crohn':             { kind: 'condition', code: '34000006',  display: "Crohn's disease" },
    'Colite Ulcerosa':       { kind: 'condition', code: '64766004',  display: 'Ulcerative colitis' },
    'IBS':                   { kind: 'condition', code: '10743008',  display: 'Irritable bowel syndrome' },
    'Oncologia':             { kind: 'condition', code: '363346000', display: 'Malignant neoplastic disease' },
    'Sarcopenia':            { kind: 'condition', code: '316307009', display: 'Sarcopenia' },
    'Osteoporosi':           { kind: 'condition', code: '64859006',  display: 'Osteoporosis' },
    'DCA/Anoressia':         { kind: 'condition', code: '302280005', display: 'Eating disorder' },
    'Gravidanza':            { kind: 'observation', code: '77386006', display: 'Patient currently pregnant' },
    'Chirurgia Bariatrica':  { kind: 'procedure', code: '442338001', display: 'Bariatric surgery' },
    'Sport':                 { kind: 'not-clinical' },
    'Pediatria':             { kind: 'not-clinical' },
    'Anziano/Fragilità':     { kind: 'observation', code: '248279007', display: 'Frailty' },
    'Vegetariano/Vegano':    { kind: 'not-clinical' },
    'Altro':                 { kind: 'not-clinical' },
  };

  function mapEsameToLoinc(tipo) {
    return LOINC_LAB_TESTS[tipo] || null;
  }

  function mapVitalToLoinc(key) {
    return LOINC_VITALS[key] || null;
  }

  function mapTagToSnomed(tag) {
    return SNOMED_TAGS[tag] || null;
  }

  // Utile in fase di sviluppo/audit: elenco dei tag/esami che compaiono
  // nell'app ma non hanno (ancora) una voce qui — non dovrebbe mai
  // succedere per i valori standard, segnala un disallineamento se l'UI
  // viene estesa senza aggiornare questo file.
  function findUnmapped(esameTipoOptions, tagOptions) {
    return {
      esami: (esameTipoOptions || []).filter(t => t && t !== '__custom__' && !LOINC_LAB_TESTS[t]),
      tags: (tagOptions || []).filter(t => t && !SNOMED_TAGS[t]),
    };
  }

  global.FhirTerminology = {
    LOINC_LAB_TESTS,
    LOINC_VITALS,
    SNOMED_TAGS,
    mapEsameToLoinc,
    mapVitalToLoinc,
    mapTagToSnomed,
    findUnmapped,
  };

})(window);
