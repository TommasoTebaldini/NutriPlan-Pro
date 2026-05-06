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
    'nav.obesita':'Obesità','nav.oncologia':'Oncologia',
    'nav.consigli':'Consigli Nutrizionali','nav.bia':'BIA','nav.questionari':'Questionari',
    'nav.studi':'Studi Scientifici','nav.ai':'Assistente AI','nav.agenda':'Agenda',
    'nav.ecm':'Corsi ECM','nav.database':'Alimenti CREA+BDA','nav.integratori':'Integratori e AFMS',
    'nav.ricette':'Ricette','nav.impostazioni':'Impostazioni','nav.admin':'Admin Utenti','nav.profilo':'Profilo Operatore','nav.esci':'Esci',
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
    'nav.obesita':'Obesity','nav.oncologia':'Oncology',
    'nav.consigli':'Nutritional Advice','nav.bia':'BIA','nav.questionari':'Questionnaires',
    'nav.studi':'Scientific Studies','nav.ai':'AI Assistant','nav.agenda':'Calendar',
    'nav.ecm':'CME Courses','nav.database':'Foods CREA+BDA','nav.integratori':'Supplements & FSFs',
    'nav.ricette':'Recipes','nav.impostazioni':'Settings','nav.admin':'User Admin','nav.profilo':'Operator Profile','nav.esci':'Log Out',
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
    'nav.obesita':'Adipositas','nav.oncologia':'Onkologie',
    'nav.consigli':'Ernährungsberatung','nav.bia':'BIA','nav.questionari':'Fragebögen',
    'nav.studi':'Wissenschaftliche Studien','nav.ai':'KI-Assistent','nav.agenda':'Kalender',
    'nav.ecm':'CME-Kurse','nav.database':'Lebensmittel CREA+BDA','nav.integratori':'Nahrungsergänzungsmittel',
    'nav.ricette':'Rezepte','nav.impostazioni':'Einstellungen','nav.admin':'Benutzerverwaltung','nav.profilo':'Operateurprofil','nav.esci':'Abmelden',
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

