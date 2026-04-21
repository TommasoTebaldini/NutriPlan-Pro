-- ═══════════════════════════════════════════════════════════════════
-- Migration: ensure patient_documents table exists with all required columns.
-- Run this script in the Supabase SQL Editor BEFORE running
-- patient_portal_policies.sql.
-- This script is idempotent and can be re-run safely.
-- ═══════════════════════════════════════════════════════════════════

-- 1. Create the table if it doesn't exist yet
CREATE TABLE IF NOT EXISTS patient_documents (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  cartella_id UUID REFERENCES cartelle(id) ON DELETE CASCADE,
  dietitian_id UUID REFERENCES auth.users NOT NULL,
  title       TEXT,
  type        TEXT,
  content     TEXT,
  file_url    TEXT,
  file_name   TEXT,
  tags        TEXT[] DEFAULT '{}',
  visible     BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

-- 2. If the table already exists but is missing cartella_id, add it
ALTER TABLE patient_documents
  ADD COLUMN IF NOT EXISTS cartella_id UUID REFERENCES cartelle(id) ON DELETE CASCADE;

-- 3. Enable RLS
ALTER TABLE patient_documents ENABLE ROW LEVEL SECURITY;

-- 4. Dietitian policy: dietitians can manage their own documents
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Own documents' AND tablename = 'patient_documents') THEN
    CREATE POLICY "Own documents" ON patient_documents
      FOR ALL USING (auth.uid() = dietitian_id);
  END IF;
END $$;
