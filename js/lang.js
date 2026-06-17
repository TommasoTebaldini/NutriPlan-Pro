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
    'int.search':'🔍 Cerca integratore o AFMS...',
    'pat.search':'🔍 Cerca patologia...',
    'ric.search':'🔍 Cerca ricetta...',
    'ric.name_ph':'es. Pasta al pomodoro, Risotto...',
    'ric.notes_ph':'Procedimento, note...',
    'db.search':'🔍 Cerca alimento...',
    'db.all_cats':'Tutte le categorie','db.all_sources':'Tutte le fonti',
    'db.src_aprot':'🟣 Aproteici','db.src_int':'🟡 Integratori/ONS',
    'db.src_upf':'🔴 Ultra-processati (UPF)','db.src_pers':'🟢 Personalizzati',
    'db.food_name_ph':'es. Tortino di quinoa e verdure',
    'db.food_cat_ph':'es. Piatti pronti, Cereali, Pesce…',
    'cs.search':'🔍 Cerca patologia o consiglio...',
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
    'int.search':'🔍 Search supplement or FSMP...',
    'pat.search':'🔍 Search dietary plan...',
    'ric.search':'🔍 Search recipe...',
    'ric.name_ph':'e.g. Pasta with tomato, Risotto...',
    'ric.notes_ph':'Method, notes...',
    'db.search':'🔍 Search food...',
    'db.all_cats':'All categories','db.all_sources':'All sources',
    'db.src_aprot':'🟣 Low-protein foods','db.src_int':'🟡 Supplements/ONS',
    'db.src_upf':'🔴 Ultra-processed (UPF)','db.src_pers':'🟢 Custom foods',
    'db.food_name_ph':'e.g. Quinoa and vegetable cake',
    'db.food_cat_ph':'e.g. Ready meals, Cereals, Fish…',
    'cs.search':'🔍 Search condition or advice...',
  },
  fr: {
    'nav.sec.piano':'Plans','nav.sec.comunicazione':'Communication',
    'nav.sec.specialistica':'Clinique','nav.sec.strumenti':'Outils','nav.sec.database':'Base de données',
    'nav.piano_alimentare':'Plan Alimentaire','nav.cartelle_pazienti':'Dossiers Patients',
    'nav.pazienti':'Patients','nav.paziente_sano':'Patient Sain','nav.diabete':'Gestion Diabète',
    'nav.pancreas':'Insuff. Pancréatique','nav.sport':'Nutrition Sportive','nav.dca':'TCA',
    'nav.chetogenica':'Régime Cétogène','nav.renale':'Néphropathie / IRC','nav.disfagia':'Dysphagie',
    'nav.pediatria':'Pédiatrie','nav.ristorazione':'Restauration Collective','nav.linee_guida':'Recommandations',
    'nav.valutazione':'Évaluation Patient','nav.ncpt':'NCPt','nav.patologie':'Régimes Spéciaux',
    'nav.obesita':'Obésité','nav.oncologia':'Oncologie',
    'nav.consigli':'Conseils Nutritionnels','nav.bia':'BIA','nav.questionari':'Questionnaires',
    'nav.studi':'Études Scientifiques','nav.ai':'Assistant IA','nav.agenda':'Agenda',
    'nav.ecm':'Cours CME','nav.database':'Aliments CREA+BDA','nav.integratori':'Compléments & AFMS',
    'nav.ricette':'Recettes','nav.impostazioni':'Paramètres','nav.admin':'Admin Utilisateurs','nav.profilo':'Profil Opérateur','nav.esci':'Se Déconnecter',
    'index.title':'DietPlan Pro — Connexion','index.login_tab':'Connexion','index.register_tab':"S'inscrire",
    'index.email':'E-mail','index.password':'Mot de passe','index.confirm_password':'Confirmer le mot de passe',
    'index.login_btn':'Connexion','index.register_btn':'Créer un compte',
    'index.waiting_title':"Compte en attente d'approbation",
    'index.waiting_text':"Votre compte est enregistré. Un administrateur l'activera prochainement.",
    'index.logout':'Se déconnecter','index.privacy_note':'Vos données sont stockées en toute sécurité.',
    'index.register_note':"Après l'inscription, attendez l'approbation de l'administrateur.",
    'index.loading':'Chargement...',
    'common.loading':'Chargement...','common.save':'Enregistrer','common.cancel':'Annuler',
    'common.confirm':'Confirmer','common.print':'Imprimer','common.all':'Tout',
    'common.error':'Erreur','common.search':'Rechercher...','common.no_data':'Aucune donnée disponible',
    'common.delete':'Supprimer','common.edit':'Modifier','common.close':'Fermer',
    'common.send':'Envoyer','common.yes':'Oui','common.no':'Non',
    'chat.conversations':'Conversations','chat.search_patient':'Rechercher patient...',
    'chat.select_patient':'Sélectionnez un patient pour commencer une conversation',
    'chat.tab_chat':'💬 Messages','chat.tab_andamento':'📈 Journal',
    'chat.tab_privacy':'📋 Confidentialité','chat.tab_storico':'📊 Historique Clinique',
    'chat.message_placeholder':'Message...','chat.send':'Envoyer',
    'chat.no_cartella':'Aucun dossier lié à ce patient.',
    'stor.title':'Historique Clinique','stor.period':'Période :','stor.all':'Tout',
    'stor.last6':'6 derniers mois','stor.last12':'Dernière année','stor.print':'Imprimer rapport',
    'stor.no_data':"Aucun dossier d'évaluation trouvé pour ce patient.",
    'stor.valutazioni':'évaluations','stor.valutazione':'évaluation',
    'stor.peso':'Poids kg','stor.bmi':'IMC','stor.massa_grassa':'Masse grasse',
    'stor.massa_magra':'Masse maigre kg','stor.vita':'Tour de taille cm',
    'stor.chart_peso':'Poids corporel','stor.chart_peso_diary':'Poids corporel & journal',
    'stor.chart_bmi':'IMC','stor.chart_comp':'Composition corporelle',
    'stor.chart_circ':'Circonférences (cm)','stor.chart_pliche':'Plis cutanés (mm)',
    'stor.chart_labs':'Analyses sanguines',
    'priv.title':'Texte du consentement éclairé','priv.edit':'✏️ Modifier',
    'priv.print':'🖨️ Imprimer','priv.create':'📤 Créer & envoyer','priv.revoke':'🗑️ Annuler',
    'priv.signed':'✅ Signé le','priv.pending':'⏳ En attente de signature du patient',
    'priv.none':'📭 Aucun formulaire envoyé','priv.save_patient':'💾 Enregistrer pour ce patient',
    'priv.save_template':'🌐 Enregistrer comme modèle pour tous les patients',
    'priv.cancel_edit':'✕ Annuler','priv.editor_close':'✕ Fermer l\'éditeur',
    'pp.title':'Espace Patient','pp.logout':'🚪 Se déconnecter',
    'pp.tab_profile':'👤 Données Personnelles','pp.tab_dieta':'🥗 Régime',
    'pp.tab_docs':'📄 Documents','pp.tab_diary':'📓 Journal',
    'pp.tab_chat':'💬 Chat','pp.tab_privacy':'📋 Confidentialité',
    'pp.profile_hdr':'👤 Données Personnelles',
    'pp.profile_note':'Saisissez vos données personnelles. Votre nutritionniste les verra pour vous identifier.',
    'pp.nome':'Prénom','pp.cognome':'Nom','pp.email':'E-mail',
    'pp.save_profile':'💾 Enregistrer les données',
    'pp.dieta_hdr':'🥗 Mon Régime','pp.docs_hdr':'📄 Mes Documents',
    'pp.diary_hdr':'📓 Journal Alimentaire & Bien-être',
    'pp.diary_note':'Enregistrez vos repas, votre humeur et vos symptômes quotidiens. Votre nutritionniste pourra les consulter.',
    'pp.diary_new':'✏️ Nouvelle entrée','pp.diary_date':'Date',
    'pp.diary_mood':'Humeur (1 = très négatif, 5 = excellent)',
    'pp.diary_notes_lbl':'Repas et alimentation (description brève)',
    'pp.diary_sleep':'Heures de sommeil (optionnel)','pp.diary_activity':'Activité physique (optionnel)',
    'pp.diary_symptoms':'Symptômes / Notes supplémentaires (optionnel)',
    'pp.chat_placeholder':'Écrire un message...',
    'pp.consent_sign':'✅ Signer le consentement',
    'pp.consent_agree':"J'ai lu et compris le document. Je consens librement au traitement de mes données personnelles.",
    'pp.consent_signed':'✅ Vous avez signé ce consentement le',
    'pp.consent_pending':'⏳ En attente de votre signature','pp.no_consents':'Aucun formulaire de consentement disponible.',
    'pp.no_piano':'Aucun plan alimentaire disponible pour le moment.',
    'pp.no_docs':'Aucun document disponible.',
    'pp.no_diary':'Aucune entrée trouvée.',
    'pp.loading_piano':'Chargement du plan alimentaire...','pp.loading_docs':'Chargement des documents...',
    'pp.mood_select':'— Sélectionner —',
    'pp.mood_1':'😞 1 — Très négatif','pp.mood_2':'😕 2 — Négatif',
    'pp.mood_3':'😐 3 — Neutre','pp.mood_4':'🙂 4 — Positif','pp.mood_5':'😊 5 — Excellent',
    'int.search':'🔍 Rechercher supplément ou ANDS...',
    'pat.search':'🔍 Rechercher un régime...',
    'ric.search':'🔍 Rechercher une recette...',
    'ric.name_ph':'ex. Pâtes à la tomate, Risotto...',
    'ric.notes_ph':'Procédure, notes...',
    'db.search':'🔍 Rechercher un aliment...',
    'db.all_cats':'Toutes les catégories','db.all_sources':'Toutes les sources',
    'db.src_aprot':'🟣 Hypoprotéiques','db.src_int':'🟡 Compléments/CNO',
    'db.src_upf':'🔴 Ultra-transformés (UPF)','db.src_pers':'🟢 Personnalisés',
    'db.food_name_ph':'ex. Gâteau de quinoa aux légumes',
    'db.food_cat_ph':'ex. Plats cuisinés, Céréales, Poisson…',
    'cs.search':'🔍 Rechercher une pathologie ou un conseil...',
  },
  es: {
    'nav.sec.piano':'Planes','nav.sec.comunicazione':'Comunicación',
    'nav.sec.specialistica':'Clínica','nav.sec.strumenti':'Herramientas','nav.sec.database':'Base de datos',
    'nav.piano_alimentare':'Plan Alimentario','nav.cartelle_pazienti':'Historiales Pacientes',
    'nav.pazienti':'Pacientes','nav.paziente_sano':'Paciente Sano','nav.diabete':'Gestión Diabetes',
    'nav.pancreas':'Insuf. Pancreática','nav.sport':'Nutrición Deportiva','nav.dca':'TCA',
    'nav.chetogenica':'Dieta Cetogénica','nav.renale':'Nefropatía / IRC','nav.disfagia':'Disfagia',
    'nav.pediatria':'Pediatría','nav.ristorazione':'Restauración Colectiva','nav.linee_guida':'Guías Clínicas',
    'nav.valutazione':'Evaluación Paciente','nav.ncpt':'NCPt','nav.patologie':'Dietas Especiales',
    'nav.obesita':'Obesidad','nav.oncologia':'Oncología',
    'nav.consigli':'Consejos Nutricionales','nav.bia':'BIA','nav.questionari':'Cuestionarios',
    'nav.studi':'Estudios Científicos','nav.ai':'Asistente IA','nav.agenda':'Agenda',
    'nav.ecm':'Cursos CME','nav.database':'Alimentos CREA+BDA','nav.integratori':'Suplementos y AFMS',
    'nav.ricette':'Recetas','nav.impostazioni':'Ajustes','nav.admin':'Admin Usuarios','nav.profilo':'Perfil Operador','nav.esci':'Cerrar Sesión',
    'index.title':'DietPlan Pro — Iniciar Sesión','index.login_tab':'Acceder','index.register_tab':'Registrarse',
    'index.email':'Correo electrónico','index.password':'Contraseña','index.confirm_password':'Confirmar contraseña',
    'index.login_btn':'Acceder','index.register_btn':'Crear cuenta',
    'index.waiting_title':'Cuenta pendiente de aprobación',
    'index.waiting_text':'Tu cuenta está registrada. Un administrador la activará pronto.',
    'index.logout':'Cerrar sesión','index.privacy_note':'Tus datos están almacenados de forma segura.',
    'index.register_note':'Tras el registro, espera la aprobación del administrador.',
    'index.loading':'Cargando...',
    'common.loading':'Cargando...','common.save':'Guardar','common.cancel':'Cancelar',
    'common.confirm':'Confirmar','common.print':'Imprimir','common.all':'Todo',
    'common.error':'Error','common.search':'Buscar...','common.no_data':'Sin datos disponibles',
    'common.delete':'Eliminar','common.edit':'Editar','common.close':'Cerrar',
    'common.send':'Enviar','common.yes':'Sí','common.no':'No',
    'chat.conversations':'Conversaciones','chat.search_patient':'Buscar paciente...',
    'chat.select_patient':'Selecciona un paciente para iniciar una conversación',
    'chat.tab_chat':'💬 Mensajes','chat.tab_andamento':'📈 Diario',
    'chat.tab_privacy':'📋 Privacidad','chat.tab_storico':'📊 Historial Clínico',
    'chat.message_placeholder':'Mensaje...','chat.send':'Enviar',
    'chat.no_cartella':'No hay historial vinculado a este paciente.',
    'stor.title':'Historial Clínico','stor.period':'Período:','stor.all':'Todo',
    'stor.last6':'Últimos 6 meses','stor.last12':'Último año','stor.print':'Imprimir informe',
    'stor.no_data':'No se encontraron registros de evaluación para este paciente.',
    'stor.valutazioni':'evaluaciones','stor.valutazione':'evaluación',
    'stor.peso':'Peso kg','stor.bmi':'IMC','stor.massa_grassa':'Masa grasa',
    'stor.massa_magra':'Masa magra kg','stor.vita':'Cintura cm',
    'stor.chart_peso':'Peso corporal','stor.chart_peso_diary':'Peso corporal & diario',
    'stor.chart_bmi':'IMC','stor.chart_comp':'Composición corporal',
    'stor.chart_circ':'Circunferencias (cm)','stor.chart_pliche':'Pliegues cutáneos (mm)',
    'stor.chart_labs':'Análisis de sangre',
    'priv.title':'Texto del consentimiento informado','priv.edit':'✏️ Editar',
    'priv.print':'🖨️ Imprimir','priv.create':'📤 Crear & enviar','priv.revoke':'🗑️ Cancelar',
    'priv.signed':'✅ Firmado el','priv.pending':'⏳ Pendiente de firma del paciente',
    'priv.none':'📭 Ningún formulario enviado','priv.save_patient':'💾 Guardar para este paciente',
    'priv.save_template':'🌐 Guardar como plantilla para todos los pacientes',
    'priv.cancel_edit':'✕ Cancelar','priv.editor_close':'✕ Cerrar editor',
    'pp.title':'Área del Paciente','pp.logout':'🚪 Salir',
    'pp.tab_profile':'👤 Datos Personales','pp.tab_dieta':'🥗 Dieta',
    'pp.tab_docs':'📄 Documentos','pp.tab_diary':'📓 Diario',
    'pp.tab_chat':'💬 Chat','pp.tab_privacy':'📋 Privacidad',
    'pp.profile_hdr':'👤 Datos Personales',
    'pp.profile_note':'Introduce tus datos personales. Tu nutricionista los verá para identificarte.',
    'pp.nome':'Nombre','pp.cognome':'Apellido','pp.email':'Correo electrónico',
    'pp.save_profile':'💾 Guardar datos',
    'pp.dieta_hdr':'🥗 Mi Dieta','pp.docs_hdr':'📄 Mis Documentos',
    'pp.diary_hdr':'📓 Diario Alimentario y Bienestar',
    'pp.diary_note':'Registra tus comidas, estado de ánimo y síntomas diarios. Tu nutricionista podrá consultarlos.',
    'pp.diary_new':'✏️ Nueva entrada','pp.diary_date':'Fecha',
    'pp.diary_mood':'Estado de ánimo (1 = muy negativo, 5 = excelente)',
    'pp.diary_notes_lbl':'Comidas y alimentación (descripción breve)',
    'pp.diary_sleep':'Horas de sueño (opcional)','pp.diary_activity':'Actividad física (opcional)',
    'pp.diary_symptoms':'Síntomas / Notas adicionales (opcional)',
    'pp.chat_placeholder':'Escribe un mensaje...',
    'pp.consent_sign':'✅ Firmar el consentimiento',
    'pp.consent_agree':'He leído y comprendido el documento. Consiento libremente el tratamiento de mis datos personales.',
    'pp.consent_signed':'✅ Firmaste este consentimiento el',
    'pp.consent_pending':'⏳ Pendiente de tu firma','pp.no_consents':'No hay formularios de consentimiento.',
    'pp.no_piano':'No hay plan alimentario disponible por el momento.',
    'pp.no_docs':'No hay documentos disponibles.',
    'pp.no_diary':'No se encontraron entradas.',
    'pp.loading_piano':'Cargando plan alimentario...','pp.loading_docs':'Cargando documentos...',
    'pp.mood_select':'— Seleccionar —',
    'pp.mood_1':'😞 1 — Muy negativo','pp.mood_2':'😕 2 — Negativo',
    'pp.mood_3':'😐 3 — Neutro','pp.mood_4':'🙂 4 — Positivo','pp.mood_5':'😊 5 — Excelente',
    'int.search':'🔍 Buscar suplemento o AEAP...',
    'pat.search':'🔍 Buscar régimen dietético...',
    'ric.search':'🔍 Buscar receta...',
    'ric.name_ph':'ej. Pasta al tomate, Risotto...',
    'ric.notes_ph':'Elaboración, notas...',
    'db.search':'🔍 Buscar alimento...',
    'db.all_cats':'Todas las categorías','db.all_sources':'Todas las fuentes',
    'db.src_aprot':'🟣 Bajos en proteína','db.src_int':'🟡 Suplementos/SNO',
    'db.src_upf':'🔴 Ultraprocesados (UPF)','db.src_pers':'🟢 Personalizados',
    'db.food_name_ph':'ej. Pastel de quinoa con verduras',
    'db.food_cat_ph':'ej. Platos preparados, Cereales, Pescado…',
    'cs.search':'🔍 Buscar patología o consejo...',
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
    'int.search':'🔍 Nahrungsergänzung oder diätetisches Lebensmittel suchen...',
    'pat.search':'🔍 Diätschema suchen...',
    'ric.search':'🔍 Rezept suchen...',
    'ric.name_ph':'z.B. Pasta mit Tomaten, Risotto...',
    'ric.notes_ph':'Zubereitung, Notizen...',
    'db.search':'🔍 Lebensmittel suchen...',
    'db.all_cats':'Alle Kategorien','db.all_sources':'Alle Quellen',
    'db.src_aprot':'🟣 Eiweißarm','db.src_int':'🟡 Nahrungsergänzung/ONS',
    'db.src_upf':'🔴 Hochverarbeitet (UPF)','db.src_pers':'🟢 Benutzerdefiniert',
    'db.food_name_ph':'z.B. Quinoa-Gemüse-Auflauf',
    'db.food_cat_ph':'z.B. Fertiggerichte, Getreide, Fisch…',
    'cs.search':'🔍 Erkrankung oder Ernährungshinweis suchen...',
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
    // ── Diabetes page tabs & labels ──
    'Rapporto I:C':'I:C Ratio','Counting CHO':'CHO Counting',
    'Porzioni Isoglucidiche':'Isoglucidic Portions','Depliant Paziente':'Patient Leaflet',
    'Peso corporeo (kg)':'Body weight (kg)',
    'Tipo diabete':'Diabetes type',
    'Dose totale giornaliera insulina (TDD, unità)':'Total daily insulin dose (TDD, units)',
    'Metodo calcolo':'Calculation method',
    'CHO del pasto (g)':'Meal CHO (g)',
    'Rapporto I:C del pasto':'Meal I:C ratio',
    'Glicemia attuale (mg/dL)':'Current blood glucose (mg/dL)',
    'Target glicemia (mg/dL)':'Blood glucose target (mg/dL)',
    'Fattore di sensibilità insulinica FSI (mg/dL per 1U)':'Insulin sensitivity factor ISF (mg/dL per 1U)',
    'TDD (unità/die)':'TDD (units/day)',
    'Cerca alimento':'Search food',
    'Kcal target/giorno':'Target kcal/day',
    'CHO target totale (g/die)':'Total CHO target (g/day)',
    'Terapia insulinica':'Insulin therapy',
    'Tipo Diabete':'Diabetes type',
    'Calcolo Rapporto I:C':'I:C Ratio Calculator',
    'Calcolo Dose Insulina per Pasto':'Meal Insulin Dose Calculator',
    'Fattore di Sensibilità Insulinica (FSI)':'Insulin Sensitivity Factor (ISF)',
    'Calcolatore CHO del Pasto':'Meal CHO Calculator',
    'Livelli di CHO Counting':'CHO Counting Levels',
    "Come Leggere l'Etichetta":'How to Read the Label',
    'Linee Guida Principali':'Main Guidelines',
    'Target Glicemici Raccomandati':'Recommended Glycaemic Targets',
    'Configurazione Piano':'Plan Configuration',
    'Distribuzione CHO per Pasto':'CHO Distribution per Meal',
    'Schema Pasti con Counting CHO':'Meal Scheme with CHO Counting',
    'Diabete Tipo 1':'Type 1 Diabetes',
    'Diabete Tipo 2 in terapia insulinica':'Type 2 Diabetes on insulin therapy',
    'MODY / altri':'MODY / other',
    'Regola del 500 (CHO counting)':'Rule of 500 (CHO counting)',
    'Regola del 450 (dieta mista)':'Rule of 450 (mixed diet)',
    'Formula basata sul peso (T1D)':'Weight-based formula (T1D)',
    'Regola del 1800 (insulina rapida)':'Rule of 1800 (rapid insulin)',
    'Regola del 1700':'Rule of 1700',
    'Regola del 1500 (insulina regolare)':'Rule of 1500 (regular insulin)',
    'Tipo 1':'Type 1','Tipo 2':'Type 2',
    'Gestazionale':'Gestational',
    'Basal-Bolus (MDI)':'Basal-Bolus (MDI)',
    'Solo basale':'Basal only',
    'Non insulino-dipendente':'Non-insulin-dependent',
    'Aggiungi alimento':'Add food',
    'Stampa solo depliant':'Print leaflet only',
    'Elimina Piano':'Delete plan',
    // ── BMI categories (shared across pages) ──
    'Sottopeso':'Underweight','Normopeso':'Normal weight',
    'Sovrappeso':'Overweight','Obesità classe I':'Obesity class I',
    'Obesità classe II':'Obesity class II','Obesità classe III':'Obesity class III',
    // ── Common specialist page elements ──
    'Seleziona una cartella paziente':'Select a patient file',
    'Nota / Titolo sessione':'Session note / title',
    'Aggiungi':'Add','Rimuovi':'Remove',
    'Calcola Dose':'Calculate dose','Calcola FSI':'Calculate ISF',
    'Inserisci CHO totale per calcolare la distribuzione.':'Enter total CHO to calculate the distribution.',
    // ── Obesity page ──
    'Calcolo Fabbisogno Energetico':'Energy Requirements Calculator',
    'Calcolo BMI e Peso Ideale':'BMI and Ideal Weight Calculator',
    'Distribuzione Macronutrienti':'Macronutrient Distribution',
    'Schema Dietetico Personalizzato':'Personalised Dietary Scheme',
    'Indice di Massa Corporea (BMI)':'Body Mass Index (BMI)',
    'Peso Ideale':'Ideal Weight',
    'Fabbisogno Energetico di Base (BMR)':'Basal Energy Requirement (BMR)',
    'Fabbisogno Totale (TDEE)':'Total Energy Requirement (TDEE)',
    'Deficit Consigliato':'Recommended Deficit',
    'Obiettivo Calorico':'Caloric Goal',
    'Peso attuale (kg)':'Current weight (kg)',
    'Altezza (cm)':'Height (cm)',
    'Età (anni)':'Age (years)',
    'Formula BMR':'BMR formula',
    'Livello di attività fisica':'Physical activity level',
    'Obiettivo':'Goal','Dimagrimento':'Weight loss',
    'Mantenimento':'Maintenance','Incremento':'Weight gain',
    'Sedentario (lavoro d\'ufficio, nessun esercizio)':'Sedentary (desk job, no exercise)',
    'Leggermente attivo (1-2 gg/sett)':'Lightly active (1-2 days/week)',
    'Moderatamente attivo (3-4 gg/sett)':'Moderately active (3-4 days/week)',
    'Molto attivo (5-6 gg/sett)':'Very active (5-6 days/week)',
    'Estremamente attivo (atleta)':'Extremely active (athlete)',
    'Harris-Benedict (rivisto)':'Harris-Benedict (revised)',
    'Mifflin-St Jeor':'Mifflin-St Jeor',
    // ── Sport page ──
    'Calcolo Fabbisogno Sportivo':'Sports Requirements Calculator',
    'Tipo di sport':'Sport type','Sport di resistenza (endurance)':'Endurance sport',
    'Sport di forza (strength)':'Strength sport','Sport misti':'Mixed sports',
    'Intensità allenamento':'Training intensity',
    'Bassa (≤60% VO2max)':'Low (≤60% VO2max)',
    'Moderata (60-75% VO2max)':'Moderate (60-75% VO2max)',
    'Alta (75-90% VO2max)':'High (75-90% VO2max)',
    'Molto alta (>90% VO2max)':'Very high (>90% VO2max)',
    'Fabbisogno Proteico':'Protein Requirements',
    'Fabbisogno CHO':'CHO Requirements',
    'Fabbisogno Energetico':'Energy Requirements',
    'Pre-allenamento':'Pre-workout','Post-allenamento':'Post-workout',
    'Timing nutrizionale':'Nutritional timing',
    'Integrazione sportiva':'Sports supplementation',
    // ── Renal page ──
    'Stadio CKD':'CKD stage','GFR (mL/min/1.73m²)':'GFR (mL/min/1.73m²)',
    'Fosforo (mg/die)':'Phosphorus (mg/day)',
    'Potassio (mg/die)':'Potassium (mg/day)',
    'Sodio (mg/die)':'Sodium (mg/day)',
    'Proteine (g/kg/die)':'Protein (g/kg/day)',
    'In emodialisi':'On haemodialysis',
    'Calcolo Apporti Raccomandati':'Recommended Intakes Calculator',
    // ── Ketogenic page ──
    'Rapporto chetogenico':'Ketogenic ratio',
    'Quota lipidica (%)':'Fat quota (%)',
    'Quota proteica (%)':'Protein quota (%)',
    'Quota glucidica (%)':'Carbohydrate quota (%)',
    'Corpo chetonico target':'Target ketone body',
    'Calcolo Piano Chetogenico':'Ketogenic Plan Calculator',
    // ── Oncology page ──
    'Valutazione Rischio Nutrizionale':'Nutritional Risk Assessment',
    'Screening NRS-2002':'NRS-2002 Screening',
    'Screening PG-SGA':'PG-SGA Screening',
    'Score nutrizionale':'Nutritional score',
    'Rischio basso':'Low risk','Rischio moderato':'Moderate risk',
    'Rischio alto':'High risk','Rischio molto alto':'Very high risk',
    // ── Pancreas page ──
    'Elastasi fecale (µg/g)':'Faecal elastase (µg/g)',
    'Dosaggio enzimatico':'Enzyme dose',
    'Tipo di pasto':'Meal type',
    'Pasto principale':'Main meal','Spuntino':'Snack',
    'Contenuto lipidico (g)':'Fat content (g)',
    'Calcolo Dose Enzimi':'Enzyme Dose Calculator',
    // ── Pediatrics page ──
    'Peso del bambino (kg)':'Child weight (kg)',
    'Altezza del bambino (cm)':'Child height (cm)',
    'Età (mesi)':'Age (months)',
    'Percentile':'Percentile',
    'Curva di crescita':'Growth chart',
    'Fabbisogno pediatrico':'Paediatric requirements',
    // ── Dysphagia page ──
    'Livello IDDSI':'IDDSI level',
    'Consistenza alimento':'Food consistency',
    'Test deglutizione':'Swallowing test',
    'Addensante (g/100mL)':'Thickener (g/100mL)',
    // ── Gravidanza page ──
    'Settimana gestazionale':'Gestational week',
    'Trimestre':'Trimester','Primo trimestre':'First trimester',
    'Secondo trimestre':'Second trimester','Terzo trimestre':'Third trimester',
    'Gravidanza singola':'Single pregnancy','Gravidanza gemellare':'Twin pregnancy',
    'Fabbisogno gravidanza':'Pregnancy requirements',
    // ── BIA page ──
    'Frequenza (kHz)':'Frequency (kHz)','Vettore BIA':'BIA vector',
    'Stato idratazione':'Hydration status',
    'Normoidratato':'Euhydrated','Disidratato':'Dehydrated','Iperidratato':'Overhydrated',
    // ── Ristorazione page ──
    'Numero pasti/giorno':'Number of meals/day',
    'Numero commensali':'Number of diners',
    'Tipo di menu':'Menu type','Colazione':'Breakfast','Pranzo':'Lunch','Cena':'Dinner',
    'Menu settimanale':'Weekly menu','Menu del giorno':'Daily menu',
    // ── Common result labels ──
    'Rapporto I:C stimato':'Estimated I:C ratio',
    'FSI stimato':'Estimated ISF',
    'mg/dL per 1 unità':'mg/dL per 1 unit',
    'Dose per CHO':'CHO dose','Correzione glicemica':'Glycaemic correction',
    'DOSE TOTALE':'TOTAL DOSE',
    'Totale CHO pasto':'Total meal CHO',
    'Con I:C':'With I:C','Dose insulina stimata':'Estimated insulin dose',
    'alimenti':'foods',
    // ── Disclaimer bar ──
    'Strumento professionale di documentazione.':'Professional documentation tool.',
    // ── Obesità h3 headings ──
    'Comorbidità Correlate all\'Obesità':'Obesity-Related Comorbidities',
    'Attività Fisica e Stile di Vita':'Physical Activity and Lifestyle',
    'Parametri di Calcolo':'Calculation Parameters',
    'Risultato Calcolo Energetico':'Energy Calculation Results',
    'Obiettivi Ponderali':'Weight Goals',
    'Ripartizione Macronutrienti Raccomandata':'Recommended Macronutrient Distribution',
    'Pattern Alimentare':'Eating Pattern',
    'Abitudini Alimentari':'Eating Habits',
    'Motivazione e Obiettivi Personali':'Motivation and Personal Goals',
    'Schema Dietetico di Documentazione':'Dietary Documentation Scheme',
    'Piano Alimentare Personalizzato':'Personalised Meal Plan',
    'Linee Guida e Risorse Ufficiali':'Official Guidelines and Resources',
    // ── Obesità labels ──
    'Data di nascita':'Date of birth',
    'Data valutazione':'Assessment date',
    'Variazione recente':'Recent change',
    'Durata sovrappeso/obesità':'Duration of overweight/obesity',
    'N° tentativi dietetici':'No. of diet attempts',
    'Note anamnesi ponderale':'Weight history notes',
    'Farmaci in uso (rilevanti per il peso)':'Medications (weight-relevant)',
    'Terapia bariatrica / farmacologica':'Bariatric / pharmacological therapy',
    'Limitazioni motorie':'Motor limitations',
    'Orari pasti irregolari':'Irregular meal times',
    'Note stile di vita':'Lifestyle notes',
    'Deficit calorico obiettivo':'Target caloric deficit',
    'Deficit personalizzato (kcal/die)':'Custom deficit (kcal/day)',
    'Formula MB':'BMR formula',
    'Peso massimo storico (kg)':'Maximum historical weight (kg)',
    'Peso minimo (adulto, kg)':'Minimum weight (adult, kg)',
    'Comportamento alimentare prevalente':'Predominant eating behaviour',
    'Trigger alimentari identificati':'Identified food triggers',
    'Alimenti a rischio (preferiti in eccesso)':'High-risk foods (eaten in excess)',
    'N° pasti al giorno (media)':'No. of meals per day (avg)',
    'Consumo di alcol':'Alcohol consumption',
    'Consumo fuori casa / delivery':'Eating out / delivery',
    'Cucina autonoma':'Cooks independently',
    'Motivazione al cambiamento':'Motivation to change',
    'Supporto familiare/sociale':'Family/social support',
    'Obiettivo principale del paziente':'Patient\'s main goal',
    'Strategie di coping proposte / note comportamentali':'Proposed coping strategies / behavioural notes',
    'Kcal/die prescritte':'Kcal/day prescribed',
    'Proteine (g o %)':'Protein (g or %)',
    'Grassi (g o %)':'Fat (g or %)',
    'Fibra (g/die)':'Fibre (g/day)',
    'Liquidi (mL/die)':'Fluids (mL/day)',
    'Distribuzione pasti':'Meal distribution',
    'Piano alimentare (modifica liberamente)':'Meal plan (edit freely)',
    'Approccio dietetico scelto':'Chosen dietary approach',
    // ── Obesità select options ──
    'Sedentario (lavoro d\'ufficio, no sport)':'Sedentary (office work, no sport)',
    'Leggero (1–2 sessioni/settimana)':'Light (1–2 sessions/week)',
    'Moderato (3–4 sessioni/settimana)':'Moderate (3–4 sessions/week)',
    'Intenso (5+ sessioni/settimana)':'Intense (5+ sessions/week)',
    'Nessuna':'None',
    'Lievi (dolori articolari occasionali)':'Mild (occasional joint pain)',
    'Moderate (difficoltà deambulazione)':'Moderate (walking difficulties)',
    'Gravi (mobilità ridotta)':'Severe (reduced mobility)',
    'No, pasti regolari':'No, regular meals',
    'Salta pasti frequentemente':'Skips meals frequently',
    'Irregolari per lavoro':'Irregular due to work',
    'Mangia di notte':'Eats at night',
    'Nessun pattern disfunzionale evidente':'No obvious dysfunctional pattern',
    'Restrittivo con abbuffate':'Restrictive with binge episodes',
    'Mangiatore emotivo':'Emotional eater',
    'Sindrome da alimentazione notturna':'Night eating syndrome',
    'Mangiatore rapido / scarsa masticazione':'Fast eater / poor chewing',
    'Binge eating disorder (BED)':'Binge eating disorder (BED)',
    'Salto pasti + eccessi serali':'Meal skipping + evening excess',
    'Alta (vuole cambiare attivamente)':'High (actively wants to change)',
    'Buona (consapevole del problema)':'Good (aware of the problem)',
    'Ambivalente (vorrebbe ma difficoltà)':'Ambivalent (wants to but finds it hard)',
    'Bassa (spinto da altri)':'Low (pushed by others)',
    'Ottimo (famiglia coinvolta)':'Excellent (family involved)',
    'Scarso (ambiente non favorevole)':'Poor (unfavourable environment)',
    'Ostacolante':'Obstructive',
    'Ipocalorica bilanciata':'Balanced hypocaloric',
    'Alto contenuto proteico':'High protein content',
    'Mediterranea ipocalorica':'Hypocaloric Mediterranean',
    'Settimanale (fase intensiva)':'Weekly (intensive phase)',
    'Quindicinale':'Fortnightly',
    'Mensile':'Monthly',
    'Bimestrale (fase mantenimento)':'Bi-monthly (maintenance phase)',
    // ── Common form fields shared across pages ──
    'Note fabbisogno':'Requirements notes',
    'Colazione':'Breakfast',
    'Non fa colazione':'Skips breakfast',
    'Colazione leggera (caffè/yogurt)':'Light breakfast (coffee/yogurt)',
    'Colazione completa':'Full breakfast',
    'Colazione abbondante':'Hearty breakfast',
    'Astinente':'Abstainer',
    'Occasionale (<1 UA/settimana)':'Occasional (<1 unit/week)',
    'Moderato (1–7 UA/settimana)':'Moderate (1–7 units/week)',
    'Elevato (>7 UA/settimana)':'High (>7 units/week)',
    'Raro (<1 volta/settimana)':'Rare (<1 time/week)',
    'Frequente':'Frequent',
    'Quotidiano':'Daily',
    'Sì, cucina regolarmente':'Yes, cooks regularly',
    'Spesso, ma non sempre':'Often, but not always',
    'Raramente':'Rarely',
    'No, non cucina':'No, does not cook',
    'Bypass gastrico (RYGB)':'Gastric bypass (RYGB)',
    'Sleeve gastrectomy':'Sleeve gastrectomy',
    'Bendaggio gastrico':'Gastric banding',
    'Pallone intragastrico':'Intragastric balloon',
    'Altra':'Other',
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
  },
  fr: {
    // ── Common buttons ──
    'Salva in Cartella':'Enregistrer dans le dossier','Salva Scheda':'Enregistrer la fiche','Salva':'Enregistrer',
    'Stampa':'Imprimer','Reset':'Réinitialiser','Calcola':'Calculer','Annulla':'Annuler',
    'Modifica':'Modifier','Elimina':'Supprimer','Chiudi':'Fermer','Invia':'Envoyer',
    'Conferma':'Confirmer','Carica':'Charger','Esporta':'Exporter',
    'Nuova Sessione':'Nouvelle session','Nuovo':'Nouveau','Aggiungi':'Ajouter',
    'Salva in Database':'Enregistrer en base de données',
    // ── Common labels ──
    'Nome e Cognome':'Nom complet','Nome':'Prénom','Cognome':'Nom',
    'Data di nascita':'Date de naissance','Data valutazione':"Date d'évaluation",
    'Data':'Date','Sesso':'Sexe','Maschio':'Masculin','Femmina':'Féminin',
    'Nota / Titolo sessione':'Note / Titre de la séance','Nota':'Note','Note':'Notes',
    'Note cliniche':'Notes cliniques','Note al piano':'Notes du plan','Note aggiuntive':'Notes supplémentaires',
    // ── Anthropometric ──
    'Dati Antropometrici':'Données anthropométriques',
    'Peso attuale (kg)':'Poids actuel (kg)','Peso (kg)':'Poids (kg)','Altezza (cm)':'Taille (cm)',
    'BMI (auto)':'IMC (auto)','Circ. vita (cm)':'Tour de taille (cm)','Circ. fianchi (cm)':'Tour de hanches (cm)',
    'WHR (auto)':'RTH (auto)','Peso ideale (kg)':'Poids idéal (kg)','Peso aggiustato (kg)':'Poids ajusté (kg)',
    'Massa grassa (%)':'Masse grasse (%)','Massa magra (kg)':'Masse maigre (kg)',
    'Peso target (kg)':'Poids cible (kg)','Peso massimo storico (kg)':'Poids maximum historique (kg)',
    'Peso minimo storico (kg)':'Poids minimum historique (kg)','Peso a 18 anni (kg)':'Poids à 18 ans (kg)',
    'Vita (cm)':'Taille (cm)','Fianchi (cm)':'Hanches (cm)','Collo (cm)':'Cou (cm)',
    'Ombelico (cm)':'Nombril (cm)','Addome (cm)':'Abdomen (cm)','Torace (cm)':'Thorax (cm)',
    'Spalla (cm)':'Épaule (cm)','Braccio rilassato dx (cm)':'Bras droit détendu (cm)',
    'Braccio rilassato sx (cm)':'Bras gauche détendu (cm)',
    'Braccio contratto dx (cm)':'Bras droit contracté (cm)','Braccio contratto sx (cm)':'Bras gauche contracté (cm)',
    'Braccio (cm)':'Bras (cm)','Avambraccio (cm)':'Avant-bras (cm)','Polso (cm)':'Poignet (cm)',
    'Coscia dx (cm)':'Cuisse droite (cm)','Coscia sx (cm)':'Cuisse gauche (cm)',
    'Polpaccio dx (cm)':'Mollet droit (cm)','Polpaccio sx (cm)':'Mollet gauche (cm)','Caviglia (cm)':'Cheville (cm)',
    // ── Clinical section headers ──
    'Dati Anagrafici':'Données personnelles','Storia del Peso':'Historique du poids',
    'Anamnesi Clinica':'Anamnèse clinique','Stile di Vita':'Mode de vie','Comorbidità':'Comorbidités',
    'Fabbisogno Energetico':'Besoins énergétiques','Obiettivo Ponderale':'Objectif pondéral',
    'Prescrizione Dietetica':'Prescription diététique','Piano Alimentare Tipo':'Plan alimentaire type',
    'Follow-up e Monitoraggio':'Suivi & surveillance','Profilo Comportamentale':'Profil comportemental',
    'Motivazione e Supporto':'Motivation & soutien','Valutazione Nutrizionale':'Évaluation nutritionnelle',
    'Composizione Corporea':'Composition corporelle','Circonferenze':'Circonférences',
    'Pliche Cutanee':'Plis cutanés','Metabolismo Basale':'Métabolisme de base',
    'TDEE e Fabbisogno':'TDEE & besoins','Macronutrienti':'Macronutriments','Micronutrienti':'Micronutriments',
    'Esami di Laboratorio':'Analyses de laboratoire','Diario Alimentare':'Journal alimentaire',
    'Questionario Alimentare':'Questionnaire alimentaire','Diagnosi Nutrizionale':'Diagnostic nutritionnel',
    'Piano di Intervento':"Plan d'intervention",'Monitoraggio':'Surveillance',
    'Integrazione raccomandata':'Supplémentation recommandée',
    // ── Tabs ──
    'Valutazione':'Évaluation','Fabbisogno':'Besoins','Comportamento':'Comportement',
    'Piano Alimentare':'Plan alimentaire','Linee Guida':'Recommandations','Esempi':'Exemples',
    'Anamnesi':'Anamnèse','Obiettivi':'Objectifs','Follow-up':'Suivi','Diagnosi':'Diagnostic',
    'Intervento':'Intervention','Pliche':'Plis cutanés','Laboratorio':'Laboratoire',
    'Schema Dietetico':'Schéma diététique','Dieta':'Régime','Calcolo':'Calcul',
    'Protocollo':'Protocole','Terapia':'Thérapie','Supplementazione':'Supplémentation',
    'Idratazione':'Hydratation','Attività Fisica':'Activité physique','BIA':'BIA',
    // ── Form fields ──
    'Età (anni)':'Âge (ans)','Eta (anni)':'Âge (ans)',
    'Livello attività fisica':"Niveau d'activité physique",'Formula':'Formule',
    'Deficit calorico (kcal/die)':'Déficit calorique (kcal/jour)',
    'TDEE calcolato (kcal/die)':'TDEE calculé (kcal/jour)','Kcal/die prescritte':'Kcal/jour prescrites',
    'Proteine (g o %)':'Protéines (g ou %)','CHO (g o %)':'Glucides (g ou %)','Grassi (g o %)':'Lipides (g ou %)',
    'Fibra (g/die)':'Fibres (g/jour)','Liquidi (mL/die)':'Liquides (mL/jour)',
    'Distribuzione pasti':'Répartition des repas','Alimenti da privilegiare':'Aliments à privilégier',
    'Alimenti da limitare / evitare':'Aliments à limiter / éviter',
    'Frequenza follow-up':'Fréquence de suivi','Parametri da monitorare':'Paramètres à surveiller',
    'Prossima visita':'Prochain rendez-vous','Obiettivi terapeutici':'Objectifs thérapeutiques',
    'Farmaci in corso':'Médicaments en cours','Patologie':'Pathologies',
    'Allergie / Intolleranze':'Allergies / Intolérances',
    'Chirurgia bariatrica precedente':'Chirurgie bariatrique antérieure',
    'Livello di attività':"Niveau d'activité",'Limitazioni fisiche':'Limitations physiques',
    'Orari pasti abituali':'Horaires habituels des repas','Note su stile di vita':'Notes sur le mode de vie',
    // ── Obesity specific ──
    'Storia del peso':'Historique du poids','Variazione peso recente':'Variation récente du poids',
    'Durata attuale del sovrappeso (anni)':'Durée actuelle du surpoids (ans)',
    'Tentativi dimagrimento precedenti':'Tentatives de perte de poids antérieures',
    'Approccio dietetico':'Approche diététique','Calo di peso atteso (kg)':'Perte de poids prévue (kg)',
    'Tempo stimato (settimane)':'Temps estimé (semaines)',
    'Pattern alimentare problematico':'Comportement alimentaire problématique',
    'Trigger emotivi':'Déclencheurs émotionnels','Alimenti a rischio':'Aliments à risque',
    'Consumo alcol':"Consommation d'alcool",'Pasti fuori casa':'Repas hors domicile',
    'Competenze in cucina':'Compétences culinaires','Obiettivo del paziente':'Objectif du patient',
    'Strategie coping':'Stratégies de coping',
    // ── Diabetes ──
    'Tipo di diabete':'Type de diabète','Terapia farmacologica':'Traitement médicamenteux',
    'Glicemia a digiuno':'Glycémie à jeun','HbA1c (%)':'HbA1c (%)',
    'Glicemia postprandiale':'Glycémie postprandiale','Complicanze':'Complications',
    'Frequenza automonitoraggio':"Fréquence d'autocontrôle",
    'Pressione arteriosa':'Pression artérielle','Colesterolo totale':'Cholestérol total',
    'LDL':'LDL','HDL':'HDL','Trigliceridi':'Triglycérides',
    // ── Cancer / Oncology ──
    'Tipo di tumore':'Type de cancer','Stadio':'Stade','Terapia oncologica':'Traitement oncologique',
    'Effetti collaterali':'Effets secondaires','Stato nutrizionale':'État nutritionnel',
    'Rischio nutrizionale':'Risque nutritionnel','Screening nutrizionale':'Dépistage nutritionnel',
    'Nausea':'Nausées','Vomito':'Vomissements','Mucositi':'Mucites','Xerostomia':'Xérostomie',
    'Disfagia':'Dysphagie','Diarrea':'Diarrhée','Costipazione':'Constipation',
    'Perdita di appetito':"Perte d'appétit",'Perdita di peso':'Perte de poids',
    'Cachessia':'Cachexie','Sarcopenia':'Sarcopénie',
    // ── Sports ──
    'Sport praticato':'Sport pratiqué','Livello agonistico':'Niveau compétitif',
    'Frequenza allenamenti':"Fréquence d'entraînement",'Durata sessione':'Durée de la séance',
    'Obiettivo sportivo':'Objectif sportif','Peso gara (kg)':'Poids de course (kg)',
    'Fase di preparazione':'Phase de préparation',
    // ── Renal ──
    'Stadio IRC':'Stade IRC','GFR stimato':'DFG estimé','Proteinuria':'Protéinurie',
    'In dialisi':'En dialyse','Tipo di dialisi':'Type de dialyse',
    'Restrizione proteica':'Restriction protéique','Restrizione potassio':'Restriction en potassium',
    'Restrizione fosforo':'Restriction en phosphore','Restrizione liquidi':'Restriction en liquides',
    'Restrizione sodio':'Restriction en sodium',
    // ── Pediatrics ──
    'Età del bambino':"Âge de l'enfant",'Percentile peso':'Percentile poids',
    'Percentile altezza':'Percentile taille','Percentile BMI':'Percentile IMC',
    'Allattamento':'Allaitement','Svezzamento':'Sevrage','Alimentazione complementare':'Alimentation complémentaire',
    // ── Dysphagia ──
    'Grado di disfagia':'Degré de dysphagie','Consistenza liquidi':'Consistance des liquides',
    'Consistenza solidi':'Consistance des solides','Rischio inalazione':"Risque d'inhalation",
    // ── BIA ──
    'Impedenza (Ω)':'Impédance (Ω)','Reattanza (Ω)':'Réactance (Ω)',
    'Angolo di fase (°)':'Angle de phase (°)','Acqua totale corporea (L)':'Eau corporelle totale (L)',
    'Acqua intracellulare (L)':'Eau intracellulaire (L)','Acqua extracellulare (L)':'Eau extracellulaire (L)',
    'Massa grassa (kg)':'Masse grasse (kg)','Massa cellulare (BCM, kg)':'Masse cellulaire (BCM, kg)',
    'Massa minerale ossea (kg)':'Masse minérale osseuse (kg)',
    // ── Skinfolds ──
    'Pliche tricipitale (mm)':'Pli tricipital (mm)','Pliche bicipitale (mm)':'Pli bicipital (mm)',
    'Pliche sottoscapolare (mm)':'Pli sous-scapulaire (mm)','Pliche sovrailiaca (mm)':'Pli supra-iliaque (mm)',
    'Pliche addominale (mm)':'Pli abdominal (mm)','Pliche coscia (mm)':'Pli de la cuisse (mm)',
    'Pliche polpaccio (mm)':'Pli du mollet (mm)',
    // ── Lab values ──
    'Glicemia (mg/dL)':'Glycémie (mg/dL)','Emoglobina (g/dL)':'Hémoglobine (g/dL)',
    'Ematocrito (%)':'Hématocrite (%)','Ferritina (ng/mL)':'Ferritine (ng/mL)',
    'Vitamina D (ng/mL)':'Vitamine D (ng/mL)','Vitamina B12 (pg/mL)':'Vitamine B12 (pg/mL)',
    'Folati (ng/mL)':'Folates (ng/mL)','Creatinina (mg/dL)':'Créatinine (mg/dL)',
    'Urea (mg/dL)':'Urée (mg/dL)','Albumina (g/dL)':'Albumine (g/dL)',
    'Prealbumina (mg/dL)':'Préalbumine (mg/dL)','Proteina C reattiva (mg/L)':'Protéine C réactive (mg/L)',
    'TSH (mUI/L)':'TSH (mUI/L)','Insulina (μU/mL)':'Insuline (μU/mL)',
    // ── Follow-up ──
    'Settimanale (fase intensiva)':'Hebdomadaire (phase intensive)',
    'Quindicinale':'Bimensuel','Mensile':'Mensuel','Bimestrale (fase mantenimento)':'Bimestriel (phase de maintien)',
    // ── Topbar / misc ──
    'Cartella Paziente':'Dossier patient','Nessuna cartella':'Aucun dossier',
    'Seleziona cartella':'Sélectionner un dossier','Nuova cartella':'Nouveau dossier',
    'Piano Alimentare Personalizzato':'Plan alimentaire personnalisé',
    'Scegli un modello di partenza:':'Choisissez un modèle de départ :',
    'Mostra textarea modificabile':'Afficher la zone de texte modifiable',
    'Calcola Fabbisogno':'Calculer les besoins','Genera Piano':'Générer le plan',
    'Apri in Piano Alimentare':'Ouvrir dans le plan alimentaire','Stampa piano':'Imprimer le plan',
  },
  es: {
    // ── Common buttons ──
    'Salva in Cartella':'Guardar en expediente','Salva Scheda':'Guardar ficha','Salva':'Guardar',
    'Stampa':'Imprimir','Reset':'Restablecer','Calcola':'Calcular','Annulla':'Cancelar',
    'Modifica':'Editar','Elimina':'Eliminar','Chiudi':'Cerrar','Invia':'Enviar',
    'Conferma':'Confirmar','Carica':'Cargar','Esporta':'Exportar',
    'Nuova Sessione':'Nueva sesión','Nuovo':'Nuevo','Aggiungi':'Añadir',
    'Salva in Database':'Guardar en base de datos',
    // ── Common labels ──
    'Nome e Cognome':'Nombre completo','Nome':'Nombre','Cognome':'Apellido',
    'Data di nascita':'Fecha de nacimiento','Data valutazione':'Fecha de evaluación',
    'Data':'Fecha','Sesso':'Sexo','Maschio':'Masculino','Femmina':'Femenino',
    'Nota / Titolo sessione':'Nota / Título de sesión','Nota':'Nota','Note':'Notas',
    'Note cliniche':'Notas clínicas','Note al piano':'Notas del plan','Note aggiuntive':'Notas adicionales',
    // ── Anthropometric ──
    'Dati Antropometrici':'Datos antropométricos',
    'Peso attuale (kg)':'Peso actual (kg)','Peso (kg)':'Peso (kg)','Altezza (cm)':'Altura (cm)',
    'BMI (auto)':'IMC (auto)','Circ. vita (cm)':'Circ. cintura (cm)','Circ. fianchi (cm)':'Circ. caderas (cm)',
    'WHR (auto)':'RCC (auto)','Peso ideale (kg)':'Peso ideal (kg)','Peso aggiustato (kg)':'Peso ajustado (kg)',
    'Massa grassa (%)':'Masa grasa (%)','Massa magra (kg)':'Masa magra (kg)',
    'Peso target (kg)':'Peso objetivo (kg)','Peso massimo storico (kg)':'Peso máximo histórico (kg)',
    'Peso minimo storico (kg)':'Peso mínimo histórico (kg)','Peso a 18 anni (kg)':'Peso a los 18 años (kg)',
    'Vita (cm)':'Cintura (cm)','Fianchi (cm)':'Caderas (cm)','Collo (cm)':'Cuello (cm)',
    'Ombelico (cm)':'Ombligo (cm)','Addome (cm)':'Abdomen (cm)','Torace (cm)':'Tórax (cm)',
    'Spalla (cm)':'Hombro (cm)','Braccio rilassato dx (cm)':'Brazo derecho relajado (cm)',
    'Braccio rilassato sx (cm)':'Brazo izquierdo relajado (cm)',
    'Braccio contratto dx (cm)':'Brazo derecho contraído (cm)','Braccio contratto sx (cm)':'Brazo izquierdo contraído (cm)',
    'Braccio (cm)':'Brazo (cm)','Avambraccio (cm)':'Antebrazo (cm)','Polso (cm)':'Muñeca (cm)',
    'Coscia dx (cm)':'Muslo derecho (cm)','Coscia sx (cm)':'Muslo izquierdo (cm)',
    'Polpaccio dx (cm)':'Pantorrilla derecha (cm)','Polpaccio sx (cm)':'Pantorrilla izquierda (cm)','Caviglia (cm)':'Tobillo (cm)',
    // ── Clinical section headers ──
    'Dati Anagrafici':'Datos personales','Storia del Peso':'Historial de peso',
    'Anamnesi Clinica':'Anamnesis clínica','Stile di Vita':'Estilo de vida','Comorbidità':'Comorbilidades',
    'Fabbisogno Energetico':'Necesidades energéticas','Obiettivo Ponderale':'Objetivo ponderal',
    'Prescrizione Dietetica':'Prescripción dietética','Piano Alimentare Tipo':'Plan alimentario tipo',
    'Follow-up e Monitoraggio':'Seguimiento & control','Profilo Comportamentale':'Perfil conductual',
    'Motivazione e Supporto':'Motivación & apoyo','Valutazione Nutrizionale':'Evaluación nutricional',
    'Composizione Corporea':'Composición corporal','Circonferenze':'Circunferencias',
    'Pliche Cutanee':'Pliegues cutáneos','Metabolismo Basale':'Metabolismo basal',
    'TDEE e Fabbisogno':'TDEE & necesidades','Macronutrienti':'Macronutrientes','Micronutrienti':'Micronutrientes',
    'Esami di Laboratorio':'Análisis de laboratorio','Diario Alimentare':'Diario alimentario',
    'Questionario Alimentare':'Cuestionario alimentario','Diagnosi Nutrizionale':'Diagnóstico nutricional',
    'Piano di Intervento':'Plan de intervención','Monitoraggio':'Control',
    'Integrazione raccomandata':'Suplementación recomendada',
    // ── Tabs ──
    'Valutazione':'Evaluación','Fabbisogno':'Necesidades','Comportamento':'Conducta',
    'Piano Alimentare':'Plan alimentario','Linee Guida':'Guías clínicas','Esempi':'Ejemplos',
    'Anamnesi':'Anamnesis','Obiettivi':'Objetivos','Follow-up':'Seguimiento','Diagnosi':'Diagnóstico',
    'Intervento':'Intervención','Pliche':'Pliegues','Laboratorio':'Laboratorio',
    'Schema Dietetico':'Esquema dietético','Dieta':'Dieta','Calcolo':'Cálculo',
    'Protocollo':'Protocolo','Terapia':'Terapia','Supplementazione':'Suplementación',
    'Idratazione':'Hidratación','Attività Fisica':'Actividad física','BIA':'BIA',
    // ── Form fields ──
    'Età (anni)':'Edad (años)','Eta (anni)':'Edad (años)',
    'Livello attività fisica':'Nivel de actividad física','Formula':'Fórmula',
    'Deficit calorico (kcal/die)':'Déficit calórico (kcal/día)',
    'TDEE calcolato (kcal/die)':'TDEE calculado (kcal/día)','Kcal/die prescritte':'Kcal/día prescritas',
    'Proteine (g o %)':'Proteínas (g o %)','CHO (g o %)':'HC (g o %)','Grassi (g o %)':'Grasas (g o %)',
    'Fibra (g/die)':'Fibra (g/día)','Liquidi (mL/die)':'Líquidos (mL/día)',
    'Distribuzione pasti':'Distribución de comidas','Alimenti da privilegiare':'Alimentos a privilegiar',
    'Alimenti da limitare / evitare':'Alimentos a limitar / evitar',
    'Frequenza follow-up':'Frecuencia de seguimiento','Parametri da monitorare':'Parámetros a controlar',
    'Prossima visita':'Próxima visita','Obiettivi terapeutici':'Objetivos terapéuticos',
    'Farmaci in corso':'Medicamentos actuales','Patologie':'Patologías',
    'Allergie / Intolleranze':'Alergias / Intolerancias',
    'Chirurgia bariatrica precedente':'Cirugía bariátrica previa',
    'Livello di attività':'Nivel de actividad','Limitazioni fisiche':'Limitaciones físicas',
    'Orari pasti abituali':'Horarios habituales de comidas','Note su stile di vita':'Notas de estilo de vida',
    // ── Obesity specific ──
    'Storia del peso':'Historial de peso','Variazione peso recente':'Variación reciente del peso',
    'Durata attuale del sovrappeso (anni)':'Duración actual del sobrepeso (años)',
    'Tentativi dimagrimento precedenti':'Intentos de adelgazamiento previos',
    'Approccio dietetico':'Enfoque dietético','Calo di peso atteso (kg)':'Pérdida de peso esperada (kg)',
    'Tempo stimato (settimane)':'Tiempo estimado (semanas)',
    'Pattern alimentare problematico':'Patrón alimentario problemático',
    'Trigger emotivi':'Desencadenantes emocionales','Alimenti a rischio':'Alimentos de riesgo',
    'Consumo alcol':'Consumo de alcohol','Pasti fuori casa':'Comidas fuera de casa',
    'Competenze in cucina':'Habilidades culinarias','Obiettivo del paziente':'Objetivo del paciente',
    'Strategie coping':'Estrategias de afrontamiento',
    // ── Diabetes ──
    'Tipo di diabete':'Tipo de diabetes','Terapia farmacologica':'Terapia farmacológica',
    'Glicemia a digiuno':'Glucemia en ayunas','HbA1c (%)':'HbA1c (%)',
    'Glicemia postprandiale':'Glucemia posprandial','Complicanze':'Complicaciones',
    'Frequenza automonitoraggio':'Frecuencia de autocontrol',
    'Pressione arteriosa':'Tensión arterial','Colesterolo totale':'Colesterol total',
    'LDL':'LDL','HDL':'HDL','Trigliceridi':'Triglicéridos',
    // ── Cancer / Oncology ──
    'Tipo di tumore':'Tipo de tumor','Stadio':'Estadio','Terapia oncologica':'Tratamiento oncológico',
    'Effetti collaterali':'Efectos secundarios','Stato nutrizionale':'Estado nutricional',
    'Rischio nutrizionale':'Riesgo nutricional','Screening nutrizionale':'Cribado nutricional',
    'Nausea':'Náuseas','Vomito':'Vómitos','Mucositi':'Mucositis','Xerostomia':'Xerostomía',
    'Disfagia':'Disfagia','Diarrea':'Diarrea','Costipazione':'Estreñimiento',
    'Perdita di appetito':'Pérdida de apetito','Perdita di peso':'Pérdida de peso',
    'Cachessia':'Caquexia','Sarcopenia':'Sarcopenia',
    // ── Sports ──
    'Sport praticato':'Deporte practicado','Livello agonistico':'Nivel competitivo',
    'Frequenza allenamenti':'Frecuencia de entrenamientos','Durata sessione':'Duración de la sesión',
    'Obiettivo sportivo':'Objetivo deportivo','Peso gara (kg)':'Peso de competición (kg)',
    'Fase di preparazione':'Fase de preparación',
    // ── Renal ──
    'Stadio IRC':'Estadio ERC','GFR stimato':'TFG estimado','Proteinuria':'Proteinuria',
    'In dialisi':'En diálisis','Tipo di dialisi':'Tipo de diálisis',
    'Restrizione proteica':'Restricción proteica','Restrizione potassio':'Restricción de potasio',
    'Restrizione fosforo':'Restricción de fósforo','Restrizione liquidi':'Restricción de líquidos',
    'Restrizione sodio':'Restricción de sodio',
    // ── Pediatrics ──
    'Età del bambino':'Edad del niño','Percentile peso':'Percentil peso',
    'Percentile altezza':'Percentil altura','Percentile BMI':'Percentil IMC',
    'Allattamento':'Lactancia','Svezzamento':'Destete','Alimentazione complementare':'Alimentación complementaria',
    // ── Dysphagia ──
    'Grado di disfagia':'Grado de disfagia','Consistenza liquidi':'Consistencia de líquidos',
    'Consistenza solidi':'Consistencia de sólidos','Rischio inalazione':'Riesgo de aspiración',
    // ── BIA ──
    'Impedenza (Ω)':'Impedancia (Ω)','Reattanza (Ω)':'Reactancia (Ω)',
    'Angolo di fase (°)':'Ángulo de fase (°)','Acqua totale corporea (L)':'Agua corporal total (L)',
    'Acqua intracellulare (L)':'Agua intracelular (L)','Acqua extracellulare (L)':'Agua extracelular (L)',
    'Massa grassa (kg)':'Masa grasa (kg)','Massa cellulare (BCM, kg)':'Masa celular (BCM, kg)',
    'Massa minerale ossea (kg)':'Masa mineral ósea (kg)',
    // ── Skinfolds ──
    'Pliche tricipitale (mm)':'Pliegue tricipital (mm)','Pliche bicipitale (mm)':'Pliegue bicipital (mm)',
    'Pliche sottoscapolare (mm)':'Pliegue subescapular (mm)','Pliche sovrailiaca (mm)':'Pliegue suprailiaco (mm)',
    'Pliche addominale (mm)':'Pliegue abdominal (mm)','Pliche coscia (mm)':'Pliegue del muslo (mm)',
    'Pliche polpaccio (mm)':'Pliegue de la pantorrilla (mm)',
    // ── Lab values ──
    'Glicemia (mg/dL)':'Glucemia (mg/dL)','Emoglobina (g/dL)':'Hemoglobina (g/dL)',
    'Ematocrito (%)':'Hematocrito (%)','Ferritina (ng/mL)':'Ferritina (ng/mL)',
    'Vitamina D (ng/mL)':'Vitamina D (ng/mL)','Vitamina B12 (pg/mL)':'Vitamina B12 (pg/mL)',
    'Folati (ng/mL)':'Folatos (ng/mL)','Creatinina (mg/dL)':'Creatinina (mg/dL)',
    'Urea (mg/dL)':'Urea (mg/dL)','Albumina (g/dL)':'Albúmina (g/dL)',
    'Prealbumina (mg/dL)':'Prealbúmina (mg/dL)','Proteina C reattiva (mg/L)':'Proteína C reactiva (mg/L)',
    'TSH (mUI/L)':'TSH (mUI/L)','Insulina (μU/mL)':'Insulina (μU/mL)',
    // ── Follow-up ──
    'Settimanale (fase intensiva)':'Semanal (fase intensiva)',
    'Quindicinale':'Quincenal','Mensile':'Mensual','Bimestrale (fase mantenimento)':'Bimestral (fase de mantenimiento)',
    // ── Topbar / misc ──
    'Cartella Paziente':'Expediente del paciente','Nessuna cartella':'Sin expediente',
    'Seleziona cartella':'Seleccionar expediente','Nuova cartella':'Nuevo expediente',
    'Piano Alimentare Personalizzato':'Plan alimentario personalizado',
    'Scegli un modello di partenza:':'Elige una plantilla de inicio:',
    'Mostra textarea modificabile':'Mostrar área de texto editable',
    'Calcola Fabbisogno':'Calcular necesidades','Genera Piano':'Generar plan',
    'Apri in Piano Alimentare':'Abrir en plan alimentario','Stampa piano':'Imprimir plan',
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
  document.querySelectorAll('.ob-tab, .onc-tab, .val-tab, .spe-tab, .tab-btn, [class*="-tab"]:not(.btn)').forEach(el => {
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
  ['it','en','de','fr','es'].forEach(l => {
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
  ['it','en','de','fr','es'].forEach(l => {
    const flag = l==='it'?'🇮🇹':l==='en'?'🇬🇧':l==='de'?'🇩🇪':l==='fr'?'🇫🇷':'🇪🇸';
    const label = l==='it'?'Italiano':l==='en'?'English':l==='de'?'Deutsch':l==='fr'?'Français':'Español';
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
