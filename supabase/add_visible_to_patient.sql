-- Migration: add visible_to_patient column to clinical document tables
-- Run this script once in your Supabase SQL editor.

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

-- patient_documents uses a "visible" column (not visible_to_patient)
-- Ensure it defaults to FALSE so documents are hidden until the dietitian enables them.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='patient_documents' AND column_name='visible') THEN
    ALTER TABLE patient_documents ADD COLUMN visible BOOLEAN NOT NULL DEFAULT FALSE;
  ELSE
    ALTER TABLE patient_documents ALTER COLUMN visible SET DEFAULT FALSE;
  END IF;
END $$;

-- Fix any existing records that may have NULL or TRUE visibility
UPDATE patient_documents SET visible = FALSE WHERE visible IS NULL;
UPDATE piani SET visible_to_patient = FALSE WHERE visible_to_patient IS NULL;
UPDATE ncpt SET visible_to_patient = FALSE WHERE visible_to_patient IS NULL;
UPDATE schede_valutazione SET visible_to_patient = FALSE WHERE visible_to_patient IS NULL;
UPDATE bia_records SET visible_to_patient = FALSE WHERE visible_to_patient IS NULL;
UPDATE note_specialistiche SET visible_to_patient = FALSE WHERE visible_to_patient IS NULL;
