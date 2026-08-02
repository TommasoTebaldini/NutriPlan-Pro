-- ═══════════════════════════════════════════════════════════════════════════
-- VERIFICA STATO SCHEMA — quali tabelle/colonne di supabase_setup.sql
-- risultano MANCANTI sul database live.
--
-- Generato automaticamente dall'elenco di tutte le CREATE TABLE IF NOT EXISTS
-- e ALTER TABLE ... ADD COLUMN IF NOT EXISTS presenti in supabase_setup.sql
-- (35 tabelle, 75 colonne attese al 2026-08-02).
--
-- USO: incolla ed esegui questa query nell'SQL Editor di Supabase (progetto
-- di produzione). Se entrambi i risultati sono vuoti, lo schema live è
-- allineato a supabase_setup.sql. Altrimenti, cerca nel file la sezione che
-- introduce ciascuna tabella/colonna mancante e rieseguila (di norma è
-- sicuro rieseguire l'intero supabase_setup.sql dall'inizio: ogni statement
-- usa IF NOT EXISTS / CREATE OR REPLACE, quindi è idempotente).
-- ═══════════════════════════════════════════════════════════════════════════

-- 1) Tabelle attese ma assenti
WITH expected_tables(nome) AS (
  VALUES
  ('profiles'),
  ('cartelle'),
  ('piani'),
  ('ncpt'),
  ('bia_records'),
  ('schede_valutazione'),
  ('note_specialistiche'),
  ('daily_wellness'),
  ('weight_logs'),
  ('chat_messages'),
  ('agenda_events'),
  ('alimenti_custom'),
  ('ecm_corsi'),
  ('patient_dietitian'),
  ('patient_documents'),
  ('patient_consents'),
  ('esami_biochimici'),
  ('patient_files'),
  ('menstrual_cycle'),
  ('clinical_audit_log'),
  ('studio_collaborators'),
  ('chat_groups'),
  ('chat_group_members'),
  ('chat_group_messages'),
  ('broadcast_messages'),
  ('piani_template'),
  ('fatture'),
  ('patient_signatures'),
  ('dietitian_push_subscriptions'),
  ('patient_specialty_access'),
  ('dietitian_todos'),
  ('liste_spesa'),
  ('pacchetti'),
  ('pacchetti_acquistati'),
  ('whatsapp_messages')
)
SELECT e.nome AS tabella_mancante
FROM expected_tables e
LEFT JOIN information_schema.tables t
  ON t.table_schema = 'public' AND t.table_name = e.nome
WHERE t.table_name IS NULL
ORDER BY 1;

-- 2) Colonne attese ma assenti (solo per tabelle che esistono)
WITH expected_cols(tabella, colonna) AS (
  VALUES
  ('patient_documents','cartella_id'),
  ('patient_documents','print_image_url'),
  ('patient_consents','signature_data_url'),
  ('piani','visible_to_patient'),
  ('ncpt','visible_to_patient'),
  ('schede_valutazione','visible_to_patient'),
  ('bia_records','visible_to_patient'),
  ('note_specialistiche','visible_to_patient'),
  ('note_specialistiche','updated_at'),
  ('piani','display_mode'),
  ('schede_valutazione','dati_extra'),
  ('daily_wellness','sleep_hours'),
  ('daily_wellness','activity'),
  ('daily_wellness','patient_id'),
  ('daily_wellness','cartella_id'),
  ('weight_logs','patient_id'),
  ('weight_logs','cartella_id'),
  ('cartelle','gdpr_consenso'),
  ('cartelle','gdpr_consenso_at'),
  ('daily_wellness','stress_level'),
  ('daily_wellness','hydration_level'),
  ('profiles','last_seen_at'),
  ('chat_group_messages','type'),
  ('chat_group_messages','status'),
  ('chat_group_messages','scheduled_at'),
  ('profiles','subscription_plan'),
  ('profiles','subscription_expires_at'),
  ('profiles','stripe_customer_id'),
  ('profiles','stripe_subscription_id'),
  ('appointments','reminder_sent_at'),
  ('fatture','aliquota_iva'),
  ('fatture','natura_iva'),
  ('fatture','codice_fiscale_paziente'),
  ('fatture','indirizzo_paziente'),
  ('fatture','cap_paziente'),
  ('fatture','comune_paziente'),
  ('fatture','provincia_paziente'),
  ('fatture','xml_generato_at'),
  ('profiles','fiscal_ragione_sociale'),
  ('profiles','fiscal_codice_fiscale'),
  ('profiles','fiscal_partita_iva'),
  ('profiles','fiscal_regime'),
  ('profiles','fiscal_indirizzo'),
  ('profiles','fiscal_cap'),
  ('profiles','fiscal_comune'),
  ('profiles','fiscal_provincia'),
  ('profiles','fiscal_progressivo_invio'),
  ('appointments','patient_reminder_sent_at'),
  ('chat_messages','type'),
  ('chat_messages','status'),
  ('chat_messages','scheduled_at'),
  ('profiles','fic_api_token'),
  ('profiles','fic_company_id'),
  ('fatture','sdi_inviato_at'),
  ('fatture','fic_document_id'),
  ('fatture','scadenza'),
  ('fatture','overdue_reminder_sent_at'),
  ('profiles','sts_api_username'),
  ('profiles','sts_api_password'),
  ('profiles','sts_username'),
  ('profiles','sts_password'),
  ('profiles','sts_pincode'),
  ('profiles','sts_erogatore_registrato'),
  ('fatture','sts_stato'),
  ('fatture','sts_protocollo'),
  ('fatture','sts_messaggio'),
  ('fatture','sts_inviato_at'),
  ('profiles','wa_phone_number_id'),
  ('profiles','wa_access_token'),
  ('profiles','wa_business_account_id'),
  ('profiles','wa_webhook_verify_token'),
  ('profiles','wa_app_secret'),
  ('profiles','wa_template_name'),
  ('profiles','wa_template_lang'),
  ('cartelle','telefono')
)
SELECT e.tabella, e.colonna AS colonna_mancante
FROM expected_cols e
JOIN information_schema.tables t
  ON t.table_schema = 'public' AND t.table_name = e.tabella
LEFT JOIN information_schema.columns c
  ON c.table_schema = 'public' AND c.table_name = e.tabella AND c.column_name = e.colonna
WHERE c.column_name IS NULL
ORDER BY 1, 2;
