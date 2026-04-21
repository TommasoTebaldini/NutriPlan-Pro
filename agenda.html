-- ═══════════════════════════════════════════════════════════════════
-- PATIENT_DIETITIAN — Tabella di collegamento pazienti-nutrizionisti
-- Eseguire questo script nel SQL Editor del progetto Supabase
-- per creare la tabella (se non esiste) e configurare le policy RLS
-- necessarie per collegare/scollegare i pazienti dalle cartelle.
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS patient_dietitian (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id    UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  dietitian_id  UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  cartella_id   UUID        REFERENCES cartelle(id) ON DELETE CASCADE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(patient_id, dietitian_id, cartella_id)
);

-- Indice per le query più frequenti
CREATE INDEX IF NOT EXISTS patient_dietitian_dietitian_cartella
  ON patient_dietitian (dietitian_id, cartella_id);

CREATE INDEX IF NOT EXISTS patient_dietitian_patient
  ON patient_dietitian (patient_id);

-- ─── Row Level Security ───────────────────────────────────────────────────────
ALTER TABLE patient_dietitian ENABLE ROW LEVEL SECURITY;

-- Il nutrizionista può vedere i propri collegamenti
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'patient_dietitian_select_own' AND tablename = 'patient_dietitian') THEN
    CREATE POLICY "patient_dietitian_select_own" ON patient_dietitian
      FOR SELECT USING (auth.uid() = dietitian_id OR auth.uid() = patient_id);
  END IF;
END $$;

-- Il nutrizionista può creare nuovi collegamenti
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'patient_dietitian_insert_own' AND tablename = 'patient_dietitian') THEN
    CREATE POLICY "patient_dietitian_insert_own" ON patient_dietitian
      FOR INSERT WITH CHECK (auth.uid() = dietitian_id);
  END IF;
END $$;

-- Il nutrizionista può eliminare (scollegare) i propri collegamenti
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'patient_dietitian_delete_own' AND tablename = 'patient_dietitian') THEN
    CREATE POLICY "patient_dietitian_delete_own" ON patient_dietitian
      FOR DELETE USING (auth.uid() = dietitian_id);
  END IF;
END $$;
