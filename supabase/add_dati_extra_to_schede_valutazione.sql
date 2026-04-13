-- Migration: add dati_extra jsonb column to schede_valutazione
-- Run this script in your Supabase SQL editor if you see the error:
--   "Could not find the 'dati_extra' column of 'schede_valutazione' in the schema cache"

ALTER TABLE schede_valutazione
  ADD COLUMN IF NOT EXISTS dati_extra jsonb;
