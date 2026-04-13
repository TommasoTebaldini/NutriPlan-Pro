-- ═══════════════════════════════════════════════════════════════════
-- Migration: enable Supabase Realtime for patient-portal document tables.
-- Run this script in the Supabase SQL Editor so that the patient portal
-- receives live updates (INSERT / UPDATE / DELETE) from the dietitian app,
-- mirroring the behaviour already in place for chat_messages.
--
-- REPLICA IDENTITY FULL is required so that Supabase can evaluate RLS
-- policies when broadcasting change events to subscribed patients.
-- ═══════════════════════════════════════════════════════════════════

-- 1. Set REPLICA IDENTITY FULL so RLS is enforced on realtime events
ALTER TABLE patient_documents      REPLICA IDENTITY FULL;
ALTER TABLE piani                  REPLICA IDENTITY FULL;
ALTER TABLE ncpt                   REPLICA IDENTITY FULL;
ALTER TABLE bia_records            REPLICA IDENTITY FULL;
ALTER TABLE schede_valutazione     REPLICA IDENTITY FULL;
ALTER TABLE note_specialistiche    REPLICA IDENTITY FULL;

-- 2. Add each table to the supabase_realtime publication (idempotent)
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'patient_documents',
    'piani',
    'ncpt',
    'bia_records',
    'schede_valutazione',
    'note_specialistiche'
  ] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE %I', t);
    END IF;
  END LOOP;
END $$;