// ═══════════════════════════════════════════════════
// LABEL & CONTENT TRANSLATIONS (text-matching)
// Covers ALL admin pages without per-element data-i18n
// ═══════════════════════════════════════════════════
const LABEL_TR = {
  en: {
    // ── Common buttons ──
    'Salva in Cartella':'Save to File','Salva Scheda':'Save Record','Salva':'Save',
    'Stampa':'Print','Reset':'Reset','Calcola':'Calculate','Annulla':'Cancel',
    'Modifica':'Edit','Elimina':'Delete','Chiudi':'Close','Invia':'Send',
    'Conferma':'Confirm','Carica':'Load','Esporta':'Export',
    'Nuova Sessione':'New Session','Nuovo':'New','Aggiungi':'Add',
    'Salva in Database':'Save to Database',
    // ── Common labels ──
    'Nome e Cognome':'Full Name','Nome':'First Name','Cognome':'Last Name',
    'Data di nascita':'Date of birth','Data valutazione':'Assessment date',
    'Data':'Date','Sesso':'Sex','Maschio':'Male','Femmina':'Female',
    'Nota / Titolo sessione':'Session note / title',
    'Nota':'Note','Note':'Notes','Note cliniche':'Clinical notes',
    'Note al piano':'Plan notes','Note aggiuntive':'Additional notes',
    // ── Anthropometric ──
    'Dati Antropometrici':'Anthropometric Data',
    'Peso attuale (kg)':'Current weight (kg)','Peso (kg)':'Weight (kg)',
    'Altezza (cm)':'Height (cm)','BMI (auto)':'BMI (auto)',
    'Circ. vita (cm)':'Waist circumference (cm)','Circ. fianchi (cm)':'Hip circumference (cm)',
    'WHR (auto)':'WHR (auto)','Peso ideale (kg)':'Ideal weight (kg)',
    'Peso aggiustato (kg)':'Adjusted weight (kg)','Massa grassa (%)':'Body fat (%)',
    'Massa magra (kg)':'Lean mass (kg)','Peso target (kg)':'Target weight (kg)',
    'Peso massimo storico (kg)':'Maximum historical weight (kg)',
    'Peso minimo storico (kg)':'Minimum historical weight (kg)',
    'Peso a 18 anni (kg)':'Weight at 18 years (kg)',
    'Vita (cm)':'Waist (cm)','Fianchi (cm)':'Hips (cm)','Collo (cm)':'Neck (cm)',
    'Ombelico (cm)':'Umbilicus (cm)','Addome (cm)':'Abdomen (cm)',
    'Torace (cm)':'Chest (cm)','Spalla (cm)':'Shoulder (cm)',
    'Braccio rilassato dx (cm)':'Right arm relaxed (cm)','Braccio rilassato sx (cm)':'Left arm relaxed (cm)',
    'Braccio contratto dx (cm)':'Right arm contracted (cm)','Braccio contratto sx (cm)':'Left arm contracted (cm)',
    'Braccio (cm)':'Arm (cm)','Avambraccio (cm)':'Forearm (cm)','Polso (cm)':'Wrist (cm)',
    'Coscia dx (cm)':'Right thigh (cm)','Coscia sx (cm)':'Left thigh (cm)',
    'Polpaccio dx (cm)':'Right calf (cm)','Polpaccio sx (cm)':'Left calf (cm)',
    'Caviglia (cm)':'Ankle (cm)',
    // ── Clinical section headers ──
    'Dati Anagrafici':'Personal Data','Storia del Peso':'Weight History',
    'Anamnesi Clinica':'Clinical Anamnesis','Stile di Vita':'Lifestyle',
    'Comorbidità':'Comorbidities','Fabbisogno Energetico':'Energy Requirements',
    'Obiettivo Ponderale':'Weight Goal','Prescrizione Dietetica':'Dietary Prescription',
    'Piano Alimentare Tipo':'Sample Meal Plan','Follow-up e Monitoraggio':'Follow-up & Monitoring',
    'Profilo Comportamentale':'Behavioural Profile','Motivazione e Supporto':'Motivation & Support',
    'Valutazione Nutrizionale':'Nutritional Assessment',
    'Composizione Corporea':'Body Composition','Circonferenze':'Circumferences',
    'Pliche Cutanee':'Skinfold Measurements','Metabolismo Basale':'Basal Metabolic Rate',
    'TDEE e Fabbisogno':'TDEE & Requirements','Macronutrienti':'Macronutrients',
    'Micronutrienti':'Micronutrients','Esami di Laboratorio':'Laboratory Tests',
    'Diario Alimentare':'Food Diary','Questionario Alimentare':'Food Questionnaire',
    'Diagnosi Nutrizionale':'Nutritional Diagnosis','Piano di Intervento':'Intervention Plan',
    'Monitoraggio':'Monitoring','Integrazione raccomandata':'Recommended supplementation',
    // ── Tabs ──
    'Valutazione':'Assessment','Fabbisogno':'Requirements','Comportamento':'Behaviour',
    'Piano Alimentare':'Meal Plan','Linee Guida':'Guidelines','Esempi':'Examples',
    'Anamnesi':'Anamnesis','Obiettivi':'Goals','Follow-up':'Follow-up',
    'Diagnosi':'Diagnosis','Intervento':'Intervention','Monitoraggio':'Monitoring',
    'Pliche':'Skinfolds','Laboratorio':'Laboratory','Schema Dietetico':'Dietary Scheme',
    'Dieta':'Diet','Calcolo':'Calculation','Protocollo':'Protocol',
    'Terapia':'Therapy','Supplementazione':'Supplementation','Idratazione':'Hydration',
    'Attività Fisica':'Physical Activity','BIA':'BIA',
    // ── Form fields ──
    'Età (anni)':'Age (years)','Eta (anni)':'Age (years)',
    'Livello attività fisica':'Physical activity level',
    'Formula':'Formula','Deficit calorico (kcal/die)':'Caloric deficit (kcal/day)',
    'TDEE calcolato (kcal/die)':'Calculated TDEE (kcal/day)',
    'Kcal/die prescritte':'Prescribed kcal/day',
    'Proteine (g o %)':'Proteins (g or %)','CHO (g o %)':'Carbs (g or %)',
    'Grassi (g o %)':'Fats (g or %)','Fibra (g/die)':'Fibre (g/day)',
    'Liquidi (mL/die)':'Fluids (mL/day)','Distribuzione pasti':'Meal distribution',
    'Alimenti da privilegiare':'Foods to favour','Alimenti da limitare / evitare':'Foods to limit / avoid',
    'Frequenza follow-up':'Follow-up frequency','Parametri da monitorare':'Parameters to monitor',
    'Prossima visita':'Next appointment','Obiettivi terapeutici':'Therapeutic goals',
    'Farmaci in corso':'Current medications','Patologie':'Medical conditions',
    'Allergie / Intolleranze':'Allergies / Intolerances','Chirurgia bariatrica precedente':'Previous bariatric surgery',
    'Livello di attività':'Activity level','Limitazioni fisiche':'Physical limitations',
    'Orari pasti abituali':'Usual meal times','Note su stile di vita':'Lifestyle notes',
    // ── Obesity specific ──
    'Storia del peso':'Weight history','Variazione peso recente':'Recent weight change',
    'Durata attuale del sovrappeso (anni)':'Current overweight duration (years)',
    'Tentativi dimagrimento precedenti':'Previous weight loss attempts',
    'Approccio dietetico':'Dietary approach',
    'Calo di peso atteso (kg)':'Expected weight loss (kg)',
    'Tempo stimato (settimane)':'Estimated time (weeks)',
    'Pattern alimentare problematico':'Problematic eating pattern',
    'Trigger emotivi':'Emotional triggers','Alimenti a rischio':'Risk foods',
    'Consumo alcol':'Alcohol consumption','Pasti fuori casa':'Meals outside home',
    'Competenze in cucina':'Cooking skills','Obiettivo del paziente':'Patient goal',
    'Strategie coping':'Coping strategies',
    // ── Diabetes specific ──
    'Tipo di diabete':'Type of diabetes','Terapia farmacologica':'Drug therapy',
    'Glicemia a digiuno':'Fasting blood glucose','HbA1c (%)':'HbA1c (%)',
    'Glicemia postprandiale':'Postprandial blood glucose','Complicanze':'Complications',
    'Frequenza automonitoraggio':'Self-monitoring frequency',
    'Pressione arteriosa':'Blood pressure','Colesterolo totale':'Total cholesterol',
    'LDL':'LDL','HDL':'HDL','Trigliceridi':'Triglycerides',
    // ── Cancer / Oncology ──
    'Tipo di tumore':'Cancer type','Stadio':'Stage','Terapia oncologica':'Oncology therapy',
    'Effetti collaterali':'Side effects','Stato nutrizionale':'Nutritional status',
    'Rischio nutrizionale':'Nutritional risk','Screening nutrizionale':'Nutritional screening',
    'Nausea':'Nausea','Vomito':'Vomiting','Mucositi':'Mucositis','Xerostomia':'Xerostomia',
    'Disfagia':'Dysphagia','Diarrea':'Diarrhea','Costipazione':'Constipation',
    'Perdita di appetito':'Loss of appetite','Perdita di peso':'Weight loss',
    'Cachessia':'Cachexia','Sarcopenia':'Sarcopenia',
    // ── Sports nutrition ──
    'Sport praticato':'Sport practised','Livello agonistico':'Competitive level',
    'Frequenza allenamenti':'Training frequency','Durata sessione':'Session duration',
    'Obiettivo sportivo':'Sports goal','Peso gara (kg)':'Race weight (kg)',
    'Fase di preparazione':'Preparation phase',
    // ── Renal ──
    'Stadio IRC':'CKD stage','GFR stimato':'Estimated GFR',
    'Proteinuria':'Proteinuria','In dialisi':'On dialysis',
    'Tipo di dialisi':'Type of dialysis','Restrizione proteica':'Protein restriction',
    'Restrizione potassio':'Potassium restriction','Restrizione fosforo':'Phosphorus restriction',
    'Restrizione liquidi':'Fluid restriction','Restrizione sodio':'Sodium restriction',
    // ── Pediatrics ──
    'Età del bambino':'Child age','Percentile peso':'Weight percentile',
    'Percentile altezza':'Height percentile','Percentile BMI':'BMI percentile',
    'Allattamento':'Breastfeeding','Svezzamento':'Weaning','Alimentazione complementare':'Complementary feeding',
    // ── Dysphagia ──
    'Grado di disfagia':'Dysphagia grade','Consistenza liquidi':'Liquid consistency',
    'Consistenza solidi':'Solid consistency','Rischio inalazione':'Aspiration risk',
    // ── BIA ──
    'Impedenza (Ω)':'Impedance (Ω)','Reattanza (Ω)':'Reactance (Ω)',
    'Angolo di fase (°)':'Phase angle (°)','Acqua totale corporea (L)':'Total body water (L)',
    'Acqua intracellulare (L)':'Intracellular water (L)','Acqua extracellulare (L)':'Extracellular water (L)',
    'Massa grassa (kg)':'Fat mass (kg)','Massa cellulare (BCM, kg)':'Cell mass (BCM, kg)',
    'Massa minerale ossea (kg)':'Bone mineral mass (kg)',
    // ── Common assessment ──
    'Pliche tricipitale (mm)':'Triceps skinfold (mm)','Pliche bicipitale (mm)':'Biceps skinfold (mm)',
    'Pliche sottoscapolare (mm)':'Subscapular skinfold (mm)','Pliche sovrailiaca (mm)':'Suprailiac skinfold (mm)',
    'Pliche addominale (mm)':'Abdominal skinfold (mm)','Pliche coscia (mm)':'Thigh skinfold (mm)',
    'Pliche polpaccio (mm)':'Calf skinfold (mm)',
    // ── Lab values ──
    'Glicemia (mg/dL)':'Blood glucose (mg/dL)','Emoglobina (g/dL)':'Haemoglobin (g/dL)',
    'Ematocrito (%)':'Haematocrit (%)','Ferritina (ng/mL)':'Ferritin (ng/mL)',
    'Vitamina D (ng/mL)':'Vitamin D (ng/mL)','Vitamina B12 (pg/mL)':'Vitamin B12 (pg/mL)',
    'Folati (ng/mL)':'Folate (ng/mL)','Creatinina (mg/dL)':'Creatinine (mg/dL)',
    'Urea (mg/dL)':'Urea (mg/dL)','Albumina (g/dL)':'Albumin (g/dL)',
    'Prealbumina (mg/dL)':'Prealbumin (mg/dL)','Proteina C reattiva (mg/L)':'C-reactive protein (mg/L)',
    'TSH (mUI/L)':'TSH (mUI/L)','Insulina (μU/mL)':'Insulin (μU/mL)',
    // ── Follow-up options ──
    'Settimanale (fase intensiva)':'Weekly (intensive phase)',
    'Quindicinale':'Fortnightly','Mensile':'Monthly',
    'Bimestrale (fase mantenimento)':'Bimonthly (maintenance phase)',
    // ── Topbar / misc ──
    'Cartella Paziente':'Patient File','Nessuna cartella':'No file',
    'Seleziona cartella':'Select file','Nuova cartella':'New file',
    'Piano Alimentare Personalizzato':'Personalised Meal Plan',
    'Scegli un modello di partenza:':'Choose a starting template:',
    'Mostra textarea modificabile':'Show editable text area',
    'Calcola Fabbisogno':'Calculate Requirements',
    'Genera Piano':'Generate Plan','Apri in Piano Alimentare':'Open in Meal Plan',
    'Stampa piano':'Print plan',
  },
  de: {
    // ── Common buttons ──
    'Salva in Cartella':'In Akte speichern','Salva Scheda':'Karte speichern','Salva':'Speichern',
    'Stampa':'Drucken','Reset':'Zurücksetzen','Calcola':'Berechnen','Annulla':'Abbrechen',
    'Modifica':'Bearbeiten','Elimina':'Löschen','Chiudi':'Schließen','Invia':'Senden',
    'Conferma':'Bestätigen','Carica':'Laden','Esporta':'Exportieren',
    'Nuova Sessione':'Neue Sitzung','Nuovo':'Neu','Aggiungi':'Hinzufügen',
    'Salva in Database':'In Datenbank speichern',
    // ── Common labels ──
    'Nome e Cognome':'Vollständiger Name','Nome':'Vorname','Cognome':'Nachname',
    'Data di nascita':'Geburtsdatum','Data valutazione':'Bewertungsdatum',
    'Data':'Datum','Sesso':'Geschlecht','Maschio':'Männlich','Femmina':'Weiblich',
    'Nota / Titolo sessione':'Sitzungsnotiz / Titel',
    'Nota':'Notiz','Note':'Notizen','Note cliniche':'Klinische Notizen',
    'Note al piano':'Plananmerkungen','Note aggiuntive':'Zusätzliche Notizen',
    // ── Anthropometric ──
    'Dati Antropometrici':'Anthropometrische Daten',
    'Peso attuale (kg)':'Aktuelles Gewicht (kg)','Peso (kg)':'Gewicht (kg)',
    'Altezza (cm)':'Körpergröße (cm)','BMI (auto)':'BMI (auto)',
    'Circ. vita (cm)':'Taillenumfang (cm)','Circ. fianchi (cm)':'Hüftumfang (cm)',
    'WHR (auto)':'WHR (auto)','Peso ideale (kg)':'Idealgewicht (kg)',
    'Peso aggiustato (kg)':'Angepasstes Gewicht (kg)','Massa grassa (%)':'Körperfett (%)',
    'Massa magra (kg)':'Magermasse (kg)','Peso target (kg)':'Zielgewicht (kg)',
    'Peso massimo storico (kg)':'Maximales Historisches Gewicht (kg)',
    'Peso minimo storico (kg)':'Minimales Historisches Gewicht (kg)',
    'Peso a 18 anni (kg)':'Gewicht mit 18 Jahren (kg)',
    'Vita (cm)':'Taille (cm)','Fianchi (cm)':'Hüfte (cm)','Collo (cm)':'Hals (cm)',
    'Ombelico (cm)':'Nabel (cm)','Addome (cm)':'Bauch (cm)',
    'Torace (cm)':'Brust (cm)','Spalla (cm)':'Schulter (cm)',
    'Braccio rilassato dx (cm)':'Rechter Arm entspannt (cm)','Braccio rilassato sx (cm)':'Linker Arm entspannt (cm)',
    'Braccio contratto dx (cm)':'Rechter Arm angespannt (cm)','Braccio contratto sx (cm)':'Linker Arm angespannt (cm)',
    'Braccio (cm)':'Arm (cm)','Avambraccio (cm)':'Unterarm (cm)','Polso (cm)':'Handgelenk (cm)',
    'Coscia dx (cm)':'Rechter Oberschenkel (cm)','Coscia sx (cm)':'Linker Oberschenkel (cm)',
    'Polpaccio dx (cm)':'Rechte Wade (cm)','Polpaccio sx (cm)':'Linke Wade (cm)',
    'Caviglia (cm)':'Knöchel (cm)',
    // ── Clinical section headers ──
    'Dati Anagrafici':'Persönliche Daten','Storia del Peso':'Gewichtsgeschichte',
    'Anamnesi Clinica':'Klinische Anamnese','Stile di Vita':'Lebensstil',
    'Comorbidità':'Komorbiditäten','Fabbisogno Energetico':'Energiebedarf',
    'Obiettivo Ponderale':'Gewichtsziel','Prescrizione Dietetica':'Ernährungsvorschrift',
    'Piano Alimentare Tipo':'Beispiel-Ernährungsplan','Follow-up e Monitoraggio':'Nachsorge & Überwachung',
    'Profilo Comportamentale':'Verhaltensprofil','Motivazione e Supporto':'Motivation & Unterstützung',
    'Valutazione Nutrizionale':'Ernährungsbewertung',
    'Composizione Corporea':'Körperzusammensetzung','Circonferenze':'Körperumfänge',
    'Pliche Cutanee':'Hautfaltenmessung','Metabolismo Basale':'Grundumsatz',
    'TDEE e Fabbisogno':'TDEE & Bedarf','Macronutrienti':'Makronährstoffe',
    'Micronutrienti':'Mikronährstoffe','Esami di Laboratorio':'Laboruntersuchungen',
    'Diario Alimentare':'Ernährungstagebuch','Questionario Alimentare':'Ernährungsfragebogen',
    'Diagnosi Nutrizionale':'Ernährungsdiagnose','Piano di Intervento':'Interventionsplan',
    'Monitoraggio':'Überwachung','Integrazione raccomandata':'Empfohlene Ergänzung',
    // ── Tabs ──
    'Valutazione':'Bewertung','Fabbisogno':'Bedarf','Comportamento':'Verhalten',
    'Piano Alimentare':'Ernährungsplan','Linee Guida':'Leitlinien','Esempi':'Beispiele',
    'Anamnesi':'Anamnese','Obiettivi':'Ziele','Follow-up':'Nachsorge',
    'Diagnosi':'Diagnose','Intervento':'Intervention','Monitoraggio':'Überwachung',
    'Pliche':'Hautfalten','Laboratorio':'Labor','Schema Dietetico':'Ernährungsschema',
    'Dieta':'Diät','Calcolo':'Berechnung','Protocollo':'Protokoll',
    'Terapia':'Therapie','Supplementazione':'Supplementierung','Idratazione':'Hydratation',
    'Attività Fisica':'Körperliche Aktivität','BIA':'BIA',
    // ── Form fields ──
    'Età (anni)':'Alter (Jahre)','Eta (anni)':'Alter (Jahre)',
    'Livello attività fisica':'Niveau körperlicher Aktivität',
    'Formula':'Formel','Deficit calorico (kcal/die)':'Kaloriendefizit (kcal/Tag)',
    'TDEE calcolato (kcal/die)':'Berechneter TDEE (kcal/Tag)',
    'Kcal/die prescritte':'Verordnete kcal/Tag',
    'Proteine (g o %)':'Proteine (g oder %)','CHO (g o %)':'Kohlenhydrate (g oder %)',
    'Grassi (g o %)':'Fette (g oder %)','Fibra (g/die)':'Ballaststoffe (g/Tag)',
    'Liquidi (mL/die)':'Flüssigkeit (mL/Tag)','Distribuzione pasti':'Mahlzeitenverteilung',
    'Alimenti da privilegiare':'Bevorzugte Lebensmittel',
    'Alimenti da limitare / evitare':'Zu begrenzende / meidende Lebensmittel',
    'Frequenza follow-up':'Nachsorgfrequenz','Parametri da monitorare':'Zu überwachende Parameter',
    'Prossima visita':'Nächster Termin','Obiettivi terapeutici':'Therapeutische Ziele',
    'Farmaci in corso':'Aktuelle Medikamente','Patologie':'Erkrankungen',
    'Allergie / Intolleranze':'Allergien / Unverträglichkeiten',
    'Chirurgia bariatrica precedente':'Frühere bariatrische Chirurgie',
    'Livello di attività':'Aktivitätsniveau','Limitazioni fisiche':'Körperliche Einschränkungen',
    'Orari pasti abituali':'Übliche Mahlzeiten-Zeiten','Note su stile di vita':'Lebensstil-Notizen',
    // ── Obesity specific ──
    'Storia del peso':'Gewichtsgeschichte','Variazione peso recente':'Aktuelle Gewichtsveränderung',
    'Durata attuale del sovrappeso (anni)':'Aktuelle Übergewichtsdauer (Jahre)',
    'Tentativi dimagrimento precedenti':'Frühere Abnehmversuche',
    'Approccio dietetico':'Ernährungsansatz',
    'Calo di peso atteso (kg)':'Erwarteter Gewichtsverlust (kg)',
    'Tempo stimato (settimane)':'Geschätzte Zeit (Wochen)',
    'Pattern alimentare problematico':'Problematisches Essverhalten',
    'Trigger emotivi':'Emotionale Auslöser','Alimenti a rischio':'Risikonahrungsmittel',
    'Consumo alcol':'Alkoholkonsum','Pasti fuori casa':'Mahlzeiten außer Haus',
    'Competenze in cucina':'Kochkenntnisse','Obiettivo del paziente':'Patientenziel',
    'Strategie coping':'Bewältigungsstrategien',
    // ── Diabetes specific ──
    'Tipo di diabete':'Diabetestyp','Terapia farmacologica':'Medikamentöse Therapie',
    'Glicemia a digiuno':'Nüchternblutzucker','HbA1c (%)':'HbA1c (%)',
    'Glicemia postprandiale':'Postprandialer Blutzucker','Complicanze':'Komplikationen',
    'Frequenza automonitoraggio':'Selbstüberwachungsfrequenz',
    'Pressione arteriosa':'Blutdruck','Colesterolo totale':'Gesamtcholesterin',
    'LDL':'LDL','HDL':'HDL','Trigliceridi':'Triglyzeride',
    // ── Follow-up options ──
    'Settimanale (fase intensiva)':'Wöchentlich (intensive Phase)',
    'Quindicinale':'Zweiwöchentlich','Mensile':'Monatlich',
    'Bimestrale (fase mantenimento)':'Zweimonatlich (Erhaltungsphase)',
    // ── Topbar / misc ──
    'Cartella Paziente':'Patientenakte','Nessuna cartella':'Keine Akte',
    'Seleziona cartella':'Akte auswählen','Nuova cartella':'Neue Akte',
    'Piano Alimentare Personalizzato':'Personalisierter Ernährungsplan',
    'Scegli un modello di partenza:':'Wählen Sie eine Vorlage:',
    'Mostra textarea modificabile':'Bearbeitbares Textfeld anzeigen',
    'Calcola Fabbisogno':'Bedarf berechnen',
    'Genera Piano':'Plan erstellen','Apri in Piano Alimentare':'In Ernährungsplan öffnen',
    'Stampa piano':'Plan drucken',
  }
};

