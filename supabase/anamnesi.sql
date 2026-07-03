-- Tabella per i questionari di anamnesi digitale
-- Esegui questo SQL nel pannello Supabase SQL Editor

CREATE TABLE IF NOT EXISTS patient_intake_forms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dietitian_id uuid REFERENCES auth.users NOT NULL,
  patient_id uuid REFERENCES auth.users,
  token text UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(16), 'hex'),
  status text DEFAULT 'pending',          -- 'pending' | 'completed'
  patient_email text,
  patient_name text,
  sections jsonb DEFAULT '["storia_alimentare","allergie","obiettivi","anamnesi_medica","stile_vita","motivazioni"]'::jsonb,
  responses jsonb,
  created_at timestamptz DEFAULT now(),
  completed_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_intake_dietitian ON patient_intake_forms(dietitian_id);
CREATE INDEX IF NOT EXISTS idx_intake_token ON patient_intake_forms(token);

-- RLS: il dietista vede solo le sue anamnesi
ALTER TABLE patient_intake_forms ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Dietitian manages own intake forms"
  ON patient_intake_forms
  FOR ALL
  USING (dietitian_id = auth.uid());

-- Il paziente può compilare via token (accesso anonimo tramite token)
CREATE POLICY "Public read by token"
  ON patient_intake_forms
  FOR SELECT
  USING (true);

CREATE POLICY "Public update responses by token"
  ON patient_intake_forms
  FOR UPDATE
  USING (true)
  WITH CHECK (true);
