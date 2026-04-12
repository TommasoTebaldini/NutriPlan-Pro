-- Migration: add visible_to_patient column to clinical document tables
-- Run this script in your Supabase SQL editor.
-- Safe to re-run: uses IF NOT EXISTS and idempotent updates.

-- 1. Add columns (if missing) with DEFAULT FALSE
ALTER TABLE piani
  ADD COLUMN IF NOT EXISTS visible_to_patient BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE ncpt
  ADD COLUMN IF NOT EXISTS visible_to_patient BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE schede_valutazione
  ADD COLUMN IF NOT EXISTS visible_to_patient BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE bia_records
  ADD COLUMN IF NOT EXISTS visible_to_patient BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE note_specialistiche
  ADD COLUMN IF NOT EXISTS visible_to_patient BOOLEAN NOT NULL DEFAULT FALSE;

-- 2. Ensure DEFAULT is FALSE even if columns were previously created with a different default
ALTER TABLE piani ALTER COLUMN visible_to_patient SET DEFAULT FALSE;
ALTER TABLE ncpt ALTER COLUMN visible_to_patient SET DEFAULT FALSE;
ALTER TABLE schede_valutazione ALTER COLUMN visible_to_patient SET DEFAULT FALSE;
ALTER TABLE bia_records ALTER COLUMN visible_to_patient SET DEFAULT FALSE;
ALTER TABLE note_specialistiche ALTER COLUMN visible_to_patient SET DEFAULT FALSE;

-- 3. patient_documents uses a "visible" column (not visible_to_patient)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='patient_documents' AND column_name='visible') THEN
    ALTER TABLE patient_documents ADD COLUMN visible BOOLEAN NOT NULL DEFAULT FALSE;
  ELSE
    ALTER TABLE patient_documents ALTER COLUMN visible SET DEFAULT FALSE;
  END IF;
END $$;

-- 4. Reset ALL existing records to hidden (FALSE).
--    Documents should only be visible when the dietitian explicitly enables them.
UPDATE piani SET visible_to_patient = FALSE WHERE visible_to_patient IS DISTINCT FROM FALSE;
UPDATE ncpt SET visible_to_patient = FALSE WHERE visible_to_patient IS DISTINCT FROM FALSE;
UPDATE schede_valutazione SET visible_to_patient = FALSE WHERE visible_to_patient IS DISTINCT FROM FALSE;
UPDATE bia_records SET visible_to_patient = FALSE WHERE visible_to_patient IS DISTINCT FROM FALSE;
UPDATE note_specialistiche SET visible_to_patient = FALSE WHERE visible_to_patient IS DISTINCT FROM FALSE;
UPDATE patient_documents SET visible = FALSE WHERE visible IS DISTINCT FROM FALSE;
