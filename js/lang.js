// ═══════════════════════════════════════════════════
// TRANSLATIONS — IT / EN / DE
// ═══════════════════════════════════════════════════
const LANGS = {
  it: {
    // Sidebar sections
    'nav.sec.piano':'Piano','nav.sec.comunicazione':'Comunicazione',
    'nav.sec.specialistica':'Specialistica','nav.sec.strumenti':'Strumenti','nav.sec.database':'Database',
    // Nav items
    'nav.piano_alimentare':'Piano Alimentare','nav.cartelle_pazienti':'Cartelle Pazienti',
    'nav.pazienti':'Pazienti','nav.paziente_sano':'Paziente Sano','nav.diabete':'Gestione Diabete',
    'nav.pancreas':'Insuff. Pancreatica','nav.sport':'Nutrizione Sportiva','nav.dca':'DCA',
    'nav.chetogenica':'Dieta Chetogenica','nav.renale':'Nefropatia / IRC','nav.disfagia':'Disfagia',
    'nav.pediatria':'Pediatria','nav.ristorazione':'Ristorazione Collettiva','nav.linee_guida':'Linee Guida',
    'nav.valutazione':'Valutazione Paziente','nav.ncpt':'NCPt','nav.patologie':'Diete Speciali',
    'nav.consigli':'Consigli Nutrizionali','nav.bia':'BIA','nav.questionari':'Questionari',
    'nav.studi':'Studi Scientifici','nav.ai':'Assistente AI','nav.agenda':'Agenda',
    'nav.ecm':'Corsi ECM','nav.database':'Alimenti CREA+BDA','nav.integratori':'Integratori e AFMS',
    'nav.ricette':'Ricette','nav.admin':'Admin Utenti','nav.profilo':'Profilo Operatore','nav.esci':'Esci',
    // Index / Login
    'index.title':'DietPlan Pro — Accedi','index.login_tab':'Accedi','index.register_tab':'Registrati',
    'index.email':'Email','index.password':'Password','index.confirm_password':'Conferma Password',
    'index.login_btn':'Accedi','index.register_btn':'Crea Account',
    'index.waiting_title':'Account in attesa di approvazione',
    'index.waiting_text':'Il tuo account è registrato. Un amministratore lo attiverà a breve.',
    'index.logout':'Esci','index.privacy_note':'I tuoi dati sono salvati in modo sicuro.',
    'index.register_note':'Dopo la registrazione attendi l\'approvazione dell\'amministratore.',
    'index.loading':'Caricamento...',
    // Common
    'common.loading':'Caricamento...','common.save':'Salva','common.cancel':'Annulla',
    'common.confirm':'Conferma','common.print':'Stampa','common.all':'Tutto',
    'common.error':'Errore','common.search':'Cerca...','common.no_data':'Nessun dato disponibile',
    'common.delete':'Elimina','common.edit':'Modifica','common.close':'Chiudi',
    'common.send':'Invia','common.yes':'Sì','common.no':'No',
    // Chat page
    'chat.conversations':'Conversazioni','chat.search_patient':'Cerca paziente...',
    'chat.select_patient':'Seleziona un paziente per iniziare una conversazione',
    'chat.tab_chat':'💬 Messaggi','chat.tab_andamento':'📈 Diario',
    'chat.tab_privacy':'📋 Privacy','chat.tab_storico':'📊 Storico Clinico',
    'chat.message_placeholder':'Messaggio...','chat.send':'Invia',
    'chat.no_cartella':'Nessuna cartella collegata a questo paziente.',
    // Storico Clinico
    'stor.title':'Storico Clinico','stor.period':'Periodo:','stor.all':'Tutto',
    'stor.last6':'Ultimi 6 mesi','stor.last12':'Ultimo anno','stor.print':'Stampa report',
    'stor.no_data':'Nessuna scheda di valutazione trovata per questo paziente.',
    'stor.valutazioni':'valutazioni','stor.valutazione':'valutazione',
    'stor.peso':'Peso kg','stor.bmi':'BMI','stor.massa_grassa':'Massa grassa',
    'stor.massa_magra':'Massa magra kg','stor.vita':'Vita cm',
    'stor.chart_peso':'Peso corporeo','stor.chart_peso_diary':'Peso corporeo & diario',
    'stor.chart_bmi':'BMI','stor.chart_comp':'Composizione corporea',
    'stor.chart_circ':'Circonferenze (cm)','stor.chart_pliche':'Pliche cutanee (mm)',
    'stor.chart_labs':'Esami ematochimici',
    // Privacy / Consent
    'priv.title':'Testo del consenso informato','priv.edit':'✏️ Modifica',
    'priv.print':'🖨️ Stampa','priv.create':'📤 Crea e invia','priv.revoke':'🗑️ Annulla',
    'priv.signed':'✅ Firmato il','priv.pending':'⏳ In attesa di firma del paziente',
    'priv.none':'📭 Nessun modulo inviato','priv.save_patient':'💾 Salva per questo paziente',
    'priv.save_template':'🌐 Salva come modello per tutti i pazienti',
    'priv.cancel_edit':'✕ Annulla','priv.editor_close':'✕ Chiudi editor',
    // Patient portal
    'pp.title':'Area Paziente','pp.logout':'🚪 Esci',
    'pp.tab_profile':'👤 Dati Personali','pp.tab_dieta':'🥗 Dieta',
    'pp.tab_docs':'📄 Documenti','pp.tab_diary':'📓 Diario',
    'pp.tab_chat':'💬 Chat','pp.tab_privacy':'📋 Privacy',
    'pp.profile_hdr':'👤 Dati Personali',
    'pp.profile_note':'Inserisci i tuoi dati personali. Il tuo nutrizionista li vedrà per identificarti.',
    'pp.nome':'Nome','pp.cognome':'Cognome','pp.email':'Email',
    'pp.save_profile':'💾 Salva Dati',
    'pp.dieta_hdr':'🥗 La Mia Dieta','pp.docs_hdr':'📄 I Miei Documenti',
    'pp.diary_hdr':'📓 Diario Alimentare e Benessere',
    'pp.diary_note':'Registra i tuoi pasti, il tuo stato d\'umore e i sintomi giornalieri. Il tuo nutrizionista li potrà consultare.',
    'pp.diary_new':'✏️ Nuova registrazione','pp.diary_date':'Data',
    'pp.diary_mood':'Umore (1 = molto negativo, 5 = ottimo)',
    'pp.diary_notes_lbl':'Pasti e alimentazione (descrivi brevemente)',
    'pp.diary_sleep':'Ore di sonno (opzionale)','pp.diary_activity':'Attività fisica (opzionale)',
    'pp.diary_symptoms':'Sintomi / Note aggiuntive (opzionale)',
    'pp.chat_placeholder':'Scrivi un messaggio...',
    'pp.consent_sign':'✅ Firma il Consenso',
    'pp.consent_agree':'Ho letto e compreso il documento. Acconsento liberamente al trattamento dei miei dati personali.',
    'pp.consent_signed':'✅ Hai già firmato questo consenso il',
    'pp.consent_pending':'⏳ In attesa della tua firma','pp.no_consents':'Nessun modulo di consenso presente.',
    'pp.no_piano':'Nessun piano alimentare disponibile al momento.',
    'pp.no_docs':'Nessun documento disponibile.',
    'pp.no_diary':'Nessuna registrazione trovata.',
    'pp.loading_piano':'Caricamento piano alimentare...','pp.loading_docs':'Caricamento documenti...',
    'pp.mood_select':'— Seleziona —',
    'pp.mood_1':'😞 1 — Molto negativo','pp.mood_2':'😕 2 — Negativo',
    'pp.mood_3':'😐 3 — Neutro','pp.mood_4':'🙂 4 — Positivo','pp.mood_5':'😊 5 — Ottimo',
  },
  en: {
    'nav.sec.piano':'Plans','nav.sec.comunicazione':'Communication',
    'nav.sec.specialistica':'Clinical','nav.sec.strumenti':'Tools','nav.sec.database':'Database',
    'nav.piano_alimentare':'Meal Plan','nav.cartelle_pazienti':'Patient Files',
    'nav.pazienti':'Patients','nav.paziente_sano':'Healthy Patient','nav.diabete':'Diabetes Management',
    'nav.pancreas':'Pancreatic Insufficiency','nav.sport':'Sports Nutrition','nav.dca':'Eating Disorders',
    'nav.chetogenica':'Ketogenic Diet','nav.renale':'Kidney Disease / CKD','nav.disfagia':'Dysphagia',
    'nav.pediatria':'Pediatrics','nav.ristorazione':'Food Service','nav.linee_guida':'Guidelines',
    'nav.valutazione':'Patient Assessment','nav.ncpt':'NCPt','nav.patologie':'Special Diets',
    'nav.consigli':'Nutritional Advice','nav.bia':'BIA','nav.questionari':'Questionnaires',
    'nav.studi':'Scientific Studies','nav.ai':'AI Assistant','nav.agenda':'Calendar',
    'nav.ecm':'CME Courses','nav.database':'Foods CREA+BDA','nav.integratori':'Supplements & FSFs',
    'nav.ricette':'Recipes','nav.admin':'User Admin','nav.profilo':'Operator Profile','nav.esci':'Log Out',
    'index.title':'DietPlan Pro — Sign In','index.login_tab':'Sign In','index.register_tab':'Register',
    'index.email':'Email','index.password':'Password','index.confirm_password':'Confirm Password',
    'index.login_btn':'Sign In','index.register_btn':'Create Account',
    'index.waiting_title':'Account pending approval',
    'index.waiting_text':'Your account has been registered. An administrator will activate it shortly.',
    'index.logout':'Log Out','index.privacy_note':'Your data is stored securely.',
    'index.register_note':'After registration, wait for administrator approval.',
    'index.loading':'Loading...',
    'common.loading':'Loading...','common.save':'Save','common.cancel':'Cancel',
    'common.confirm':'Confirm','common.print':'Print','common.all':'All',
    'common.error':'Error','common.search':'Search...','common.no_data':'No data available',
    'common.delete':'Delete','common.edit':'Edit','common.close':'Close',
    'common.send':'Send','common.yes':'Yes','common.no':'No',
    'chat.conversations':'Conversations','chat.search_patient':'Search patient...',
    'chat.select_patient':'Select a patient to start a conversation',
    'chat.tab_chat':'💬 Messages','chat.tab_andamento':'📈 Diary',
    'chat.tab_privacy':'📋 Privacy','chat.tab_storico':'📊 Clinical History',
    'chat.message_placeholder':'Message...','chat.send':'Send',
    'chat.no_cartella':'No patient file linked to this patient.',
    'stor.title':'Clinical History','stor.period':'Period:','stor.all':'All',
    'stor.last6':'Last 6 months','stor.last12':'Last year','stor.print':'Print report',
    'stor.no_data':'No assessment records found for this patient.',
    'stor.valutazioni':'assessments','stor.valutazione':'assessment',
    'stor.peso':'Weight kg','stor.bmi':'BMI','stor.massa_grassa':'Body fat',
    'stor.massa_magra':'Lean mass kg','stor.vita':'Waist cm',
    'stor.chart_peso':'Body weight','stor.chart_peso_diary':'Body weight & diary',
    'stor.chart_bmi':'BMI','stor.chart_comp':'Body composition',
    'stor.chart_circ':'Circumferences (cm)','stor.chart_pliche':'Skinfolds (mm)',
    'stor.chart_labs':'Blood tests',
    'priv.title':'Informed Consent Text','priv.edit':'✏️ Edit',
    'priv.print':'🖨️ Print','priv.create':'📤 Create & send','priv.revoke':'🗑️ Cancel',
    'priv.signed':'✅ Signed on','priv.pending':'⏳ Awaiting patient signature',
    'priv.none':'📭 No form sent','priv.save_patient':'💾 Save for this patient',
    'priv.save_template':'🌐 Save as template for all patients',
    'priv.cancel_edit':'✕ Cancel','priv.editor_close':'✕ Close editor',
    'pp.title':'Patient Area','pp.logout':'🚪 Sign Out',
    'pp.tab_profile':'👤 Personal Data','pp.tab_dieta':'🥗 Diet',
    'pp.tab_docs':'📄 Documents','pp.tab_diary':'📓 Diary',
    'pp.tab_chat':'💬 Chat','pp.tab_privacy':'📋 Privacy',
    'pp.profile_hdr':'👤 Personal Data',
    'pp.profile_note':'Enter your personal data. Your nutritionist will see it to identify you.',
    'pp.nome':'First Name','pp.cognome':'Last Name','pp.email':'Email',
    'pp.save_profile':'💾 Save Data',
    'pp.dieta_hdr':'🥗 My Diet','pp.docs_hdr':'📄 My Documents',
    'pp.diary_hdr':'📓 Food & Wellness Diary',
    'pp.diary_note':'Log your meals, mood and daily symptoms. Your nutritionist will be able to review them.',
    'pp.diary_new':'✏️ New entry','pp.diary_date':'Date',
    'pp.diary_mood':'Mood (1 = very negative, 5 = excellent)',
    'pp.diary_notes_lbl':'Meals and nutrition (brief description)',
    'pp.diary_sleep':'Sleep hours (optional)','pp.diary_activity':'Physical activity (optional)',
    'pp.diary_symptoms':'Symptoms / Additional notes (optional)',
    'pp.chat_placeholder':'Write a message...',
    'pp.consent_sign':'✅ Sign Consent',
    'pp.consent_agree':'I have read and understood the document. I freely consent to the processing of my personal data.',
    'pp.consent_signed':'✅ You signed this consent on',
    'pp.consent_pending':'⏳ Awaiting your signature','pp.no_consents':'No consent forms available.',
    'pp.no_piano':'No meal plan available at this time.',
    'pp.no_docs':'No documents available.',
    'pp.no_diary':'No entries found.',
    'pp.loading_piano':'Loading meal plan...','pp.loading_docs':'Loading documents...',
    'pp.mood_select':'— Select —',
    'pp.mood_1':'😞 1 — Very negative','pp.mood_2':'😕 2 — Negative',
    'pp.mood_3':'😐 3 — Neutral','pp.mood_4':'🙂 4 — Positive','pp.mood_5':'😊 5 — Excellent',
  },
  de: {
    'nav.sec.piano':'Pläne','nav.sec.comunicazione':'Kommunikation',
    'nav.sec.specialistica':'Klinisch','nav.sec.strumenti':'Werkzeuge','nav.sec.database':'Datenbank',
    'nav.piano_alimentare':'Ernährungsplan','nav.cartelle_pazienti':'Patientenakten',
    'nav.pazienti':'Patienten','nav.paziente_sano':'Gesunder Patient','nav.diabete':'Diabetes-Management',
    'nav.pancreas':'Pankreasinsuffizienz','nav.sport':'Sporternährung','nav.dca':'Essstörungen',
    'nav.chetogenica':'Ketogene Diät','nav.renale':'Nierenerkrankung / CKD','nav.disfagia':'Dysphagie',
    'nav.pediatria':'Pädiatrie','nav.ristorazione':'Gemeinschaftsverpflegung','nav.linee_guida':'Leitlinien',
    'nav.valutazione':'Patientenbewertung','nav.ncpt':'NCPt','nav.patologie':'Spezialdiäten',
    'nav.consigli':'Ernährungsberatung','nav.bia':'BIA','nav.questionari':'Fragebögen',
    'nav.studi':'Wissenschaftliche Studien','nav.ai':'KI-Assistent','nav.agenda':'Kalender',
    'nav.ecm':'CME-Kurse','nav.database':'Lebensmittel CREA+BDA','nav.integratori':'Nahrungsergänzungsmittel',
    'nav.ricette':'Rezepte','nav.admin':'Benutzerverwaltung','nav.profilo':'Operateurprofil','nav.esci':'Abmelden',
    'index.title':'DietPlan Pro — Anmelden','index.login_tab':'Anmelden','index.register_tab':'Registrieren',
    'index.email':'E-Mail','index.password':'Passwort','index.confirm_password':'Passwort bestätigen',
    'index.login_btn':'Anmelden','index.register_btn':'Konto erstellen',
    'index.waiting_title':'Konto wartet auf Genehmigung',
    'index.waiting_text':'Ihr Konto wurde registriert. Ein Administrator wird es in Kürze aktivieren.',
    'index.logout':'Abmelden','index.privacy_note':'Ihre Daten werden sicher gespeichert.',
    'index.register_note':'Warten Sie nach der Registrierung auf die Genehmigung des Administrators.',
    'index.loading':'Wird geladen...',
    'common.loading':'Wird geladen...','common.save':'Speichern','common.cancel':'Abbrechen',
    'common.confirm':'Bestätigen','common.print':'Drucken','common.all':'Alle',
    'common.error':'Fehler','common.search':'Suchen...','common.no_data':'Keine Daten verfügbar',
    'common.delete':'Löschen','common.edit':'Bearbeiten','common.close':'Schließen',
    'common.send':'Senden','common.yes':'Ja','common.no':'Nein',
    'chat.conversations':'Gespräche','chat.search_patient':'Patient suchen...',
    'chat.select_patient':'Wählen Sie einen Patienten, um ein Gespräch zu beginnen',
    'chat.tab_chat':'💬 Nachrichten','chat.tab_andamento':'📈 Tagebuch',
    'chat.tab_privacy':'📋 Datenschutz','chat.tab_storico':'📊 Krankengeschichte',
    'chat.message_placeholder':'Nachricht...','chat.send':'Senden',
    'chat.no_cartella':'Keine Patientenakte mit diesem Patienten verknüpft.',
    'stor.title':'Krankengeschichte','stor.period':'Zeitraum:','stor.all':'Alle',
    'stor.last6':'Letzte 6 Monate','stor.last12':'Letztes Jahr','stor.print':'Bericht drucken',
    'stor.no_data':'Keine Bewertungsunterlagen für diesen Patienten gefunden.',
    'stor.valutazioni':'Bewertungen','stor.valutazione':'Bewertung',
    'stor.peso':'Gewicht kg','stor.bmi':'BMI','stor.massa_grassa':'Körperfett',
    'stor.massa_magra':'Magermasse kg','stor.vita':'Taille cm',
    'stor.chart_peso':'Körpergewicht','stor.chart_peso_diary':'Körpergewicht & Tagebuch',
    'stor.chart_bmi':'BMI','stor.chart_comp':'Körperzusammensetzung',
    'stor.chart_circ':'Umfänge (cm)','stor.chart_pliche':'Hautfalten (mm)',
    'stor.chart_labs':'Bluttests',
    'priv.title':'Text der Einwilligungserklärung','priv.edit':'✏️ Bearbeiten',
    'priv.print':'🖨️ Drucken','priv.create':'📤 Erstellen & senden','priv.revoke':'🗑️ Abbrechen',
    'priv.signed':'✅ Unterzeichnet am','priv.pending':'⏳ Warte auf Patientenunterschrift',
    'priv.none':'📭 Kein Formular gesendet','priv.save_patient':'💾 Nur für diesen Patienten speichern',
    'priv.save_template':'🌐 Als Vorlage für alle Patienten speichern',
    'priv.cancel_edit':'✕ Abbrechen','priv.editor_close':'✕ Editor schließen',
    'pp.title':'Patientenbereich','pp.logout':'🚪 Abmelden',
    'pp.tab_profile':'👤 Persönliche Daten','pp.tab_dieta':'🥗 Diät',
    'pp.tab_docs':'📄 Dokumente','pp.tab_diary':'📓 Tagebuch',
    'pp.tab_chat':'💬 Chat','pp.tab_privacy':'📋 Datenschutz',
    'pp.profile_hdr':'👤 Persönliche Daten',
    'pp.profile_note':'Geben Sie Ihre persönlichen Daten ein. Ihr Ernährungsberater wird sie zur Identifikation sehen.',
    'pp.nome':'Vorname','pp.cognome':'Nachname','pp.email':'E-Mail',
    'pp.save_profile':'💾 Daten speichern',
    'pp.dieta_hdr':'🥗 Meine Diät','pp.docs_hdr':'📄 Meine Dokumente',
    'pp.diary_hdr':'📓 Ernährungs- & Wellness-Tagebuch',
    'pp.diary_note':'Erfassen Sie Ihre Mahlzeiten, Stimmung und täglichen Symptome. Ihr Ernährungsberater kann diese einsehen.',
    'pp.diary_new':'✏️ Neuer Eintrag','pp.diary_date':'Datum',
    'pp.diary_mood':'Stimmung (1 = sehr negativ, 5 = ausgezeichnet)',
    'pp.diary_notes_lbl':'Mahlzeiten und Ernährung (kurze Beschreibung)',
    'pp.diary_sleep':'Schlafstunden (optional)','pp.diary_activity':'Körperliche Aktivität (optional)',
    'pp.diary_symptoms':'Symptome / Zusätzliche Notizen (optional)',
    'pp.chat_placeholder':'Nachricht schreiben...',
    'pp.consent_sign':'✅ Einwilligung unterzeichnen',
    'pp.consent_agree':'Ich habe das Dokument gelesen und verstanden. Ich stimme der Verarbeitung meiner personenbezogenen Daten zu.',
    'pp.consent_signed':'✅ Sie haben diese Einwilligung am unterzeichnet',
    'pp.consent_pending':'⏳ Warte auf Ihre Unterschrift','pp.no_consents':'Keine Einwilligungsformulare vorhanden.',
    'pp.no_piano':'Derzeit kein Ernährungsplan verfügbar.',
    'pp.no_docs':'Keine Dokumente verfügbar.',
    'pp.no_diary':'Keine Einträge gefunden.',
    'pp.loading_piano':'Ernährungsplan wird geladen...','pp.loading_docs':'Dokumente werden geladen...',
    'pp.mood_select':'— Auswählen —',
    'pp.mood_1':'😞 1 — Sehr negativ','pp.mood_2':'😕 2 — Negativ',
    'pp.mood_3':'😐 3 — Neutral','pp.mood_4':'🙂 4 — Positiv','pp.mood_5':'😊 5 — Ausgezeichnet',
  }
};

