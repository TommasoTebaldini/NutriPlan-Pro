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
  created    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

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
