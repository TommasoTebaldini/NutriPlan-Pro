-- ═══════════════════════════════════════════════════════════════════
-- Patient Portal RLS Policies — v2
-- IMPORTANT: the original patient_portal_policies.sql was accidentally
-- overwritten with ECM course data and contains no patient policies.
-- Run this script in the Supabase SQL Editor to restore patient access.
--
-- What this does:
--   • patient_dietitian  → patient reads their own rows
--   • cartelle           → patient reads cartelle they are linked to
--   • piani              → patient reads visible plans in linked cartelle
--   • ncpt               → patient reads visible NCPt in linked cartelle
--   • bia_records        → patient reads visible BIA in linked cartelle
--   • schede_valutazione → patient reads visible valutazioni
--   • note_specialistiche→ patient reads visible specialist notes
--   • patient_documents  → patient reads visible documents
--
-- This script is idempotent and can be re-run safely.
-- ═══════════════════════════════════════════════════════════════════

-- ─── patient_dietitian ───────────────────────────────────────────────
ALTER TABLE patient_dietitian ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'patient_dietitian_patient_select' AND tablename = 'patient_dietitian') THEN
    CREATE POLICY "patient_dietitian_patient_select" ON patient_dietitian
      FOR SELECT USING (auth.uid() = patient_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'patient_dietitian_dietitian_all' AND tablename = 'patient_dietitian') THEN
    CREATE POLICY "patient_dietitian_dietitian_all" ON patient_dietitian
      FOR ALL USING (auth.uid() = dietitian_id)
      WITH CHECK (auth.uid() = dietitian_id);
  END IF;
END $$;

-- ─── cartelle ────────────────────────────────────────────────────────
-- (dietitian policy is in cartelle_rls.sql / enable_realtime_documents.sql)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'cartelle_select_linked_patient' AND tablename = 'cartelle') THEN
    CREATE POLICY "cartelle_select_linked_patient" ON cartelle
      FOR SELECT USING (
        id IN (
          SELECT cartella_id FROM patient_dietitian WHERE patient_id = auth.uid()
        )
      );
  END IF;
END $$;

-- ─── piani ───────────────────────────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'piani_patient_select' AND tablename = 'piani') THEN
    CREATE POLICY "piani_patient_select" ON piani
      FOR SELECT USING (
        visible_to_patient = TRUE
        AND cartella_id IN (
          SELECT cartella_id FROM patient_dietitian WHERE patient_id = auth.uid()
        )
      );
  END IF;
END $$;

-- ─── ncpt ────────────────────────────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'ncpt_patient_select' AND tablename = 'ncpt') THEN
    CREATE POLICY "ncpt_patient_select" ON ncpt
      FOR SELECT USING (
        visible_to_patient = TRUE
        AND cartella_id IN (
          SELECT cartella_id FROM patient_dietitian WHERE patient_id = auth.uid()
        )
      );
  END IF;
END $$;

-- ─── bia_records ─────────────────────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'bia_records_patient_select' AND tablename = 'bia_records') THEN
    CREATE POLICY "bia_records_patient_select" ON bia_records
      FOR SELECT USING (
        visible_to_patient = TRUE
        AND cartella_id IN (
          SELECT cartella_id FROM patient_dietitian WHERE patient_id = auth.uid()
        )
      );
  END IF;
END $$;

-- ─── schede_valutazione ──────────────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'schede_valutazione_patient_select' AND tablename = 'schede_valutazione') THEN
    CREATE POLICY "schede_valutazione_patient_select" ON schede_valutazione
      FOR SELECT USING (
        visible_to_patient = TRUE
        AND cartella_id IN (
          SELECT cartella_id FROM patient_dietitian WHERE patient_id = auth.uid()
        )
      );
  END IF;
END $$;

-- ─── note_specialistiche ─────────────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'note_specialistiche_patient_select' AND tablename = 'note_specialistiche') THEN
    CREATE POLICY "note_specialistiche_patient_select" ON note_specialistiche
      FOR SELECT USING (
        visible_to_patient = TRUE
        AND cartella_id IN (
          SELECT cartella_id FROM patient_dietitian WHERE patient_id = auth.uid()
        )
      );
  END IF;
END $$;

-- ─── patient_documents ───────────────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'patient_documents_patient_select' AND tablename = 'patient_documents') THEN
    CREATE POLICY "patient_documents_patient_select" ON patient_documents
      FOR SELECT USING (
        visible = TRUE
        AND cartella_id IN (
          SELECT cartella_id FROM patient_dietitian WHERE patient_id = auth.uid()
        )
      );
  END IF;
END $$;