// ═══════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════
function getLang() { return localStorage.getItem('nlang') || 'it'; }

function t(key) {
  const l = getLang();
  return (LANGS[l] && LANGS[l][key]) || (LANGS.it && LANGS.it[key]) || key;
}

function setLang(lang) {
  localStorage.setItem('nlang', lang);
  location.reload();
}

// ─── Apply data-i18n attributes ───────────────────
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
  document.querySelectorAll('[data-i18n-html]').forEach(el => {
    const val = t(el.dataset.i18nHtml);
    if (val && val !== el.dataset.i18nHtml) el.innerHTML = val;
  });
  // Show/hide language-specific blocks
  document.querySelectorAll('[data-only-lang]').forEach(el => {
    el.style.display = (el.dataset.onlyLang === l) ? '' : 'none';
  });
}

// ─── Smart label translation (no per-element markup) ──
function translateLabels() {
  const l = getLang();
  if (l === 'it') return;
  const dict = LABEL_TR[l];
  if (!dict) return;

  // Translate <label> elements
  document.querySelectorAll('label').forEach(el => {
    const txt = el.childNodes[0]?.nodeType === 3
      ? el.childNodes[0].textContent.trim()
      : el.textContent.trim();
    if (dict[txt]) {
      if (el.childNodes[0]?.nodeType === 3) {
        el.childNodes[0].textContent = dict[txt];
      } else {
        el.textContent = dict[txt];
      }
    }
  });

  // Translate <h3> section headers (strip emoji prefix for lookup)
  document.querySelectorAll('.calc-box h3, .card-section h3, .guide-section h4, section h3').forEach(el => {
    const full = el.textContent.trim();
    // strip leading emoji/symbols for lookup
    const bare = full.replace(/^[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE00}-\u{FEFF}\s📊📏📈🧮🧠🍽️📚🩺⚖️🥗📅🔬💊🏋️💼🎯🩸💉🧪📋👤📐🏃🎽]+/u, '').trim();
    if (dict[bare]) {
      // Replace text but keep the emoji prefix
      const prefix = full.slice(0, full.length - bare.length);
      el.textContent = prefix + dict[bare];
    } else if (dict[full]) {
      el.textContent = dict[full];
    }
  });

  // Translate tab buttons
  document.querySelectorAll('.ob-tab, .onc-tab, .val-tab, .spe-tab, .tab-btn, [class$="-tab"]:not(.btn)').forEach(el => {
    const full = el.textContent.trim();
    const bare = full.replace(/^[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE00}-\u{FEFF}\s📊📏📈🧮🧠🍽️📚🩺⚖️🥗📅🔬💊🏋️💼🎯]+/u, '').trim();
    if (dict[bare]) {
      const prefix = full.slice(0, full.length - bare.length);
      el.textContent = prefix + dict[bare];
    }
  });

  // Translate key buttons (save, print, reset, calculate)
  document.querySelectorAll('button.btn, .btn').forEach(el => {
    const full = el.textContent.trim();
    const bare = full.replace(/^[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\s💾🖨️🔄🧮✅❌📤📥📂]+/u, '').trim();
    if (dict[bare]) {
      const prefix = full.slice(0, full.length - bare.length);
      el.textContent = prefix + dict[bare];
    } else if (dict[full]) {
      el.textContent = dict[full];
    }
  });

  // Translate <select> <option> texts
  document.querySelectorAll('select option').forEach(el => {
    const txt = el.textContent.trim();
    if (dict[txt]) el.textContent = dict[txt];
  });

  // Translate topbar / page headers
  document.querySelectorAll('.tbar-title, .page-title, .section-title').forEach(el => {
    const txt = el.textContent.trim();
    if (dict[txt]) el.textContent = dict[txt];
  });
}

// ─── Translate sidebar nav items (works on all app pages) ──
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
    'ricette.html':'nav.ricette','impostazioni.html':'nav.impostazioni','admin.html':'nav.admin',
    'obesita.html':'nav.obesita','oncologia.html':'nav.oncologia',
  };
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

// ─── Language switcher widget ──────────────────────
function initLangSwitcher(container) {
  if (document.getElementById('lang-switcher')) return;
  const el = container
    || document.querySelector('.tbar-actions')
    || document.querySelector('.pp-topbar')
    || document.querySelector('#topbar .tbar-right')
    || document.querySelector('#topbar');
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

// ─── Auto-init on DOMContentLoaded ───────────────────
document.addEventListener('DOMContentLoaded', function() {
  applyLang();
  translateSidebarNav();
  translateLabels();
});
