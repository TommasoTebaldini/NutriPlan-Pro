-- ═══════════════════════════════════════════════════════════════════
-- AGENDA EVENTS — Tabella per gli appuntamenti dell'agenda
-- Eseguire questo script nel SQL Editor del progetto Supabase
-- Richiesta anche per il feed iCalendar live: /api/calendar?uid=<uuid>
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS agenda_events (
  id         TEXT        PRIMARY KEY,               -- 'ev_<timestamp>'
  user_id    UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  paziente   TEXT,                                  -- nome paziente o titolo evento
  titolo     TEXT,                                  -- titolo alternativo
  data       DATE        NOT NULL,                  -- YYYY-MM-DD
  ora        TEXT        NOT NULL DEFAULT '09:00',  -- HH:MM
  tipo       TEXT        NOT NULL DEFAULT 'visita'
               CHECK (tipo IN ('visita','controllo','reminder','urgente')),
  durata     INTEGER     NOT NULL DEFAULT 60,       -- minuti
  note       TEXT,
  created    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()     -- aggiornato automaticamente dal trigger
);

-- Aggiorna updated_at automaticamente ad ogni modifica della riga
-- (usato da LAST-MODIFIED nel feed iCal per segnalare le modifiche ai client)
CREATE OR REPLACE FUNCTION agenda_events_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_agenda_events_updated_at ON agenda_events;
CREATE TRIGGER trg_agenda_events_updated_at
  BEFORE UPDATE ON agenda_events
  FOR EACH ROW EXECUTE FUNCTION agenda_events_set_updated_at();

-- Aggiunge la colonna updated_at se la tabella esiste già senza di essa
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'agenda_events' AND column_name = 'updated_at'
  ) THEN
    ALTER TABLE agenda_events ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
  END IF;
END;
$$;

-- Indice per query per utente e data (usato dal feed iCal e dalla pagina)
CREATE INDEX IF NOT EXISTS agenda_events_user_data
  ON agenda_events (user_id, data ASC, ora ASC);

-- ─── Row Level Security ───────────────────────────────────────────────────────
ALTER TABLE agenda_events ENABLE ROW LEVEL SECURITY;

-- Ogni utente può leggere solo i propri appuntamenti
CREATE POLICY "agenda_events_select_own" ON agenda_events
  FOR SELECT USING (auth.uid() = user_id);

-- Ogni utente può inserire/aggiornare solo i propri appuntamenti
CREATE POLICY "agenda_events_upsert_own" ON agenda_events
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "agenda_events_update_own" ON agenda_events
  FOR UPDATE USING (auth.uid() = user_id);

-- Ogni utente può eliminare solo i propri appuntamenti
CREATE POLICY "agenda_events_delete_own" ON agenda_events
  FOR DELETE USING (auth.uid() = user_id);

-- ─── Accesso service-role per il feed iCal (/api/calendar) ───────────────────
-- Il feed iCal (/api/calendar) legge gli eventi lato server usando
-- SUPABASE_SERVICE_KEY, che bypassa RLS per poter accedere agli eventi
-- dell'utente specificato nel parametro ?uid=.
-- Non impostare SUPABASE_ANON_KEY come fallback per questo endpoint:
-- la anon key non può bypassare RLS e la query restituirebbe 0 risultati.

-- ─── Fallback con anon key: funzione SECURITY DEFINER ─────────────────────────
-- Quando SUPABASE_SERVICE_KEY non è configurata, /api/calendar chiama questa
-- funzione RPC con la anon key pubblica.  Poiché la funzione è SECURITY DEFINER
-- esegue con i permessi del proprietario (che può leggere tutti i record) e
-- applica il filtro user_id internamente, restituendo solo gli eventi
-- dell'utente richiesto.  Il parametro p_user_id (UUID v4) agisce da token
-- di accesso al feed, esattamente come i "share link" di Google Calendar.
CREATE OR REPLACE FUNCTION get_user_agenda_events(p_user_id UUID)
RETURNS SETOF agenda_events
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT * FROM agenda_events
  WHERE user_id = p_user_id
  ORDER BY data ASC, ora ASC;
$$;

-- Concedi l'esecuzione alla anon role (chiamata senza autenticazione)
GRANT EXECUTE ON FUNCTION get_user_agenda_events(UUID) TO anon;

-- ─── Realtime ────────────────────────────────────────────────────────────────
-- Abilitare la replica Realtime per questa tabella nel pannello Supabase
-- (Database → Replication → agenda_events) oppure eseguire:
ALTER PUBLICATION supabase_realtime ADD TABLE agenda_events;
