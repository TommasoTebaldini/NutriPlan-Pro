-- ═══════════════════════════════════════════════════════════════════
-- patient_consents — Modulo Privacy GDPR
-- Run this script in the Supabase SQL Editor.
-- Idempotent: safe to re-run.
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS patient_consents (
  id                 uuid          DEFAULT gen_random_uuid() PRIMARY KEY,
  cartella_id        uuid          REFERENCES cartelle(id) ON DELETE CASCADE,
  dietitian_id       uuid          NOT NULL REFERENCES auth.users,
  patient_id         uuid          REFERENCES auth.users,
  consent_version    text          DEFAULT '1.0',
  consent_text       text,
  visible_to_patient boolean       DEFAULT true,
  signed_at          timestamptz,
  sign_method        text          DEFAULT 'digital_checkbox',
  created_at         timestamptz   DEFAULT now(),
  updated_at         timestamptz   DEFAULT now()
);

ALTER TABLE patient_consents ENABLE ROW LEVEL SECURITY;

-- Dietitian: full access to consents they created
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'patient_consents_dietitian_all' AND tablename = 'patient_consents') THEN
    CREATE POLICY "patient_consents_dietitian_all" ON patient_consents
      FOR ALL USING (auth.uid() = dietitian_id)
      WITH CHECK (auth.uid() = dietitian_id);
  END IF;
END $$;

-- Patient: read visible consents linked to their cartelle
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'patient_consents_patient_select' AND tablename = 'patient_consents') THEN
    CREATE POLICY "patient_consents_patient_select" ON patient_consents
      FOR SELECT USING (
        visible_to_patient = TRUE
        AND cartella_id IN (
          SELECT cartella_id FROM patient_dietitian WHERE patient_id = auth.uid()
        )
      );
  END IF;
END $$;

-- Patient: update only signed_at and sign_method (i.e. sign the consent)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'patient_consents_patient_update_sign' AND tablename = 'patient_consents') THEN
    CREATE POLICY "patient_consents_patient_update_sign" ON patient_consents
      FOR UPDATE USING (
        cartella_id IN (
          SELECT cartella_id FROM patient_dietitian WHERE patient_id = auth.uid()
        )
      )
      WITH CHECK (
        cartella_id IN (
          SELECT cartella_id FROM patient_dietitian WHERE patient_id = auth.uid()
        )
      );
  END IF;
END $$;

-- Auto-update updated_at on row change
CREATE OR REPLACE FUNCTION patient_consents_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_patient_consents_updated_at') THEN
    CREATE TRIGGER trg_patient_consents_updated_at
      BEFORE UPDATE ON patient_consents
      FOR EACH ROW EXECUTE FUNCTION patient_consents_set_updated_at();
  END IF;
END $$;
