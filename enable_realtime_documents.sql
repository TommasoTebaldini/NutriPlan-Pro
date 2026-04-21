-- ═══════════════════════════════════════════════════════════════════
-- Migration: enable RLS and add dietitian CRUD policies for cartelle.
-- The cartelle table stores patient folders (one per patient/dietitian pair).
-- Without RLS, any authenticated user can read all dietitians' patient records.
--
-- Run this script in the Supabase SQL Editor.
-- This script is idempotent and can be re-run safely.
-- Run AFTER patient_portal_policies.sql (which adds the patient SELECT policy).
-- ═══════════════════════════════════════════════════════════════════

-- 1. Enable RLS (no-op if already enabled)
ALTER TABLE cartelle ENABLE ROW LEVEL SECURITY;

-- 2. Dietitian: full access to their own cartelle
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'cartelle_dietitian_all' AND tablename = 'cartelle') THEN
    CREATE POLICY "cartelle_dietitian_all" ON cartelle
      FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

-- Note: the patient SELECT policy ("cartelle_select_linked_patient") is created by
-- patient_portal_policies.sql and allows linked patients to read their own cartella.
-- Run that migration too if not already done.
