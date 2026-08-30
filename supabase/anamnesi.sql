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

-- NOTA DI SICUREZZA: qui c'erano due policy "Public read/update by token"
-- con USING(true) — cioè leggibili/scrivibili da CHIUNQUE, non solo da chi
-- possiede il token, perché RLS valuta la singola riga e non può verificare
-- da sola che il chiamante conosca il token della RIGA richiesta (questo va
-- fatto lato applicazione). Con più policy permissive sullo stesso comando
-- (SELECT/UPDATE), Postgres le unisce in OR: bastava questa da sola per
-- rendere leggibile/scrivibile qualunque anamnesi di qualunque paziente a
-- chiunque avesse anche solo la anon key pubblica, aggirando completamente
-- "Dietitian manages own intake forms" sopra.
--
-- Rimosse: nessun codice client usa oggi l'accesso anonimo via token (il
-- link generato da anamnesi.html punta a PATIENT_APP_URL/anamnesi?token=...,
-- ma quella pagina non esiste ancora nell'app pazienti — vedi generaLink()/
-- copyLink() in anamnesi.html). Se in futuro si implementa la compilazione
-- via link, il modo sicuro è una funzione SECURITY DEFINER tipo
-- get_intake_form_by_token(p_token text)/submit_intake_form_by_token(...)
-- che confronta esplicitamente il token passato con quello della riga,
-- con EXECUTE revocato da anon salvo quanto serve — MAI una policy RLS
-- USING(true) sulla tabella.
