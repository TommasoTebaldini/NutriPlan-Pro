// fse.js — FSE 2.0 (Fascicolo Sanitario Elettronico) Export Module
// Generates HL7 CDA R2 (Clinical Document Architecture) XML for Italian FSE 2.0
// Document type: "Referto ambulatoriale nutrizionale" — compatible with FSE 2.0 standard

(function(global) {
  'use strict';

  // ─── XML helpers ────────────────────────────────────────────────────────────
  function xmlEsc(s) {
    if (!s && s !== 0) return '';
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;');
  }

  function uuid() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = Math.random()*16|0;
      return (c==='x' ? r : (r&0x3|0x8)).toString(16);
    });
  }

  function fseDate(d) {
    if (!d) d = new Date();
    if (typeof d === 'string') d = new Date(d);
    const p = n => String(n).padStart(2,'0');
    return `${d.getFullYear()}${p(d.getMonth()+1)}${p(d.getDate())}${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
  }

  function fseDateOnly(d) {
    if (!d) d = new Date();
    if (typeof d === 'string') d = new Date(d);
    const p = n => String(n).padStart(2,'0');
    return `${d.getFullYear()}${p(d.getMonth()+1)}${p(d.getDate())}`;
  }

  // ─── Main export function ────────────────────────────────────────────────────
  /**
   * generateFSECDA2(data) → XML string
   * data = {
   *   patient: { cf, name, surname, birthdate, sex, address, city, cap },
   *   dietitian: { name, surname, codiceFiscale, email, studio },
   *   visit: { date, weight, height, bmi, imc, notes },
   *   diet: { type, totalKcal, prot, carb, fat, notes, meals },
   *   diagnoses: [{ code, description }],   // ICD-10 codes
   *   recommendations: string
   * }
   */
  function generateFSECDA2(data) {
    const docId = uuid();
    const setId = uuid();
    const now = new Date();
    const effectiveTime = fseDate(data.visit?.date ? new Date(data.visit.date) : now);
    const creationTime = fseDate(now);

    const pat = data.patient || {};
    const diet = data.dietitian || {};
    const visit = data.visit || {};
    const piano = data.diet || {};
    const diagnoses = data.diagnoses || [];
    const recommendations = data.recommendations || '';

    const bmi = visit.bmi || (visit.weight && visit.height ? (visit.weight / Math.pow(visit.height/100, 2)).toFixed(1) : null);

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<!-- ============================================================
     Fascicolo Sanitario Elettronico 2.0 — CDA R2
     Referto Ambulatoriale Nutrizionale
     Generato da DietPlan Pro — ${now.toISOString()}
     ATTENZIONE: Questo documento deve essere firmato digitalmente
     con firma qualificata prima dell'invio al FSE 2.0
     ============================================================ -->
<ClinicalDocument xmlns="urn:hl7-org:v3"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xmlns:sdtc="urn:hl7-org:sdtc"
  xsi:schemaLocation="urn:hl7-org:v3 CDA.xsd">

  <!-- ─── Header ─────────────────────────────────────────────────────────── -->
  <realmCode code="IT"/>
  <typeId root="2.16.840.1.113883.1.3" extension="POCD_HD000040"/>
  <!-- Referto ambulatoriale (2.16.840.1.113883.2.9.10.1.1) -->
  <templateId root="2.16.840.1.113883.2.9.10.1.1"/>
  <id root="2.16.840.1.113883.2.9.2.10" extension="${docId}"/>
  <!-- Tipo documento: Referto ambulatoriale -->
  <code code="11488-4" codeSystem="2.16.840.1.113883.6.1" codeSystemName="LOINC"
        displayName="Referto di visita ambulatoriale nutrizionale"/>
  <title>Referto Ambulatoriale Nutrizionale</title>
  <effectiveTime value="${effectiveTime}"/>
  <confidentialityCode code="N" codeSystem="2.16.840.1.113883.5.25" displayName="Normal"/>
  <languageCode code="it-IT"/>
  <setId root="2.16.840.1.113883.2.9.2.10" extension="${setId}"/>
  <versionNumber value="1"/>

  <!-- ─── Patient ─────────────────────────────────────────────────────────── -->
  <recordTarget>
    <patientRole>
      ${pat.cf ? `<id root="2.16.840.1.113883.2.9.4.3.2" extension="${xmlEsc(pat.cf.toUpperCase())}"/>` : '<id nullFlavor="UNK"/>'}
      ${pat.address ? `<addr use="HP">
        <streetAddressLine>${xmlEsc(pat.address)}</streetAddressLine>
        <city>${xmlEsc(pat.city||'')}</city>
        <postalCode>${xmlEsc(pat.cap||'')}</postalCode>
        <country>IT</country>
      </addr>` : ''}
      <patient>
        <name>
          <family>${xmlEsc(pat.surname||'')}</family>
          <given>${xmlEsc(pat.name||'')}</given>
        </name>
        <administrativeGenderCode code="${pat.sex==='F'?'F':'M'}" codeSystem="2.16.840.1.113883.5.1"/>
        ${pat.birthdate ? `<birthTime value="${fseDateOnly(pat.birthdate)}"/>` : ''}
      </patient>
    </patientRole>
  </recordTarget>

  <!-- ─── Author (Dietitian) ──────────────────────────────────────────────── -->
  <author>
    <time value="${creationTime}"/>
    <assignedAuthor>
      ${diet.codiceFiscale ? `<id root="2.16.840.1.113883.2.9.4.3.2" extension="${xmlEsc(diet.codiceFiscale.toUpperCase())}"/>` : '<id nullFlavor="UNK"/>'}
      ${diet.email ? `<telecom use="WP" value="mailto:${xmlEsc(diet.email)}"/>` : ''}
      <assignedPerson>
        <name>
          <prefix>Dott.</prefix>
          <given>${xmlEsc(diet.name||'')}</given>
          <family>${xmlEsc(diet.surname||'')}</family>
        </name>
      </assignedPerson>
      ${diet.studio ? `<representedOrganization>
        <name>${xmlEsc(diet.studio)}</name>
      </representedOrganization>` : ''}
    </assignedAuthor>
  </author>

  <!-- ─── Custodian ───────────────────────────────────────────────────────── -->
  <custodian>
    <assignedCustodian>
      <representedCustodianOrganization>
        <id root="2.16.840.1.113883.2.9.2.10.4.1.1" extension="DIETPLANPRO"/>
        <name>${xmlEsc(diet.studio || 'DietPlan Pro Studio')}</name>
      </representedCustodianOrganization>
    </assignedCustodian>
  </custodian>

  <!-- ─── DocumentationOf ─────────────────────────────────────────────────── -->
  <documentationOf>
    <serviceEvent classCode="PCPR">
      <code code="103696004" codeSystem="2.16.840.1.113883.6.96"
            codeSystemName="SNOMED-CT" displayName="Valutazione nutrizionale"/>
      <effectiveTime>
        <low value="${effectiveTime}"/>
        <high value="${effectiveTime}"/>
      </effectiveTime>
    </serviceEvent>
  </documentationOf>

  <!-- ═══════════════════════════════════════════════════════════════════════
       BODY
       ═══════════════════════════════════════════════════════════════════════ -->
  <component>
    <structuredBody>

      <!-- ─── Sezione 1: Dati antropometrici ─────────────────────────────── -->
      <component>
        <section>
          <templateId root="2.16.840.1.113883.2.9.10.1.4.3.3"/>
          <code code="29463-7" codeSystem="2.16.840.1.113883.6.1"
                codeSystemName="LOINC" displayName="Parametri vitali"/>
          <title>Dati Antropometrici</title>
          <text>
            <table border="1" width="100%">
              <tbody>
                ${visit.weight ? `<tr><td>Peso</td><td>${xmlEsc(visit.weight)} kg</td></tr>` : ''}
                ${visit.height ? `<tr><td>Altezza</td><td>${xmlEsc(visit.height)} cm</td></tr>` : ''}
                ${bmi ? `<tr><td>IMC/BMI</td><td>${xmlEsc(bmi)} kg/m²</td></tr>` : ''}
                ${visit.notes ? `<tr><td>Note cliniche</td><td>${xmlEsc(visit.notes)}</td></tr>` : ''}
              </tbody>
            </table>
          </text>
          ${visit.weight ? `
          <entry>
            <observation classCode="OBS" moodCode="EVN">
              <code code="29463-7" codeSystem="2.16.840.1.113883.6.1" displayName="Peso corporeo"/>
              <effectiveTime value="${effectiveTime}"/>
              <value xsi:type="PQ" value="${xmlEsc(visit.weight)}" unit="kg"/>
            </observation>
          </entry>` : ''}
          ${visit.height ? `
          <entry>
            <observation classCode="OBS" moodCode="EVN">
              <code code="8302-2" codeSystem="2.16.840.1.113883.6.1" displayName="Altezza"/>
              <effectiveTime value="${effectiveTime}"/>
              <value xsi:type="PQ" value="${xmlEsc(visit.height)}" unit="cm"/>
            </observation>
          </entry>` : ''}
          ${bmi ? `
          <entry>
            <observation classCode="OBS" moodCode="EVN">
              <code code="39156-5" codeSystem="2.16.840.1.113883.6.1" displayName="Indice di massa corporea"/>
              <effectiveTime value="${effectiveTime}"/>
              <value xsi:type="PQ" value="${xmlEsc(bmi)}" unit="kg/m2"/>
            </observation>
          </entry>` : ''}
        </section>
      </component>

      <!-- ─── Sezione 2: Diagnosi e problemi ─────────────────────────────── -->
      ${diagnoses.length ? `
      <component>
        <section>
          <templateId root="2.16.840.1.113883.10.20.1.11"/>
          <code code="11450-4" codeSystem="2.16.840.1.113883.6.1"
                codeSystemName="LOINC" displayName="Lista dei problemi"/>
          <title>Diagnosi e Problemi Nutrizionali</title>
          <text>
            <list>
              ${diagnoses.map(d => `<item>${xmlEsc(d.description)}${d.code ? ` [ICD-10: ${xmlEsc(d.code)}]` : ''}</item>`).join('\n              ')}
            </list>
          </text>
          ${diagnoses.map(d => `
          <entry typeCode="DRIV">
            <act classCode="ACT" moodCode="EVN">
              <templateId root="2.16.840.1.113883.10.20.1.27"/>
              <code nullFlavor="NA"/>
              <entryRelationship typeCode="SUBJ">
                <observation classCode="OBS" moodCode="EVN">
                  <templateId root="2.16.840.1.113883.10.20.1.28"/>
                  <code code="${xmlEsc(d.code||'NOFINDING')}" codeSystem="2.16.840.1.113883.6.103"
                        codeSystemName="ICD-10-IT" displayName="${xmlEsc(d.description)}"/>
                  <statusCode code="active"/>
                  <effectiveTime><low value="${effectiveTime}"/></effectiveTime>
                </observation>
              </entryRelationship>
            </act>
          </entry>`).join('')}
        </section>
      </component>` : ''}

      <!-- ─── Sezione 3: Piano Nutrizionale ───────────────────────────────── -->
      <component>
        <section>
          <code code="61144-2" codeSystem="2.16.840.1.113883.6.1"
                codeSystemName="LOINC" displayName="Piano di dieta"/>
          <title>Piano Nutrizionale Prescritto</title>
          <text>
            <paragraph>
              <content styleCode="Bold">Tipo di regime alimentare:</content> ${xmlEsc(piano.type || 'Piano alimentare personalizzato')}
            </paragraph>
            ${piano.totalKcal ? `<paragraph><content styleCode="Bold">Apporto energetico totale:</content> ${xmlEsc(piano.totalKcal)} kcal/giorno</paragraph>` : ''}
            ${(piano.prot||piano.carb||piano.fat) ? `<paragraph>
              <content styleCode="Bold">Macronutrienti target:</content>
              Proteine ${xmlEsc(piano.prot||0)}g | Carboidrati ${xmlEsc(piano.carb||0)}g | Lipidi ${xmlEsc(piano.fat||0)}g
            </paragraph>` : ''}
            ${piano.notes ? `<paragraph><content styleCode="Bold">Note dietetiche:</content> ${xmlEsc(piano.notes)}</paragraph>` : ''}
            ${piano.meals && piano.meals.length ? `<paragraph><content styleCode="Bold">Schema pasti:</content></paragraph>
            <list>
              ${piano.meals.map(m => `<item>${xmlEsc(m.name||m.tipo||m)}: ${xmlEsc(m.description||m.foods||'')}</item>`).join('\n              ')}
            </list>` : ''}
          </text>
        </section>
      </component>

      <!-- ─── Sezione 4: Raccomandazioni ──────────────────────────────────── -->
      ${recommendations ? `
      <component>
        <section>
          <code code="18776-5" codeSystem="2.16.840.1.113883.6.1"
                codeSystemName="LOINC" displayName="Piano di trattamento"/>
          <title>Raccomandazioni e Follow-up</title>
          <text>
            <paragraph>${xmlEsc(recommendations)}</paragraph>
          </text>
        </section>
      </component>` : ''}

    </structuredBody>
  </component>
</ClinicalDocument>`;
    return xml;
  }

  // ─── Download helper ──────────────────────────────────────────────────────
  function downloadFSE(xml, patientName) {
    const blob = new Blob([xml], { type: 'application/xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const safeName = (patientName || 'paziente').replace(/[^a-zA-Z0-9_]/g, '_');
    a.href = url;
    a.download = `FSE_CDA2_${safeName}_${new Date().toISOString().slice(0,10)}.xml`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // ─── Main UI function ─────────────────────────────────────────────────────
  /**
   * openFSEExport(patientData)
   * Shows a modal to fill in FSE details and download the CDA2 XML
   */
  function openFSEExport(patientData) {
    // Inject modal if not present
    if (!document.getElementById('fse-modal')) {
      document.body.insertAdjacentHTML('beforeend', `
<style>
#fse-modal{position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:9992;display:none;align-items:center;justify-content:center;padding:16px}
#fse-modal.open{display:flex}
.fse-box{background:white;border-radius:18px;max-width:580px;width:100%;max-height:92vh;overflow-y:auto;box-shadow:0 24px 64px rgba(0,0,0,.3)}
.fse-hdr{padding:16px 20px;border-bottom:1px solid #E2E8F0;display:flex;align-items:center;gap:12px;background:linear-gradient(135deg,#0F766E,#0891B2);color:white;border-radius:18px 18px 0 0;flex-shrink:0}
.fse-title{font-size:15px;font-weight:700;flex:1}
.fse-close{background:rgba(255,255,255,.15);border:none;color:white;width:32px;height:32px;border-radius:8px;font-size:18px;cursor:pointer;display:flex;align-items:center;justify-content:center}
</style>
<div id="fse-modal">
  <div class="fse-box">
    <div class="fse-hdr">
      <span style="font-size:22px">📄</span>
      <div class="fse-title">Esporta FSE 2.0 — CDA R2</div>
      <button class="fse-close" onclick="document.getElementById('fse-modal').classList.remove('open')">✕</button>
    </div>
    <div style="padding:16px 20px">
      <div style="background:#EFF6FF;border:1px solid #BFDBFE;border-radius:8px;padding:10px 14px;font-size:12px;color:#1E3A5F;margin-bottom:14px;line-height:1.6">
        📋 Questo strumento genera un <b>documento CDA R2</b> compatibile con FSE 2.0. Il file XML deve poi essere firmato digitalmente con firma qualificata e caricato manualmente sul portale FSE della tua Regione.
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <div class="fg" style="grid-column:1/-1"><label>Tipo documento</label>
          <select id="fse-doctype">
            <option value="Referto ambulatoriale nutrizionale">Referto ambulatoriale nutrizionale</option>
            <option value="Piano terapeutico nutrizionale">Piano terapeutico nutrizionale</option>
            <option value="Lettera di dimissione ambulatoriale">Lettera di dimissione ambulatoriale</option>
          </select>
        </div>
        <div class="fg"><label>Codice Fiscale paziente</label><input id="fse-cf" type="text" placeholder="RSSMRA..." maxlength="16" style="text-transform:uppercase"></div>
        <div class="fg"><label>Sesso</label><select id="fse-sex"><option value="M">Maschile</option><option value="F">Femminile</option></select></div>
        <div class="fg"><label>Diagnosi principale (ICD-10)</label><input id="fse-diag-code" type="text" placeholder="es. E66.0"></div>
        <div class="fg"><label>Descrizione diagnosi</label><input id="fse-diag-desc" type="text" placeholder="Obesità di primo grado"></div>
        <div class="fg"><label>Peso (kg)</label><input id="fse-weight" type="number" step="0.1" placeholder="70.5"></div>
        <div class="fg"><label>Altezza (cm)</label><input id="fse-height" type="number" step="0.5" placeholder="170"></div>
        <div class="fg" style="grid-column:1/-1"><label>Raccomandazioni / Follow-up</label><textarea id="fse-recommendations" style="min-height:70px;width:100%;padding:7px 10px;border:1.5px solid #CBD5E1;border-radius:8px;font-size:13px;font-family:inherit;resize:vertical;outline:none" placeholder="Controllo tra 30 giorni. Attività fisica moderata..."></textarea></div>
        <div class="fg" style="grid-column:1/-1"><label>Note aggiuntive</label><textarea id="fse-notes" style="min-height:60px;width:100%;padding:7px 10px;border:1.5px solid #CBD5E1;border-radius:8px;font-size:13px;font-family:inherit;resize:vertical;outline:none" placeholder="Note cliniche..."></textarea></div>
      </div>
    </div>
    <div style="padding:12px 20px;border-top:1px solid #E2E8F0;display:flex;gap:8px;justify-content:flex-end;align-items:center;flex-wrap:wrap">
      <span style="font-size:11.5px;color:#64748B;flex:1">Il file XML generato non è firmato digitalmente</span>
      <button onclick="document.getElementById('fse-modal').classList.remove('open')" style="padding:7px 16px;background:#F1F5F9;color:#475569;border:none;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer">Annulla</button>
      <button onclick="doFSEExport()" style="padding:7px 18px;background:#0F766E;color:white;border:none;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer">⬇️ Scarica XML CDA2</button>
    </div>
  </div>
</div>`);
    }

    // Pre-fill from patient data
    if (patientData) {
      const cf = patientData.cf || patientData.codice_fiscale || '';
      const sex = patientData.sex || patientData.sesso || 'M';
      const weight = patientData.last_weight || patientData.peso || '';
      const height = patientData.height || patientData.altezza || '';
      if (cf) document.getElementById('fse-cf').value = cf;
      document.getElementById('fse-sex').value = sex;
      if (weight) document.getElementById('fse-weight').value = weight;
      if (height) document.getElementById('fse-height').value = height;
    }

    // Store patient data for the export
    document.getElementById('fse-modal')._patientData = patientData;
    document.getElementById('fse-modal').classList.add('open');
  }

  function doFSEExport() {
    const patientData = document.getElementById('fse-modal')._patientData || {};
    const cf = document.getElementById('fse-cf').value.trim().toUpperCase();
    const sex = document.getElementById('fse-sex').value;
    const weight = document.getElementById('fse-weight').value;
    const height = document.getElementById('fse-height').value;
    const diagCode = document.getElementById('fse-diag-code').value.trim();
    const diagDesc = document.getElementById('fse-diag-desc').value.trim();
    const recs = document.getElementById('fse-recommendations').value.trim();
    const notes = document.getElementById('fse-notes').value.trim();
    const docType = document.getElementById('fse-doctype').value;

    const exportData = {
      patient: {
        cf: cf || patientData.cf,
        name: patientData.first_name || patientData.nome || '',
        surname: patientData.last_name || patientData.cognome || '',
        birthdate: patientData.birthdate || patientData.data_nascita || null,
        sex,
        address: patientData.address || '',
        city: patientData.city || '',
        cap: patientData.cap || ''
      },
      dietitian: {
        name: patientData._dietitianName || '',
        surname: patientData._dietitianSurname || '',
        email: patientData._dietitianEmail || (typeof currentUser !== 'undefined' ? currentUser.email : ''),
        studio: patientData._studioName || ''
      },
      visit: { date: new Date(), weight: weight||null, height: height||null, notes: notes||null },
      diet: { type: docType, totalKcal: patientData.kcal_target || null, prot: patientData.prot_target||null, carb: patientData.carb_target||null, fat: patientData.fat_target||null },
      diagnoses: diagCode || diagDesc ? [{ code: diagCode, description: diagDesc }] : [],
      recommendations: recs
    };

    const xml = generateFSECDA2(exportData);
    const patName = `${exportData.patient.surname||''}${exportData.patient.name||''}` || 'paziente';
    downloadFSE(xml, patName);
    document.getElementById('fse-modal').classList.remove('open');
    if (typeof toast === 'function') toast('✅ Documento FSE 2.0 (CDA R2) scaricato!', 'ok');
  }

  // Export to global
  global.generateFSECDA2 = generateFSECDA2;
  global.downloadFSE = downloadFSE;
  global.openFSEExport = openFSEExport;
  global.doFSEExport = doFSEExport;

})(window);
