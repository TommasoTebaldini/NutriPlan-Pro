-- ═══════════════════════════════════════════════════════════════
-- Migration 002: Indici per scalabilità + pulizia Realtime
-- Eseguire in: Supabase Dashboard → SQL Editor
-- Idempotente: sicuro da rieseguire.
-- ═══════════════════════════════════════════════════════════════

-- ────────────────────────────────────────────────────────────────
-- TABELLE NUTRIPLAN-PRO (sito dietisti)
-- ────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_chat_messages_patient_created
  ON chat_messages(patient_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_daily_wellness_patient_date
  ON daily_wellness(patient_id, logged_at DESC);
CREATE INDEX IF NOT EXISTS idx_daily_wellness_cartella_date
  ON daily_wellness(cartella_id, logged_at DESC);

CREATE INDEX IF NOT EXISTS idx_weight_logs_patient_date
  ON weight_logs(patient_id, logged_at DESC);
CREATE INDEX IF NOT EXISTS idx_weight_logs_cartella_date
  ON weight_logs(cartella_id, logged_at DESC);

CREATE INDEX IF NOT EXISTS idx_patient_documents_patient_created
  ON patient_documents(patient_id, created_at DESC);

-- piani usa saved_at, non created_at
CREATE INDEX IF NOT EXISTS idx_piani_cartella_saved
  ON piani(cartella_id, saved_at DESC);
CREATE INDEX IF NOT EXISTS idx_ncpt_cartella_created
  ON ncpt(cartella_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bia_records_cartella_created
  ON bia_records(cartella_id, created_at DESC);

-- ────────────────────────────────────────────────────────────────
-- TABELLE APP PAZIENTI (Diet-Plan-Pro — stesso progetto Supabase)
-- ────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_food_logs_user_date
  ON food_logs(user_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_food_logs_user_foodname
  ON food_logs(user_id, food_name text_pattern_ops);

CREATE INDEX IF NOT EXISTS idx_water_logs_user_date
  ON water_logs(user_id, date DESC);

CREATE INDEX IF NOT EXISTS idx_daily_wellness_user_date
  ON daily_wellness(user_id, date DESC);

CREATE INDEX IF NOT EXISTS idx_weight_logs_user_date
  ON weight_logs(user_id, date DESC);

CREATE INDEX IF NOT EXISTS idx_appointments_patient_date
  ON appointments(patient_id, appointment_date DESC);

CREATE INDEX IF NOT EXISTS idx_activity_logs_user_date
  ON activity_logs(user_id, date DESC);

CREATE INDEX IF NOT EXISTS idx_ricette_user_created
  ON ricette(user_id, created_at DESC);

-- ────────────────────────────────────────────────────────────────
-- PULIZIA REALTIME: tenere solo le 2 tabelle usate da NotificationContext
-- ────────────────────────────────────────────────────────────────

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['chat_messages', 'patient_documents'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE %I', t);
    END IF;
  END LOOP;

  FOREACH t IN ARRAY ARRAY[
    'piani', 'ncpt', 'bia_records', 'schede_valutazione',
    'note_specialistiche', 'daily_wellness', 'weight_logs', 'agenda_events'
  ] LOOP
    IF EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime DROP TABLE %I', t);
    END IF;
  END LOOP;
END $$;
