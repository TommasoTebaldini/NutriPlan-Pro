-- ============================================================================
-- Cosa fa: crea la tabella diario_alimentare_foto, usata da pazienti.html
--   (sezione "Diario Alimentare Fotografico" nella cartella paziente) per
--   salvare le foto del diario alimentare cartaceo/dei pasti del paziente
--   caricate dal dietista, insieme al risultato dell'analisi AI (alimenti
--   riconosciuti, macro e micronutrienti stimati) e a una nota clinica
--   libera del dietista.
-- Perché: richiesta esplicita dell'utente — il dietista carica una foto del
--   diario, l'app calcola in automatico macro/micro tramite una nuova Edge
--   Function (analyze-food-diary, stesso pattern di analyze-meal già usata
--   dall'app paziente per le foto pasto, ma con prompt esteso ai
--   micronutrienti per uso clinico) e il dietista può vederli e analizzarli.
-- Data: 2026-07-24
-- ============================================================================

CREATE TABLE IF NOT EXISTS diario_alimentare_foto (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  cartella_id   UUID        NOT NULL REFERENCES cartelle(id) ON DELETE CASCADE,
  user_id       UUID        NOT NULL REFERENCES auth.users(id),
  storage_path  TEXT        NOT NULL,
  data_diario   DATE        NOT NULL DEFAULT CURRENT_DATE,
  ai_description TEXT,
  ai_confidence TEXT,
  foods         JSONB       NOT NULL DEFAULT '[]'::jsonb,
  totali        JSONB,
  note          TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_diario_alimentare_foto_cartella ON diario_alimentare_foto(cartella_id, data_diario DESC);

ALTER TABLE diario_alimentare_foto ENABLE ROW LEVEL SECURITY;

-- Stesso modello di bia_records/esami_biochimici/patient_files: la riga
-- appartiene al dietista che l'ha caricata (user_id), nessuna condivisione
-- diretta con colleghi di studio per questa tabella.
DROP POLICY IF EXISTS "diario_alimentare_foto_owner_all" ON diario_alimentare_foto;
CREATE POLICY "diario_alimentare_foto_owner_all" ON diario_alimentare_foto
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
