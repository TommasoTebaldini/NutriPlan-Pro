// fhir-export.js — Generatore di risorse HL7 FHIR R4 per l'interoperabilità
// con FSE 2.0 (dati strutturati; i documenti firmati restano in CDA R2,
// vedi fse.js). Richiede fhir-terminology.js per le mappature LOINC/SNOMED.
//
// Differenza rispetto a fse.js: fse.js produce un documento CDA compilato a
// mano dal dietista per un singolo invio. Questo modulo costruisce risorse
// FHIR a partire dai dati già presenti nel database (cartella, esami, BIA,
// piano), pensate per essere generate automaticamente ad ogni scrittura
// clinica rilevante — vedi la coda fhir_export_queue (SEZIONE 51 di
// supabase_setup.sql) e fhir-sync.js per il lato "flusso continuo".

(function (global) {
  'use strict';

  const T = global.FhirTerminology;
  if (!T) { console.error('fhir-export.js richiede fhir-terminology.js caricato prima.'); return; }

  function uuidUrn() {
    const u = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = Math.random() * 16 | 0;
      return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
    return 'urn:uuid:' + u;
  }

  function isoDate(d) {
    if (!d) return null;
    const dt = typeof d === 'string' ? new Date(d) : d;
    if (isNaN(dt.getTime())) return null;
    return dt.toISOString().slice(0, 10);
  }

  function isoDateTime(d) {
    if (!d) d = new Date();
    const dt = typeof d === 'string' ? new Date(d) : d;
    if (isNaN(dt.getTime())) return new Date().toISOString();
    return dt.toISOString();
  }

  // ─── Patient ────────────────────────────────────────────────────────────
  // cartella = riga della tabella `cartelle` (id, nome, cognome, ddn, sesso, codice_fiscale)
  function buildPatient(cartella) {
    const fullUrl = uuidUrn();
    const resource = {
      resourceType: 'Patient',
      identifier: cartella.codice_fiscale ? [{
        system: 'https://sistemats1.sanita.finanze.it/simossHome/FiscalCode', // OID CF italiano usato in FSE 2.0
        value: String(cartella.codice_fiscale).toUpperCase(),
      }] : [],
      name: [{ family: cartella.cognome || '', given: cartella.nome ? [cartella.nome] : [] }],
      gender: cartella.sesso === 'F' ? 'female' : (cartella.sesso === 'M' ? 'male' : 'unknown'),
      birthDate: isoDate(cartella.ddn),
    };
    return { fullUrl, resource };
  }

  // ─── Practitioner (dietista) ────────────────────────────────────────────
  // profile = riga della tabella `profiles` del dietista/titolare studio
  function buildPractitioner(profile) {
    const fullUrl = uuidUrn();
    const cf = profile.fiscal_codice_fiscale || null;
    const resource = {
      resourceType: 'Practitioner',
      identifier: cf ? [{
        system: 'https://sistemats1.sanita.finanze.it/simossHome/FiscalCode',
        value: String(cf).toUpperCase(),
      }] : [],
      name: [{ family: profile.cognome || profile.last_name || '', given: [profile.nome || profile.first_name || ''] }],
      telecom: profile.email ? [{ system: 'email', value: profile.email }] : [],
      qualification: [{
        code: { text: 'Dietista/Nutrizionista' },
      }],
    };
    return { fullUrl, resource };
  }

  // ─── Observation: parametro vitale/antropometrico ─────────────────────────
  function buildVitalObservation(key, value, date, patientFullUrl) {
    if (value == null || value === '') return null;
    const map = T.mapVitalToLoinc(key);
    if (!map) return null;
    const fullUrl = uuidUrn();
    const resource = {
      resourceType: 'Observation',
      status: 'final',
      category: [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/observation-category', code: 'vital-signs' }] }],
      code: { coding: [{ system: 'http://loinc.org', code: map.code, display: map.display }] },
      subject: { reference: patientFullUrl },
      effectiveDateTime: isoDateTime(date),
      valueQuantity: { value: Number(value), unit: map.unit, system: 'http://unitsofmeasure.org', code: map.unit },
    };
    return { fullUrl, resource };
  }

  // ─── Observation: esame di laboratorio ─────────────────────────────────
  // esame = riga della tabella `esami_biochimici` (tipo, valore, unita, data_esame)
  function buildLabObservation(esame, patientFullUrl) {
    const map = T.mapEsameToLoinc(esame.tipo);
    if (!map) return null; // tipo custom/non mappato: niente FHIR, resta solo nel DB interno
    const fullUrl = uuidUrn();
    const resource = {
      resourceType: 'Observation',
      status: 'final',
      category: [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/observation-category', code: 'laboratory' }] }],
      code: { coding: [{ system: 'http://loinc.org', code: map.code, display: map.display }] },
      subject: { reference: patientFullUrl },
      effectiveDateTime: isoDateTime(esame.data_esame),
      valueQuantity: { value: Number(esame.valore), unit: esame.unita || map.unit, system: 'http://unitsofmeasure.org', code: esame.unita || map.unit },
      note: esame.note ? [{ text: esame.note }] : undefined,
    };
    return { fullUrl, resource };
  }

  // ─── Condition / Procedure / Observation da tag patologia ──────────────
  // Un tag può generare una risorsa di tipo diverso a seconda della sua
  // natura clinica reale (vedi SNOMED_TAGS.kind in fhir-terminology.js).
  // Ritorna null per i tag non clinici (non vanno trasmessi al FSE).
  function buildResourceFromTag(tag, patientFullUrl, recordedDate) {
    const map = T.mapTagToSnomed(tag);
    if (!map || map.kind === 'not-clinical') return null;
    const fullUrl = uuidUrn();
    const coding = [{ system: 'http://snomed.info/sct', code: map.code, display: map.display }];

    if (map.kind === 'condition') {
      return { fullUrl, resource: {
        resourceType: 'Condition',
        clinicalStatus: { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/condition-clinical', code: 'active' }] },
        code: { coding },
        subject: { reference: patientFullUrl },
        recordedDate: isoDate(recordedDate) || isoDate(new Date()),
      } };
    }
    if (map.kind === 'procedure') {
      return { fullUrl, resource: {
        resourceType: 'Procedure',
        status: 'in-progress',
        code: { coding },
        subject: { reference: patientFullUrl },
      } };
    }
    // observation (es. stato di gravidanza, fragilità)
    return { fullUrl, resource: {
      resourceType: 'Observation',
      status: 'final',
      code: { coding },
      subject: { reference: patientFullUrl },
      effectiveDateTime: isoDateTime(recordedDate),
      valueBoolean: true,
    } };
  }

  // ─── NutritionOrder: piano alimentare ───────────────────────────────────
  // piano = riga della tabella `piani` (nome, meals [JSON stringato], saved_at)
  function buildNutritionOrder(piano, patientFullUrl, practitionerFullUrl) {
    let giorni = [];
    try { giorni = piano.meals ? JSON.parse(piano.meals) : []; } catch (e) { /* meals non parsabile: procede senza dettaglio pasti */ }

    const instructionParts = [];
    if (Array.isArray(giorni) && giorni.length) {
      giorni.slice(0, 1).forEach(g => { // solo il primo giorno come esempio rappresentativo dello schema
        (g.meals || g.pasti || []).forEach(m => {
          const nome = m.name || m.tipo || m.nome || '';
          const items = Array.isArray(m.items) ? m.items.map(it => it.nome || it.food || '').filter(Boolean).join(', ') : '';
          if (nome) instructionParts.push(`${nome}: ${items}`);
        });
      });
    }

    const fullUrl = uuidUrn();
    const resource = {
      resourceType: 'NutritionOrder',
      status: 'active',
      intent: 'order',
      subject: { reference: patientFullUrl },
      orderer: practitionerFullUrl ? { reference: practitionerFullUrl } : undefined,
      dateTime: isoDateTime(piano.saved_at),
      oralDiet: {
        type: [{ text: piano.nome || 'Piano alimentare personalizzato' }],
        instruction: instructionParts.length ? instructionParts.join(' | ') : undefined,
      },
    };
    return { fullUrl, resource };
  }

  // ─── Bundle completo per una cartella ───────────────────────────────────
  // Assembla un transaction Bundle con Patient + Practitioner + tutte le
  // risorse cliniche disponibili. cartellaData è l'oggetto già usato altrove
  // nell'app per la vista dettaglio cartella (window._currentCartellaData),
  // esteso con { cartella, dietitianProfile, esami, bia, piani, tags }.
  function buildBundleForCartella(data) {
    const entries = [];
    const { fullUrl: patientUrl, resource: patientRes } = buildPatient(data.cartella);
    entries.push({ fullUrl: patientUrl, resource: patientRes, request: { method: 'POST', url: 'Patient' } });

    let practitionerUrl = null;
    if (data.dietitianProfile) {
      const p = buildPractitioner(data.dietitianProfile);
      practitionerUrl = p.fullUrl;
      entries.push({ fullUrl: p.fullUrl, resource: p.resource, request: { method: 'POST', url: 'Practitioner' } });
    }

    (data.tags || []).forEach(tag => {
      const r = buildResourceFromTag(tag, patientUrl, data.cartella.created_at);
      if (r) entries.push({ fullUrl: r.fullUrl, resource: r.resource, request: { method: 'POST', url: r.resource.resourceType } });
    });

    (data.esami || []).forEach(esame => {
      const r = buildLabObservation(esame, patientUrl);
      if (r) entries.push({ fullUrl: r.fullUrl, resource: r.resource, request: { method: 'POST', url: 'Observation' } });
    });

    (data.bia || []).forEach(bia => {
      ['peso', 'altezza', 'bmi', 'massa_grassa_pct', 'massa_magra', 'angolo_fase'].forEach(key => {
        const valueKey = { peso: 'peso', altezza: 'altezza', bmi: 'bmi', massa_grassa_pct: 'bf_pct', massa_magra: 'ffm_kg', angolo_fase: 'angolo_fase' }[key];
        const r = buildVitalObservation(key, bia[valueKey], bia.data_misura, patientUrl);
        if (r) entries.push({ fullUrl: r.fullUrl, resource: r.resource, request: { method: 'POST', url: 'Observation' } });
      });
    });

    (data.piani || []).forEach(piano => {
      const r = buildNutritionOrder(piano, patientUrl, practitionerUrl);
      entries.push({ fullUrl: r.fullUrl, resource: r.resource, request: { method: 'POST', url: 'NutritionOrder' } });
    });

    return {
      resourceType: 'Bundle',
      type: 'transaction',
      timestamp: new Date().toISOString(),
      entry: entries,
    };
  }

  // ─── Auto-verifica strutturale (non è un test contro il Gateway reale) ──
  // Controlla che il Bundle rispetti i vincoli strutturali minimi di FHIR
  // R4 (fullUrl/resourceType presenti, riferimenti risolvibili all'interno
  // del Bundle) — utile per beccare errori di programmazione prima
  // dell'invio, non sostituisce un test contro un Gateway FSE reale (che
  // richiede credenziali di ambiente Stage ottenute con la registrazione
  // formale presso la Regione, vedi SETUP-FHIR-FSE.md).
  function validateBundleStructure(bundle) {
    const errors = [];
    if (bundle.resourceType !== 'Bundle') errors.push('resourceType radice non è Bundle');
    if (!Array.isArray(bundle.entry) || !bundle.entry.length) errors.push('Bundle senza entry');
    const knownUrls = new Set((bundle.entry || []).map(e => e.fullUrl));
    (bundle.entry || []).forEach((e, i) => {
      if (!e.fullUrl) errors.push(`entry[${i}] senza fullUrl`);
      if (!e.resource || !e.resource.resourceType) errors.push(`entry[${i}] senza resource.resourceType`);
      const refs = JSON.stringify(e.resource).match(/"reference":"urn:uuid:[a-f0-9-]+"/g) || [];
      refs.forEach(r => {
        const url = r.match(/urn:uuid:[a-f0-9-]+/)[0];
        if (!knownUrls.has(url)) errors.push(`entry[${i}] referenzia ${url} che non esiste nel Bundle`);
      });
    });
    return { valid: errors.length === 0, errors };
  }

  global.FhirExport = {
    buildPatient,
    buildPractitioner,
    buildVitalObservation,
    buildLabObservation,
    buildResourceFromTag,
    buildNutritionOrder,
    buildBundleForCartella,
    validateBundleStructure,
  };

})(window);
