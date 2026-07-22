-- ============================================================================
-- Cosa fa: crea la tabella consigli_custom (mai creata in nessun file .sql del
--   repo, esisteva solo come SQL incollato dentro un console.error di
--   js/consigli-render.js). Permette al dietista di salvare consigli
--   personalizzati in consigli.html — finché non viene eseguita, ogni
--   salvataggio/modifica/eliminazione fallisce con errore 42P01 (già segnalato
--   chiaramente all'utente in UI, non un fallimento silenzioso: solo la
--   tabella mancava).
-- Perché: trovato durante un audit generale di bug richiesto dall'utente.
-- Data: 2026-07-22
-- ============================================================================

CREATE TABLE IF NOT EXISTS consigli_custom (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        REFERENCES auth.users(id) NOT NULL,
  data_id    TEXT,
  contenuto  TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE consigli_custom ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Propri consigli" ON consigli_custom;
CREATE POLICY "Propri consigli" ON consigli_custom
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
