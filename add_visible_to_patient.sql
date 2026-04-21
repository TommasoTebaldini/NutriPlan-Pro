-- ═══════════════════════════════════════════════════════════════════
-- CARTELLE — Aggiunta colonna codice_fiscale
-- Eseguire questo script nel SQL Editor del progetto Supabase
-- ═══════════════════════════════════════════════════════════════════

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'cartelle' AND column_name = 'codice_fiscale'
  ) THEN
    ALTER TABLE cartelle ADD COLUMN codice_fiscale TEXT;
  END IF;
END;
$$;
