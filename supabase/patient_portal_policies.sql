-- ═══════════════════════════════════════════════════════════════════
-- PATIENT PORTAL — RLS policies for patient access to shared documents
-- Run this script in the Supabase SQL Editor to enable patients to
-- view documents their dietitian has marked as visible.
-- ═══════════════════════════════════════════════════════════════════

-- ─── Helper function: check if current user is a linked patient for a given cartella ──
CREATE OR REPLACE FUNCTION is_linked_patient(cart_id UUID)
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM patient_dietitian
    WHERE patient_id = auth.uid() AND cartella_id = cart_id
  );
$$;

GRANT EXECUTE ON FUNCTION is_linked_patient(UUID) TO authenticated, anon;

-- ─── Profiles: allow dietitians to read profiles of their linked patients ──
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'profiles_select_linked_patients' AND tablename = 'profiles') THEN
    CREATE POLICY "profiles_select_linked_patients" ON profiles
      FOR SELECT USING (
        EXISTS (
          SELECT 1 FROM patient_dietitian
          WHERE patient_dietitian.patient_id = profiles.id
            AND patient_dietitian.dietitian_id = auth.uid()
        )
      );
  END IF;
END $$;

-- ─── Profiles: allow patients to read profiles of their linked dietitians ──
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'profiles_select_linked_dietitians' AND tablename = 'profiles') THEN
    CREATE POLICY "profiles_select_linked_dietitians" ON profiles
      FOR SELECT USING (
        EXISTS (
          SELECT 1 FROM patient_dietitian
          WHERE patient_dietitian.dietitian_id = profiles.id
            AND patient_dietitian.patient_id = auth.uid()
        )
      );
  END IF;
END $$;

-- ─── Cartelle: patients can read their linked cartelle ──
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'cartelle_select_linked_patient' AND tablename = 'cartelle') THEN
    CREATE POLICY "cartelle_select_linked_patient" ON cartelle
      FOR SELECT USING (is_linked_patient(id));
  END IF;
END $$;

-- ─── Piani: patients can read visible plans from their linked cartelle ──
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'piani_select_patient_visible' AND tablename = 'piani') THEN
    CREATE POLICY "piani_select_patient_visible" ON piani
      FOR SELECT USING (
        visible_to_patient = TRUE AND is_linked_patient(cartella_id)
      );
  END IF;
END $$;

-- ─── NCPt: patients can read visible NCPt from their linked cartelle ──
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'ncpt_select_patient_visible' AND tablename = 'ncpt') THEN
    CREATE POLICY "ncpt_select_patient_visible" ON ncpt
      FOR SELECT USING (
        visible_to_patient = TRUE AND is_linked_patient(cartella_id)
      );
  END IF;
END $$;

-- ─── BIA Records: patients can read visible BIA records from their linked cartelle ──
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'bia_records_select_patient_visible' AND tablename = 'bia_records') THEN
    CREATE POLICY "bia_records_select_patient_visible" ON bia_records
      FOR SELECT USING (
        visible_to_patient = TRUE AND is_linked_patient(cartella_id)
      );
  END IF;
END $$;

-- ─── Schede Valutazione: patients can read visible evaluation sheets from their linked cartelle ──
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'schede_valutazione_select_patient_visible' AND tablename = 'schede_valutazione') THEN
    CREATE POLICY "schede_valutazione_select_patient_visible" ON schede_valutazione
      FOR SELECT USING (
        visible_to_patient = TRUE AND is_linked_patient(cartella_id)
      );
  END IF;
END $$;

-- ─── Note Specialistiche: patients can read visible specialist notes from their linked cartelle ──
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'note_specialistiche_select_patient_visible' AND tablename = 'note_specialistiche') THEN
    CREATE POLICY "note_specialistiche_select_patient_visible" ON note_specialistiche
      FOR SELECT USING (
        visible_to_patient = TRUE AND is_linked_patient(cartella_id)
      );
  END IF;
END $$;

-- ─── Patient Documents: patients can read visible documents from their linked cartelle ──
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'patient_documents_select_patient_visible' AND tablename = 'patient_documents') THEN
    CREATE POLICY "patient_documents_select_patient_visible" ON patient_documents
      FOR SELECT USING (
        visible = TRUE AND is_linked_patient(cartella_id)
      );
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════════
-- NOTE: Run this script AFTER add_visible_to_patient.sql and
-- patient_dietitian.sql have been executed. This script is
-- idempotent and can be re-run safely.
-- ═══════════════════════════════════════════════════════════════════