// ── Helpers ──────────────────────────────────────────
function getLang() { return localStorage.getItem('nlang') || 'it'; }

function t(key) {
  const l = getLang();
  return (LANGS[l] && LANGS[l][key]) || (LANGS.it && LANGS.it[key]) || key;
}

function setLang(lang) {
  localStorage.setItem('nlang', lang);
  location.reload();
}

// ── Apply data-i18n attributes ────────────────────────
function applyLang() {
  const l = getLang();
  document.documentElement.lang = l;
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const val = t(el.dataset.i18n);
    if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
      el.value = val;
    } else {
      el.textContent = val;
    }
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    el.placeholder = t(el.dataset.i18nPlaceholder);
  });
  document.querySelectorAll('[data-i18n-title]').forEach(el => {
    document.title = t(el.dataset.i18nTitle);
  });
}

// ── Translate sidebar nav items (works on all 28 app pages) ──
function translateSidebarNav() {
  const navMap = {
    'app.html':'nav.piano_alimentare','pazienti.html':'nav.cartelle_pazienti',
    'chat.html':'nav.pazienti','paziente-sano.html':'nav.paziente_sano',
    'diabete.html':'nav.diabete','pancreas.html':'nav.pancreas',
    'sport.html':'nav.sport','dna.html':'nav.dca','chetogenica.html':'nav.chetogenica',
    'renale.html':'nav.renale','disfagia.html':'nav.disfagia','pediatria.html':'nav.pediatria',
    'ristorazione.html':'nav.ristorazione','linee-guida.html':'nav.linee_guida',
    'valutazione.html':'nav.valutazione','ncpt.html':'nav.ncpt','patologie.html':'nav.patologie',
    'consigli.html':'nav.consigli','bia.html':'nav.bia','questionari.html':'nav.questionari',
    'studi.html':'nav.studi','ai.html':'nav.ai','agenda.html':'nav.agenda',
    'ecm.html':'nav.ecm','database.html':'nav.database','integratori.html':'nav.integratori',
    'ricette.html':'nav.ricette','admin.html':'nav.admin',
  };
  // Known section labels in all 3 languages → key
  const secMap = {};
  ['it','en','de'].forEach(l => {
    ['nav.sec.piano','nav.sec.comunicazione','nav.sec.specialistica','nav.sec.strumenti','nav.sec.database'].forEach(k => {
      if (LANGS[l][k]) secMap[LANGS[l][k]] = k;
    });
  });

  document.querySelectorAll('#sidebar .nav-item[href]').forEach(el => {
    const href = el.getAttribute('href');
    const key = navMap[href];
    if (!key) return;
    const ni = el.querySelector('.ni');
    if (ni) {
      let node = ni.nextSibling;
      while (node) {
        if (node.nodeType === 3) { node.textContent = t(key); break; }
        node = node.nextSibling;
      }
    }
  });
  document.querySelectorAll('#sidebar .nav-sec').forEach(el => {
    const txt = el.textContent.trim();
    const key = secMap[txt];
    if (key) el.textContent = t(key);
  });

  const logoutBtn = document.querySelector('#sidebar .sb-logout:not(#btn-profilo-op)');
  if (logoutBtn) logoutBtn.innerHTML = '🚪 ' + t('nav.esci');
  const profileBtn = document.getElementById('btn-profilo-op');
  if (profileBtn) profileBtn.innerHTML = '👤 ' + t('nav.profilo');
}

