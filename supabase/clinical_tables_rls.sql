-- ═══════════════════════════════════════════════════════════════════
-- Migration: enable RLS and add dietitian CRUD policies for clinical tables.
-- These tables already have patient-read policies (patient_portal_policies.sql)
-- but are MISSING policies that allow the dietitian to manage their own records.
-- Without these, any INSERT/UPDATE/DELETE by the dietitian is rejected by RLS.
--
-- Affected tables: piani, ncpt, bia_records, schede_valutazione, note_specialistiche
-- Owner column on all tables: user_id (= auth.uid() of the dietitian)
--
-- This script is idempotent and can be re-run safely.
-- Run AFTER the tables have been created and RLS has been enabled.
-- ═══════════════════════════════════════════════════════════════════

-- 1. Ensure RLS is enabled on every clinical table
ALTER TABLE piani                ENABLE ROW LEVEL SECURITY;
ALTER TABLE ncpt                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE bia_records          ENABLE ROW LEVEL SECURITY;
ALTER TABLE schede_valutazione   ENABLE ROW LEVEL SECURITY;
ALTER TABLE note_specialistiche  ENABLE ROW LEVEL SECURITY;

-- ─── Piani ──────────────────────────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'piani_dietitian_all' AND tablename = 'piani') THEN
    CREATE POLICY "piani_dietitian_all" ON piani
      FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

-- ─── NCPt ───────────────────────────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'ncpt_dietitian_all' AND tablename = 'ncpt') THEN
    CREATE POLICY "ncpt_dietitian_all" ON ncpt
      FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

-- ─── BIA Records ────────────────────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'bia_records_dietitian_all' AND tablename = 'bia_records') THEN
    CREATE POLICY "bia_records_dietitian_all" ON bia_records
      FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

-- ─── Schede Valutazione ─────────────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'schede_valutazione_dietitian_all' AND tablename = 'schede_valutazione') THEN
    CREATE POLICY "schede_valutazione_dietitian_all" ON schede_valutazione
      FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

-- ─── Note Specialistiche ────────────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'note_specialistiche_dietitian_all' AND tablename = 'note_specialistiche') THEN
    CREATE POLICY "note_specialistiche_dietitian_all" ON note_specialistiche
      FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;
