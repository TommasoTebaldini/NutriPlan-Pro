-- ============================================================================
-- Cosa fa: blinda la 2FA a livello di database (RLS). Se un utente HA un
--   secondo fattore (TOTP) verificato, può accedere ai dati clinici SOLO da
--   una sessione che ha completato il secondo fattore (aal2). Chi NON ha la
--   2FA (tutti i pazienti + i dietisti che non l'hanno attivata) NON è
--   toccato: continua ad accedere come prima.
-- Perché: finora la 2FA era imposta solo al login; una sessione già valida che
--   aggirasse il prompt poteva comunque leggere i dati. Questo la rende un vero
--   perimetro anche a livello dati (difesa in profondità su dati sanitari).
-- Data: 2026-07-21
--
-- ⚠️ NON DISTRUTTIVO E REVERSIBILE: usa policy RESTRICTIVE separate, che si
--    SOMMANO (AND) alle policy esistenti senza modificarle. Per annullare tutto
--    basta la sezione "ESCAPE HATCH" in fondo (droppa le policy + la funzione).
--
-- 🆘 SE TI BLOCCHI FUORI (es. hai la 2FA attiva e non riesci più ad accedere):
--    esegui nel SQL Editor le righe della sezione ESCAPE HATCH qui sotto e
--    torni immediatamente allo stato precedente.
-- ============================================================================

-- Helper: TRUE se l'utente può accedere ai dati clinici in questa sessione.
--   - aal2 (secondo fattore completato) → sempre TRUE
--   - nessun fattore TOTP verificato (2FA non attiva) → TRUE (non forziamo)
--   - service_role / SQL editor (auth.uid() nullo) → TRUE (non intralcia i cron)
-- SECURITY DEFINER per poter leggere auth.mfa_factors indipendentemente dalle
-- RLS dello schema auth.
CREATE OR REPLACE FUNCTION public.mfa_ok()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT
    COALESCE(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
    OR NOT EXISTS (
      SELECT 1 FROM auth.mfa_factors
      WHERE user_id = auth.uid() AND status = 'verified'
    );
$$;

-- Applica la regola restrittiva a tutte le tabelle con dati clinici/sensibili.
-- Un blocco DO che cicla la lista: aggiunge (o rimpiazza) una sola policy
-- RESTRICTIVE "mfa_required" per tabella, valida per ogni comando.
DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'cartelle', 'esami_biochimici', 'note_specialistiche', 'bia_records',
    'schede_valutazione', 'ncpt', 'patient_documents', 'patient_consents',
    'patient_signatures', 'patient_files', 'chat_messages', 'piani',
    'daily_wellness', 'weight_logs', 'menstrual_cycle', 'fatture',
    'liste_spesa', 'patient_specialty_access'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    -- salta le tabelle non ancora esistenti sul DB (fault-tolerant)
    IF EXISTS (SELECT 1 FROM information_schema.tables
               WHERE table_schema = 'public' AND table_name = t) THEN
      EXECUTE format('DROP POLICY IF EXISTS "mfa_required" ON public.%I', t);
      EXECUTE format(
        'CREATE POLICY "mfa_required" ON public.%I AS RESTRICTIVE FOR ALL '
        'USING (public.mfa_ok()) WITH CHECK (public.mfa_ok())', t);
    END IF;
  END LOOP;
END $$;

-- ============================================================================
-- 🆘 ESCAPE HATCH — esegui SOLO queste righe per ANNULLARE tutto e tornare
--    allo stato precedente (rimuove il vincolo 2FA dalle tabelle):
--
--   DO $$
--   DECLARE t text; tables text[] := ARRAY['cartelle','esami_biochimici',
--     'note_specialistiche','bia_records','schede_valutazione','ncpt',
--     'patient_documents','patient_consents','patient_signatures',
--     'patient_files','chat_messages','piani','daily_wellness','weight_logs',
--     'menstrual_cycle','fatture','liste_spesa','patient_specialty_access'];
--   BEGIN
--     FOREACH t IN ARRAY tables LOOP
--       EXECUTE format('DROP POLICY IF EXISTS "mfa_required" ON public.%I', t);
--     END LOOP;
--   END $$;
--   DROP FUNCTION IF EXISTS public.mfa_ok();
-- ============================================================================
