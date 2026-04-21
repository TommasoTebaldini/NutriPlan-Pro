-- ═══════════════════════════════════════════════════
-- Tabella alimenti personalizzati per utente
-- Eseguire nel SQL editor di Supabase
-- ═══════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS alimenti_custom (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  nome          TEXT NOT NULL,
  categoria     TEXT,
  kcal          NUMERIC,
  proteine      NUMERIC,
  grassi_saturi NUMERIC,
  grassi_tot    NUMERIC,
  zuccheri      NUMERIC,
  carboidrati   NUMERIC,
  fibre         NUMERIC,
  calcio        NUMERIC,
  ferro         NUMERIC,
  magnesio      NUMERIC,
  potassio      NUMERIC,
  sodio         NUMERIC,
  zinco         NUMERIC,
  fosforo       NUMERIC,
  selenio       NUMERIC,
  colesterolo   NUMERIC,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Abilita RLS
ALTER TABLE alimenti_custom ENABLE ROW LEVEL SECURITY;

-- Ogni utente gestisce solo i propri alimenti
CREATE POLICY "alimenti_custom_owner"
  ON alimenti_custom
  FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
