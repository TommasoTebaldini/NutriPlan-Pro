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
