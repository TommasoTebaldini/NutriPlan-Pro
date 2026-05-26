-- ═══════════════════════════════════════════════════════════════
-- Migration 002: Indici per scalabilità + pulizia Realtime
-- Eseguire in: Supabase Dashboard → SQL Editor
-- Idempotente: sicuro da rieseguire.
-- ═══════════════════════════════════════════════════════════════

-- ────────────────────────────────────────────────────────────────
-- TABELLE NUTRIPLAN-PRO (sito dietisti)
-- ────────────────────────────────────────────────────────────────

-- chat_messages: storia chat paginata per paziente
CREATE INDEX IF NOT EXISTS idx_chat_messages_patient_created
  ON chat_messages(patient_id, created_at DESC);

-- daily_wellness: lettura diario paziente da dietista (cartella_id) e dal paziente (patient_id)
CREATE INDEX IF NOT EXISTS idx_daily_wellness_patient_date
  ON daily_wellness(patient_id, logged_at DESC);
CREATE INDEX IF NOT EXISTS idx_daily_wellness_cartella_date
  ON daily_wellness(cartella_id, logged_at DESC);

-- weight_logs: idem
CREATE INDEX IF NOT EXISTS idx_weight_logs_patient_date
  ON weight_logs(patient_id, logged_at DESC);
CREATE INDEX IF NOT EXISTS idx_weight_logs_cartella_date
  ON weight_logs(cartella_id, logged_at DESC);

-- patient_documents: documenti visibili per paziente
CREATE INDEX IF NOT EXISTS idx_patient_documents_patient_created
  ON patient_documents(patient_id, created_at DESC);

-- piani clinici: tutti consultati per cartella
CREATE INDEX IF NOT EXISTS idx_piani_cartella_created
  ON piani(cartella_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ncpt_cartella_created
  ON ncpt(cartella_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bia_records_cartella_created
  ON bia_records(cartella_id, created_at DESC);

-- ────────────────────────────────────────────────────────────────
-- TABELLE APP PAZIENTI (Diet-Plan-Pro — stesso progetto Supabase)
-- ────────────────────────────────────────────────────────────────

-- food_logs: query giornaliera più frequente dell'app
CREATE INDEX IF NOT EXISTS idx_food_logs_user_date
  ON food_logs(user_id, date DESC);

-- food_logs: ricerca per nome alimento recente (searchRecentFoods usa ILIKE)
CREATE INDEX IF NOT EXISTS idx_food_logs_user_foodname
  ON food_logs(user_id, food_name text_pattern_ops);

-- water_logs: registro acqua giornaliero
CREATE INDEX IF NOT EXISTS idx_water_logs_user_date
  ON water_logs(user_id, date DESC);

-- daily_wellness (lato app paziente usa user_id + date)
CREATE INDEX IF NOT EXISTS idx_daily_wellness_user_date
  ON daily_wellness(user_id, date DESC);

-- weight_logs (lato app paziente usa user_id + date)
CREATE INDEX IF NOT EXISTS idx_weight_logs_user_date
  ON weight_logs(user_id, date DESC);

-- appointments: prossime visite per paziente
CREATE INDEX IF NOT EXISTS idx_appointments_patient_date
  ON appointments(patient_id, appointment_date DESC);

-- activity_logs: storico attività fisica
CREATE INDEX IF NOT EXISTS idx_activity_logs_user_date
  ON activity_logs(user_id, date DESC);

-- ricette: ricerca per utente
CREATE INDEX IF NOT EXISTS idx_ricette_user_created
  ON ricette(user_id, created_at DESC);

-- ────────────────────────────────────────────────────────────────
-- PULIZIA REALTIME: rimuovere tabelle non subscribed attivamente
-- Tenere solo chat_messages e patient_documents (usati da NotificationContext)
-- ────────────────────────────────────────────────────────────────

DO $$
DECLARE t TEXT;
BEGIN
  -- Assicura che le due tabelle necessarie siano in pubblicazione
  FOREACH t IN ARRAY ARRAY['chat_messages', 'patient_documents'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE %I', t);
    END IF;
  END LOOP;

  -- Rimuove le tabelle aggiunte ma mai subscribed (overhead inutile)
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