// ── Language switcher widget ──────────────────────────
function initLangSwitcher(container) {
  if (document.getElementById('lang-switcher')) return;
  const el = container
    || document.querySelector('.tbar-actions')
    || document.querySelector('.pp-topbar');
  if (!el) return;
  const lang = getLang();
  const div = document.createElement('div');
  div.id = 'lang-switcher';
  div.style.cssText = 'display:flex;gap:2px;align-items:center;margin-left:6px';
  ['it','en','de'].forEach(l => {
    const flag = l==='it'?'🇮🇹':l==='en'?'🇬🇧':'🇩🇪';
    const label = l==='it'?'Italiano':l==='en'?'English':'Deutsch';
    const btn = document.createElement('button');
    btn.id = 'lbtn-' + l;
    btn.title = label;
    btn.setAttribute('aria-label', label);
    btn.style.cssText = `background:none;border:none;cursor:pointer;font-size:19px;padding:2px 3px;border-radius:5px;opacity:${l===lang?'1':'0.4'};transition:opacity .15s;line-height:1`;
    btn.textContent = flag;
    btn.onclick = () => setLang(l);
    div.appendChild(btn);
  });
  el.appendChild(div);
}

// ── Auto-init on DOMContentLoaded ─────────────────────
document.addEventListener('DOMContentLoaded', function() {
  applyLang();
  translateSidebarNav();
  initLangSwitcher();
});
