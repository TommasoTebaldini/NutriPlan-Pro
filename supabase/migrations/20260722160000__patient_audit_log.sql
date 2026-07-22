-- ============================================================================
-- Cosa fa: crea la tabella patient_audit_log, usata da pazienti.html per
--   registrare le azioni del dietista su una cartella paziente (es. modifica
--   profilo). logAuditEvent()/loadAuditLog() esistevano già nel codice ma
--   scrivevano/leggevano su una tabella che non è mai stata creata — la
--   scrittura falliva silenziosamente (catch che fa solo console.warn), la
--   lettura era già gestita con un messaggio di fallback "tabella mancante"
--   (che mostrava proprio questo CREATE TABLE). Quindi l'audit trail non ha
--   mai registrato un solo evento da quando la feature esiste.
-- Perché: trovato durante un audit generale di bug richiesto dall'utente
--   (stesso pattern "scritto lato client, mai completato lato DB" già visto
--   più volte in questo repo — fatture/piani_template/patient_signatures).
-- Data: 2026-07-22
-- ============================================================================

CREATE TABLE IF NOT EXISTS patient_audit_log (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id   UUID        REFERENCES cartelle(id) ON DELETE CASCADE,
  dietitian_id UUID        REFERENCES auth.users(id),
  action       TEXT        NOT NULL,
  details      JSONB,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_patient_audit_log_patient ON patient_audit_log(patient_id, created_at DESC);

ALTER TABLE patient_audit_log ENABLE ROW LEVEL SECURITY;

-- Stesso modello di note_specialistiche/schede_valutazione: la riga appartiene
-- al dietista che l'ha scritta (dietitian_id), nessuna condivisione con
-- colleghi/paziente per questo log (a differenza di clinical_audit_log, che è
-- il log automatico via trigger e ha una policy di trasparenza per il paziente
-- — questo è un log applicativo manuale, scope più ristretto per ora).
DROP POLICY IF EXISTS "patient_audit_log_dietitian_all" ON patient_audit_log;
CREATE POLICY "patient_audit_log_dietitian_all" ON patient_audit_log
  FOR ALL USING (auth.uid() = dietitian_id) WITH CHECK (auth.uid() = dietitian_id);
