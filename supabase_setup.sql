-- ═══════════════════════════════════════════════════════════════════════════
-- NUTRIPLAN PRO — Setup Supabase Completo
-- ───────────────────────────────────────────────────────────────────────────
-- Questo è l'UNICO file di riferimento per tutto lo schema del database.
-- Aggiornare SEMPRE questo file quando si aggiungono tabelle, colonne,
-- policy RLS, trigger o bucket di storage.
--
-- Script idempotente: sicuro da rieseguire su installazioni esistenti.
-- Ordine sezioni (rispetta le dipendenze):
--   1.  Funzioni helper
--   2.  Tabella profiles
--   3.  Tabelle core (cartelle, chat_messages, tabelle cliniche)
--   4.  Tabelle indipendenti (agenda_events, alimenti_custom, ecm_corsi)
--   5.  Patient_dietitian (collegamento paziente–nutrizionista)
--   6.  Patient_documents
--   7.  Patient_consents
--   8.  Colonne aggiuntive (ALTER TABLE ADD COLUMN IF NOT EXISTS)
--   9.  Storage bucket document-prints + policy
--   10. Row Level Security — tabelle nutrizionista
--   11. Row Level Security — accesso paziente (patient portal)
--   12. Policy diario paziente
--   13. Policy lettura diario da nutrizionista
--   14. Realtime
-- ═══════════════════════════════════════════════════════════════════════════


-- ═══════════════════════════════════════════════════════════════════════════
-- SEZIONE 1 — FUNZIONI HELPER
-- ═══════════════════════════════════════════════════════════════════════════

-- check_is_admin(): usata nelle policy di profiles per evitare ricorsione RLS
CREATE OR REPLACE FUNCTION check_is_admin()
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((SELECT is_admin FROM profiles WHERE id = auth.uid()), false);
$$;
GRANT EXECUTE ON FUNCTION check_is_admin() TO authenticated, anon;

-- Trigger rimosso: la creazione del profilo avviene via RPC client-side (create_profile_for_new_user).
-- Qualsiasi trigger su auth.users rischia di far fallire il signUp con un 500 da GoTrue.
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- create_profile_for_new_user(): chiamata dal client (anon key) subito dopo signUp()
-- SECURITY DEFINER + GRANT anon → inserisce il profilo bypassando RLS anche senza sessione
CREATE OR REPLACE FUNCTION create_profile_for_new_user(uid UUID, user_email TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, email, approved, is_admin)
  VALUES (uid, user_email, false, false)
  ON CONFLICT (id) DO NOTHING;
EXCEPTION WHEN OTHERS THEN
  NULL;
END;
$$;
GRANT EXECUTE ON FUNCTION create_profile_for_new_user(UUID, TEXT) TO anon, authenticated;

-- is_linked_patient(): usata nelle policy del patient portal
CREATE OR REPLACE FUNCTION is_linked_patient(cart_id UUID)
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM patient_dietitian
    WHERE patient_id = auth.uid() AND cartella_id = cart_id
  );
$$;
GRANT EXECUTE ON FUNCTION is_linked_patient(UUID) TO authenticated;


-- ═══════════════════════════════════════════════════════════════════════════
-- SEZIONE 2 — PROFILES
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS profiles (
  id          UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email       TEXT,
  username    TEXT,
  approved    BOOLEAN     NOT NULL DEFAULT false,
  is_admin    BOOLEAN     NOT NULL DEFAULT false,
  nome        TEXT,
  cognome     TEXT,
  albo        TEXT,
  logo        TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Aggiunge colonne mancanti su installazioni esistenti
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='profiles' AND column_name='is_admin') THEN
    ALTER TABLE profiles ADD COLUMN is_admin BOOLEAN NOT NULL DEFAULT false;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='profiles' AND column_name='approved') THEN
    ALTER TABLE profiles ADD COLUMN approved BOOLEAN NOT NULL DEFAULT false;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='profiles' AND column_name='username') THEN
    ALTER TABLE profiles ADD COLUMN username TEXT;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='profiles' AND column_name='nome') THEN
    ALTER TABLE profiles ADD COLUMN nome TEXT;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='profiles' AND column_name='cognome') THEN
    ALTER TABLE profiles ADD COLUMN cognome TEXT;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='profiles' AND column_name='albo') THEN
    ALTER TABLE profiles ADD COLUMN albo TEXT;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='profiles' AND column_name='logo') THEN
    ALTER TABLE profiles ADD COLUMN logo TEXT;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='profiles' AND column_name='consent_template') THEN
    ALTER TABLE profiles ADD COLUMN consent_template TEXT;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='profiles' AND column_name='sections_enabled') THEN
    ALTER TABLE profiles ADD COLUMN sections_enabled TEXT[];
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='profiles' AND column_name='dpa_accepted_at') THEN
    ALTER TABLE profiles ADD COLUMN dpa_accepted_at TIMESTAMPTZ;
  END IF;
END $$;

-- Colonna role: 'dietitian' di default (tutti gli account admin panel sono dietisti)
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'dietitian';

-- Imposta role='patient' per account che sono SOLO patient_id (non dietitian_id) in patient_dietitian
UPDATE public.profiles
SET role = 'patient'
WHERE is_admin = false
  AND (role IS NULL OR role = 'dietitian')
  AND id IN (SELECT DISTINCT patient_id FROM public.patient_dietitian WHERE patient_id IS NOT NULL)
  AND id NOT IN (SELECT DISTINCT dietitian_id FROM public.patient_dietitian WHERE dietitian_id IS NOT NULL);

-- Tutti gli altri account approvati rimangono/diventano 'dietitian'
UPDATE public.profiles
SET role = 'dietitian'
WHERE role IS NULL AND approved = true;

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Rimuove tutte le vecchie policy per ripartire puliti (evita ricorsione)
DO $$ DECLARE pol record;
BEGIN
  FOR pol IN SELECT policyname FROM pg_policies WHERE tablename='profiles' AND schemaname='public' LOOP
    EXECUTE 'DROP POLICY IF EXISTS ' || quote_ident(pol.policyname) || ' ON profiles';
  END LOOP;
END $$;

CREATE POLICY "profiles_select_own"             ON profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "profiles_select_admin"            ON profiles FOR SELECT USING (check_is_admin());
CREATE POLICY "profiles_update_own"              ON profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "profiles_update_admin"            ON profiles FOR UPDATE USING (check_is_admin());
CREATE POLICY "profiles_insert_own"              ON profiles FOR INSERT WITH CHECK (auth.uid() = id);

-- Dietisti possono leggere i profili dei propri pazienti
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='profiles_select_linked_patients' AND tablename='profiles') THEN
    CREATE POLICY "profiles_select_linked_patients" ON profiles
      FOR SELECT USING (
        EXISTS (SELECT 1 FROM patient_dietitian
                WHERE patient_dietitian.patient_id = profiles.id
                  AND patient_dietitian.dietitian_id = auth.uid())
      );
  END IF;
END $$;

-- Pazienti possono leggere il profilo del proprio dietista
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='profiles_select_linked_dietitians' AND tablename='profiles') THEN
    CREATE POLICY "profiles_select_linked_dietitians" ON profiles
      FOR SELECT USING (
        EXISTS (SELECT 1 FROM patient_dietitian
                WHERE patient_dietitian.dietitian_id = profiles.id
                  AND patient_dietitian.patient_id = auth.uid())
      );
  END IF;
END $$;

-- Trigger rimosso (duplicato): la creazione del profilo avviene via RPC client-side.
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- ─── NOTA ADMIN ──────────────────────────────────────────────────────────────
-- Per promuovere il primo utente ad admin eseguire:
--   UPDATE profiles SET is_admin = true, approved = true
--   WHERE email = 'tua-email@example.com';
-- ─────────────────────────────────────────────────────────────────────────────


-- ═══════════════════════════════════════════════════════════════════════════
-- SEZIONE 3 — TABELLE CORE
-- (schema indicativo — potrebbero già esistere nel progetto Supabase)
-- ═══════════════════════════════════════════════════════════════════════════

-- Cartelle pazienti
CREATE TABLE IF NOT EXISTS cartelle (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  nome            TEXT,
  codice_fiscale  TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Piani alimentari
CREATE TABLE IF NOT EXISTS piani (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  cartella_id         UUID        REFERENCES cartelle(id) ON DELETE CASCADE,
  nome                TEXT,
  visible_to_patient  BOOLEAN     NOT NULL DEFAULT FALSE,
  print_image_url     TEXT,
  saved_at            TIMESTAMPTZ DEFAULT NOW(),
  data_piano          DATE
);

-- NCPt (Nutrition Care Process)
CREATE TABLE IF NOT EXISTS ncpt (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  cartella_id         UUID        REFERENCES cartelle(id) ON DELETE CASCADE,
  valutazione         JSONB,
  visible_to_patient  BOOLEAN     NOT NULL DEFAULT FALSE,
  print_image_url     TEXT,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

-- Misurazioni BIA
CREATE TABLE IF NOT EXISTS bia_records (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  cartella_id         UUID        REFERENCES cartelle(id) ON DELETE CASCADE,
  data_misura         DATE,
  peso                NUMERIC,
  bf_pct              NUMERIC,
  ffm_kg              NUMERIC,
  angolo_fase         NUMERIC,
  visible_to_patient  BOOLEAN     NOT NULL DEFAULT FALSE,
  print_image_url     TEXT,
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

-- Schede di valutazione paziente
CREATE TABLE IF NOT EXISTS schede_valutazione (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  cartella_id         UUID        REFERENCES cartelle(id) ON DELETE CASCADE,
  nome                TEXT,
  peso                NUMERIC,
  altezza             NUMERIC,
  massa_grassa_pct    NUMERIC,
  massa_magra         NUMERIC,
  vita                NUMERIC,
  fianchi             NUMERIC,
  dati_extra          JSONB,
  visible_to_patient  BOOLEAN     NOT NULL DEFAULT FALSE,
  print_image_url     TEXT,
  saved_at            TIMESTAMPTZ DEFAULT NOW(),
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

-- Note specialistiche (consigli, questionari, sport, diabete, ecc.)
CREATE TABLE IF NOT EXISTS note_specialistiche (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  cartella_id         UUID        REFERENCES cartelle(id) ON DELETE CASCADE,
  tipo                TEXT,
  nota                TEXT,
  dati                JSONB,
  visible_to_patient  BOOLEAN     NOT NULL DEFAULT FALSE,
  print_image_url     TEXT,
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

-- Diario benessere quotidiano (compilato dal paziente)
CREATE TABLE IF NOT EXISTS daily_wellness (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id    UUID        REFERENCES auth.users(id),
  cartella_id   UUID        REFERENCES cartelle(id) ON DELETE CASCADE,
  mood          INTEGER     CHECK (mood BETWEEN 1 AND 5),
  notes         TEXT,
  sleep_hours   NUMERIC(4,1),
  activity      TEXT,
  symptoms      TEXT,
  logged_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_daily_wellness_patient_date  ON daily_wellness(patient_id, logged_at DESC);
CREATE INDEX IF NOT EXISTS idx_daily_wellness_cartella_date ON daily_wellness(cartella_id, logged_at DESC);

-- Log peso giornaliero (compilato dal paziente)
CREATE TABLE IF NOT EXISTS weight_logs (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id    UUID        REFERENCES auth.users(id),
  cartella_id   UUID        REFERENCES cartelle(id) ON DELETE CASCADE,
  weight        NUMERIC,
  logged_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_weight_logs_patient_date  ON weight_logs(patient_id, logged_at DESC);
CREATE INDEX IF NOT EXISTS idx_weight_logs_cartella_date ON weight_logs(cartella_id, logged_at DESC);

-- Chat tra nutrizionista e paziente
CREATE TABLE IF NOT EXISTS chat_messages (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id    UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sender_id     UUID        NOT NULL REFERENCES auth.users(id),
  sender_role   TEXT        NOT NULL CHECK (sender_role IN ('dietitian','patient')),
  content       TEXT        NOT NULL,
  read_at       TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_chat_messages_patient_created ON chat_messages(patient_id, created_at DESC);


-- ═══════════════════════════════════════════════════════════════════════════
-- SEZIONE 4 — TABELLE INDIPENDENTI
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 4.1 Agenda Events ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS agenda_events (
  id          TEXT        PRIMARY KEY,
  user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  paziente    TEXT,
  titolo      TEXT,
  data        DATE        NOT NULL,
  ora         TEXT        NOT NULL DEFAULT '09:00',
  tipo        TEXT        NOT NULL DEFAULT 'visita'
                CHECK (tipo IN ('visita','controllo','reminder','urgente')),
  durata      INTEGER     NOT NULL DEFAULT 60,
  note        TEXT,
  created     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name='agenda_events' AND column_name='updated_at') THEN
    ALTER TABLE agenda_events ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
  END IF;
END $$;

CREATE OR REPLACE FUNCTION agenda_events_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_agenda_events_updated_at ON agenda_events;
CREATE TRIGGER trg_agenda_events_updated_at
  BEFORE UPDATE ON agenda_events
  FOR EACH ROW EXECUTE FUNCTION agenda_events_set_updated_at();

CREATE INDEX IF NOT EXISTS agenda_events_user_data ON agenda_events (user_id, data ASC, ora ASC);

ALTER TABLE agenda_events ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='agenda_events_select_own' AND tablename='agenda_events') THEN
    CREATE POLICY "agenda_events_select_own" ON agenda_events FOR SELECT USING (auth.uid() = user_id);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='agenda_events_upsert_own' AND tablename='agenda_events') THEN
    CREATE POLICY "agenda_events_upsert_own" ON agenda_events FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='agenda_events_update_own' AND tablename='agenda_events') THEN
    CREATE POLICY "agenda_events_update_own" ON agenda_events FOR UPDATE USING (auth.uid() = user_id);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='agenda_events_delete_own' AND tablename='agenda_events') THEN
    CREATE POLICY "agenda_events_delete_own" ON agenda_events FOR DELETE USING (auth.uid() = user_id);
  END IF;
END $$;

-- Funzione SECURITY DEFINER per feed iCal (anon key)
CREATE OR REPLACE FUNCTION get_user_agenda_events(p_user_id UUID)
RETURNS SETOF agenda_events LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT * FROM agenda_events WHERE user_id = p_user_id ORDER BY data ASC, ora ASC;
$$;
GRANT EXECUTE ON FUNCTION get_user_agenda_events(UUID) TO anon;


-- ─── 4.2 Alimenti Custom ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS alimenti_custom (
  id              UUID      PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID      NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  nome            TEXT      NOT NULL,
  categoria       TEXT,
  kcal            NUMERIC,
  proteine        NUMERIC,
  grassi_saturi   NUMERIC,
  grassi_tot      NUMERIC,
  zuccheri        NUMERIC,
  carboidrati     NUMERIC,
  fibre           NUMERIC,
  calcio          NUMERIC,
  ferro           NUMERIC,
  magnesio        NUMERIC,
  potassio        NUMERIC,
  sodio           NUMERIC,
  zinco           NUMERIC,
  fosforo         NUMERIC,
  selenio         NUMERIC,
  colesterolo     NUMERIC,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE alimenti_custom ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='alimenti_custom_owner' AND tablename='alimenti_custom') THEN
    CREATE POLICY "alimenti_custom_owner" ON alimenti_custom
      FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;


-- ─── 4.3 ECM Corsi ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ecm_corsi (
  id          SERIAL   PRIMARY KEY,
  cat         TEXT[]   NOT NULL DEFAULT '{}',
  tipo        TEXT     NOT NULL CHECK (tipo IN ('fad','residenziale','blended')),
  gratuito    BOOLEAN  NOT NULL DEFAULT false,
  provider    TEXT     NOT NULL,
  titolo      TEXT     NOT NULL,
  crediti     INTEGER  NOT NULL,
  durata      TEXT     NOT NULL,
  costo       TEXT     NOT NULL,
  target      TEXT[]   NOT NULL DEFAULT '{}',
  descrizione TEXT     NOT NULL,
  argomenti   TEXT[]   NOT NULL DEFAULT '{}',
  link        TEXT     NOT NULL,
  data_inizio DATE,
  data_fine   DATE,
  scadenza    TEXT,
  attivo      BOOLEAN  NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE ecm_corsi ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='ecm_corsi_read_all' AND tablename='ecm_corsi') THEN
    CREATE POLICY "ecm_corsi_read_all" ON ecm_corsi FOR SELECT USING (true);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='ecm_corsi_admin_write' AND tablename='ecm_corsi') THEN
    CREATE POLICY "ecm_corsi_admin_write" ON ecm_corsi
      FOR ALL USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true));
  END IF;
END $$;

-- Dati iniziali: inserisce i corsi solo se la tabella è vuota
DO $$ BEGIN
  IF (SELECT COUNT(*) FROM ecm_corsi) = 0 THEN

    INSERT INTO ecm_corsi (cat,tipo,gratuito,provider,titolo,crediti,durata,costo,target,descrizione,argomenti,link,data_inizio,data_fine,scadenza) VALUES
    (ARRAY['nutrizione','fad'],'fad',false,'SINU — Società Italiana di Nutrizione Umana','Nutrizione Clinica Avanzata: dalla Valutazione al Piano Terapeutico',12,'8 ore FAD','Gratuito per soci SINU / € 60 non soci',ARRAY['Dietisti','Medici','Biologi nutrizionisti'],'Corso FAD accreditato ECM su valutazione dello stato nutrizionale con strumenti validati (NRS-2002, MNA, MUST), diagnosi di malnutrizione secondo criteri GLIM, NCP e formulazione di piani nutrizionali personalizzati.',ARRAY['NRS-2002','MNA','GLIM','NCP','Malnutrizione'],'https://www.sinu.it/formazione',NULL,'2026-12-31','Accesso continuativo — verificare su sito SINU'),
    (ARRAY['patologie','fad'],'fad',false,'ESPEN — European Society for Clinical Nutrition','ESPEN eLearning: Nutrition in Chronic Diseases',8,'6 ore FAD (in inglese)','Gratuito per soci ESPEN',ARRAY['Dietisti','Medici','Nutrizionisti'],'Moduli eLearning ESPEN su nutrizione nelle malattie croniche: diabete, IRC, epatopatia, BPCO, oncologia e malattie cardiovascolari.',ARRAY['Diabete','IRC','Oncologia','BPCO','Epatopatie','Linee guida ESPEN'],'https://www.espen.org/elearning',NULL,NULL,'Accesso permanente con registrazione ESPEN'),
    (ARRAY['pediatria','fad'],'fad',false,'SIP — Società Italiana di Pediatria','Nutrizione Pediatrica: svezzamento, obesità e patologie specifiche',10,'8 ore FAD','€ 50–80',ARRAY['Dietisti','Pediatri','MMG','Infermieri pediatrici'],'Corso FAD su allattamento, diversificazione alimentare (BLW), APLV, obesità infantile, celiachia e diete speciali in età evolutiva.',ARRAY['Allattamento','BLW','Svezzamento','APLV','Obesità infantile','Celiachia'],'https://www.sip.it/formazione',NULL,'2026-12-31','Verificare disponibilità sul sito SIP'),
    (ARRAY['nutrizione','fad'],'fad',true,'ISS — Istituto Superiore di Sanità','Sorveglianza Nutrizionale e Indicatori di Salute nella Popolazione Italiana',6,'4 ore FAD','GRATUITO',ARRAY['Tutti i professionisti sanitari'],'Corso gratuito ISS su dati epidemiologici della nutrizione italiana, OKkio alla SALUTE, sistema PASSI e principali indicatori di salute nutrizionale.',ARRAY['Epidemiologia','OKkio alla SALUTE','PASSI','Sorveglianza','Salute pubblica'],'https://www.iss.it/formazione',NULL,NULL,'Accesso libero e continuativo'),
    (ARRAY['patologie','fad'],'fad',false,'SID — Società Italiana di Diabetologia','Terapia Medica Nutrizionale nel Diabete Mellito Tipo 1 e Tipo 2',10,'8 ore FAD','€ 40–80',ARRAY['Dietisti','Medici diabetologi','MMG','Infermieri'],'Linee guida ADA/SID 2024 sulla terapia nutrizionale nel diabete: conteggio carboidrati, indice glicemico, dieta mediterranea vs low-carb, gestione insulinica.',ARRAY['Diabete T1','Diabete T2','Conteggio CHO','Indice glicemico','Insulina','ADA 2024'],'https://www.siditalia.it/formazione',NULL,'2026-12-31','Verificare su sito SID'),
    (ARRAY['nutrizione','fad'],'fad',true,'Humanitas / Fondazione Umberto Veronesi','Alimentazione e Prevenzione dei Tumori: evidenze e raccomandazioni',8,'6 ore FAD','GRATUITO',ARRAY['Tutti i professionisti sanitari'],'Corso gratuito sulle evidenze sul legame tra alimentazione e rischio oncologico, raccomandazioni WCRF/AIRC, nutrizione durante chemioterapia e radioterapia, cachessia neoplastica.',ARRAY['Oncologia','Prevenzione tumori','WCRF','Cachessia','Omega-3','Immunonutrizione'],'https://www.fondazioneveronesi.it/formazione',NULL,NULL,'Accesso libero — verificare su sito'),
    (ARRAY['patologie','fad'],'fad',false,'SINPE — Società Italiana di Nutrizione Parenterale ed Enterale','Nutrizione Artificiale Domiciliare (NAD): indicazioni, gestione e complicanze',10,'8 ore FAD','€ 50–100',ARRAY['Dietisti','Infermieri','Medici'],'Corso FAD sulla gestione della NAD: indicazioni cliniche, formule nutrizionali, dispositivi per accesso vascolare, monitoraggio metabolico e gestione complicanze.',ARRAY['NAD','NED','Nutrizione enterale domiciliare','Nutrizione parenterale','PICC','Gestione complicanze'],'https://www.sinpe.org/formazione',NULL,'2026-12-31','Verificare su sito SINPE'),
    (ARRAY['nutrizione','fad'],'fad',false,'ADI — Associazione Italiana di Dietetica e Nutrizione Clinica','Sarcopenia, Fragilità e Malnutrizione: strategie nutrizionali nell''anziano',10,'8 ore FAD','€ 60–100 (soci/non soci)',ARRAY['Dietisti','Geriatri','MMG','Infermieri','Fisioterapisti'],'Percorso formativo sulla gestione nutrizionale dell''anziano fragile: criteri EWGSOP2, MNA, fabbisogni proteici, supplementazione, vitamina D.',ARRAY['Sarcopenia','EWGSOP2','MNA','Anziano fragile','Fragilità','Vitamina D','Proteine'],'https://www.adiitalia.net/formazione',NULL,'2026-12-31','Verificare disponibilità su sito ADI Italia'),
    (ARRAY['patologie','fad'],'fad',true,'ISS / Ministero della Salute','Allergie e Intolleranze Alimentari: diagnosi, gestione e comunicazione al paziente',6,'5 ore FAD','GRATUITO',ARRAY['Tutti i professionisti sanitari'],'Corso gratuito su allergie IgE-mediate e non, APLV, celiachia, SGNC, lattosio, FODMAP e IBS.',ARRAY['Allergie alimentari','APLV','Celiachia','SGNC','Lattosio','FODMAP','IBS','Intolleranze'],'https://www.iss.it/formazione',NULL,NULL,'Accesso libero e continuativo'),
    (ARRAY['nutrizione','fad'],'fad',false,'SINU — Società Italiana di Nutrizione Umana','Nutrizione Sostenibile e Planetary Health Diet: la dieta del futuro',8,'6 ore FAD','Gratuito per soci SINU / € 50 non soci',ARRAY['Dietisti','Medici','Biologi nutrizionisti','Professionisti della salute'],'Corso FAD sui principi della Planetary Health Diet (EAT-Lancet), impatto ambientale dell''alimentazione, diete plant-based.',ARRAY['Planetary Health Diet','Sostenibilità','Plant-based','EAT-Lancet','Impronta carbonica','Dieta mediterranea'],'https://www.sinu.it/formazione',NULL,'2026-12-31','Accesso continuativo — verificare su sito SINU'),
    (ARRAY['nutrizione','fad'],'fad',false,'ADI — Associazione Italiana di Dietetica e Nutrizione Clinica','Nutrizione nei Disturbi del Comportamento Alimentare (DCA): approccio clinico integrato',10,'8 ore FAD','€ 70–120 (soci/non soci)',ARRAY['Dietisti','Psicologi','Medici','Infermieri'],'Percorso FAD sulla gestione nutrizionale nei DCA: anoressia, bulimia, BED, ARFID. Refeeding syndrome e approccio multidisciplinare.',ARRAY['DCA','Anoressia nervosa','Bulimia','BED','ARFID','Refeeding syndrome','Approccio multidisciplinare'],'https://www.adiitalia.net/formazione',NULL,'2026-12-31','Verificare disponibilità su sito ADI Italia'),
    (ARRAY['patologie','fad'],'fad',false,'SIC / SISA — Società Italiana di Cardiologia','Nutrizione e Rischio Cardiovascolare: dalla prevenzione alla gestione terapeutica',8,'6 ore FAD','€ 40–70',ARRAY['Dietisti','Cardiologi','MMG','Infermieri'],'Corso FAD su linee guida ESC 2023, dieta DASH, gestione ipercolesterolemia e ipertensione attraverso la dieta.',ARRAY['Rischio cardiovascolare','Dieta DASH','Ipercolesterolemia','Ipertensione','ESC 2023','Prevenzione CV'],'https://www.cardioitalia.net/formazione',NULL,'2026-12-31','Verificare su sito SIC'),
    (ARRAY['nutrizione','fad'],'fad',false,'FAND — Federazione Associazioni Nazionali Dietisti','Il Dietista nel Team Multiprofessionale: ruolo, responsabilità e NCP',8,'6 ore FAD','€ 50–80 (soci/non soci)',ARRAY['Dietisti'],'Corso FAD sul ruolo professionale del dietista, NCP/NCPT, documentazione nutrizionale e responsabilità professionale.',ARRAY['NCP','NCPT','Team multiprofessionale','Documentazione','Ruolo professionale dietista','FNABI'],'https://www.andid.it/formazione',NULL,'2026-12-31','Accesso continuativo — verificare su sito ANDID'),
    (ARRAY['nutrizione','fad'],'fad',true,'CREA — Centro di Ricerca Alimenti e Nutrizione','Linee Guida per una Sana Alimentazione Italiana 2024: aggiornamento e applicazioni pratiche',6,'4 ore FAD','GRATUITO',ARRAY['Tutti i professionisti sanitari'],'Corso gratuito basato sulle nuove Linee Guida CREA 2024: porzioni, frequenze, legumi, pesce azzurro, frutta secca, sale e zuccheri.',ARRAY['Linee guida CREA','Alimentazione italiana','Porzioni','Frequenza alimentare','Prevenzione','LARN'],'https://www.crea.gov.it/alimenti-e-nutrizione',NULL,NULL,'Accesso libero e continuativo'),
    (ARRAY['patologie','fad'],'fad',false,'ADI — Associazione Italiana di Dietetica e Nutrizione Clinica','Nutrizione in Oncologia: screening, valutazione e supporto nutrizionale',12,'10 ore FAD','€ 80–140 (soci/non soci)',ARRAY['Dietisti','Oncologi','Infermieri oncologici','Medici'],'Percorso FAD completo sulla nutrizione oncologica: screening (MST, MUST, PG-SGA), effetti collaterali, cachessia, sarcopenia oncologica.',ARRAY['Oncologia','Cachessia','PG-SGA','MST','Chemioterapia','Radioterapia','Mucosite','Sarcopenia oncologica'],'https://www.adiitalia.net/formazione',NULL,'2026-12-31','Verificare disponibilità su sito ADI Italia'),
    (ARRAY['patologie','fad'],'fad',false,'SIGE — Società Italiana di Gastroenterologia ed Endoscopia','Nutrizione nelle Malattie Infiammatorie Intestinali (IBD): Crohn e Colite Ulcerosa',8,'6 ore FAD','€ 50–90',ARRAY['Dietisti','Gastroenterologi','Medici','Infermieri'],'Corso FAD su valutazione e gestione nutrizionale nelle IBD, NEE come terapia d''induzione, gestione stomia, probiotici.',ARRAY['Malattia di Crohn','Colite ulcerosa','IBD','NEE','Stomia','Probiotici','Prebiotici','Malnutrizione IBD'],'https://www.sige.it/formazione',NULL,'2026-12-31','Verificare su sito SIGE'),
    (ARRAY['patologie','fad'],'blended',false,'ADI — Associazione Italiana di Dietetica e Nutrizione Clinica','Nutrizione Enterale e Parenterale: Gestione Pratica in Ospedale e a Domicilio',14,'10 ore FAD + 2 ore residenziale','€ 120–200 (soci/non soci)',ARRAY['Dietisti','Infermieri','Medici'],'Percorso completo: accessi enterali (SNG, PEG, digiunostomia), miscele, NPT periferica e totale, NED domiciliare, complicanze metaboliche.',ARRAY['Nutrizione enterale','Nutrizione parenterale','PEG','NPT','NED','Complicanze'],'https://www.adiitalia.net/formazione',NULL,'2026-12-31','Verificare disponibilità su sito ADI Italia'),
    (ARRAY['nutrizione','fad'],'blended',false,'SINU — Società Italiana di Nutrizione Umana','Il Caso Clinico in Nutrizione: percorso interattivo di valutazione e pianificazione',12,'8 ore FAD + 2 ore interazione online','€ 70–100',ARRAY['Dietisti','Medici','Biologi nutrizionisti'],'Corso blended con simulazioni di casi clinici: malnutrizione, ICU, chirurgia, IRC, epatopatia avanzata, obesità e sindrome metabolica.',ARRAY['Casi clinici','Malnutrizione ospedaliera','ICU','Chirurgia','Sindrome metabolica','Valutazione nutrizionale'],'https://www.sinu.it/formazione',NULL,'2026-12-31','Accesso continuativo — verificare su sito SINU'),
    (ARRAY['nutrizione','residenziale'],'residenziale',false,'ADI — Associazione Italiana di Dietetica e Nutrizione Clinica','ADI Congress 2026 — Annual Meeting della Nutrizione Clinica Italiana',18,'3 giorni (22–24 maggio 2026)','€ 250–450 (soci/non soci)',ARRAY['Dietisti','Medici','Biologi nutrizionisti','Infermieri','Professionisti sanitari'],'Il principale congresso italiano di nutrizione clinica. Sessioni parallele, workshop pratici e letture magistrali da esperti internazionali.',ARRAY['Nutrizione clinica','ESPEN','Congresso ADI','Nutrizione artificiale','Aggiornamento multidisciplinare'],'https://www.adiitalia.net/congresso','2026-05-22','2026-05-24','Iscrizioni aperte — verificare su sito ADI'),
    (ARRAY['nutrizione','sport','residenziale'],'residenziale',false,'ANDID — Associazione Nazionale Dietisti','Nutrizione Sportiva e Performance Atletica: dalla Teoria al Campo',10,'2 giorni (29–30 maggio 2026)','€ 150–250 (soci/non soci)',ARRAY['Dietisti','Medici sportivi','Fisioterapisti'],'Workshop residenziale: fabbisogni energetici atleti, carboloading, integrazione sportiva evidence-based (creatina, caffeina, beta-alanina), RED-S.',ARRAY['Nutrizione sportiva','Carboloading','RED-S','Integrazione sportiva','Creatina','Caffeina','Performance atletica'],'https://www.andid.it/formazione','2026-05-29','2026-05-30','Iscrizioni aperte — verificare calendario ANDID'),
    (ARRAY['pediatria','residenziale'],'residenziale',false,'SIPPS — Società Italiana di Prevenzione e Igiene Pediatrica','Svezzamento Guidato dal Bambino (BLW) e Alimentazione Complementare 0–3 Anni',8,'1 giorno (10 maggio 2026)','€ 90–150',ARRAY['Pediatri','Dietisti','Ostetriche','MMG'],'Workshop pratico su BLW: sicurezza, prevenzione allergie con introduzione precoce (LEAP study), linee guida WHO/ESPGHAN 2024.',ARRAY['BLW','Prevenzione allergie','ESPGHAN','WHO','Alimentazione complementare','LEAP study'],'https://www.sipps.it','2026-05-10','2026-05-10','Iscrizioni aperte — verificare calendario SIPPS'),
    (ARRAY['patologie','residenziale'],'residenziale',false,'AISF — Associazione Italiana Studio Fegato','Malattie Epatiche e Nutrizione: NAFLD/MAFLD, Cirrosi e Trapianto di Fegato',12,'2 giorni (12–13 giugno 2026)','€ 150–250',ARRAY['Dietisti','Epatologi','Gastroenterologi','Medici','Infermieri'],'Corso su NAFLD/MAFLD, sarcopenia nella cirrosi, BCAA per encefalopatia epatica, nutrizione post-trapianto, ascite e dieta iposodica.',ARRAY['NAFLD','MAFLD','Cirrosi','Encefalopatia epatica','BCAA','Trapianto fegato','Ascite','Sarcopenia epatica'],'https://www.webaisf.org','2026-06-12','2026-06-13','Iscrizioni aperte — verificare su sito AISF'),
    (ARRAY['patologie','residenziale'],'residenziale',false,'ANDID — Associazione Nazionale Dietisti / GdL Disfagia','Disfagia e Texture Modified Foods: valutazione e gestione nutrizionale',10,'2 giorni (19–20 giugno 2026)','€ 150–240 (soci/non soci)',ARRAY['Dietisti','Logopedisti','Medici','Infermieri','Terapisti occupazionali'],'Corso su classificazione IDDSI, TMF, bedside swallowing assessment, videofluoroscopia, FEES e gestione disfagico neurologico.',ARRAY['Disfagia','IDDSI','Texture modified foods','Addensanti','Videofluoroscopia','FEES','SLA','Ictus','Parkinson'],'https://www.andid.it/formazione','2026-06-19','2026-06-20','Iscrizioni aperte — verificare calendario ANDID'),
    (ARRAY['pediatria','residenziale'],'residenziale',false,'SINUPE — Società Italiana di Nutrizione Pediatrica','Obesità Infantile e Adolescenziale: dalla Prevenzione al Trattamento Multidisciplinare',12,'2 giorni (5–6 giugno 2026)','€ 180–280',ARRAY['Pediatri','Dietisti','Psicologi','MMG','Endocrinologi'],'Approccio integrato all''obesità infantile: diagnosi precoce, intervento nutrizionale per fasce d''età, comorbilità metaboliche.',ARRAY['Obesità pediatrica','BMI','Insulino-resistenza','NAFLD','Approccio multidisciplinare','Adolescenti'],'https://www.sinupe.it','2026-06-05','2026-06-06','Iscrizioni aperte — verificare su sito SINUPE'),
    (ARRAY['patologie','residenziale'],'residenziale',false,'SIGE — Società Italiana di Gastroenterologia','Nutrizione nelle Malattie Gastrointestinali: dalla Celiachia alla IBS',10,'2 giorni (3–4 luglio 2026)','€ 160–260',ARRAY['Dietisti','Gastroenterologi','Medici internisti','Infermieri'],'Corso su celiachia, SGNC, IBS (protocollo Monash FODMAP), SIBO, GERD, post-chirurgia bariatrica.',ARRAY['Celiachia','Dieta senza glutine','SGNC','IBS','FODMAP','SIBO','GERD','Chirurgia bariatrica','Malabsorzione'],'https://www.sige.it/formazione','2026-07-03','2026-07-04','Iscrizioni aperte — verificare su sito SIGE'),
    (ARRAY['patologie','residenziale'],'residenziale',false,'Federazione COMLAS / ADI Italia','Nutrizione nell''Insufficienza Renale Cronica: dalla Teoria alla Pratica Clinica',10,'1 giorno (19 settembre 2026)','€ 100–180',ARRAY['Dietisti','Medici nefrologi','Infermieri'],'Corso pratico su IRC: restrizione proteica, gestione potassio e fosforo, dialisi, CKD-MBD.',ARRAY['IRC','CKD','Dialisi','Potassio','Fosforo','Proteine','Lisciviazione','CKD-MBD'],'https://www.ecm.salute.gov.it','2026-09-19','2026-09-19','Iscrizioni aperte — verificare calendario ECM regionale'),
    (ARRAY['patologie','residenziale'],'residenziale',false,'ADI — Associazione Italiana di Dietetica e Nutrizione Clinica','Nutrizione Oncologica Update 2026: nuove evidenze e strategie pratiche',14,'2 giorni (11–12 settembre 2026)','€ 200–350 (soci/non soci)',ARRAY['Dietisti','Oncologi','Infermieri oncologici','Medici'],'Congresso: linee guida ESPEN 2024/2025, immunonutrizione pre-operatoria (ERAS), cachessia, microbiota e risposta ai farmaci oncologici.',ARRAY['Oncologia','Cachessia','ESPEN','ERAS','Immunonutrizione','Anamorelina','Immunoterapia','Microbiota oncologico'],'https://www.adiitalia.net/congresso','2026-09-11','2026-09-12','Iscrizioni aperte — verificare su sito ADI'),
    (ARRAY['patologie','residenziale'],'residenziale',false,'SID — Società Italiana di Diabetologia','Nutrizione nel Diabete Gestazionale e in Gravidanza: strategie pratiche 2026',8,'1 giorno (25 settembre 2026)','€ 80–150',ARRAY['Dietisti','Ginecologi','Diabetologi','Ostetriche','MMG'],'Corso su GDM: criteri IADPSG, terapia medica nutrizionale, obiettivi glicemici, DHA, folati, ferro e vitamina D in gravidanza.',ARRAY['Diabete gestazionale','GDM','IADPSG','Gravidanza','DHA','Folati','Gestione glicemica'],'https://www.siditalia.it/formazione','2026-09-25','2026-09-25','Iscrizioni aperte — verificare su sito SID'),
    (ARRAY['nutrizione','residenziale'],'residenziale',false,'SINU — Società Italiana di Nutrizione Umana','Microbiota Intestinale e Nutrizione: evidenze cliniche e applicazioni pratiche',12,'2 giorni (9–10 ottobre 2026)','€ 180–300',ARRAY['Dietisti','Medici','Biologi','Gastroenterologi'],'Congresso su microbioma, probiotici, FMT, microbiota in IBD, diabete, obesità e asse intestino-cervello.',ARRAY['Microbiota intestinale','Probiotici','Prebiotici','FMT','Asse intestino-cervello','Disbiosi','Psicobiotici'],'https://www.sinu.it/formazione','2026-10-09','2026-10-10','Iscrizioni aperte — verificare su sito SINU'),
    (ARRAY['nutrizione','residenziale'],'residenziale',false,'ANDID — Associazione Nazionale Dietisti','44° Congresso Nazionale ANDID 2026 — Nutrizione, Innovazione e Futuro della Dietetica',16,'3 giorni (15–17 ottobre 2026)','€ 180–380 (soci/non soci)',ARRAY['Dietisti'],'Il principale evento formativo nazionale per i dietisti italiani. Sessioni plenarie, workshop, poster scientifici e networking professionale.',ARRAY['Nutrizione clinica','NCP','Innovazione','Ricerca','Network professionale','ANDID 2026'],'https://www.andid.it/congresso','2026-10-15','2026-10-17','Iscrizioni aperte fino a settembre 2026'),
    (ARRAY['nutrizione','residenziale'],'residenziale',false,'ANDID — Associazione Nazionale Dietisti','La Comunicazione Efficace con il Paziente: Counseling Motivazionale in Dietetica',8,'1 giorno (14 novembre 2026)','€ 100–180 (soci/non soci)',ARRAY['Dietisti','Nutrizionisti'],'Workshop pratico su Motivational Interviewing, gestione resistenza al cambiamento, tecniche SMART. Laboratorio con role-playing.',ARRAY['Counseling','Motivational Interviewing','Comunicazione','Aderenza terapeutica','Psicologia alimentazione','Role-playing'],'https://www.andid.it/formazione','2026-11-14','2026-11-14','Iscrizioni aperte — verificare calendario ANDID regionale'),
    (ARRAY['pediatria','residenziale'],'residenziale',false,'SINUPE — Società Italiana di Nutrizione Pediatrica','Nutrizione Neonatale e del Prematuro: dalle Linee Guida alla Pratica di Reparto',10,'2 giorni (6–7 novembre 2026)','€ 160–260',ARRAY['Dietisti','Neonatologi','Ostetriche','Infermieri neonatali','Pediatri'],'Corso su latte materno e fortification nel prematuro, formule, nutrizione parenterale in TIN, curve WHO, allattamento.',ARRAY['Nutrizione neonatale','Prematuro','TIN','Latte materno','Fortification','Curva di crescita WHO','Allattamento'],'https://www.sinupe.it','2026-11-06','2026-11-07','Iscrizioni aperte — verificare su sito SINUPE'),
    (ARRAY['patologie','fad'],'fad',false,'ADI / SINPE — Nutrizione Artificiale','Nutrizione nel Paziente Critico in ICU: dalle Linee Guida alla Pratica',12,'10 ore FAD','€ 80–140 (soci/non soci)',ARRAY['Dietisti','Medici intensivisti','Infermieri di area critica'],'Corso FAD su nutrizione in ICU: timing enterale precoce, protocolli ESPEN 2023, instabilità emodinamica, ARDS, insufficienza multiorgano.',ARRAY['ICU','Terapia intensiva','Nutrizione enterale precoce','ARDS','ESPEN ICU','Instabilità emodinamica','Insufficienza multiorgano'],'https://www.sinpe.org/formazione',NULL,'2026-12-31','Verificare su sito SINPE'),
    (ARRAY['nutrizione','fad'],'fad',false,'SINU — Società Italiana di Nutrizione Umana','Interazioni Farmaco-Nutriente: dal Warfarin agli Inibitori di Pompa',8,'6 ore FAD','Gratuito per soci SINU / € 50 non soci',ARRAY['Dietisti','Farmacisti','Medici','Infermieri'],'Percorso FAD sulle principali interazioni farmaco-nutriente: warfarin/vitamina K, MAO-inibitori/tiramina, pompelmo, farmaci antiretrovirali.',ARRAY['Warfarin','Vitamina K','Interazioni farmaco-nutriente','MAO-inibitori','Tiramina','Nutrizione enterale','Pompelmo'],'https://www.sinu.it/formazione',NULL,'2026-12-31','Accesso continuativo — verificare su sito SINU'),
    (ARRAY['patologie','fad'],'fad',false,'ADI — Associazione Italiana di Dietetica e Nutrizione Clinica','Nutrizione nella Chirurgia Bariatrica: Percorso Nutrizionale Pre e Post-operatorio',10,'8 ore FAD','€ 70–120 (soci/non soci)',ARRAY['Dietisti','Chirurghi bariatrici','Medici endocrinologi'],'Corso FAD su bariatrica: valutazione preoperatoria, dieta iperproteica ipocalorica, supplementazione micronutrienti (ferro, B12, calcio, vitamina D), dumping syndrome.',ARRAY['Chirurgia bariatrica','Bypass gastrico','Sleeve gastrectomy','Dumping syndrome','Carenze micronutrienti','Supplementazione','Vitamina B12'],'https://www.adiitalia.net/formazione',NULL,'2026-12-31','Verificare disponibilità su sito ADI Italia'),
    (ARRAY['patologie','fad'],'fad',false,'AIC — Associazione Italiana Celiachia','Celiachia e Sensibilità al Glutine: dalla Diagnosi alla Gestione Dietetica Ottimale',8,'6 ore FAD','€ 40–70',ARRAY['Dietisti','Gastroenterologi','MMG','Infermieri'],'Corso FAD su celiachia: criteri diagnostici ESPGHAN 2020, SGNC, dieta senza glutine, etichettatura, contaminazione crociata, follow-up.',ARRAY['Celiachia','SGNC','Dieta senza glutine','ESPGHAN','Etichettatura','Contaminazione crociata','Anti-tTG','EMA'],'https://www.celiachia.it/formazione',NULL,'2026-12-31','Verificare disponibilità su sito AIC'),
    (ARRAY['nutrizione','fad'],'fad',false,'SIN — Società Italiana di Neonatologia / SID','Nutrizione e Integrazione in Gravidanza: Micronutrienti, DHA, Folati e Oltre',10,'8 ore FAD','€ 60–100',ARRAY['Dietisti','Ginecologi','Ostetriche','MMG'],'Percorso FAD su fabbisogni in gravidanza, supplementazione (acido folico, ferro, iodio, vitamina D, DHA, zinco, B12), nausea e vomito gravidici.',ARRAY['Gravidanza','Acido folico','DHA','Ferro in gravidanza','Vitamina D','Iodio','Peso gestazionale','Allattamento','Nausea gravidica'],'https://www.siditalia.it/formazione',NULL,'2026-12-31','Verificare disponibilità su sito SID'),
    (ARRAY['nutrizione','fad'],'fad',false,'ANDID — Associazione Nazionale Dietisti','Counseling Nutrizionale Motivazionale: Tecniche e Strumenti per il Dietista',8,'6 ore FAD','€ 50–80 (soci/non soci)',ARRAY['Dietisti','Nutrizionisti'],'Corso FAD su Motivational Interviewing, processi cognitivi nel cambiamento, SMART, gestione ambivalenza, educazione terapeutica strutturata.',ARRAY['Motivational Interviewing','Counseling','Cambiamento comportamentale','SMART','Ascolto attivo','Educazione terapeutica','Aderenza'],'https://www.andid.it/formazione',NULL,'2026-12-31','Accesso continuativo — verificare su sito ANDID'),
    (ARRAY['nutrizione','fad'],'fad',false,'ANDID — Associazione Nazionale Dietisti','Dietetica Digitale e Telemedicina: Strumenti Innovativi per il Dietista',6,'5 ore FAD','€ 40–60 (soci/non soci)',ARRAY['Dietisti','Nutrizionisti'],'Corso FAD su trasformazione digitale: software per pianificazione alimentare, telemedicina, wearables, CGM, IA in nutrizione, GDPR.',ARRAY['Telemedicina','App nutrizionali','CGM','Intelligenza artificiale','GDPR','Telemonitoraggio','Digital health','Wearables'],'https://www.andid.it/formazione',NULL,'2026-12-31','Accesso continuativo — verificare su sito ANDID'),
    (ARRAY['nutrizione','residenziale'],'residenziale',false,'SINPE — Società Italiana di Nutrizione Parenterale ed Enterale','Congresso Nazionale SINPE 2026 — Nutrizione Artificiale: Innovazioni e Nuove LG',16,'2 giorni (27–28 novembre 2026)','€ 200–380 (soci/non soci)',ARRAY['Dietisti','Medici','Infermieri','Farmacisti'],'Congresso annuale SINPE: nuove linee guida ESPEN/SINPE 2025-2026, NAD/NPD, dispositivi per accesso enterale e vascolare, workshop pratici.',ARRAY['Nutrizione artificiale','SINPE','ESPEN','NAD','NPD','Nutrizione enterale','Nutrizione parenterale','Workshop'],'https://www.sinpe.org/congresso','2026-11-27','2026-11-28','Iscrizioni aperte — verificare su sito SINPE'),
    (ARRAY['patologie','residenziale'],'residenziale',false,'SIN — Società Italiana di Nefrologia','Congresso SIN 2026 — Gestione Nutrizionale Avanzata del Paziente Nefropatico',12,'2 giorni (6–7 novembre 2026)','€ 150–280',ARRAY['Dietisti','Nefrologi','Infermieri nefrologici'],'Sessioni SIN 2026: linee guida KDIGO/ESPEN nella CKD, trapianto renale, MIS, CKD-MBD, innovazioni nella dialisi.',ARRAY['IRC','CKD','Dialisi peritoneale','Emodialisi','KDIGO','Trapianto renale','MIS','CKD-MBD'],'https://www.sin-italy.org','2026-11-06','2026-11-07','Iscrizioni aperte — verificare su sito SIN');

  END IF;
END $$;


-- ═══════════════════════════════════════════════════════════════════════════
-- SEZIONE 5 — PATIENT_DIETITIAN
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS patient_dietitian (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id    UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  dietitian_id  UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  cartella_id   UUID        REFERENCES cartelle(id) ON DELETE CASCADE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(patient_id, dietitian_id, cartella_id)
);

CREATE INDEX IF NOT EXISTS patient_dietitian_dietitian_cartella ON patient_dietitian (dietitian_id, cartella_id);
CREATE INDEX IF NOT EXISTS patient_dietitian_patient ON patient_dietitian (patient_id);

ALTER TABLE patient_dietitian ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='patient_dietitian_select_own' AND tablename='patient_dietitian') THEN
    CREATE POLICY "patient_dietitian_select_own" ON patient_dietitian
      FOR SELECT USING (auth.uid() = dietitian_id OR auth.uid() = patient_id);
  END IF;
END $$;
-- Fix sicurezza (2026-07-11): la vecchia policy verificava solo "sto inserendo me stesso
-- come dietitian_id", senza controllare che l'utente sia davvero un dietista né che la
-- cartella_id gli appartenga. Un paziente autenticato poteva auto-concedersi accesso ai
-- dati clinici di qualunque altro paziente. DROP+CREATE incondizionato (non guardato da
-- IF NOT EXISTS) per sostituire anche la versione già eseguita su installazioni esistenti.
DROP POLICY IF EXISTS "patient_dietitian_insert_own" ON patient_dietitian;
CREATE POLICY "patient_dietitian_insert_own" ON patient_dietitian
  FOR INSERT WITH CHECK (
    auth.uid() = dietitian_id
    AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'dietitian')
    AND (cartella_id IS NULL OR cartella_id IN (SELECT id FROM cartelle WHERE user_id = auth.uid()))
  );
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='patient_dietitian_delete_own' AND tablename='patient_dietitian') THEN
    CREATE POLICY "patient_dietitian_delete_own" ON patient_dietitian
      FOR DELETE USING (auth.uid() = dietitian_id);
  END IF;
END $$;


-- ═══════════════════════════════════════════════════════════════════════════
-- SEZIONE 6 — PATIENT_DOCUMENTS
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS patient_documents (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  cartella_id   UUID        REFERENCES cartelle(id) ON DELETE CASCADE,
  dietitian_id  UUID        NOT NULL REFERENCES auth.users,
  title         TEXT,
  type          TEXT,
  content       TEXT,
  file_url      TEXT,
  file_name     TEXT,
  tags          TEXT[]      DEFAULT '{}',
  visible       BOOLEAN     NOT NULL DEFAULT FALSE,
  print_image_url TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE patient_documents ADD COLUMN IF NOT EXISTS cartella_id UUID REFERENCES cartelle(id) ON DELETE CASCADE;
ALTER TABLE patient_documents ADD COLUMN IF NOT EXISTS print_image_url TEXT;

ALTER TABLE patient_documents ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='Own documents' AND tablename='patient_documents') THEN
    CREATE POLICY "Own documents" ON patient_documents
      FOR ALL USING (auth.uid() = dietitian_id);
  END IF;
END $$;


-- ═══════════════════════════════════════════════════════════════════════════
-- SEZIONE 7 — PATIENT_CONSENTS (modulo privacy GDPR)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS patient_consents (
  id                 UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  cartella_id        UUID        REFERENCES cartelle(id) ON DELETE CASCADE,
  dietitian_id       UUID        NOT NULL REFERENCES auth.users,
  patient_id         UUID        REFERENCES auth.users,
  consent_version    TEXT        DEFAULT '1.0',
  consent_text       TEXT,
  visible_to_patient BOOLEAN     DEFAULT true,
  signed_at          TIMESTAMPTZ,
  sign_method        TEXT        DEFAULT 'digital_checkbox',
  created_at         TIMESTAMPTZ DEFAULT NOW(),
  updated_at         TIMESTAMPTZ DEFAULT NOW()
);

-- "Firma in studio" (chat.html openFirmaConsenso) salva qui il disegno della
-- firma raccolto su un canvas (data URL); mancava del tutto, quindi ogni
-- firma-in-studio falliva con "column does not exist" e (senza controllo
-- errore lato client) veniva mostrata come riuscita.
ALTER TABLE patient_consents ADD COLUMN IF NOT EXISTS signature_data_url TEXT;

ALTER TABLE patient_consents ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='patient_consents_dietitian_all' AND tablename='patient_consents') THEN
    CREATE POLICY "patient_consents_dietitian_all" ON patient_consents
      FOR ALL USING (auth.uid() = dietitian_id)
      WITH CHECK (auth.uid() = dietitian_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='patient_consents_patient_select' AND tablename='patient_consents') THEN
    CREATE POLICY "patient_consents_patient_select" ON patient_consents
      FOR SELECT USING (
        visible_to_patient = TRUE
        AND cartella_id IN (SELECT cartella_id FROM patient_dietitian WHERE patient_id = auth.uid())
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='patient_consents_patient_update_sign' AND tablename='patient_consents') THEN
    CREATE POLICY "patient_consents_patient_update_sign" ON patient_consents
      FOR UPDATE USING (
        cartella_id IN (SELECT cartella_id FROM patient_dietitian WHERE patient_id = auth.uid())
      )
      WITH CHECK (
        cartella_id IN (SELECT cartella_id FROM patient_dietitian WHERE patient_id = auth.uid())
      );
  END IF;
END $$;

CREATE OR REPLACE FUNCTION patient_consents_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='trg_patient_consents_updated_at') THEN
    CREATE TRIGGER trg_patient_consents_updated_at
      BEFORE UPDATE ON patient_consents
      FOR EACH ROW EXECUTE FUNCTION patient_consents_set_updated_at();
  END IF;
END $$;


-- ═══════════════════════════════════════════════════════════════════════════
-- SEZIONE 8 — COLONNE AGGIUNTIVE
-- ═══════════════════════════════════════════════════════════════════════════

-- visible_to_patient su tabelle cliniche
ALTER TABLE piani                ADD COLUMN IF NOT EXISTS visible_to_patient BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE ncpt                 ADD COLUMN IF NOT EXISTS visible_to_patient BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE schede_valutazione   ADD COLUMN IF NOT EXISTS visible_to_patient BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE bia_records          ADD COLUMN IF NOT EXISTS visible_to_patient BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE note_specialistiche  ADD COLUMN IF NOT EXISTS visible_to_patient BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE note_specialistiche  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

ALTER TABLE piani                ADD COLUMN IF NOT EXISTS display_mode VARCHAR(20) DEFAULT 'normale';
ALTER TABLE piani                ALTER COLUMN visible_to_patient SET DEFAULT FALSE;
ALTER TABLE ncpt                 ALTER COLUMN visible_to_patient SET DEFAULT FALSE;
ALTER TABLE schede_valutazione   ALTER COLUMN visible_to_patient SET DEFAULT FALSE;
ALTER TABLE bia_records          ALTER COLUMN visible_to_patient SET DEFAULT FALSE;
ALTER TABLE note_specialistiche  ALTER COLUMN visible_to_patient SET DEFAULT FALSE;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='patient_documents' AND column_name='visible') THEN
    ALTER TABLE patient_documents ADD COLUMN visible BOOLEAN NOT NULL DEFAULT FALSE;
  ELSE
    ALTER TABLE patient_documents ALTER COLUMN visible SET DEFAULT FALSE;
  END IF;
END $$;

-- dati_extra JSONB su schede_valutazione (per pliche, circonferenze bilaterali, esami ematochimici)
ALTER TABLE schede_valutazione ADD COLUMN IF NOT EXISTS dati_extra JSONB;

-- codice_fiscale su cartelle
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='cartelle' AND column_name='codice_fiscale') THEN
    ALTER TABLE cartelle ADD COLUMN codice_fiscale TEXT;
  END IF;
END $$;

-- sleep_hours e activity su daily_wellness
ALTER TABLE daily_wellness ADD COLUMN IF NOT EXISTS sleep_hours NUMERIC(4,1);
ALTER TABLE daily_wellness ADD COLUMN IF NOT EXISTS activity TEXT;

-- patient_id e cartella_id su daily_wellness e weight_logs
ALTER TABLE daily_wellness ADD COLUMN IF NOT EXISTS patient_id  UUID REFERENCES auth.users;
ALTER TABLE daily_wellness ADD COLUMN IF NOT EXISTS cartella_id UUID REFERENCES cartelle(id) ON DELETE CASCADE;
ALTER TABLE weight_logs    ADD COLUMN IF NOT EXISTS patient_id  UUID REFERENCES auth.users;
ALTER TABLE weight_logs    ADD COLUMN IF NOT EXISTS cartella_id UUID REFERENCES cartelle(id) ON DELETE CASCADE;

-- print_image_url su tutte le tabelle che hanno un documento stampabile
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['patient_documents','piani','ncpt','bia_records','schede_valutazione','note_specialistiche'] LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=t) THEN
      EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS print_image_url TEXT', t);
    END IF;
  END LOOP;
END $$;

-- Explicit safety net: tables may have been created after the DO block ran
ALTER TABLE IF EXISTS bia_records ADD COLUMN IF NOT EXISTS print_image_url TEXT;
ALTER TABLE IF EXISTS ncpt         ADD COLUMN IF NOT EXISTS print_image_url TEXT;


-- ═══════════════════════════════════════════════════════════════════════════
-- SEZIONE 9 — STORAGE BUCKET document-prints
-- ═══════════════════════════════════════════════════════════════════════════

-- ⚠️ PRIVATO (era pubblico fino a SEZIONE 33): contiene immagini PNG di
-- documenti clinici (piani, ecc.) — PHI. Le policy sotto (dietista collegato
-- in scrittura, paziente proprietario in lettura) erano già corrette ma
-- venivano VANIFICATE dal flag public=TRUE, perché su un bucket pubblico
-- l'accesso in lettura via URL bypassa del tutto le policy SELECT. Il codice
-- (js/print-capture.js) ora usa createSignedUrl() invece di getPublicUrl().
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'document-prints', 'document-prints', FALSE,
  10485760,
  ARRAY['image/png','image/jpeg','image/webp']
)
ON CONFLICT (id) DO UPDATE
  SET public             = EXCLUDED.public,
      file_size_limit    = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Dietista collegato al paziente: accesso completo alla cartella del paziente
DROP POLICY IF EXISTS "document_prints_dietitian_write" ON storage.objects;
CREATE POLICY "document_prints_dietitian_write" ON storage.objects
  FOR ALL
  USING (
    bucket_id = 'document-prints'
    AND EXISTS (
      SELECT 1 FROM public.patient_dietitian pd
      WHERE pd.dietitian_id = auth.uid()
        AND pd.patient_id::text = (storage.foldername(name))[1]
    )
  )
  WITH CHECK (
    bucket_id = 'document-prints'
    AND EXISTS (
      SELECT 1 FROM public.patient_dietitian pd
      WHERE pd.dietitian_id = auth.uid()
        AND pd.patient_id::text = (storage.foldername(name))[1]
    )
  );

-- Paziente: accesso in sola lettura alla propria cartella
DROP POLICY IF EXISTS "document_prints_patient_read" ON storage.objects;
CREATE POLICY "document_prints_patient_read" ON storage.objects
  FOR SELECT
  USING (
    bucket_id = 'document-prints'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );


-- ═══════════════════════════════════════════════════════════════════════════
-- SEZIONE 10 — RLS: TABELLE NUTRIZIONISTA (CRUD)
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE cartelle             ENABLE ROW LEVEL SECURITY;
ALTER TABLE piani                ENABLE ROW LEVEL SECURITY;
ALTER TABLE ncpt                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE bia_records          ENABLE ROW LEVEL SECURITY;
ALTER TABLE schede_valutazione   ENABLE ROW LEVEL SECURITY;
ALTER TABLE note_specialistiche  ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='cartelle_dietitian_all' AND tablename='cartelle') THEN
    CREATE POLICY "cartelle_dietitian_all" ON cartelle
      FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='piani_dietitian_all' AND tablename='piani') THEN
    CREATE POLICY "piani_dietitian_all" ON piani
      FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='ncpt_dietitian_all' AND tablename='ncpt') THEN
    CREATE POLICY "ncpt_dietitian_all" ON ncpt
      FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='bia_records_dietitian_all' AND tablename='bia_records') THEN
    CREATE POLICY "bia_records_dietitian_all" ON bia_records
      FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='schede_valutazione_dietitian_all' AND tablename='schede_valutazione') THEN
    CREATE POLICY "schede_valutazione_dietitian_all" ON schede_valutazione
      FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='note_specialistiche_dietitian_all' AND tablename='note_specialistiche') THEN
    CREATE POLICY "note_specialistiche_dietitian_all" ON note_specialistiche
      FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;


-- ═══════════════════════════════════════════════════════════════════════════
-- SEZIONE 11 — RLS: PATIENT PORTAL (accesso paziente ai documenti)
-- ═══════════════════════════════════════════════════════════════════════════

-- Cartelle: paziente può leggere le proprie
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='cartelle_select_linked_patient' AND tablename='cartelle') THEN
    CREATE POLICY "cartelle_select_linked_patient" ON cartelle
      FOR SELECT USING (is_linked_patient(id));
  END IF;
END $$;

-- Piani: paziente vede solo quelli resi visibili
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='piani_select_patient_visible' AND tablename='piani') THEN
    CREATE POLICY "piani_select_patient_visible" ON piani
      FOR SELECT USING (visible_to_patient = TRUE AND is_linked_patient(cartella_id));
  END IF;
END $$;

-- NCPt
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='ncpt_select_patient_visible' AND tablename='ncpt') THEN
    CREATE POLICY "ncpt_select_patient_visible" ON ncpt
      FOR SELECT USING (visible_to_patient = TRUE AND is_linked_patient(cartella_id));
  END IF;
END $$;

-- BIA
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='bia_records_select_patient_visible' AND tablename='bia_records') THEN
    CREATE POLICY "bia_records_select_patient_visible" ON bia_records
      FOR SELECT USING (visible_to_patient = TRUE AND is_linked_patient(cartella_id));
  END IF;
END $$;

-- Schede valutazione
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='schede_valutazione_select_patient_visible' AND tablename='schede_valutazione') THEN
    CREATE POLICY "schede_valutazione_select_patient_visible" ON schede_valutazione
      FOR SELECT USING (visible_to_patient = TRUE AND is_linked_patient(cartella_id));
  END IF;
END $$;

-- Note specialistiche
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='note_specialistiche_select_patient_visible' AND tablename='note_specialistiche') THEN
    CREATE POLICY "note_specialistiche_select_patient_visible" ON note_specialistiche
      FOR SELECT USING (visible_to_patient = TRUE AND is_linked_patient(cartella_id));
  END IF;
END $$;

-- Patient documents
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='patient_documents_select_patient_visible' AND tablename='patient_documents') THEN
    CREATE POLICY "patient_documents_select_patient_visible" ON patient_documents
      FOR SELECT USING (visible = TRUE AND is_linked_patient(cartella_id));
  END IF;
END $$;

-- patient_documents è una tabella condivisa con Diet-Plan-Pro-app-claude, il
-- cui supabase-schema.sql aggiunge una policy UPDATE "paziente firma documento"
-- (using/with check solo su patient_id = auth.uid()) per permettere la firma
-- privacy/consenso. RLS è per-riga, non per-colonna: senza questo trigger un
-- paziente potrebbe riscrivere QUALSIASI colonna della propria riga (incluso
-- dietitian_id, per farla comparire tra i documenti di un dietista estraneo),
-- non solo i campi firma. Ricreato qui (DROP+CREATE) invece che solo nell'altro
-- file perché non è garantito quale script giri per ultimo sul DB condiviso.
-- Accesso ai campi via jsonb (non OLD.patient_id diretto): la variante
-- NutriPlan-Pro pura di questa tabella non ha una colonna patient_id (usa
-- cartella_id), quindi un accesso tipizzato diretto romperebbe ogni UPDATE
-- su quella variante con "record has no field patient_id".
CREATE OR REPLACE FUNCTION prevent_patient_document_tampering()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  allowed TEXT[] := ARRAY['signed_at','signature_data','signature_accepted'];
  old_j JSONB := to_jsonb(OLD);
  patient_uid UUID;
  dietitian_uid UUID;
BEGIN
  IF NOT (old_j ? 'patient_id') THEN
    RETURN NEW;
  END IF;
  patient_uid   := (old_j->>'patient_id')::UUID;
  dietitian_uid := (old_j->>'dietitian_id')::UUID;
  IF auth.uid() = patient_uid AND auth.uid() IS DISTINCT FROM dietitian_uid THEN
    IF (to_jsonb(NEW) - allowed) IS DISTINCT FROM (old_j - allowed) THEN
      RAISE EXCEPTION 'Un paziente può modificare solo i campi di firma del documento';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_patient_document_tampering ON patient_documents;
CREATE TRIGGER trg_prevent_patient_document_tampering
  BEFORE UPDATE ON patient_documents
  FOR EACH ROW EXECUTE FUNCTION prevent_patient_document_tampering();


-- ═══════════════════════════════════════════════════════════════════════════
-- SEZIONE 12 — RLS: DIARIO PAZIENTE (daily_wellness + weight_logs)
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE daily_wellness ENABLE ROW LEVEL SECURITY;
ALTER TABLE weight_logs    ENABLE ROW LEVEL SECURITY;

-- Paziente inserisce le proprie voci di diario
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='daily_wellness_insert_patient' AND tablename='daily_wellness') THEN
    CREATE POLICY "daily_wellness_insert_patient" ON daily_wellness
      FOR INSERT WITH CHECK (
        auth.uid() = patient_id
        AND EXISTS (SELECT 1 FROM patient_dietitian
                    WHERE patient_dietitian.patient_id = auth.uid()
                      AND patient_dietitian.cartella_id = daily_wellness.cartella_id)
      );
  END IF;
END $$;

-- Paziente legge le proprie voci; nutrizionista legge quelle dei propri pazienti
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='daily_wellness_select_patient' AND tablename='daily_wellness') THEN
    CREATE POLICY "daily_wellness_select_patient" ON daily_wellness
      FOR SELECT USING (
        auth.uid() = patient_id
        OR EXISTS (SELECT 1 FROM patient_dietitian
                   WHERE patient_dietitian.patient_id = auth.uid()
                     AND patient_dietitian.cartella_id = daily_wellness.cartella_id)
      );
  END IF;
END $$;

-- Paziente aggiorna le proprie voci (upsert onConflict user_id,date da patient-portal.html/Diet-Plan-Pro)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='daily_wellness_update_patient' AND tablename='daily_wellness') THEN
    CREATE POLICY "daily_wellness_update_patient" ON daily_wellness
      FOR UPDATE USING (
        auth.uid() = patient_id
        AND EXISTS (SELECT 1 FROM patient_dietitian
                    WHERE patient_dietitian.patient_id = auth.uid()
                      AND patient_dietitian.cartella_id = daily_wellness.cartella_id)
      ) WITH CHECK (
        auth.uid() = patient_id
        AND EXISTS (SELECT 1 FROM patient_dietitian
                    WHERE patient_dietitian.patient_id = auth.uid()
                      AND patient_dietitian.cartella_id = daily_wellness.cartella_id)
      );
  END IF;
END $$;

-- Stessa logica per weight_logs
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='weight_logs_insert_patient' AND tablename='weight_logs') THEN
    CREATE POLICY "weight_logs_insert_patient" ON weight_logs
      FOR INSERT WITH CHECK (
        auth.uid() = patient_id
        AND EXISTS (SELECT 1 FROM patient_dietitian
                    WHERE patient_dietitian.patient_id = auth.uid()
                      AND patient_dietitian.cartella_id = weight_logs.cartella_id)
      );
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='weight_logs_update_patient' AND tablename='weight_logs') THEN
    CREATE POLICY "weight_logs_update_patient" ON weight_logs
      FOR UPDATE USING (
        auth.uid() = patient_id
        AND EXISTS (SELECT 1 FROM patient_dietitian
                    WHERE patient_dietitian.patient_id = auth.uid()
                      AND patient_dietitian.cartella_id = weight_logs.cartella_id)
      ) WITH CHECK (
        auth.uid() = patient_id
        AND EXISTS (SELECT 1 FROM patient_dietitian
                    WHERE patient_dietitian.patient_id = auth.uid()
                      AND patient_dietitian.cartella_id = weight_logs.cartella_id)
      );
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='weight_logs_select_patient' AND tablename='weight_logs') THEN
    CREATE POLICY "weight_logs_select_patient" ON weight_logs
      FOR SELECT USING (
        auth.uid() = patient_id
        OR EXISTS (SELECT 1 FROM patient_dietitian
                   WHERE patient_dietitian.patient_id = auth.uid()
                     AND patient_dietitian.cartella_id = weight_logs.cartella_id)
      );
  END IF;
END $$;


-- ═══════════════════════════════════════════════════════════════════════════
-- SEZIONE 13 — RLS: NUTRIZIONISTA LEGGE DIARIO PAZIENTE
-- ═══════════════════════════════════════════════════════════════════════════

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='daily_wellness_select_dietitian' AND tablename='daily_wellness') THEN
    CREATE POLICY "daily_wellness_select_dietitian" ON daily_wellness
      FOR SELECT USING (
        EXISTS (SELECT 1 FROM patient_dietitian
                WHERE patient_dietitian.dietitian_id = auth.uid()
                  AND patient_dietitian.cartella_id = daily_wellness.cartella_id)
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='weight_logs_select_dietitian' AND tablename='weight_logs') THEN
    CREATE POLICY "weight_logs_select_dietitian" ON weight_logs
      FOR SELECT USING (
        EXISTS (SELECT 1 FROM patient_dietitian
                WHERE patient_dietitian.dietitian_id = auth.uid()
                  AND patient_dietitian.cartella_id = weight_logs.cartella_id)
      );
  END IF;
END $$;


-- ═══════════════════════════════════════════════════════════════════════════
-- SEZIONE 14 — REALTIME
-- ═══════════════════════════════════════════════════════════════════════════

-- REPLICA IDENTITY FULL: necessario per valutare le policy RLS sugli eventi Realtime
ALTER TABLE patient_documents    REPLICA IDENTITY FULL;
ALTER TABLE piani                REPLICA IDENTITY FULL;
ALTER TABLE ncpt                 REPLICA IDENTITY FULL;
ALTER TABLE bia_records          REPLICA IDENTITY FULL;
ALTER TABLE schede_valutazione   REPLICA IDENTITY FULL;
ALTER TABLE note_specialistiche  REPLICA IDENTITY FULL;
ALTER TABLE daily_wellness       REPLICA IDENTITY FULL;
ALTER TABLE weight_logs          REPLICA IDENTITY FULL;
ALTER TABLE agenda_events        REPLICA IDENTITY FULL;

-- SEZIONE 15 — ESAMI BIOCHIMICI
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS esami_biochimici (
  id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  cartella_id UUID        NOT NULL REFERENCES cartelle(id) ON DELETE CASCADE,
  tipo        TEXT        NOT NULL,
  valore      NUMERIC     NOT NULL,
  unita       TEXT,
  data_esame  DATE,
  note        TEXT,
  created_at  TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE esami_biochimici ENABLE ROW LEVEL SECURITY;
ALTER TABLE esami_biochimici REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='esami_biochimici_dietitian_all' AND tablename='esami_biochimici') THEN
    CREATE POLICY "esami_biochimici_dietitian_all" ON esami_biochimici
      FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

-- SEZIONE 13 — RLS: DIARIO PAZIENTE (water_logs + activity_logs per dietista)
-- Permette al dietista di leggere i log idrici e attività del paziente collegato.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='water_logs_dietitian_read' AND tablename='water_logs') THEN
    CREATE POLICY "water_logs_dietitian_read" ON water_logs
      FOR SELECT USING (
        EXISTS (
          SELECT 1 FROM patient_dietitian pd
          WHERE pd.patient_id = water_logs.user_id
            AND pd.dietitian_id = auth.uid()
        )
      );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='activity_logs_dietitian_read' AND tablename='activity_logs') THEN
    CREATE POLICY "activity_logs_dietitian_read" ON activity_logs
      FOR SELECT USING (
        EXISTS (
          SELECT 1 FROM patient_dietitian pd
          WHERE pd.patient_id = activity_logs.user_id
            AND pd.dietitian_id = auth.uid()
        )
      );
  END IF;
END $$;

-- Pubblicazione Realtime: solo le tabelle attivamente subscribed dall'app pazienti
-- (chat_messages e patient_documents — vedi NotificationContext.jsx)
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['chat_messages', 'patient_documents'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE %I', t);
    END IF;
  END LOOP;
END $$;

-- Fix ruoli: imposta 'dietitian' per tutti gli account approvati che non sono esplicitamente pazienti
-- (corregge account legacy con role = NULL)
UPDATE public.profiles
SET role = 'dietitian'
WHERE approved = true
  AND is_admin = false
  AND (role IS NULL OR role != 'patient')
  AND id NOT IN (
    SELECT DISTINCT patient_id FROM public.patient_dietitian
    WHERE patient_id IS NOT NULL
  );

-- ═══════════════════════════════════════════════════════════════════════════
-- SEZIONE 15 — PATIENT_FILES (allegati liberi in cartella)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS patient_files (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  cartella_id   UUID        NOT NULL REFERENCES cartelle(id) ON DELETE CASCADE,
  filename      TEXT        NOT NULL,
  storage_path  TEXT        NOT NULL,
  file_size     BIGINT,
  mime_type     TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE patient_files ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='patient_files_dietitian_all' AND tablename='patient_files') THEN
    CREATE POLICY "patient_files_dietitian_all" ON patient_files
      FOR ALL USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

-- Storage bucket patient-files
-- SECURITY FIX: aggiunti file_size_limit e allowed_mime_types — l'upload
-- lato client (pazienti.html) valida già tipo/dimensione, ma senza un limite
-- sul bucket stesso quel controllo è aggirabile con una chiamata diretta alla
-- Storage API. ON CONFLICT DO UPDATE per applicare il limite anche se il
-- bucket esiste già da un'installazione precedente.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'patient-files', 'patient-files', false, 15728640,
  ARRAY['application/pdf','image/jpeg','image/png','image/webp','image/heic',
        'application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'text/csv','text/plain']
)
ON CONFLICT (id) DO UPDATE SET
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- SECURITY FIX: le policy sotto controllavano solo "auth.uid() IS NOT NULL",
-- quindi QUALSIASI dietista autenticato poteva leggere/sovrascrivere/cancellare
-- gli allegati di QUALSIASI altro dietista/paziente conoscendo/indovinando lo
-- storage path (che è pubblico solo entro l'app, ma la policy non lo verificava
-- affatto). Il path è sempre "<uid di chi carica>/<cartella_id>/<file>" — la
-- policy ora impone che il primo segmento coincida con l'utente autenticato,
-- coerente con la RLS già corretta su patient_files (auth.uid() = user_id).
DROP POLICY IF EXISTS "patient_files_storage_insert" ON storage.objects;
CREATE POLICY "patient_files_storage_insert" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'patient-files'
    AND auth.uid() IS NOT NULL
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "patient_files_storage_select" ON storage.objects;
CREATE POLICY "patient_files_storage_select" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'patient-files'
    AND auth.uid() IS NOT NULL
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "patient_files_storage_delete" ON storage.objects;
CREATE POLICY "patient_files_storage_delete" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'patient-files'
    AND auth.uid() IS NOT NULL
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- GDPR: colonna consenso sulle cartelle
ALTER TABLE cartelle ADD COLUMN IF NOT EXISTS gdpr_consenso BOOLEAN DEFAULT FALSE;
ALTER TABLE cartelle ADD COLUMN IF NOT EXISTS gdpr_consenso_at TIMESTAMPTZ;

-- ── Benessere paziente: colonne aggiunte dall'app per pazienti (feature stress + idratazione) ──
-- Eseguire dopo aver già creato daily_wellness con le colonne base.
ALTER TABLE daily_wellness ADD COLUMN IF NOT EXISTS stress_level    INTEGER CHECK (stress_level    BETWEEN 1 AND 5);
ALTER TABLE daily_wellness ADD COLUMN IF NOT EXISTS hydration_level INTEGER CHECK (hydration_level BETWEEN 1 AND 5);

-- ── Ciclo mestruale (app paziente) ──
CREATE TABLE IF NOT EXISTS menstrual_cycle (
  id           UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id      UUID        REFERENCES auth.users(id) ON DELETE CASCADE,
  start_date   DATE        NOT NULL,
  end_date     DATE,
  cycle_length INTEGER,
  notes        TEXT,
  symptoms     TEXT[],
  created_at   TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE menstrual_cycle ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='menstrual_cycle_own' AND tablename='menstrual_cycle') THEN
    CREATE POLICY "menstrual_cycle_own" ON menstrual_cycle
      FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  END IF;
  -- Permette al dietista di leggere i cicli dei pazienti collegati
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='menstrual_cycle_dietitian_read' AND tablename='menstrual_cycle') THEN
    CREATE POLICY "menstrual_cycle_dietitian_read" ON menstrual_cycle
      FOR SELECT USING (
        EXISTS (
          SELECT 1 FROM patient_dietitian pd
          WHERE pd.patient_id = menstrual_cycle.user_id
            AND pd.dietitian_id = auth.uid()
        )
      );
  END IF;
END $$;


-- ═══════════════════════════════════════════════════════════════════════════
-- SECURITY FIX — chat_messages era priva di RLS: qualunque utente loggato
-- poteva leggere/scrivere la chat di qualsiasi paziente con una select('*').
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='chat_messages_own_or_linked' AND tablename='chat_messages') THEN
    CREATE POLICY "chat_messages_own_or_linked" ON chat_messages
      FOR ALL USING (
        auth.uid() = patient_id
        OR EXISTS (
          SELECT 1 FROM patient_dietitian pd
          WHERE pd.patient_id = chat_messages.patient_id
            AND pd.dietitian_id = auth.uid()
        )
      )
      WITH CHECK (
        auth.uid() = patient_id
        OR EXISTS (
          SELECT 1 FROM patient_dietitian pd
          WHERE pd.patient_id = chat_messages.patient_id
            AND pd.dietitian_id = auth.uid()
        )
      );
  END IF;
END $$;


-- ═══════════════════════════════════════════════════════════════════════════
-- SECURITY FIX — profiles_update_own non aveva WITH CHECK: un utente poteva
-- fare UPDATE profiles SET is_admin=true, approved=true, role='dietitian'
-- sulla propria riga e auto-promuoversi, perché la USING clause (auth.uid()=id)
-- resta vera prima e dopo l'update. Un trigger blocca il cambio di questi tre
-- campi a meno che chi esegue l'update non sia già admin (check_is_admin()),
-- e non interferisce con operazioni dirette da SQL editor / service role
-- (dove auth.uid() è NULL).
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION prevent_self_privilege_escalation()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT check_is_admin() THEN
    NEW.is_admin := OLD.is_admin;
    NEW.approved := OLD.approved;
    NEW.role     := OLD.role;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prevent_self_privilege_escalation ON profiles;
CREATE TRIGGER prevent_self_privilege_escalation
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION prevent_self_privilege_escalation();


-- ═══════════════════════════════════════════════════════════════════════════
-- AUDIT LOG — dati clinici
-- Traccia scritture (insert/update/delete) sulle tabelle cliniche sensibili:
-- chi (changed_by), cosa (table_name/record_id/operation, colonne cambiate
-- per gli update), quando (created_at), per quale paziente/cartella.
-- NOTA: questo copre solo le SCRITTURE — un vero audit degli ACCESSI IN LETTURA
-- richiederebbe strumentare ogni query lato applicazione (Postgres non genera
-- trigger sui SELECT), che è fuori scope qui.
-- Questa stessa tabella/funzione è definita in modo identico e idempotente
-- anche in supabase-schema.sql (Diet-Plan-Pro-app-claude), perché i due
-- progetti condividono lo stesso DB Supabase: qualunque dei due script giri
-- per primo la crea, il secondo è un no-op.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS clinical_audit_log (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name       TEXT        NOT NULL,
  record_id        UUID,
  operation        TEXT        NOT NULL CHECK (operation IN ('INSERT','UPDATE','DELETE')),
  changed_by       UUID        REFERENCES auth.users(id),
  changed_columns  TEXT[],
  patient_id       UUID,
  cartella_id      UUID,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_clinical_audit_log_patient ON clinical_audit_log(patient_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_clinical_audit_log_cartella ON clinical_audit_log(cartella_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_clinical_audit_log_table_record ON clinical_audit_log(table_name, record_id);

ALTER TABLE clinical_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "clinical_audit_log_dietitian_read" ON clinical_audit_log;
CREATE POLICY "clinical_audit_log_dietitian_read" ON clinical_audit_log
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM patient_dietitian pd
      WHERE pd.dietitian_id = auth.uid()
        AND (
          (clinical_audit_log.patient_id IS NOT NULL AND pd.patient_id = clinical_audit_log.patient_id)
          OR (clinical_audit_log.cartella_id IS NOT NULL AND pd.cartella_id = clinical_audit_log.cartella_id)
        )
    )
  );

-- Trasparenza verso il paziente: può vedere chi ha toccato i propri dati clinici.
DROP POLICY IF EXISTS "clinical_audit_log_own_read" ON clinical_audit_log;
CREATE POLICY "clinical_audit_log_own_read" ON clinical_audit_log
  FOR SELECT USING (patient_id = auth.uid());

-- Nessuna policy INSERT/UPDATE/DELETE per authenticated/anon: le uniche
-- scritture ammesse sono quelle della funzione trigger sotto (SECURITY DEFINER).

CREATE OR REPLACE FUNCTION log_clinical_change()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_row JSONB;
  v_changed_cols TEXT[];
BEGIN
  -- COALESCE su tipi record/composite è ambiguo in plpgsql: branching esplicito.
  IF TG_OP = 'DELETE' THEN
    v_row := to_jsonb(OLD);
  ELSE
    v_row := to_jsonb(NEW);
  END IF;

  IF TG_OP = 'UPDATE' THEN
    SELECT array_agg(n.key) INTO v_changed_cols
    FROM jsonb_each(to_jsonb(NEW)) n
    JOIN jsonb_each(to_jsonb(OLD)) o ON n.key = o.key
    WHERE n.value IS DISTINCT FROM o.value;
  END IF;

  INSERT INTO clinical_audit_log (table_name, record_id, operation, changed_by, changed_columns, patient_id, cartella_id)
  VALUES (
    TG_TABLE_NAME,
    (v_row->>'id')::uuid,
    TG_OP,
    auth.uid(),
    v_changed_cols,
    COALESCE(NULLIF(v_row->>'patient_id',''), NULLIF(v_row->>'user_id',''))::uuid,
    -- La tabella cartelle non ha una colonna cartella_id: è identificata dal
    -- proprio id, che qui coincide col cartella_id da usare per il collegamento RLS.
    CASE WHEN TG_TABLE_NAME = 'cartelle' THEN (v_row->>'id')::uuid
         ELSE NULLIF(v_row->>'cartella_id','')::uuid END
  );

  -- Il valore di ritorno di un trigger AFTER viene ignorato da Postgres.
  RETURN NULL;
END;
$$;

-- Tabelle cliniche definite in QUESTO file.
DROP TRIGGER IF EXISTS trg_audit_cartelle ON cartelle;
CREATE TRIGGER trg_audit_cartelle AFTER INSERT OR UPDATE OR DELETE ON cartelle
  FOR EACH ROW EXECUTE FUNCTION log_clinical_change();

DROP TRIGGER IF EXISTS trg_audit_ncpt ON ncpt;
CREATE TRIGGER trg_audit_ncpt AFTER INSERT OR UPDATE OR DELETE ON ncpt
  FOR EACH ROW EXECUTE FUNCTION log_clinical_change();

DROP TRIGGER IF EXISTS trg_audit_bia_records ON bia_records;
CREATE TRIGGER trg_audit_bia_records AFTER INSERT OR UPDATE OR DELETE ON bia_records
  FOR EACH ROW EXECUTE FUNCTION log_clinical_change();

DROP TRIGGER IF EXISTS trg_audit_schede_valutazione ON schede_valutazione;
CREATE TRIGGER trg_audit_schede_valutazione AFTER INSERT OR UPDATE OR DELETE ON schede_valutazione
  FOR EACH ROW EXECUTE FUNCTION log_clinical_change();

DROP TRIGGER IF EXISTS trg_audit_note_specialistiche ON note_specialistiche;
CREATE TRIGGER trg_audit_note_specialistiche AFTER INSERT OR UPDATE OR DELETE ON note_specialistiche
  FOR EACH ROW EXECUTE FUNCTION log_clinical_change();

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'esami_biochimici') THEN
    DROP TRIGGER IF EXISTS trg_audit_esami_biochimici ON esami_biochimici;
    CREATE TRIGGER trg_audit_esami_biochimici AFTER INSERT OR UPDATE OR DELETE ON esami_biochimici
      FOR EACH ROW EXECUTE FUNCTION log_clinical_change();
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'menstrual_cycle') THEN
    DROP TRIGGER IF EXISTS trg_audit_menstrual_cycle ON menstrual_cycle;
    CREATE TRIGGER trg_audit_menstrual_cycle AFTER INSERT OR UPDATE OR DELETE ON menstrual_cycle
      FOR EACH ROW EXECUTE FUNCTION log_clinical_change();
  END IF;
END $$;

-- Tabelle definite in ENTRAMBI i file (stessa tabella fisica, DB condiviso):
-- riattaccare qui è sicuro grazie al DROP TRIGGER IF EXISTS, a prescindere da
-- quale dei due script giri per primo.
DROP TRIGGER IF EXISTS trg_audit_chat_messages ON chat_messages;
CREATE TRIGGER trg_audit_chat_messages AFTER INSERT OR UPDATE OR DELETE ON chat_messages
  FOR EACH ROW EXECUTE FUNCTION log_clinical_change();

DROP TRIGGER IF EXISTS trg_audit_patient_documents ON patient_documents;
CREATE TRIGGER trg_audit_patient_documents AFTER INSERT OR UPDATE OR DELETE ON patient_documents
  FOR EACH ROW EXECUTE FUNCTION log_clinical_change();


-- ═══════════════════════════════════════════════════════════════════════════
-- RUOLI GRANULARI NELLO STUDIO — segretaria vs titolare (backend)
--
-- Un "collaboratore" è un account già registrato come dietista sulla
-- piattaforma (approvato dall'admin come tutti gli altri) che il titolare
-- collega al proprio studio con un livello di permesso:
--   - 'secretary'  → può LEGGERE cartelle/piani/NCPt/BIA/schede/note del
--                    titolare e gestire agenda/appuntamenti, ma non può
--                    scrivere sui dati clinici.
--   - 'dietitian'  → accesso pieno (lettura + scrittura) come il titolare.
--
-- get_studio_owner(uid): per un collaboratore restituisce l'id del titolare
-- a cui è collegato; per chiunque altro (titolare o dietista indipendente)
-- restituisce se stesso. Usarla al posto di un confronto diretto con
-- auth.uid() ovunque un collaboratore debba "vedere ciò che vede il titolare".
--
-- Questa stessa tabella/funzioni sono definite in modo identico e idempotente
-- anche in supabase-schema.sql (Diet-Plan-Pro-app-claude), stesso DB condiviso.
--
-- Copertura attuale (deliberatamente non esaustiva — vedi nota finale):
--   patient_dietitian (lettura), cartelle/piani/ncpt/bia_records/
--   schede_valutazione/note_specialistiche (lettura per entrambi i livelli,
--   scrittura solo per livello 'dietitian'), agenda/appuntamenti (vedi
--   supabase-schema.sql, entrambi i livelli in scrittura).
-- Le altre tabelle cliniche (es. esami_biochimici, patient_documents) NON
-- sono ancora state estese: seguono lo stesso pattern se servirà in futuro.
--
-- Nessuna UI di conferma/invito via email: il titolare aggiunge un
-- collaboratore per email dalla pagina collaboratori.html, che risolve
-- l'email in un id tramite la tabella profiles (il collaboratore deve
-- già avere un account sulla piattaforma).
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS studio_collaborators (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  titolare_id       UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  collaborator_id   UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  permission_level  TEXT        NOT NULL DEFAULT 'secretary' CHECK (permission_level IN ('secretary','dietitian')),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (titolare_id, collaborator_id),
  CHECK (titolare_id <> collaborator_id)
);
CREATE INDEX IF NOT EXISTS idx_studio_collaborators_collaborator ON studio_collaborators(collaborator_id);
CREATE INDEX IF NOT EXISTS idx_studio_collaborators_titolare ON studio_collaborators(titolare_id);

ALTER TABLE studio_collaborators ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "studio_collaborators_titolare_manage" ON studio_collaborators;
CREATE POLICY "studio_collaborators_titolare_manage" ON studio_collaborators
  FOR ALL USING (auth.uid() = titolare_id) WITH CHECK (auth.uid() = titolare_id);

DROP POLICY IF EXISTS "studio_collaborators_collaborator_read" ON studio_collaborators;
CREATE POLICY "studio_collaborators_collaborator_read" ON studio_collaborators
  FOR SELECT USING (auth.uid() = collaborator_id);

CREATE OR REPLACE FUNCTION get_studio_owner(uid UUID)
RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(
    (SELECT titolare_id FROM studio_collaborators WHERE collaborator_id = uid LIMIT 1),
    uid
  );
$$;
GRANT EXECUTE ON FUNCTION get_studio_owner(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION is_dietitian_level_collaborator(uid UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  -- true per chiunque NON sia registrato come collaboratore 'secretary'
  -- (quindi vero anche per titolari e dietisti indipendenti)
  SELECT NOT EXISTS (
    SELECT 1 FROM studio_collaborators
    WHERE collaborator_id = uid AND permission_level = 'secretary'
  );
$$;
GRANT EXECUTE ON FUNCTION is_dietitian_level_collaborator(UUID) TO authenticated;

-- Risolve un'email in un id account per collegare un collaboratore: senza
-- questa RPC un titolare non potrebbe trovare l'id del collega da collegare,
-- perché le policy di profiles bloccano la lettura di profili non ancora
-- collegati. Espone solo id/nome/cognome, e solo per account dietista
-- approvati (mai pazienti), su match esatto dell'email.
CREATE OR REPLACE FUNCTION find_dietitian_by_email(p_email TEXT)
RETURNS TABLE(id UUID, nome TEXT, cognome TEXT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.id, p.nome, p.cognome
  FROM profiles p
  WHERE p.email = p_email AND p.role = 'dietitian' AND p.approved = true
  LIMIT 1;
$$;
GRANT EXECUTE ON FUNCTION find_dietitian_by_email(TEXT) TO authenticated;

-- ── patient_dietitian: il collaboratore vede il roster pazienti del titolare ──
DROP POLICY IF EXISTS "patient_dietitian_collaborator_read" ON patient_dietitian;
CREATE POLICY "patient_dietitian_collaborator_read" ON patient_dietitian
  FOR SELECT USING (dietitian_id = get_studio_owner(auth.uid()));

-- ── Tabelle cliniche "user_id = dietista proprietario": stesso pattern per tutte ──
DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['cartelle','piani','ncpt','bia_records','schede_valutazione','note_specialistiche']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', tbl || '_collaborator_read', tbl);
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR SELECT USING (user_id = get_studio_owner(auth.uid()))',
      tbl || '_collaborator_read', tbl
    );

    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', tbl || '_collaborator_write', tbl);
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR ALL USING (user_id = get_studio_owner(auth.uid()) AND is_dietitian_level_collaborator(auth.uid())) WITH CHECK (user_id = get_studio_owner(auth.uid()) AND is_dietitian_level_collaborator(auth.uid()))',
      tbl || '_collaborator_write', tbl
    );
  END LOOP;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- SEZIONE 16 — GRUPPI DI CHAT (dietisti + pazienti insieme, stile WhatsApp)
--
-- Sostituisce la proposta mai eseguita in supabase/new_features.sql
-- (patient_groups/patient_group_members: solo pazienti, nessuna chat
-- persistente, solo liste destinatari per un invio broadcast una-tantum).
-- broadcast_messages viene invece creata qui: resta lo storico dell'invio
-- rapido "una tantum" a più pazienti, funzionalità distinta dai gruppi.
-- ═══════════════════════════════════════════════════════════════════════════

-- Colonna condivisa con Diet-Plan-Pro-app-claude (supabase-schema.sql riga
-- ~351): l'app paziente la aggiorna ogni 60s per lo stato online in chat.
-- Ridichiarata qui in modo difensivo nel caso questo file giri per primo.
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS chat_groups (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT        NOT NULL,
  color         TEXT        NOT NULL DEFAULT '#0F766E',
  created_by    UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS chat_group_members (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id      UUID        NOT NULL REFERENCES chat_groups(id) ON DELETE CASCADE,
  user_id       UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  member_role   TEXT        NOT NULL CHECK (member_role IN ('dietitian','patient')),
  last_read_at  TIMESTAMPTZ,
  added_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (group_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_chat_group_members_group ON chat_group_members(group_id);
CREATE INDEX IF NOT EXISTS idx_chat_group_members_user  ON chat_group_members(user_id);

CREATE TABLE IF NOT EXISTS chat_group_messages (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id      UUID        NOT NULL REFERENCES chat_groups(id) ON DELETE CASCADE,
  sender_id     UUID        NOT NULL REFERENCES auth.users(id),
  content       TEXT        NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_chat_group_messages_group_created ON chat_group_messages(group_id, created_at DESC);

CREATE TABLE IF NOT EXISTS broadcast_messages (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  dietitian_id      UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  message_text      TEXT        NOT NULL,
  message_type      TEXT        NOT NULL DEFAULT 'chat' CHECK (message_type IN ('chat','notification')),
  recipients_count  INTEGER     NOT NULL DEFAULT 0,
  patient_ids       UUID[]      NOT NULL DEFAULT '{}',
  group_name        TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_broadcast_messages_dietitian_created ON broadcast_messages(dietitian_id, created_at DESC);

ALTER TABLE chat_groups          ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_group_members   ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_group_messages  ENABLE ROW LEVEL SECURITY;
ALTER TABLE broadcast_messages   ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION is_chat_group_member(gid UUID, uid UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM chat_group_members WHERE group_id = gid AND user_id = uid);
$$;
GRANT EXECUTE ON FUNCTION is_chat_group_member(UUID, UUID) TO authenticated;

DROP POLICY IF EXISTS "chat_groups_member_select" ON chat_groups;
CREATE POLICY "chat_groups_member_select" ON chat_groups
  FOR SELECT USING (is_chat_group_member(id, auth.uid()));

DROP POLICY IF EXISTS "chat_groups_dietitian_insert" ON chat_groups;
CREATE POLICY "chat_groups_dietitian_insert" ON chat_groups
  FOR INSERT WITH CHECK (
    auth.uid() = created_by
    AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'dietitian')
  );

DROP POLICY IF EXISTS "chat_groups_creator_update" ON chat_groups;
CREATE POLICY "chat_groups_creator_update" ON chat_groups
  FOR UPDATE USING (auth.uid() = created_by) WITH CHECK (auth.uid() = created_by);

DROP POLICY IF EXISTS "chat_groups_creator_delete" ON chat_groups;
CREATE POLICY "chat_groups_creator_delete" ON chat_groups
  FOR DELETE USING (auth.uid() = created_by);

DROP POLICY IF EXISTS "chat_group_members_select" ON chat_group_members;
CREATE POLICY "chat_group_members_select" ON chat_group_members
  FOR SELECT USING (is_chat_group_member(group_id, auth.uid()));

DROP POLICY IF EXISTS "chat_group_members_creator_insert" ON chat_group_members;
CREATE POLICY "chat_group_members_creator_insert" ON chat_group_members
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM chat_groups WHERE id = group_id AND created_by = auth.uid())
  );

DROP POLICY IF EXISTS "chat_group_members_creator_delete" ON chat_group_members;
CREATE POLICY "chat_group_members_creator_delete" ON chat_group_members
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM chat_groups WHERE id = group_id AND created_by = auth.uid())
  );

-- Un membro può aggiornare solo il proprio last_read_at (badge "non letti")
DROP POLICY IF EXISTS "chat_group_members_self_update" ON chat_group_members;
CREATE POLICY "chat_group_members_self_update" ON chat_group_members
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "chat_group_messages_member_select" ON chat_group_messages;
CREATE POLICY "chat_group_messages_member_select" ON chat_group_messages
  FOR SELECT USING (is_chat_group_member(group_id, auth.uid()));

DROP POLICY IF EXISTS "chat_group_messages_member_insert" ON chat_group_messages;
CREATE POLICY "chat_group_messages_member_insert" ON chat_group_messages
  FOR INSERT WITH CHECK (
    auth.uid() = sender_id AND is_chat_group_member(group_id, auth.uid())
  );

DROP POLICY IF EXISTS "broadcast_messages_dietitian_own" ON broadcast_messages;
CREATE POLICY "broadcast_messages_dietitian_own" ON broadcast_messages
  FOR ALL USING (auth.uid() = dietitian_id) WITH CHECK (auth.uid() = dietitian_id);

-- ── Visibilità profili per il selettore contatti e le chat di gruppo ────────

-- Un dietista vede i profili dei colleghi del proprio studio (titolare +
-- collaboratori), necessario per popolare il selettore contatti "Dietisti"
-- in broadcast.html indipendentemente dal legame patient_dietitian.
DROP POLICY IF EXISTS "profiles_select_studio_mates" ON profiles;
CREATE POLICY "profiles_select_studio_mates" ON profiles
  FOR SELECT USING (get_studio_owner(profiles.id) = get_studio_owner(auth.uid()));

-- Chi condivide un gruppo di chat vede il profilo (nome/badge) degli altri
-- membri, anche se non altrimenti collegati (es. paziente di un collega,
-- o paziente co-membro dello stesso gruppo).
DROP POLICY IF EXISTS "profiles_select_group_co_members" ON profiles;
CREATE POLICY "profiles_select_group_co_members" ON profiles
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM chat_group_members m1
      JOIN chat_group_members m2 ON m1.group_id = m2.group_id
      WHERE m1.user_id = auth.uid() AND m2.user_id = profiles.id
    )
  );

-- Il selettore contatti di broadcast.html deve funzionare anche per un
-- collaboratore (non solo per il titolare): estende la policy esistente
-- perché patient_dietitian.dietitian_id è sempre il titolare, mai il
-- collaboratore, quindi "dietitian_id = auth.uid()" da solo escludeva i
-- collaboratori dalla lettura dei profili paziente.
DROP POLICY IF EXISTS "profiles_select_linked_patients" ON profiles;
CREATE POLICY "profiles_select_linked_patients" ON profiles
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM patient_dietitian
            WHERE patient_dietitian.patient_id = profiles.id
              AND patient_dietitian.dietitian_id = get_studio_owner(auth.uid()))
  );

-- Realtime per il nuovo canale di gruppo (vedi SEZIONE 14)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'chat_group_messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE chat_group_messages;
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- SEZIONE 17 — GRUPPI: MESSAGGI VOCALI + PROGRAMMATI + PARITÀ CON LA CHAT 1:1
--
-- type/status/scheduled_at ricalcano la convenzione di chat.html sulla
-- chat_messages 1:1 (colonne type/status, non message_type — vedi nota
-- architetturale: le due app usano convenzioni diverse sulla stessa tabella
-- condivisa; qui, essendo una tabella nuova usata da ENTRAMBE le app, si fissa
-- UNA sola convenzione fin da subito).
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE chat_group_messages ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'text' CHECK (type IN ('text','voice'));
ALTER TABLE chat_group_messages ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'sent' CHECK (status IN ('sent','scheduled'));
ALTER TABLE chat_group_messages ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMPTZ;

-- Un messaggio programmato resta visibile SOLO al mittente finché non viene
-- promosso a 'sent' (dal poller client-side, stesso pattern imperfetto ma
-- già in uso in chat.html/checkScheduledMessages — nessuna funzione cron
-- server-side in questo progetto).
DROP POLICY IF EXISTS "chat_group_messages_member_select" ON chat_group_messages;
CREATE POLICY "chat_group_messages_member_select" ON chat_group_messages
  FOR SELECT USING (
    is_chat_group_member(group_id, auth.uid())
    AND (status = 'sent' OR sender_id = auth.uid())
  );

-- Serve al mittente per promuovere i propri messaggi da 'scheduled' a 'sent'
-- quando arriva l'orario programmato.
DROP POLICY IF EXISTS "chat_group_messages_sender_update" ON chat_group_messages;
CREATE POLICY "chat_group_messages_sender_update" ON chat_group_messages
  FOR UPDATE USING (auth.uid() = sender_id) WITH CHECK (auth.uid() = sender_id);

-- Storage bucket per i messaggi vocali di gruppo — privato con URL firmati
-- (~10 anni), stesso pattern già usato da Diet-Plan-Pro-app-claude per
-- chat-media, più sicuro del bucket pubblico usato da chat.html per la
-- chat 1:1 (voice-messages).
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('group-chat-media', 'group-chat-media', false, 10485760,
        ARRAY['audio/webm','audio/ogg','audio/mp4','audio/mpeg'])
ON CONFLICT (id) DO UPDATE SET
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Path: <group_id>/<file>.webm — primo segmento = id gruppo, verificato via
-- is_chat_group_member() (stesso helper delle policy sulle tabelle).
DROP POLICY IF EXISTS "group_chat_media_insert" ON storage.objects;
CREATE POLICY "group_chat_media_insert" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'group-chat-media'
    AND auth.uid() IS NOT NULL
    AND is_chat_group_member(((storage.foldername(name))[1])::uuid, auth.uid())
  );

DROP POLICY IF EXISTS "group_chat_media_select" ON storage.objects;
CREATE POLICY "group_chat_media_select" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'group-chat-media'
    AND auth.uid() IS NOT NULL
    AND is_chat_group_member(((storage.foldername(name))[1])::uuid, auth.uid())
  );

-- ═══════════════════════════════════════════════════════════════════════════
-- SEZIONE 18 — FIX: creazione gruppo falliva con 403
--
-- broadcast.html crea un gruppo con `INSERT ... RETURNING *` (per riavere
-- l'id) e SOLO DOPO inserisce la riga del creatore in chat_group_members
-- (chiamata separata). Nel momento del RETURNING la policy SELECT su
-- chat_groups richiedeva già l'appartenenza (is_chat_group_member), che a
-- quel punto non esiste ancora per nessuno — Postgres rifiuta di restituire
-- la riga appena creata → 403 su ogni creazione di gruppo. Il creatore deve
-- poter vedere il proprio gruppo appena creato indipendentemente dal fatto
-- che si sia già aggiunto come membro.
-- ═══════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "chat_groups_member_select" ON chat_groups;
CREATE POLICY "chat_groups_member_select" ON chat_groups
  FOR SELECT USING (
    is_chat_group_member(id, auth.uid()) OR created_by = auth.uid()
  );

-- ═══════════════════════════════════════════════════════════════════════════
-- SEZIONE 19 — ABBONAMENTO STRIPE (dietista)
--
-- Colonne lette/scritte da abbonamento.html e dalle edge function già presenti
-- in supabase/functions/{create-checkout-session,stripe-portal,stripe-webhook}
-- (create-patient-checkout-session è per Diet-Plan-Pro-app-claude, stesso
-- progetto Supabase condiviso, non tocca queste colonne di profiles se non
-- per stripe_customer_id che è generico per qualunque ruolo).
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS subscription_plan TEXT NOT NULL DEFAULT 'free';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS subscription_expires_at TIMESTAMPTZ;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT;
CREATE INDEX IF NOT EXISTS idx_profiles_stripe_customer ON profiles(stripe_customer_id) WHERE stripe_customer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_profiles_stripe_subscription ON profiles(stripe_subscription_id) WHERE stripe_subscription_id IS NOT NULL;

-- prevent_self_privilege_escalation() (SEZIONE precedente) blocca già
-- is_admin/approved/role da self-update, ma non conosceva ancora queste 4
-- colonne — senza estenderlo, QUALUNQUE dietista potrebbe fare
-- `UPDATE profiles SET subscription_plan='pro', subscription_expires_at=...`
-- dalla console del browser e ottenere Pro gratis per sempre. Solo
-- l'edge function stripe-webhook (service role, auth.uid() IS NULL) o un
-- admin devono poter cambiare queste colonne.
CREATE OR REPLACE FUNCTION prevent_self_privilege_escalation()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT check_is_admin() THEN
    NEW.is_admin := OLD.is_admin;
    NEW.approved := OLD.approved;
    NEW.role     := OLD.role;
    NEW.subscription_plan         := OLD.subscription_plan;
    NEW.subscription_expires_at   := OLD.subscription_expires_at;
    NEW.stripe_customer_id        := OLD.stripe_customer_id;
    NEW.stripe_subscription_id    := OLD.stripe_subscription_id;
  END IF;
  RETURN NEW;
END;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- SEZIONE 20 — PROMEMORIA AUTOMATICO PRE-APPUNTAMENTO
--
-- Colonna letta/scritta da api/cron-appointment-reminders.js (nuovo Vercel
-- Cron). `appointments` è definita in Diet-Plan-Pro-app-claude/supabase-
-- schema.sql (progetto Supabase condiviso) — questa colonna vive lì per
-- schema ownership, ma va eseguita qui perché il cron gira nel progetto
-- Vercel di NutriPlan-Pro. ADD COLUMN IF NOT EXISTS: nessun rischio a
-- eseguirla due volte o nell'ordine sbagliato rispetto all'altro repo.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE appointments ADD COLUMN IF NOT EXISTS reminder_sent_at TIMESTAMPTZ;

-- ═══════════════════════════════════════════════════════════════════════════
-- SEZIONE 21 — TEMPLATE PIANI ALIMENTARI + MARKETPLACE CONDIVISO TRA DIETISTI
--
-- `piani_template` era una feature già scritta in app.html (_saveTemplate/
-- _loadTemplates/_checkTemplateTable) ma la tabella non era mai stata creata:
-- l'app faceva fallback silenzioso a localStorage (template privati, non
-- sincronizzati tra dispositivi). Schema base ripreso identico dall'hint
-- già mostrato nel modal "Carica Template" quando la tabella manca, così
-- resta compatibile anche se un dietista l'avesse già creata a mano da lì.
-- Aggiunta `shared`/`usage_count` per il marketplace: un template condiviso
-- è leggibile da QUALUNQUE dietista della piattaforma (non solo colleghi di
-- studio, a differenza di studio_collaborators — qui è un marketplace
-- volutamente aperto, l'utente l'ha descritto come tale).
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS piani_template (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID        REFERENCES auth.users(id) ON DELETE CASCADE,
  nome         TEXT        NOT NULL,
  descrizione  TEXT,
  categoria    TEXT        DEFAULT 'Altro',
  meals        JSONB,
  giorni       JSONB,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  shared       BOOLEAN     NOT NULL DEFAULT FALSE,
  usage_count  INTEGER     NOT NULL DEFAULT 0
);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name='piani_template' AND column_name='shared') THEN
    ALTER TABLE piani_template ADD COLUMN shared BOOLEAN NOT NULL DEFAULT FALSE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name='piani_template' AND column_name='usage_count') THEN
    ALTER TABLE piani_template ADD COLUMN usage_count INTEGER NOT NULL DEFAULT 0;
  END IF;
END $$;

ALTER TABLE piani_template ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "template_own" ON piani_template;
CREATE POLICY "template_own" ON piani_template FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Lettura dei template condivisi da ALTRI dietisti (marketplace). Il ruolo
-- viene controllato per non esporre il marketplace anche ai pazienti, che
-- condividono lo stesso progetto Supabase/auth.users tramite Diet-Plan-Pro.
DROP POLICY IF EXISTS "template_shared_read" ON piani_template;
CREATE POLICY "template_shared_read" ON piani_template FOR SELECT
  USING (
    shared = true
    AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'dietitian')
  );

-- Un dietista che applica il template di un collega deve poter incrementare
-- usage_count senza possedere la riga: la policy "template_own" (FOR ALL)
-- blocca l'UPDATE diretto per chiunque non sia il proprietario, quindi serve
-- una funzione SECURITY DEFINER dedicata, che tocca solo quella colonna e
-- solo su righe realmente condivise.
CREATE OR REPLACE FUNCTION increment_template_usage(tmpl_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE piani_template SET usage_count = usage_count + 1
  WHERE id = tmpl_id AND shared = true;
END;
$$;
GRANT EXECUTE ON FUNCTION increment_template_usage(UUID) TO authenticated;

CREATE INDEX IF NOT EXISTS idx_piani_template_shared ON piani_template (shared) WHERE shared = true;

-- ═══════════════════════════════════════════════════════════════════════════
-- SEZIONE 22 — FATTURAZIONE ELETTRONICA (generazione XML FatturaPA)
--
-- `fatture` era già usata da pagamenti.html ma non esisteva in NESSUN file
-- .sql del repo (probabilmente mai creata su alcune installazioni — il
-- codice ha sempre avuto un fallback a localStorage per il caso "tabella
-- assente", codice errore 42P01). CREATE TABLE IF NOT EXISTS con lo schema
-- completo: non fa nulla se la tabella esiste già live, altrimenti la crea
-- da zero — sicura in entrambi i casi.
--
-- Importante: questa sezione genera XML conforme allo schema FatturaPA
-- 1.2.2 (formato FPR12, invio verso privati) ma NON lo trasmette allo SDI
-- — serve un canale accreditato (PEC, intermediario, o accreditamento
-- diretto con certificato digitale) che questa app non può fornire. Il
-- dietista scarica l'XML e lo invia tramite il proprio canale abituale.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS fatture (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  dietitian_id    UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  patient_id      UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  patient_name    TEXT,
  numero_fattura  TEXT,
  data_fattura    DATE        NOT NULL,
  tipo_visita     TEXT,
  importo         NUMERIC     NOT NULL DEFAULT 0,
  stato           TEXT        NOT NULL DEFAULT 'da_pagare',
  note            TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE fatture ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='fatture_all_own' AND tablename='fatture') THEN
    CREATE POLICY "fatture_all_own" ON fatture FOR ALL
      USING (auth.uid() = dietitian_id) WITH CHECK (auth.uid() = dietitian_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_fatture_dietitian ON fatture (dietitian_id, data_fattura DESC);

-- Colonne per la generazione XML FatturaPA (CessionarioCommittente = paziente
-- privato — la XSD richiede indirizzo completo e codice fiscale).
ALTER TABLE fatture ADD COLUMN IF NOT EXISTS aliquota_iva NUMERIC;
ALTER TABLE fatture ADD COLUMN IF NOT EXISTS natura_iva TEXT;
ALTER TABLE fatture ADD COLUMN IF NOT EXISTS codice_fiscale_paziente TEXT;
ALTER TABLE fatture ADD COLUMN IF NOT EXISTS indirizzo_paziente TEXT;
ALTER TABLE fatture ADD COLUMN IF NOT EXISTS cap_paziente TEXT;
ALTER TABLE fatture ADD COLUMN IF NOT EXISTS comune_paziente TEXT;
ALTER TABLE fatture ADD COLUMN IF NOT EXISTS provincia_paziente TEXT;
ALTER TABLE fatture ADD COLUMN IF NOT EXISTS xml_generato_at TIMESTAMPTZ;

-- Dati fiscali del dietista (CedentePrestatore in FatturaPA) — impostati una
-- tantum in impostazioni.html. fiscal_progressivo_invio è il contatore che
-- alimenta il ProgressivoInvio richiesto dalla XSD (deve essere univoco e
-- crescente per ogni fattura trasmessa dallo stesso soggetto).
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS fiscal_ragione_sociale TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS fiscal_codice_fiscale TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS fiscal_partita_iva TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS fiscal_regime TEXT DEFAULT 'RF19';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS fiscal_indirizzo TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS fiscal_cap TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS fiscal_comune TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS fiscal_provincia TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS fiscal_progressivo_invio INTEGER NOT NULL DEFAULT 0;

-- prevent_self_privilege_escalation() (SEZIONE 19) non deve toccare queste
-- colonne: sono dati anagrafici/fiscali del dietista stesso, non privilegi —
-- restano modificabili via la normale policy profiles_update_own, nessuna
-- estensione del trigger necessaria qui.

-- ═══════════════════════════════════════════════════════════════════════════
-- SEZIONE 23 — FIRMA ELETTRONICA AVANZATA (audit trail) + MODULI GENERICI
--
-- `patient_signatures` era già referenziata da js/firma.js (firmaSave(), righe
-- ~155-169) ma non esisteva in NESSUN file .sql — ogni tentativo di salvarci
-- falliva silenziosamente (catch che fa comunque proseguire il flusso con la
-- sola immagine in dataURL, mai un audit trail persistente). Creata qui con
-- lo schema che il codice già si aspettava, esteso con i campi di audit.
--
-- Importante — terminologia onesta: questa NON è una firma digitale
-- qualificata ai sensi del CAD/eIDAS (richiederebbe un prestatore di servizi
-- fiduciari certificato, es. Namirial/InfoCert/Yousign, che questa app non
-- integra). È una firma elettronica "avanzata" nel senso comune: disegno su
-- canvas + audit trail verificabile (IP, user-agent, timestamp server-side
-- via created_at, hash SHA-256 del testo firmato) — più solida di un
-- semplice checkbox, ma senza le garanzie legali di una firma qualificata.
-- La UI deve sempre dirlo esplicitamente, mai promettere "legalmente
-- vincolante" senza qualificazione.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS patient_signatures (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id      UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  dietitian_id    UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  doc_id          UUID,       -- id del consenso/documento firmato (patient_consents.id o patient_documents.id, tabelle diverse quindi nessuna FK tipizzata)
  context         TEXT        NOT NULL DEFAULT 'documento', -- 'consenso' | 'documento' | altro libero
  signature_url   TEXT,       -- se l'upload su storage riesce
  ip_address      TEXT,
  user_agent      TEXT,
  content_sha256  TEXT,       -- hash del testo firmato, per rilevare modifiche successive al documento
  signed_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE patient_signatures ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='patient_signatures_dietitian_all' AND tablename='patient_signatures') THEN
    CREATE POLICY "patient_signatures_dietitian_all" ON patient_signatures
      FOR ALL USING (auth.uid() = dietitian_id) WITH CHECK (auth.uid() = dietitian_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='patient_signatures_patient_read' AND tablename='patient_signatures') THEN
    CREATE POLICY "patient_signatures_patient_read" ON patient_signatures
      FOR SELECT USING (auth.uid() = patient_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_patient_signatures_doc ON patient_signatures (doc_id);

-- Bucket storage per il PNG della firma — stesso pattern già usato per
-- patient-files/group-chat-media, ON CONFLICT DO UPDATE per applicare i
-- limiti anche se il bucket esiste già da un tentativo precedente di
-- firma.js che l'avesse creato al volo con altre impostazioni.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('patient-signatures', 'patient-signatures', false, 2097152, ARRAY['image/png'])
ON CONFLICT (id) DO UPDATE SET
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "patient_signatures_storage_write" ON storage.objects;
CREATE POLICY "patient_signatures_storage_write" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'patient-signatures' AND auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "patient_signatures_storage_read" ON storage.objects;
CREATE POLICY "patient_signatures_storage_read" ON storage.objects
  FOR SELECT USING (bucket_id = 'patient-signatures' AND auth.uid() IS NOT NULL);

-- ═══════════════════════════════════════════════════════════════════════════
-- SEZIONE 24 — NOTIFICHE PUSH PER IL DIETISTA (promemoria appuntamenti)
--
-- Sostituisce l'invio email al paziente (SEZIONE 20) con una notifica push
-- sul dispositivo del DIETISTA — evita di dover mandare potenzialmente
-- migliaia di email/giorno via Resend al crescere della piattaforma, e
-- sfrutta la PWA installabile già esistente (app.html, unica pagina col
-- manifest). Un dietista con multipli dispositivi (desktop studio + telefono)
-- può avere più subscription attive: UNIQUE(user_id, endpoint), non solo
-- user_id, a differenza di push_subscriptions di Diet-Plan-Pro-app-claude.
--
-- Tabella dedicata invece di riusare push_subscriptions (Diet-Plan-Pro-app-
-- claude, stesso progetto Supabase): le subscription sono comunque legate a
-- un VAPID keypair e un service worker/origine specifici, quindi non sono
-- realmente intercambiabili tra le due app anche condividendo la tabella —
-- separarle evita ambiguità su quale VAPID key/endpoint appartiene a quale
-- app.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS dietitian_push_subscriptions (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint    TEXT        NOT NULL,
  p256dh      TEXT        NOT NULL,
  auth        TEXT        NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, endpoint)
);

ALTER TABLE dietitian_push_subscriptions ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='dietitian_push_subs_own' AND tablename='dietitian_push_subscriptions') THEN
    CREATE POLICY "dietitian_push_subs_own" ON dietitian_push_subscriptions
      FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- SEZIONE 25 — PROMEMORIA PUSH ANCHE AL PAZIENTE (riduzione no-show)
--
-- Colonna gemella di reminder_sent_at (SEZIONE 20, che ora tiene traccia
-- solo dell'invio al DIETISTA dopo SEZIONE 24) — tracciata separatamente
-- perché i due canali sono indipendenti: un paziente può avere le notifiche
-- push attive sull'app Diet-Plan-Pro-app-claude anche se il suo dietista non
-- le ha mai attivate su NutriPlan-Pro, e viceversa. api/cron-appointment-
-- reminders.js riprova ciascun canale finché non risulta "sent", senza far
-- dipendere l'uno dall'altro.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE appointments ADD COLUMN IF NOT EXISTS patient_reminder_sent_at TIMESTAMPTZ;

-- ═══════════════════════════════════════════════════════════════════════════
-- SEZIONE 26 — SEZIONE "SPECIALE" APP PAZIENTE: VISIBILITÀ PER PATOLOGIA
--
-- Prima versione (non in questa sezione): la visibilità di una sottosezione
-- specialistica lato paziente dipendeva dal flag visible_to_patient sulla
-- SINGOLA nota in note_specialistiche — cioè dal "documento" più recente
-- condiviso. Il dietista ha chiesto di scollegare le due cose: deve poter
-- attivare/disattivare una patologia per un paziente indipendentemente da
-- quali note abbia condiviso — le note restano solo la FONTE DATI (l'app
-- paziente legge sempre l'ultima nota di quel tipo, a prescindere dal suo
-- visible_to_patient), mentre patient_specialty_access è l'unico interruttore
-- che decide se la sottosezione compare o no nell'app.
--
-- Chiave (patient_id, specialty) senza dietitian_id: è un interruttore unico
-- per paziente+patologia, non uno per-dietista — se un paziente ha più
-- dietisti collegati (patient_dietitian), ciascuno di essi può attivarla/
-- disattivarla, l'ultimo che tocca il toggle vince (stesso spirito di
-- visible_to_patient sulle altre tabelle cliniche condivise).
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS patient_specialty_access (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id  UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  specialty   TEXT        NOT NULL,
  enabled     BOOLEAN     NOT NULL DEFAULT FALSE,
  updated_by  UUID        REFERENCES auth.users(id),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(patient_id, specialty)
);

ALTER TABLE patient_specialty_access ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='specialty_access_dietitian_manage' AND tablename='patient_specialty_access') THEN
    CREATE POLICY "specialty_access_dietitian_manage" ON patient_specialty_access
      FOR ALL USING (
        EXISTS (SELECT 1 FROM patient_dietitian pd WHERE pd.patient_id = patient_specialty_access.patient_id AND pd.dietitian_id = auth.uid())
      ) WITH CHECK (
        EXISTS (SELECT 1 FROM patient_dietitian pd WHERE pd.patient_id = patient_specialty_access.patient_id AND pd.dietitian_id = auth.uid())
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='specialty_access_patient_read' AND tablename='patient_specialty_access') THEN
    CREATE POLICY "specialty_access_patient_read" ON patient_specialty_access
      FOR SELECT USING (auth.uid() = patient_id);
  END IF;
END $$;

ALTER TABLE patient_specialty_access REPLICA IDENTITY FULL;

-- ═══════════════════════════════════════════════════════════════════════════
-- SEZIONE 27 — SECURITY FIX: chat_group_members_creator_insert non verificava
-- il membro aggiunto
--
-- La policy originale (SEZIONE 17) controllava solo che chi esegue l'INSERT
-- abbia creato il gruppo (chat_groups.created_by = auth.uid()), ma non
-- verificava CHI viene aggiunto come membro. Un dietista poteva quindi
-- creare un gruppo e aggiungere come membro un paziente qualsiasi — non
-- necessariamente collegato a lui via patient_dietitian — ottenendo una
-- chat persistente con un paziente di un altro dietista. broadcast.html è
-- già stato corretto lato client per non offrire più pazienti non collegati
-- nella lista di selezione, ma senza questo fix la policy DB restava
-- comunque permissiva per chiunque interrogasse l'API direttamente.
--
-- La nuova WITH CHECK ammette solo: il creatore che aggiunge se stesso, un
-- proprio paziente (via patient_dietitian), o un altro dietista (invarianza
-- rispetto al comportamento attuale di broadcast.html, che permette gruppi
-- tra dietisti senza scoping per studio).
-- ═══════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "chat_group_members_creator_insert" ON chat_group_members;
CREATE POLICY "chat_group_members_creator_insert" ON chat_group_members
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM chat_groups WHERE id = group_id AND created_by = auth.uid())
    AND (
      user_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM patient_dietitian pd
        WHERE pd.patient_id = chat_group_members.user_id
          AND pd.dietitian_id = auth.uid()
      )
      OR EXISTS (SELECT 1 FROM profiles WHERE id = chat_group_members.user_id AND role = 'dietitian')
    )
  );

-- ═══════════════════════════════════════════════════════════════════════════
-- SEZIONE 28 — WIDGET "COSE DA FARE" NELLA DASHBOARD DEL DIETISTA
--
-- Elenco privato di promemoria testuali del singolo dietista, mostrato nel
-- nuovo widget "Cose da fare" della dashboard di benvenuto (app.html). Non è
-- un dato clinico/del paziente: nessun collegamento a cartella_id, nessuna
-- visibilità paziente, nessun audit trail.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS dietitian_todos (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  testo       TEXT        NOT NULL,
  fatto       BOOLEAN     NOT NULL DEFAULT FALSE,
  ordine      BIGINT      NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE dietitian_todos ENABLE ROW LEVEL SECURITY;
ALTER TABLE dietitian_todos REPLICA IDENTITY FULL;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='dietitian_todos_owner_all' AND tablename='dietitian_todos') THEN
    CREATE POLICY "dietitian_todos_owner_all" ON dietitian_todos
      FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- SEZIONE 29 — LISTE DELLA SPESA (autogenerate dal piano o create a mano)
--
-- Lista persistita con 3 colonne per riga (alimento, pezzatura, prezzo), così
-- da poter stimare il costo totale della spesa. `tipo` distingue le liste
-- generate automaticamente dal piano alimentare da quelle scritte a mano dal
-- dietista; entrambe condividono la stessa struttura `items` ed entrambe
-- possono essere condivise con il paziente tramite `visible_to_patient`,
-- seguendo lo stesso pattern già usato per piani/ncpt/bia_records/ecc.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS liste_spesa (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  cartella_id         UUID        REFERENCES cartelle(id) ON DELETE CASCADE,
  piano_id            UUID        REFERENCES piani(id) ON DELETE SET NULL,
  nome                TEXT,
  tipo                TEXT        NOT NULL DEFAULT 'manuale', -- 'auto' | 'manuale'
  items               JSONB       NOT NULL DEFAULT '[]',      -- [{alimento, pezzatura, prezzo}, ...]
  visible_to_patient  BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE liste_spesa ENABLE ROW LEVEL SECURITY;
ALTER TABLE liste_spesa REPLICA IDENTITY FULL;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='liste_spesa_dietitian_all' AND tablename='liste_spesa') THEN
    CREATE POLICY "liste_spesa_dietitian_all" ON liste_spesa
      FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='liste_spesa_select_patient_visible' AND tablename='liste_spesa') THEN
    CREATE POLICY "liste_spesa_select_patient_visible" ON liste_spesa
      FOR SELECT USING (visible_to_patient = TRUE AND is_linked_patient(cartella_id));
  END IF;
END $$;

DROP TRIGGER IF EXISTS trg_audit_liste_spesa ON liste_spesa;
CREATE TRIGGER trg_audit_liste_spesa AFTER INSERT OR UPDATE OR DELETE ON liste_spesa
  FOR EACH ROW EXECUTE FUNCTION log_clinical_change();


-- ═══════════════════════════════════════════════════════════════════════════
-- SEZIONE 30 — RICONCILIAZIONE chat_messages (chat 1:1 dietista↔paziente)
--
-- Verificato sul DB live (2026-07-19, probe read-only con anon key): la
-- tabella reale ha SOLO la convenzione dell'app paziente (message_type,
-- file_url, file_name, duration_seconds) — le colonne type/status/
-- scheduled_at usate da chat.html NON sono mai esistite. Risultato: l'invio
-- messaggi lato dietista falliva con 42703 e il caricamento chat restituiva
-- sempre una chat vuota. Questa sezione aggiunge le colonne mancanti (i
-- messaggi esistenti diventano status='sent') e allinea le RLS al pattern
-- già usato dalla chat di gruppo: i messaggi programmati sono visibili SOLO
-- al mittente finché non passano a 'sent'.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS type TEXT DEFAULT 'text';
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'sent';
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMPTZ;

-- La vecchia policy FOR ALL concedeva anche la SELECT senza filtro sui
-- programmati: sostituita da policy separate per comando (stessa condizione
-- own-or-linked per le scritture, SELECT ristretta su status).
DROP POLICY IF EXISTS "chat_messages_own_or_linked" ON chat_messages;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='chat_messages_select_visible' AND tablename='chat_messages') THEN
    CREATE POLICY "chat_messages_select_visible" ON chat_messages
      FOR SELECT USING (
        (
          auth.uid() = patient_id
          OR EXISTS (
            SELECT 1 FROM patient_dietitian pd
            WHERE pd.patient_id = chat_messages.patient_id
              AND pd.dietitian_id = auth.uid()
          )
        )
        AND (status = 'sent' OR sender_id = auth.uid())
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='chat_messages_insert_own_or_linked' AND tablename='chat_messages') THEN
    CREATE POLICY "chat_messages_insert_own_or_linked" ON chat_messages
      FOR INSERT WITH CHECK (
        auth.uid() = patient_id
        OR EXISTS (
          SELECT 1 FROM patient_dietitian pd
          WHERE pd.patient_id = chat_messages.patient_id
            AND pd.dietitian_id = auth.uid()
        )
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='chat_messages_update_own_or_linked' AND tablename='chat_messages') THEN
    CREATE POLICY "chat_messages_update_own_or_linked" ON chat_messages
      FOR UPDATE USING (
        auth.uid() = patient_id
        OR EXISTS (
          SELECT 1 FROM patient_dietitian pd
          WHERE pd.patient_id = chat_messages.patient_id
            AND pd.dietitian_id = auth.uid()
        )
      )
      WITH CHECK (
        auth.uid() = patient_id
        OR EXISTS (
          SELECT 1 FROM patient_dietitian pd
          WHERE pd.patient_id = chat_messages.patient_id
            AND pd.dietitian_id = auth.uid()
        )
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='chat_messages_delete_own_or_linked' AND tablename='chat_messages') THEN
    CREATE POLICY "chat_messages_delete_own_or_linked" ON chat_messages
      FOR DELETE USING (
        auth.uid() = patient_id
        OR EXISTS (
          SELECT 1 FROM patient_dietitian pd
          WHERE pd.patient_id = chat_messages.patient_id
            AND pd.dietitian_id = auth.uid()
        )
      );
  END IF;
END $$;


-- ═══════════════════════════════════════════════════════════════════════════
-- SEZIONE 31 — PACCHETTI / PERCORSI VENDIBILI (tab Pacchetti in pagamenti.html)
--
-- `pacchetti` = catalogo del dietista; `pacchetti_acquistati` = snapshot della
-- vendita a un paziente (nome/prezzo/visite copiati, così modifiche successive
-- al catalogo non alterano i percorsi già venduti). Il paziente può leggere i
-- propri pacchetti (per una futura visualizzazione "visite residue" nell'app).
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS pacchetti (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  dietitian_id  UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  nome          TEXT        NOT NULL,
  n_visite      INT         NOT NULL CHECK (n_visite >= 1),
  prezzo        NUMERIC(10,2) NOT NULL CHECK (prezzo >= 0),
  durata_giorni INT,
  descrizione   TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pacchetti_acquistati (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  dietitian_id   UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  patient_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  patient_name   TEXT,
  pacchetto_id   UUID        REFERENCES pacchetti(id) ON DELETE SET NULL,
  nome_pacchetto TEXT        NOT NULL,
  visite_totali  INT         NOT NULL,
  visite_usate   INT         NOT NULL DEFAULT 0,
  prezzo         NUMERIC(10,2) NOT NULL,
  data_inizio    DATE,
  scadenza       DATE,
  stato          TEXT        NOT NULL DEFAULT 'da_pagare', -- 'da_pagare' | 'pagato'
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE pacchetti ENABLE ROW LEVEL SECURITY;
ALTER TABLE pacchetti_acquistati ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='pacchetti_owner_all' AND tablename='pacchetti') THEN
    CREATE POLICY "pacchetti_owner_all" ON pacchetti
      FOR ALL USING (auth.uid() = dietitian_id) WITH CHECK (auth.uid() = dietitian_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='pacchetti_acquistati_owner_all' AND tablename='pacchetti_acquistati') THEN
    CREATE POLICY "pacchetti_acquistati_owner_all" ON pacchetti_acquistati
      FOR ALL USING (auth.uid() = dietitian_id) WITH CHECK (auth.uid() = dietitian_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='pacchetti_acquistati_patient_read' AND tablename='pacchetti_acquistati') THEN
    CREATE POLICY "pacchetti_acquistati_patient_read" ON pacchetti_acquistati
      FOR SELECT USING (auth.uid() = patient_id);
  END IF;
END $$;


-- ═══════════════════════════════════════════════════════════════════════════
-- SEZIONE 32 — INTEGRAZIONE FATTURE IN CLOUD (invio fatture allo SDI)
--
-- Credenziali per-dietista dell'API Fatture in Cloud (Impostazioni → Dati
-- fiscali) + tracking dell'invio SDI sulla singola fattura. Il token è
-- leggibile solo dal proprietario (RLS su profiles) e usato server-side da
-- api/fattura-sdi.js via service role.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS fic_api_token TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS fic_company_id TEXT;

ALTER TABLE fatture ADD COLUMN IF NOT EXISTS sdi_inviato_at TIMESTAMPTZ;
ALTER TABLE fatture ADD COLUMN IF NOT EXISTS fic_document_id TEXT;


-- ═══════════════════════════════════════════════════════════════════════════
-- SEZIONE 33 — FIX SICUREZZA: bucket con dati sanitari resi PRIVATI
--
-- Tre bucket contenevano PHI (dati sanitari) ma erano PUBBLICI, quindi
-- chiunque con l'URL (path in parte prevedibile) poteva accedervi SENZA login:
--   • patient-photos  — foto cliniche/composizione corporea (valutazione.html)
--   • voice-messages  — messaggi vocali chat dietista↔paziente (chat.html)
--   • document-prints — immagini PNG di documenti/piani clinici (print-capture)
-- Portati a private + policy di storage per-riga, allineati al pattern già
-- usato per patient-files e group-chat-media. Il codice passa da
-- getPublicUrl() a createSignedUrl() (URL firmati). Le policy di
-- document-prints esistevano già (SEZIONE 9) ma erano vanificate dal flag
-- public=TRUE: qui lo forziamo a FALSE (idempotente, così basta eseguire
-- questa sezione senza ri-eseguire la 9).
--
-- NOTA: gli URL pubblici già salvati nei vecchi messaggi vocali smetteranno di
-- funzionare (403) — è il comportamento voluto: erano un leak. I nuovi vocali
-- usano URL firmati. Le foto non salvavano URL nel DB (ricavati a runtime dal
-- listing), quindi nessun dato storico da migrare lì.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── document-prints: forza privato (policy già presenti in SEZIONE 9) ──
UPDATE storage.buckets SET public = FALSE WHERE id = 'document-prints';

-- ── patient-photos: privato + limiti ──
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('patient-photos', 'patient-photos', false, 15728640,
        ARRAY['image/jpeg','image/png','image/webp','image/heic','image/heif'])
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Path: <cartella_id>/<scheda_id>/<tipo>.<ext> — foldername[1] = cartella_id.
-- Accesso al solo dietista proprietario della cartella (feature dietista-only,
-- le foto non sono mai mostrate ai pazienti).
DROP POLICY IF EXISTS "patient_photos_owner_all" ON storage.objects;
CREATE POLICY "patient_photos_owner_all" ON storage.objects
  FOR ALL USING (
    bucket_id = 'patient-photos'
    AND EXISTS (
      SELECT 1 FROM cartelle c
      WHERE c.id = ((storage.foldername(name))[1])::uuid
        AND c.user_id = auth.uid()
    )
  )
  WITH CHECK (
    bucket_id = 'patient-photos'
    AND EXISTS (
      SELECT 1 FROM cartelle c
      WHERE c.id = ((storage.foldername(name))[1])::uuid
        AND c.user_id = auth.uid()
    )
  );

-- ── voice-messages: privato + limiti ──
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('voice-messages', 'voice-messages', false, 10485760,
        ARRAY['audio/webm','audio/ogg','audio/mp4','audio/mpeg'])
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Path: voice-messages/<patient_id>/<ts>.webm — foldername[2] = patient_id
-- (foldername[1] è il prefisso letterale 'voice-messages' presente nel path).
-- Accesso: il paziente stesso o un dietista a lui collegato via patient_dietitian.
DROP POLICY IF EXISTS "voice_messages_read" ON storage.objects;
CREATE POLICY "voice_messages_read" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'voice-messages'
    AND (
      auth.uid() = ((storage.foldername(name))[2])::uuid
      OR EXISTS (
        SELECT 1 FROM patient_dietitian pd
        WHERE pd.patient_id = ((storage.foldername(name))[2])::uuid
          AND pd.dietitian_id = auth.uid()
      )
    )
  );

DROP POLICY IF EXISTS "voice_messages_write" ON storage.objects;
CREATE POLICY "voice_messages_write" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'voice-messages'
    AND (
      auth.uid() = ((storage.foldername(name))[2])::uuid
      OR EXISTS (
        SELECT 1 FROM patient_dietitian pd
        WHERE pd.patient_id = ((storage.foldername(name))[2])::uuid
          AND pd.dietitian_id = auth.uid()
      )
    )
  );

DROP POLICY IF EXISTS "voice_messages_delete" ON storage.objects;
CREATE POLICY "voice_messages_delete" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'voice-messages'
    AND (
      auth.uid() = ((storage.foldername(name))[2])::uuid
      OR EXISTS (
        SELECT 1 FROM patient_dietitian pd
        WHERE pd.patient_id = ((storage.foldername(name))[2])::uuid
          AND pd.dietitian_id = auth.uid()
      )
    )
  );


-- ═══════════════════════════════════════════════════════════════════════════
-- SEZIONE 34 — PROMEMORIA PAGAMENTI SCADUTI (feature #5, seconda metà)
--
-- Scadenza pagamento per fattura (facoltativa, impostata dal dietista in
-- pagamenti.html). Il cron api/cron-overdue-payments.js segnala al DIETISTA
-- (push, stesso canale/filosofia di api/cron-appointment-reminders.js — mai
-- email/SMS per non introdurre un costo per invio che cresce con la base
-- utenti) le fatture con stato='da_pagare' E scadenza nel passato. Traccia
-- l'invio con overdue_reminder_sent_at per non rimandare lo stesso avviso
-- ogni giorno — se l'importo resta scaduto a lungo, un nuovo promemoria
-- riparte solo se il dietista sposta la scadenza in avanti (aggiornandola)
-- o dopo un periodo di silenzio impostato nel cron stesso.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE fatture ADD COLUMN IF NOT EXISTS scadenza DATE;
ALTER TABLE fatture ADD COLUMN IF NOT EXISTS overdue_reminder_sent_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_fatture_scadenza_da_pagare
  ON fatture (scadenza)
  WHERE stato = 'da_pagare' AND scadenza IS NOT NULL;

-- ═══════════════════════════════════════════════════════════════════════════
-- SEZIONE 35 — SISTEMA TESSERA SANITARIA (STS), feature #1
--
-- Obbligo di legge dal 2019: i dietisti (professione sanitaria) devono
-- trasmettere al Sistema TS i dati di TUTTE le fatture emesse a persone
-- fisiche (spese sanitarie detraibili, salvo opposizione del paziente).
--
-- Il Sistema TS non espone un'API pubblica diretta per i professionisti:
-- l'accreditamento diretto presso SOGEI è un processo lungo pensato per
-- grandi soggetti. Come già avviene per l'invio SDI (Fatture in Cloud,
-- SEZIONE 32), la via realistica è un intermediario accreditato con una
-- REST API — verificato: sistema-ts-api.it (prodotto A-Cube) espone
-- POST /erogatori (registrazione una tantum come erogatore sanitario) e
-- POST /documenti-spesa (invio della singola fattura, tipoSpesa "SP" per
-- le professioni sanitarie diverse da medici/odontoiatri).
--
-- Il dietista deve REGISTRARSI AUTONOMAMENTE su un intermediario accreditato
-- (es. sistema-ts-api.it) prima che questa funzione sia utilizzabile — le
-- credenziali sotto restano vuote e il pulsante "Invia a STS" in Pagamenti
-- resta nascosto finché non vengono compilate, esattamente come per FIC/SDI.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS sts_api_username TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS sts_api_password TEXT;
-- Credenziali del PORTALE Sistema TS del dietista (sistemats2.sanita.finanze.it),
-- non quelle dell'intermediario sopra: servono all'intermediario per
-- trasmettere per suo conto (campo pincodeSts richiesto da POST /erogatori).
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS sts_username TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS sts_password TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS sts_pincode TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS sts_erogatore_registrato BOOLEAN DEFAULT false;

ALTER TABLE fatture ADD COLUMN IF NOT EXISTS sts_stato TEXT; -- INVI | PREN | ERRO
ALTER TABLE fatture ADD COLUMN IF NOT EXISTS sts_protocollo TEXT;
ALTER TABLE fatture ADD COLUMN IF NOT EXISTS sts_messaggio TEXT; -- errore riportato dal Sistema TS, se presente
ALTER TABLE fatture ADD COLUMN IF NOT EXISTS sts_inviato_at TIMESTAMPTZ;

-- ═══════════════════════════════════════════════════════════════════════════
-- SEZIONE 36 — WHATSAPP BUSINESS REALE (feature #2)
--
-- Integrazione vera con l'API Meta WhatsApp Business Cloud (non la sola chat
-- in-app "in stile WhatsApp" già esistente in broadcast.html). Il dietista
-- collega un numero WhatsApp Business gestito su business.facebook.com/wa
-- (Meta for Developers): serve un Phone Number ID, un access token
-- permanente (System User), il Business Account ID e un webhook verify
-- token a scelta. Restano un servizio/costo Meta esterno e un requisito
-- reale: i messaggi liberi (non-template) sono inviabili solo entro 24h
-- dall'ultimo messaggio ricevuto dal paziente su WhatsApp — fuori da quella
-- finestra Meta richiede un messaggio "template" pre-approvato dal Business
-- Manager (nome/lingua configurabili sotto, ma la creazione/approvazione
-- del template avviene sul portale Meta, non da qui).
--
-- Come per Fatture in Cloud/Sistema TS: il dietista si registra
-- autonomamente su Meta for Developers prima che la funzione sia
-- utilizzabile — i pulsanti restano nascosti finché le credenziali non
-- sono compilate.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS wa_phone_number_id TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS wa_access_token TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS wa_business_account_id TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS wa_webhook_verify_token TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS wa_app_secret TEXT; -- App Secret del proprio App Meta, per verificare la firma del webhook
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS wa_template_name TEXT; -- template approvato da usare fuori dalla finestra 24h
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS wa_template_lang TEXT DEFAULT 'it';

ALTER TABLE cartelle ADD COLUMN IF NOT EXISTS telefono TEXT;

-- Log messaggi WhatsApp (in entrambe le direzioni) per dietista/paziente.
-- cartella_id è nullable: un messaggio in arrivo da un numero non ancora
-- associato a nessuna cartella resta comunque visibile/associabile a mano.
CREATE TABLE IF NOT EXISTS whatsapp_messages (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  dietitian_id  UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  cartella_id   UUID        REFERENCES cartelle(id) ON DELETE SET NULL,
  wa_phone      TEXT        NOT NULL, -- numero WhatsApp del paziente, formato E.164
  direction     TEXT        NOT NULL CHECK (direction IN ('in','out')),
  body          TEXT,
  wa_message_id TEXT,       -- id assegnato da Meta, per aggiornare lo stato via webhook
  status        TEXT,       -- sent | delivered | read | failed (solo per direction='out')
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_dietitian_phone
  ON whatsapp_messages (dietitian_id, wa_phone, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_wa_message_id
  ON whatsapp_messages (wa_message_id) WHERE wa_message_id IS NOT NULL;

ALTER TABLE whatsapp_messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "dietitian_own_whatsapp_messages" ON whatsapp_messages;
CREATE POLICY "dietitian_own_whatsapp_messages" ON whatsapp_messages
  FOR ALL USING (auth.uid() = dietitian_id) WITH CHECK (auth.uid() = dietitian_id);

-- ═══════════════════════════════════════════════════════════════════════════
-- SEZIONE 37 — schema_migrations (tracciamento sezioni eseguite) + client_errors
--
-- Problema: ogni nuova feature richiede di copiare/eseguire a mano una nuova
-- sezione di questo file nell'SQL Editor di Supabase; con 36+ sezioni non è
-- più chiaro quali risultino già state eseguite sul progetto live (causa nota
-- di bug intermittenti 404/PGRST204 quando una sezione resta non eseguita).
-- Da qui in avanti, OGNI sezione futura deve terminare con un INSERT in
-- schema_migrations che registra il proprio id — così una query su questa
-- tabella dice esattamente cosa è stato applicato, senza doverlo ricordare a
-- memoria. Per lo stato ATTUALE (sezioni 1-36, mai state marcate a runtime),
-- usare invece scripts/check-schema-status.sql, che verifica direttamente
-- l'esistenza di tabelle/colonne attese confrontandole con information_schema.
--
-- client_errors: raccolta automatica di errori JS non gestiti lato client
-- (window.onerror / unhandledrejection), per non dipendere da un servizio di
-- error-monitoring esterno a pagamento. Scrittura aperta (anche pre-login,
-- es. pagina di login stessa) perché non contiene nulla di più sensibile di
-- quanto già visibile lato client; lettura riservata agli admin.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS schema_migrations (
  id          TEXT        PRIMARY KEY,
  applied_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  note        TEXT
);

ALTER TABLE schema_migrations ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='schema_migrations_admin_only' AND tablename='schema_migrations') THEN
    CREATE POLICY "schema_migrations_admin_only" ON schema_migrations
      FOR ALL USING (check_is_admin()) WITH CHECK (check_is_admin());
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS client_errors (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  app         TEXT        NOT NULL,               -- 'nutriplan-pro' | 'diet-plan-pro-app'
  level       TEXT        NOT NULL DEFAULT 'error', -- 'error' | 'unhandledrejection'
  message     TEXT        NOT NULL,
  stack       TEXT,
  page_url    TEXT,
  user_id     UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  user_email  TEXT,
  user_agent  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_client_errors_created_at ON client_errors (created_at DESC);

ALTER TABLE client_errors ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='client_errors_insert_any' AND tablename='client_errors') THEN
    CREATE POLICY "client_errors_insert_any" ON client_errors
      FOR INSERT WITH CHECK (true);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='client_errors_select_admin' AND tablename='client_errors') THEN
    CREATE POLICY "client_errors_select_admin" ON client_errors
      FOR SELECT USING (check_is_admin());
  END IF;
END $$;

INSERT INTO schema_migrations (id, note) VALUES
  ('sezione_37_observability', 'schema_migrations + client_errors')
ON CONFLICT (id) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════
-- SEZIONE 38 — usage_counters: quote mensili per dietista (AI/storage)
--
-- Il rate limiter esistente (api/_rateLimit.js) blocca gli abusi al minuto,
-- ma non un tetto mensile: uno studio molto attivo potrebbe generare costi
-- Groq/AI sproporzionati rispetto al prezzo dell'abbonamento. Serve un
-- contatore DURATURO (sopravvive a cold start e dura 30 giorni): sia
-- api/_rateLimit.js (in-memory/Upstash) sia il rate limiter Deno lato
-- Diet-Plan-Pro (_shared/rateLimit.ts) sono esplicitamente per-istanza/non
-- garantiti su finestre lunghe — inadatti a una quota mensile reale. Qui il
-- contatore vive in Postgres, incrementato atomicamente via RPC.
--
-- period = 'YYYY-MM' (mese di calendario, UTC). scope = nome libero per
-- endpoint/risorsa (es. 'ai_calls_claude', 'ai_calls_scribe', 'storage_bytes').
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS usage_counters (
  user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  scope       TEXT        NOT NULL,
  period      TEXT        NOT NULL,
  count       BIGINT      NOT NULL DEFAULT 0,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, scope, period)
);

ALTER TABLE usage_counters ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='usage_counters_own_read' AND tablename='usage_counters') THEN
    CREATE POLICY "usage_counters_own_read" ON usage_counters
      FOR SELECT USING (auth.uid() = user_id OR check_is_admin());
  END IF;
END $$;

-- Incrementa atomicamente il contatore (user_id, scope, period) e ritorna
-- true se il nuovo totale resta entro p_max, false se lo supera. Pensata per
-- essere chiamata dai soli endpoint serverless (api/_monthlyQuota.js /
-- _shared/monthlyQuota.ts) con la service role key, DOPO aver già verificato
-- il JWT reale dell'utente lato server. Guardia p_user_id = auth.uid() come
-- nel trigger prevent_self_privilege_escalation (SEZIONE 1): bypassata solo
-- quando auth.uid() IS NULL, cioè service role/SQL editor — un utente
-- autenticato che chiamasse questa RPC direttamente (bypassando il server)
-- potrebbe quindi incrementare/controllare solo il PROPRIO contatore, mai
-- quello di un altro dietista.
CREATE OR REPLACE FUNCTION increment_usage_and_check(p_user_id UUID, p_scope TEXT, p_period TEXT, p_max BIGINT)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  new_count BIGINT;
BEGIN
  IF auth.uid() IS NOT NULL AND auth.uid() != p_user_id THEN
    RAISE EXCEPTION 'p_user_id deve coincidere con l''utente autenticato';
  END IF;
  INSERT INTO usage_counters (user_id, scope, period, count, updated_at)
  VALUES (p_user_id, p_scope, p_period, 1, NOW())
  ON CONFLICT (user_id, scope, period)
  DO UPDATE SET count = usage_counters.count + 1, updated_at = NOW()
  RETURNING count INTO new_count;
  RETURN new_count <= p_max;
END;
$$;
GRANT EXECUTE ON FUNCTION increment_usage_and_check(UUID, TEXT, TEXT, BIGINT) TO authenticated;

INSERT INTO schema_migrations (id, note) VALUES
  ('sezione_38_usage_counters', 'usage_counters + increment_usage_and_check() per quote mensili')
ON CONFLICT (id) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════
-- SEZIONE 39 — delete_own_dietitian_account() (GDPR Art. 17, lato dietista)
--
-- Specchio di delete_own_account() (Diet-Plan-Pro-app-claude/src/sql/
-- delete_own_account.sql, lato paziente), ma per un account NutriPlan-Pro.
--
-- La quasi totalità delle tabelle proprietà del dietista ha già
-- ON DELETE CASCADE sulla colonna che punta a auth.users(id) (cartelle,
-- piani, ncpt, bia_records, schede_valutazione, note_specialistiche,
-- esami_biochimici, patient_files, agenda_events, alimenti_custom,
-- patient_dietitian, studio_collaborators, chat_groups, broadcast_messages,
-- piani_template, fatture, patient_signatures, dietitian_push_subscriptions,
-- dietitian_todos, liste_spesa, pacchetti, pacchetti_acquistati,
-- whatsapp_messages, usage_counters, profiles): il DELETE FROM auth.users
-- finale le rimuove tutte automaticamente.
--
-- Verificate a mano (audit di ogni "REFERENCES auth.users" nel file) le SOLE
-- eccezioni SENZA cascade, gestite esplicitamente qui sotto PRIMA del DELETE
-- finale — altrimenti la FK bloccherebbe l'intera cancellazione con un
-- errore invece di completarla:
--   • clinical_audit_log.changed_by — si preserva la riga (audit trail
--     clinico, ha senso restare anche dopo che l'autore ha cancellato
--     l'account), si scollega solo l'autore (colonna nullable).
--   • patient_specialty_access.updated_by — stesso trattamento: si preserva
--     il toggle attivo per il paziente, si scollega solo chi l'ha impostato.
--   • patient_documents.dietitian_id / patient_consents.dietitian_id —
--     NOT NULL, nessun cascade: qui la riga va rimossa esplicitamente (di
--     norma cadrebbe comunque in cascata da cartella_id, ma è nullable, quindi
--     un documento/consenso non ancora legato a una cartella andrebbe perso
--     senza questa riga esplicita).
--   • chat_messages.sender_id / chat_group_messages.sender_id — NOT NULL,
--     nessun cascade, nessuna colonna "mittente anonimo" disponibile: i
--     messaggi INVIATI dal dietista vengono rimossi anche dal lato paziente/
--     gruppo (stesso compromesso di qualunque cancellazione account su
--     contenuti condivisi — non c'è alternativa senza una modifica di schema).
--
-- Non tocca lo Storage (bucket patient-files/document-prints/ecc.): stessa
-- scelta già fatta in delete_own_account.sql lato paziente, i file restano
-- orfani nel bucket — limite noto, non nuovo qui.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION delete_own_dietitian_account()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'dietitian') THEN
    RAISE EXCEPTION 'Solo un account dietista può usare questa funzione';
  END IF;

  UPDATE clinical_audit_log SET changed_by = NULL WHERE changed_by = auth.uid();
  UPDATE patient_specialty_access SET updated_by = NULL WHERE updated_by = auth.uid();

  DELETE FROM patient_documents WHERE dietitian_id = auth.uid();
  DELETE FROM patient_consents WHERE dietitian_id = auth.uid();
  DELETE FROM chat_messages WHERE sender_id = auth.uid();
  DELETE FROM chat_group_messages WHERE sender_id = auth.uid();

  DELETE FROM auth.users WHERE id = auth.uid();
END;
$$;
GRANT EXECUTE ON FUNCTION delete_own_dietitian_account() TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- SEZIONE 40 — CIFRATURA APPLICATIVA DEI CAMPI CLINICI SENSIBILI (pilota: cartelle.note)
--
-- Fino ad oggi i dati sono protetti SOLO dalla cifratura infrastrutturale di
-- Supabase (a riposo, automatica) e da RLS — il valore stesso di un campo
-- sensibile è in chiaro nel database. Questa sezione aggiunge cifratura reale
-- a livello di campo (pgcrypto + Supabase Vault) per il campo clinico più
-- sensibile di `cartelle` (`note`), come primo tassello di un lavoro che
-- andrà esteso — su più sessioni, esattamente come l'audit alimenti — ad
-- altri campi (note_specialistiche.nota, ncpt.*, chat_messages.content,
-- chat_group_messages.content, patient_intake_forms.responses).
--
-- APPROCCIO: vista trasparente, ZERO modifiche al codice client.
-- `cartelle` diventa una VIEW (non più la tabella reale) che espone `note`
-- già decifrato; la tabella reale con la colonna cifrata si chiama ora
-- `cartelle_raw`. Ogni `sb.from('cartelle').select(...)`/`.insert(...)`/
-- `.update(...)`/`.delete(...)` esistente in tutte le pagine continua a
-- funzionare esattamente come prima — decifra in lettura, cifra in
-- scrittura, in modo trasparente lato Postgres. La vista è
-- `security_invoker=true`: le policy RLS già esistenti su `cartelle`
-- (rinominate insieme alla tabella) restano applicate esattamente come
-- prima, per lo stesso utente, senza bypass.
--
-- CHIAVE: generata casualmente una sola volta, salvata in Supabase Vault
-- (mai visibile lato client, leggibile solo dalle funzioni SECURITY DEFINER
-- sotto). Se in futuro la chiave venisse ruotata, TUTTI i valori cifrati con
-- la chiave vecchia diventerebbero illeggibili — non implementata qui la
-- rotazione, fuori scope per un primo pilota.
--
-- ATTENZIONE — cosa NON viene fatto qui, deliberatamente:
--  • La colonna col testo in chiaro originale NON viene droppata: resta
--    rinominata `note_plain_deprecated` dentro `cartelle_raw`, come rete di
--    sicurezza ispezionabile finché non si conferma che tutto funziona nel
--    prodotto reale. Va droppata a mano con la query di pulizia in fondo a
--    questa sezione SOLO dopo aver verificato (blocco di verifica sotto) che
--    lettura/scrittura funzionano correttamente.
--  • `chat_messages`/`chat_group_messages` NON sono toccate in questo giro:
--    la memoria di progetto documenta `chat_messages` come tabella già
--    delicata (riconciliata di recente in SEZIONE 30) — va cifrata in una
--    sessione dedicata successiva, ripetendo lo STESSO pattern qui sotto.
--  • Foreign key FUTURE che puntano a `cartelle(id)` falliranno (una VIEW
--    non può essere target di FOREIGN KEY): usare `cartelle_raw(id)` per
--    qualunque nuova tabella collegata a una cartella.
-- ═══════════════════════════════════════════════════════════════════════════

-- 40.1 — Chiave di cifratura + funzioni riusabili (per qualunque campo futuro)

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'app_field_encryption_key') THEN
    PERFORM vault.create_secret(
      encode(extensions.gen_random_bytes(32), 'hex'),
      'app_field_encryption_key',
      'Chiave simmetrica per cifratura campo-per-campo dei dati clinici sensibili (pgp_sym_encrypt/decrypt). Non condividere, non loggare, non rigenerare senza un piano di ri-cifratura di tutti i dati esistenti.'
    );
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public._enc_key()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = vault, pg_temp
AS $$
  SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'app_field_encryption_key' LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public._enc_key() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.encrypt_text(plain text)
RETURNS bytea
LANGUAGE sql
SECURITY DEFINER
SET search_path = extensions, pg_temp
AS $$
  SELECT CASE WHEN plain IS NULL THEN NULL
    ELSE extensions.pgp_sym_encrypt(plain, public._enc_key(), 'compress-algo=1, cipher-algo=aes256')
  END;
$$;

-- NULL-safe anche sugli errori: se il bytea non è un blob pgp valido (dato
-- legacy inatteso, corruzione), ritorna NULL invece di far fallire con
-- eccezione l'intera query — preferibile in una vista usata da 40+ pagine.
CREATE OR REPLACE FUNCTION public.decrypt_text(cipher bytea)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = extensions, pg_temp
AS $$
BEGIN
  IF cipher IS NULL THEN
    RETURN NULL;
  END IF;
  RETURN extensions.pgp_sym_decrypt(cipher, public._enc_key());
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;
END;
$$;

GRANT EXECUTE ON FUNCTION public.encrypt_text(text) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.decrypt_text(bytea) TO authenticated, anon, service_role;

-- 40.2 — Fix necessario PRIMA del rename: log_clinical_change() aveva un caso
-- speciale hardcoded su TG_TABLE_NAME='cartelle' per collegare l'audit log
-- alla cartella corretta (cartelle non ha una colonna cartella_id propria,
-- è identificata dal proprio id). Dopo il rename sotto, il trigger continua
-- a essere attaccato alla tabella reale ma TG_TABLE_NAME diventa
-- 'cartelle_raw' — senza questo fix, ogni futura modifica a una cartella
-- perderebbe silenziosamente il collegamento cartella_id nell'audit log.

CREATE OR REPLACE FUNCTION public.log_clinical_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_row JSONB;
  v_changed_cols TEXT[];
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_row := to_jsonb(OLD);
  ELSE
    v_row := to_jsonb(NEW);
  END IF;

  IF TG_OP = 'UPDATE' THEN
    SELECT array_agg(n.key) INTO v_changed_cols
    FROM jsonb_each(to_jsonb(NEW)) n
    JOIN jsonb_each(to_jsonb(OLD)) o ON n.key = o.key
    WHERE n.value IS DISTINCT FROM o.value;
  END IF;

  INSERT INTO clinical_audit_log (table_name, record_id, operation, changed_by, changed_columns, patient_id, cartella_id)
  VALUES (
    TG_TABLE_NAME,
    (v_row->>'id')::uuid,
    TG_OP,
    auth.uid(),
    v_changed_cols,
    COALESCE(NULLIF(v_row->>'patient_id',''), NULLIF(v_row->>'user_id',''))::uuid,
    -- 'cartelle_raw' aggiunto qui: è il nome reale della tabella dopo la
    -- SEZIONE 40 (vista trasparente cifrata). 'cartelle' resta nell'elenco
    -- per compatibilità storica/documentativa, anche se dopo questa sezione
    -- non esiste più come tabella reale (solo come vista, mai bersaglio
    -- diretto di questo trigger AFTER).
    CASE WHEN TG_TABLE_NAME IN ('cartelle','cartelle_raw') THEN (v_row->>'id')::uuid
         ELSE NULLIF(v_row->>'cartella_id','')::uuid END
  );

  RETURN NULL;
END;
$$;

-- 40.3 — Migrazione di cartelle.note a colonna cifrata + vista trasparente

ALTER TABLE cartelle ADD COLUMN IF NOT EXISTS note_enc bytea;

UPDATE cartelle SET note_enc = public.encrypt_text(note)
WHERE note IS NOT NULL AND note_enc IS NULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='cartelle' AND table_type='BASE TABLE') THEN
    ALTER TABLE cartelle RENAME TO cartelle_raw;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='cartelle_raw' AND column_name='note') THEN
    ALTER TABLE cartelle_raw RENAME COLUMN note TO note_plain_deprecated;
  END IF;
END $$;

DROP VIEW IF EXISTS public.cartelle;
CREATE VIEW public.cartelle WITH (security_invoker = true) AS
  SELECT
    id, user_id, nome, cognome, ddn, sesso, codice_fiscale, telefono,
    tags, archived, gdpr_consenso, gdpr_consenso_at, created_at,
    public.decrypt_text(note_enc) AS note
  FROM public.cartelle_raw;

CREATE OR REPLACE FUNCTION public.cartelle_view_insert()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE r public.cartelle_raw;
BEGIN
  INSERT INTO public.cartelle_raw
    (id, user_id, nome, cognome, ddn, sesso, codice_fiscale, telefono,
     tags, archived, gdpr_consenso, gdpr_consenso_at, created_at, note_enc)
  VALUES
    (COALESCE(NEW.id, gen_random_uuid()), NEW.user_id, NEW.nome, NEW.cognome, NEW.ddn, NEW.sesso,
     NEW.codice_fiscale, NEW.telefono, NEW.tags, COALESCE(NEW.archived, false),
     NEW.gdpr_consenso, NEW.gdpr_consenso_at, COALESCE(NEW.created_at, now()),
     public.encrypt_text(NEW.note))
  RETURNING * INTO r;
  NEW.id := r.id;
  NEW.created_at := r.created_at;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS cartelle_view_insert_trg ON public.cartelle;
CREATE TRIGGER cartelle_view_insert_trg INSTEAD OF INSERT ON public.cartelle
  FOR EACH ROW EXECUTE FUNCTION public.cartelle_view_insert();

CREATE OR REPLACE FUNCTION public.cartelle_view_update()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  UPDATE public.cartelle_raw SET
    nome = NEW.nome, cognome = NEW.cognome, ddn = NEW.ddn, sesso = NEW.sesso,
    codice_fiscale = NEW.codice_fiscale, telefono = NEW.telefono, tags = NEW.tags,
    archived = NEW.archived, gdpr_consenso = NEW.gdpr_consenso,
    gdpr_consenso_at = NEW.gdpr_consenso_at,
    note_enc = public.encrypt_text(NEW.note)
  WHERE id = OLD.id;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS cartelle_view_update_trg ON public.cartelle;
CREATE TRIGGER cartelle_view_update_trg INSTEAD OF UPDATE ON public.cartelle
  FOR EACH ROW EXECUTE FUNCTION public.cartelle_view_update();

CREATE OR REPLACE FUNCTION public.cartelle_view_delete()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  DELETE FROM public.cartelle_raw WHERE id = OLD.id;
  RETURN OLD;
END;
$$;
DROP TRIGGER IF EXISTS cartelle_view_delete_trg ON public.cartelle;
CREATE TRIGGER cartelle_view_delete_trg INSTEAD OF DELETE ON public.cartelle
  FOR EACH ROW EXECUTE FUNCTION public.cartelle_view_delete();

GRANT SELECT, INSERT, UPDATE, DELETE ON public.cartelle TO authenticated;
-- anon non ha mai avuto policy su cartelle: nessun grant qui, comportamento invariato.

NOTIFY pgrst, 'reload schema';

INSERT INTO schema_migrations (id, note) VALUES
  ('sezione_40_field_encryption_cartelle_note', 'Cifratura cartelle.note via pgcrypto+Vault, vista trasparente cartelle_raw')
ON CONFLICT (id) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────
-- BLOCCO DI VERIFICA — eseguire SEPARATAMENTE dopo la sezione sopra, PRIMA
-- di considerare la migrazione riuscita. Se una qualunque delle 4 righe
-- sotto non produce il risultato atteso, NON droppare note_plain_deprecated
-- e segnalarlo per un fix, invece di procedere.
-- ─────────────────────────────────────────────────────────────────────────
--
-- 1) Le note esistenti devono leggersi ancora in chiaro attraverso la vista:
--    SELECT id, nome, note FROM cartelle WHERE note IS NOT NULL LIMIT 3;
--
-- 2) La tabella reale sotto deve mostrare BYTEA illeggibile, non testo in
--    chiaro, per le stesse righe (conferma che la cifratura è reale):
--    SELECT id, note_enc, note_plain_deprecated FROM cartelle_raw WHERE note_enc IS NOT NULL LIMIT 3;
--
-- 3) Round-trip completo insert→update→delete attraverso la vista (pulisce
--    da sé, non lascia righe di test):
--    DO $$
--    DECLARE test_id uuid;
--    BEGIN
--      INSERT INTO cartelle (user_id, nome, cognome, note)
--        VALUES (auth.uid(), 'Test Cifratura', 'Verifica', 'Nota di prova da cancellare')
--        RETURNING id INTO test_id;
--      ASSERT (SELECT note FROM cartelle WHERE id = test_id) = 'Nota di prova da cancellare', 'round-trip insert fallito';
--      UPDATE cartelle SET note = 'Nota modificata' WHERE id = test_id;
--      ASSERT (SELECT note FROM cartelle WHERE id = test_id) = 'Nota modificata', 'round-trip update fallito';
--      ASSERT (SELECT note_enc IS NOT NULL FROM cartelle_raw WHERE id = test_id), 'note_enc non popolata';
--      DELETE FROM cartelle WHERE id = test_id;
--      RAISE NOTICE 'Verifica cifratura cartelle.note: OK';
--    END $$;
--    (va eseguito da un utente autenticato come dietista, non dal SQL editor
--    con ruolo postgres/service_role, altrimenti auth.uid() è NULL e la
--    insert fallisce la policy RLS — usare "Run as" nell'SQL Editor se
--    disponibile, oppure verificare dall'app stessa creando/modificando una
--    cartella di prova e controllando il punto 2 subito dopo)
--
-- Una volta confermati i punti 1-3 nell'app reale per qualche giorno, la
-- colonna in chiaro può essere rimossa in modo irreversibile con:
--    ALTER TABLE cartelle_raw DROP COLUMN note_plain_deprecated;

INSERT INTO schema_migrations (id, note) VALUES
  ('sezione_39_delete_dietitian_account', 'delete_own_dietitian_account() GDPR Art. 17')
ON CONFLICT (id) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════
-- SEZIONE 41 — COLONNE MANCANTI PER SYNC WEARABLE (daily_wellness.steps/heart_rate_avg)
--
-- Diet-Plan-Pro-app-claude (HealthSyncPage.jsx, syncWearablesToSupabase())
-- prova già a scrivere `steps` e `heart_rate_avg` su daily_wellness ad ogni
-- sync da Apple Health/Google Health Connect/Bluetooth, ma le colonne non
-- esistono sul DB — la scrittura fallisce silenziosamente (errore Postgres
-- 42703 "column does not exist", intercettato e ignorato lato client) e i
-- dati non vengono mai salvati. Questa sezione aggiunge solo le due colonne
-- mancanti: nessuna RLS da cambiare (le policy esistenti su daily_wellness
-- sono già a livello di riga, non di colonna) e nessun trigger necessario.
--
-- Nota per la dashboard "Attività & Dispositivi" in pazienti.html: il
-- payload scritto dal paziente NON valorizza cartella_id/patient_id (solo
-- user_id+date) — per leggere questi dati lato dietista si usa quindi la
-- policy "dietista legge wellness pazienti"/"dietista legge peso pazienti"
-- (già esistente, chiave su user_id via patient_dietitian), filtrando le
-- query su daily_wellness/weight_logs per user_id = patientId, non per
-- cartella_id.

ALTER TABLE public.daily_wellness ADD COLUMN IF NOT EXISTS steps integer;
ALTER TABLE public.daily_wellness ADD COLUMN IF NOT EXISTS heart_rate_avg integer;

NOTIFY pgrst, 'reload schema';

INSERT INTO schema_migrations (id, note) VALUES
  ('sezione_41_wearable_columns', 'daily_wellness.steps/heart_rate_avg per sync wearable + dashboard attività paziente')
ON CONFLICT (id) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════
-- SEZIONE 42 — PERCORSI NUTRIZIONALI MULTI-SETTIMANA (check-in e scadenza
-- automatizzati)
--
-- Prima d'ora l'unico automatismo temporale era il messaggio programmato
-- singolo (chat_group_messages.scheduled_at, un invio una tantum). Questa
-- sezione introduce un vero "percorso" con durata e cadenza di check-in: il
-- dietista lo avvia una volta per un paziente, poi il job cron
-- ?job=program-checkins (api/cron.js) invia da solo, senza altro intervento:
--   • un promemoria push+email al paziente quando è passato più tempo di
--     `checkin_ogni_giorni` dall'ultimo peso registrato (weight_logs, già
--     sincronizzato da Diet-Plan-Pro-app-claude — nessuna nuova tabella di
--     "check-in", si riusa il dato reale già esistente);
--   • un avviso push+email quando mancano 7 giorni o meno dalla fine del
--     percorso (data_inizio + durata_settimane), sia al paziente che al
--     dietista.
--
-- NOTA: FK verso cartelle_raw, non verso la vista `cartelle` (una VIEW non
-- può essere target di REFERENCES — stessa cautela già documentata nel
-- pattern di cifratura di SEZIONE 40).

CREATE TABLE IF NOT EXISTS public.percorsi_nutrizionali (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dietitian_id              UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  cartella_id               UUID NOT NULL REFERENCES public.cartelle_raw(id) ON DELETE CASCADE,
  patient_id                UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  nome                      TEXT NOT NULL,
  data_inizio               DATE NOT NULL DEFAULT CURRENT_DATE,
  durata_settimane          INTEGER NOT NULL CHECK (durata_settimane > 0),
  checkin_ogni_giorni       INTEGER NOT NULL DEFAULT 7 CHECK (checkin_ogni_giorni > 0),
  stato                     TEXT NOT NULL DEFAULT 'attivo' CHECK (stato IN ('attivo','completato','annullato')),
  ultimo_checkin_reminder_at TIMESTAMPTZ,
  scadenza_notificata_at    TIMESTAMPTZ,
  note                      TEXT,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_percorsi_stato_attivo ON public.percorsi_nutrizionali(stato) WHERE stato = 'attivo';
CREATE INDEX IF NOT EXISTS idx_percorsi_cartella ON public.percorsi_nutrizionali(cartella_id);

ALTER TABLE public.percorsi_nutrizionali ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'percorsi_dietitian_all' AND tablename = 'percorsi_nutrizionali') THEN
    CREATE POLICY "percorsi_dietitian_all" ON public.percorsi_nutrizionali
      FOR ALL USING (dietitian_id = auth.uid()) WITH CHECK (dietitian_id = auth.uid());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'percorsi_patient_read' AND tablename = 'percorsi_nutrizionali') THEN
    CREATE POLICY "percorsi_patient_read" ON public.percorsi_nutrizionali
      FOR SELECT USING (patient_id = auth.uid());
  END IF;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.percorsi_nutrizionali TO authenticated;

NOTIFY pgrst, 'reload schema';

INSERT INTO schema_migrations (id, note) VALUES
  ('sezione_42_percorsi_nutrizionali', 'Tabella percorsi_nutrizionali + RLS per check-in/scadenza automatizzati (job cron program-checkins)')
ON CONFLICT (id) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════
-- SEZIONE 43 — PAGAMENTO DIRETTO PAZIENTE→DIETISTA (Stripe Connect)
--
-- Distinto dall'abbonamento SaaS ricorrente già presente (profiles.
-- stripe_customer_id/stripe_subscription_id, sezione più sopra): qui i soldi
-- di una SINGOLA fattura (`fatture`, tab Pagamenti di pagamenti.html) vanno
-- direttamente sul conto Stripe del dietista via Stripe Connect (destination
-- charge), non sul conto della piattaforma. Commissione piattaforma: 5%
-- (application_fee_amount), decisione esplicita dell'utente 2026-08-10.
--
-- Nuove funzioni Edge richieste (non deployabili da questa sessione, sola
-- lettura — vedi supabase/functions/stripe-connect-onboarding/ e
-- supabase/functions/create-invoice-checkout-session/):
--   • stripe-connect-onboarding: crea/riprende l'account Stripe Connect
--     Express del dietista (Account Links).
--   • create-invoice-checkout-session: crea la Checkout Session di
--     pagamento per una fattura specifica, lato paziente.
--   • stripe-webhook (esistente, esteso): su checkout.session.completed con
--     metadata.fattura_id marca la fattura pagata; su account.updated
--     aggiorna stripe_connect_charges_enabled.

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS stripe_connect_account_id TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS stripe_connect_charges_enabled BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_profiles_stripe_connect ON public.profiles(stripe_connect_account_id) WHERE stripe_connect_account_id IS NOT NULL;

ALTER TABLE public.fatture ADD COLUMN IF NOT EXISTS stripe_checkout_session_id TEXT;
ALTER TABLE public.fatture ADD COLUMN IF NOT EXISTS stripe_payment_intent_id TEXT;
ALTER TABLE public.fatture ADD COLUMN IF NOT EXISTS pagato_online_at TIMESTAMPTZ;

-- Il paziente deve poter LEGGERE le proprie fatture per pagarle dall'app —
-- finora `fatture` aveva policy solo per il dietista proprietario (nessun
-- accesso paziente). Sola lettura: lo stato "pagato" viene sempre scritto
-- dal webhook con service role, mai dal client paziente.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'fatture_patient_read' AND tablename = 'fatture') THEN
    CREATE POLICY "fatture_patient_read" ON public.fatture
      FOR SELECT USING (patient_id = auth.uid());
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

INSERT INTO schema_migrations (id, note) VALUES
  ('sezione_43_stripe_connect_fatture', 'Stripe Connect per pagamento diretto paziente->dietista (commissione piattaforma 5%)')
ON CONFLICT (id) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════
-- SEZIONE 44 — TABELLA MANCANTE: diario_alimentare_foto
--
-- Il "Diario Alimentare Fotografico" (upload foto pasto → analisi AI →
-- selezione alimenti → nota clinica del dietista) è completo lato client in
-- pazienti.html (openDiarioFotoModal/diarioFotoSave/viewDiarioFoto/
-- deleteDiarioFoto) ma la tabella non è mai stata creata — ogni query
-- falliva con 404 PostgREST (schema cache: tabella sconosciuta), silenziata
-- da safeQuery() che la traduce in "nessuna foto". Nessun dato perso: la
-- feature semplicemente non ha mai scritto nulla finché questa sezione non
-- viene eseguita.
--
-- FK verso cartelle_raw (non la vista `cartelle`), stessa cautela delle
-- sezioni precedenti (una VIEW non può essere target di REFERENCES).

CREATE TABLE IF NOT EXISTS public.diario_alimentare_foto (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  cartella_id    UUID        NOT NULL REFERENCES public.cartelle_raw(id) ON DELETE CASCADE,
  storage_path   TEXT        NOT NULL,
  data_diario    DATE        NOT NULL DEFAULT CURRENT_DATE,
  ai_description TEXT,
  ai_confidence  TEXT,
  foods          JSONB       NOT NULL DEFAULT '[]'::jsonb,
  totali         JSONB       NOT NULL DEFAULT '{}'::jsonb,
  note           TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_diario_alimentare_foto_cartella ON public.diario_alimentare_foto(cartella_id);

ALTER TABLE public.diario_alimentare_foto ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'diario_alimentare_foto_dietitian_all' AND tablename = 'diario_alimentare_foto') THEN
    CREATE POLICY "diario_alimentare_foto_dietitian_all" ON public.diario_alimentare_foto
      FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
  END IF;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.diario_alimentare_foto TO authenticated;

NOTIFY pgrst, 'reload schema';

INSERT INTO schema_migrations (id, note) VALUES
  ('sezione_44_diario_alimentare_foto', 'Tabella diario_alimentare_foto mancante (feature già completa lato client, mai aveva una tabella)')
ON CONFLICT (id) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════
-- SEZIONE 45 — COLLABORATORI DI STUDIO: estensione alle tabelle mancanti
--
-- Il pattern "collaboratori" (SEZIONE 15: studio_collaborators,
-- get_studio_owner(), is_dietitian_level_collaborator()) copriva finora solo
-- cartelle, piani, ncpt, bia_records, schede_valutazione, note_specialistiche
-- (+ patient_dietitian in sola lettura, + appointments già completo). Tutte
-- le tabelle aggiunte in sessioni successive (esami_biochimici, patient_files,
-- diario_alimentare_foto, percorsi_nutrizionali, fatture) non erano mai state
-- estese: un collaboratore non vedeva né poteva scrivere nulla lì, pur
-- avendo accesso al resto della cartella dello stesso paziente.
--
-- Aggiunge anche la policy di SCRITTURA mancante su patient_dietitian per i
-- collaboratori dietista-level: prima potevano solo leggere il roster
-- pazienti del titolare, non collegarne di nuovi.

-- ── Tabelle con ownership su user_id: stesso pattern del loop di SEZIONE 15 ──
DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['esami_biochimici','patient_files','diario_alimentare_foto']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', tbl || '_collaborator_read', tbl);
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR SELECT USING (user_id = get_studio_owner(auth.uid()))',
      tbl || '_collaborator_read', tbl
    );

    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', tbl || '_collaborator_write', tbl);
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR ALL USING (user_id = get_studio_owner(auth.uid()) AND is_dietitian_level_collaborator(auth.uid())) WITH CHECK (user_id = get_studio_owner(auth.uid()) AND is_dietitian_level_collaborator(auth.uid()))',
      tbl || '_collaborator_write', tbl
    );
  END LOOP;
END $$;

-- ── Tabelle con ownership su dietitian_id: percorsi_nutrizionali, fatture ──
DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['percorsi_nutrizionali','fatture']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', tbl || '_collaborator_read', tbl);
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR SELECT USING (dietitian_id = get_studio_owner(auth.uid()))',
      tbl || '_collaborator_read', tbl
    );

    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', tbl || '_collaborator_write', tbl);
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR ALL USING (dietitian_id = get_studio_owner(auth.uid()) AND is_dietitian_level_collaborator(auth.uid())) WITH CHECK (dietitian_id = get_studio_owner(auth.uid()) AND is_dietitian_level_collaborator(auth.uid()))',
      tbl || '_collaborator_write', tbl
    );
  END LOOP;
END $$;

-- ── patient_dietitian: i collaboratori dietista-level possono collegare/scollegare pazienti ──
DROP POLICY IF EXISTS "patient_dietitian_collaborator_write" ON patient_dietitian;
CREATE POLICY "patient_dietitian_collaborator_write" ON patient_dietitian
  FOR ALL USING (dietitian_id = get_studio_owner(auth.uid()) AND is_dietitian_level_collaborator(auth.uid()))
  WITH CHECK (dietitian_id = get_studio_owner(auth.uid()) AND is_dietitian_level_collaborator(auth.uid()));

NOTIFY pgrst, 'reload schema';

INSERT INTO schema_migrations (id, note) VALUES
  ('sezione_45_collaboratori_estensione', 'RLS collaboratori estesa a esami_biochimici/patient_files/diario_alimentare_foto/percorsi_nutrizionali/fatture + scrittura patient_dietitian')
ON CONFLICT (id) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════
-- SEZIONE 46 — COLLABORATORI DI STUDIO: policy storage bucket
--
-- Le policy sui bucket storage sono indipendenti dalle RLS delle tabelle
-- (SEZIONE 45 sopra) — un collaboratore poteva già leggere/scrivere la RIGA
-- in patient_files, ma non il FILE vero e proprio nello storage, perché
-- patient_files_storage_* controllava che il primo segmento del path fosse
-- letteralmente auth.uid() (l'id di chi è loggato ORA), non
-- get_studio_owner(auth.uid()) (l'id del titolare dello studio). Stesso
-- discorso per patient-photos, tramite il join su cartelle_raw.user_id.
--
-- NOTA IMPORTANTE per il client: i nuovi upload su patient-files vanno
-- scritti sotto la cartella `${studioOwnerId}/...`, non più
-- `${currentUser.id}/...` — altrimenti la policy INSERT sotto rifiuta la
-- scrittura (il path deve combaciare con get_studio_owner(auth.uid())).
-- I file già esistenti restano leggibili: per un titolare/dietista
-- indipendente studioOwnerId === currentUser.id, nessun path esistente cambia.

DROP POLICY IF EXISTS "patient_files_storage_select" ON storage.objects;
CREATE POLICY "patient_files_storage_select" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'patient-files' AND auth.uid() IS NOT NULL
    AND (storage.foldername(name))[1] = get_studio_owner(auth.uid())::text
  );

DROP POLICY IF EXISTS "patient_files_storage_insert" ON storage.objects;
CREATE POLICY "patient_files_storage_insert" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'patient-files' AND auth.uid() IS NOT NULL
    AND (storage.foldername(name))[1] = get_studio_owner(auth.uid())::text
    AND is_dietitian_level_collaborator(auth.uid())
  );

DROP POLICY IF EXISTS "patient_files_storage_delete" ON storage.objects;
CREATE POLICY "patient_files_storage_delete" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'patient-files' AND auth.uid() IS NOT NULL
    AND (storage.foldername(name))[1] = get_studio_owner(auth.uid())::text
    AND is_dietitian_level_collaborator(auth.uid())
  );

-- patient-photos: il path è ${cartellaId}/${schedaId}/..., non uid — la
-- policy verifica l'ownership via join, basta risolvere lo studio owner lì.
DROP POLICY IF EXISTS "patient_photos_owner_read" ON storage.objects;
CREATE POLICY "patient_photos_owner_read" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'patient-photos' AND EXISTS (
      SELECT 1 FROM cartelle_raw c
      WHERE c.id = ((storage.foldername(objects.name))[1])::uuid
        AND c.user_id = get_studio_owner(auth.uid())
    )
  );

DROP POLICY IF EXISTS "patient_photos_owner_write" ON storage.objects;
CREATE POLICY "patient_photos_owner_write" ON storage.objects
  FOR ALL USING (
    bucket_id = 'patient-photos' AND EXISTS (
      SELECT 1 FROM cartelle_raw c
      WHERE c.id = ((storage.foldername(objects.name))[1])::uuid
        AND c.user_id = get_studio_owner(auth.uid())
    ) AND is_dietitian_level_collaborator(auth.uid())
  ) WITH CHECK (
    bucket_id = 'patient-photos' AND EXISTS (
      SELECT 1 FROM cartelle_raw c
      WHERE c.id = ((storage.foldername(objects.name))[1])::uuid
        AND c.user_id = get_studio_owner(auth.uid())
    ) AND is_dietitian_level_collaborator(auth.uid())
  );

-- La vecchia policy combinata (read+write insieme, senza distinzione
-- segreteria/dietista) va rimossa esplicitamente: le due nuove sopra la
-- sostituiscono con lettura permissiva + scrittura solo dietista-level.
DROP POLICY IF EXISTS "patient_photos_owner_all" ON storage.objects;

NOTIFY pgrst, 'reload schema';

INSERT INTO schema_migrations (id, note) VALUES
  ('sezione_46_collaboratori_storage', 'Policy storage bucket (patient-files, patient-photos) aggiornate per i collaboratori di studio')
ON CONFLICT (id) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════
-- SEZIONE 47 — patient_documents (collaboratori) + fix patient_audit_log
--
-- patient_documents (Privacy/GDPR/moduli inviati al paziente) non aveva
-- alcuna policy per i collaboratori: un collaboratore che invia un modulo lo
-- "orfanizza" sotto il proprio auth.uid(), invisibile al titolare e agli
-- altri collaboratori dello studio.
--
-- patient_audit_log è un bug scoperto durante questa sessione, indipendente
-- dai collaboratori: la tabella ha RLS attiva ma ZERO policy — significa
-- accesso negato a chiunque, titolare compreso. È il motivo per cui lo
-- storico modifiche in pazienti.html è sempre risultato vuoto (l'INSERT di
-- logAuditEvent() fallisce silenziosamente, il try/catch lo nasconde).
-- Deliberatamente NESSUNA policy UPDATE/DELETE: un log di audit deve restare
-- append-only, non modificabile nemmeno dal titolare.

DROP POLICY IF EXISTS "patient_documents_collaborator_read" ON patient_documents;
CREATE POLICY "patient_documents_collaborator_read" ON patient_documents
  FOR SELECT USING (dietitian_id = get_studio_owner(auth.uid()));

DROP POLICY IF EXISTS "patient_documents_collaborator_write" ON patient_documents;
CREATE POLICY "patient_documents_collaborator_write" ON patient_documents
  FOR ALL USING (dietitian_id = get_studio_owner(auth.uid()) AND is_dietitian_level_collaborator(auth.uid()))
  WITH CHECK (dietitian_id = get_studio_owner(auth.uid()) AND is_dietitian_level_collaborator(auth.uid()));

DROP POLICY IF EXISTS "patient_audit_log_studio_read" ON patient_audit_log;
CREATE POLICY "patient_audit_log_studio_read" ON patient_audit_log
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM cartelle_raw c WHERE c.id = patient_audit_log.patient_id AND c.user_id = get_studio_owner(auth.uid()))
  );

DROP POLICY IF EXISTS "patient_audit_log_studio_insert" ON patient_audit_log;
CREATE POLICY "patient_audit_log_studio_insert" ON patient_audit_log
  FOR INSERT WITH CHECK (
    dietitian_id = auth.uid()
    AND EXISTS (SELECT 1 FROM cartelle_raw c WHERE c.id = patient_audit_log.patient_id AND c.user_id = get_studio_owner(auth.uid()))
  );

GRANT SELECT, INSERT ON public.patient_audit_log TO authenticated;

NOTIFY pgrst, 'reload schema';

INSERT INTO schema_migrations (id, note) VALUES
  ('sezione_47_patient_documents_audit_log', 'Collaboratori su patient_documents + fix patient_audit_log (RLS attiva ma senza policy, sempre vuota)')
ON CONFLICT (id) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════
-- SEZIONE 48 — COLLABORATORI DI STUDIO: patient_consents, ricette
--
-- Ultime due tabelle trovate durante il giro completo di pazienti.html,
-- chat.html, bia.html, ncpt.html, valutazione.html, questionari.html,
-- agenda.html, app.html, pagamenti.html, ricette.html: nessuna delle due
-- aveva policy per i collaboratori.

DROP POLICY IF EXISTS "patient_consents_collaborator_read" ON patient_consents;
CREATE POLICY "patient_consents_collaborator_read" ON patient_consents
  FOR SELECT USING (dietitian_id = get_studio_owner(auth.uid()));

DROP POLICY IF EXISTS "patient_consents_collaborator_write" ON patient_consents;
CREATE POLICY "patient_consents_collaborator_write" ON patient_consents
  FOR ALL USING (dietitian_id = get_studio_owner(auth.uid()) AND is_dietitian_level_collaborator(auth.uid()))
  WITH CHECK (dietitian_id = get_studio_owner(auth.uid()) AND is_dietitian_level_collaborator(auth.uid()));

DROP POLICY IF EXISTS "ricette_collaborator_read" ON ricette;
CREATE POLICY "ricette_collaborator_read" ON ricette
  FOR SELECT USING (user_id = get_studio_owner(auth.uid()));

DROP POLICY IF EXISTS "ricette_collaborator_write" ON ricette;
CREATE POLICY "ricette_collaborator_write" ON ricette
  FOR ALL USING (user_id = get_studio_owner(auth.uid()) AND is_dietitian_level_collaborator(auth.uid()))
  WITH CHECK (user_id = get_studio_owner(auth.uid()) AND is_dietitian_level_collaborator(auth.uid()));

NOTIFY pgrst, 'reload schema';

INSERT INTO schema_migrations (id, note) VALUES
  ('sezione_48_collaboratori_consents_ricette', 'Collaboratori su patient_consents e ricette')
ON CONFLICT (id) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════
-- SEZIONE 49 — COLLABORATORI DI STUDIO: giro completo pagine rimanenti
--
-- Trovate durante il giro finale su anamnesi.html, database.html,
-- pagamenti.html (pacchetti), broadcast.html, profilo-pubblico.html,
-- app.html (liste_spesa, piani_template): nessuna aveva policy collaboratori.
-- chat_groups/chat_group_members restano volutamente esclusi: il modello a
-- membership esplicita (is_chat_group_member) è già indipendente dallo studio
-- e un titolare può aggiungere manualmente il collaboratore a un gruppo.
-- dietitian_todos resta volutamente esclusa: è una todo-list personale per
-- singolo utente, non condivisa (come agenda_events).

-- ── Tabelle con ownership su user_id ──
DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['alimenti_custom','liste_spesa','piani_template']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', tbl || '_collaborator_read', tbl);
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR SELECT USING (user_id = get_studio_owner(auth.uid()))',
      tbl || '_collaborator_read', tbl
    );

    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', tbl || '_collaborator_write', tbl);
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR ALL USING (user_id = get_studio_owner(auth.uid()) AND is_dietitian_level_collaborator(auth.uid())) WITH CHECK (user_id = get_studio_owner(auth.uid()) AND is_dietitian_level_collaborator(auth.uid()))',
      tbl || '_collaborator_write', tbl
    );
  END LOOP;
END $$;

-- ── Tabelle con ownership su dietitian_id ──
DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['patient_intake_forms','pacchetti','pacchetti_acquistati','broadcast_messages','dietitian_profiles','shared_recipes','whatsapp_messages']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', tbl || '_collaborator_read', tbl);
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR SELECT USING (dietitian_id = get_studio_owner(auth.uid()))',
      tbl || '_collaborator_read', tbl
    );

    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', tbl || '_collaborator_write', tbl);
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR ALL USING (dietitian_id = get_studio_owner(auth.uid()) AND is_dietitian_level_collaborator(auth.uid())) WITH CHECK (dietitian_id = get_studio_owner(auth.uid()) AND is_dietitian_level_collaborator(auth.uid()))',
      tbl || '_collaborator_write', tbl
    );
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';

INSERT INTO schema_migrations (id, note) VALUES
  ('sezione_49_collaboratori_giro_finale', 'Collaboratori su patient_intake_forms/alimenti_custom/pacchetti/pacchetti_acquistati/broadcast_messages/dietitian_profiles/shared_recipes/whatsapp_messages/liste_spesa/piani_template')
ON CONFLICT (id) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════
-- SEZIONE 50 — AUDIT LOG CLINICO CENTRALIZZATO + RETENTION POLICY
--
-- patient_audit_log era scritta da un'unica chiamata client (logAuditEvent,
-- solo su 'updated_profile' in pazienti.html) che non controllava mai
-- l'errore dell'insert: finché la RLS non copriva la tabella (prima della
-- SEZIONE 47), ogni scrittura falliva in silenzio — la tabella è sempre
-- rimasta vuota. Anche risolta la RLS, un singolo call-site client-side non
-- copre "tutte le azioni cliniche rilevanti": creare/modificare/eliminare un
-- piano, una BIA, una scheda NCPt/valutazione, una nota specialistica,
-- collegare/scollegare un paziente, inviare un consenso o un documento.
--
-- Soluzione: un trigger generico lato database, non aggirabile da un bug o
-- una dimenticanza lato client, agganciato AFTER INSERT/UPDATE/DELETE su
-- tutte le tabelle cliniche. SECURITY DEFINER cosicché l'audit funzioni
-- anche quando l'attore non ha di per sé i permessi RLS per scrivere in
-- patient_audit_log (es. un paziente che carica una foto diario). La
-- funzione non deve mai bloccare la scrittura clinica primaria: qualunque
-- eccezione nell'audit viene loggata come WARNING e ignorata.

CREATE OR REPLACE FUNCTION log_patient_audit_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  -- Colonne con contenuto clinico esteso: il valore attuale resta sempre
  -- leggibile nella tabella di origine, non serve duplicarlo nell'audit
  -- trail (eviterebbe solo di gonfiare la tabella senza reale beneficio).
  v_heavy_cols text[] := ARRAY['meals','dati','ingredienti','items','giorni','contenuto_html','recipe_data'];
  v_new jsonb;
  v_old jsonb;
  v_cartella_id uuid;
  v_record_id uuid;
  v_action text;
  v_changed text[];
  v_details jsonb;
BEGIN
  v_new := CASE WHEN TG_OP <> 'DELETE' THEN to_jsonb(NEW) - v_heavy_cols ELSE NULL END;
  v_old := CASE WHEN TG_OP <> 'INSERT' THEN to_jsonb(OLD) - v_heavy_cols ELSE NULL END;

  IF TG_TABLE_NAME = 'cartelle' THEN
    v_cartella_id := COALESCE(v_new->>'id', v_old->>'id')::uuid;
  ELSE
    v_cartella_id := COALESCE(v_new->>'cartella_id', v_old->>'cartella_id')::uuid;
  END IF;
  v_record_id := COALESCE(v_new->>'id', v_old->>'id')::uuid;
  v_action := TG_TABLE_NAME || '_' || lower(TG_OP);
  v_details := jsonb_build_object('record_id', v_record_id);

  IF TG_OP = 'UPDATE' THEN
    SELECT array_agg(n.key) INTO v_changed
    FROM jsonb_each(v_new) n JOIN jsonb_each(v_old) o USING (key)
    WHERE n.value IS DISTINCT FROM o.value;
    IF v_changed IS NOT NULL THEN
      v_details := v_details || jsonb_build_object(
        'changed_fields', v_changed,
        'before', (SELECT jsonb_object_agg(key, v_old->key) FROM unnest(v_changed) key),
        'after',  (SELECT jsonb_object_agg(key, v_new->key) FROM unnest(v_changed) key)
      );
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    -- Unico punto in cui il contenuto del record cancellato resterà mai
    -- consultabile: qui vale la pena tenere lo snapshot completo (esclusi
    -- i campi pesanti sopra).
    v_details := v_details || jsonb_build_object('deleted_row', v_old);
  END IF;

  IF v_cartella_id IS NOT NULL THEN
    INSERT INTO patient_audit_log (patient_id, dietitian_id, action, details, created_at)
    VALUES (v_cartella_id, auth.uid(), v_action, v_details, now());
  END IF;

  RETURN COALESCE(NEW, OLD);
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'log_patient_audit_event fallito su %.%: %', TG_TABLE_NAME, TG_OP, SQLERRM;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['cartelle','piani','ncpt','bia_records','schede_valutazione','note_specialistiche','esami_biochimici','patient_files','diario_alimentare_foto','percorsi_nutrizionali','patient_dietitian','patient_documents','patient_consents']
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_audit_log ON %I', tbl);
    EXECUTE format(
      'CREATE TRIGGER trg_audit_log AFTER INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION log_patient_audit_event()',
      tbl
    );
  END LOOP;
END $$;

CREATE INDEX IF NOT EXISTS idx_patient_audit_log_patient_id ON patient_audit_log(patient_id);
CREATE INDEX IF NOT EXISTS idx_patient_audit_log_created_at ON patient_audit_log(created_at);

-- ── Retention policy ─────────────────────────────────────────────────────
-- Allineata alla voce B.1 del registro dei trattamenti (legal/registro-
-- trattamenti.html): "durata del rapporto terapeutico + 10 anni
-- (documentazione sanitaria)". L'audit trail documenta modifiche a dati
-- clinici, quindi segue la stessa regola del fascicolo che documenta — non
-- avrebbe senso cancellare "chi ha modificato cosa" prima del dato stesso,
-- svuoterebbe di valore probatorio la cartella che resta.
--
-- Per applicarla serve sapere QUANDO è finito il rapporto: si aggiunge
-- cartelle.archived_at, stampata automaticamente (mai dal client, stesso
-- errore di affidabilità dell'audit log stesso) al primo archiviare/
-- riattivare una cartella. Finché archived = false il rapporto è
-- considerato attivo e nulla viene mai cancellato automaticamente.

ALTER TABLE cartelle ADD COLUMN IF NOT EXISTS archived_at timestamptz;

CREATE OR REPLACE FUNCTION stamp_cartella_archived_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.archived IS DISTINCT FROM OLD.archived THEN
    NEW.archived_at := CASE WHEN NEW.archived THEN now() ELSE NULL END;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_stamp_archived_at ON cartelle;
CREATE TRIGGER trg_stamp_archived_at BEFORE UPDATE ON cartelle
FOR EACH ROW EXECUTE FUNCTION stamp_cartella_archived_at();

CREATE OR REPLACE FUNCTION purge_expired_patient_audit_log()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Cartelle archiviate da oltre 10 anni: fine del periodo di conservazione.
  DELETE FROM patient_audit_log al
  USING cartelle c
  WHERE al.patient_id = c.id
    AND c.archived = true
    AND c.archived_at IS NOT NULL
    AND c.archived_at < now() - interval '10 years';

  -- Voci orfane (cartella già cancellata fisicamente dal database): non
  -- potendo più risalire alla data di fine rapporto, si applicano 10 anni
  -- dalla scrittura dell'evento stesso come rete di sicurezza, in linea con
  -- il principio di limitazione della conservazione (art. 5.1.e GDPR).
  DELETE FROM patient_audit_log al
  WHERE NOT EXISTS (SELECT 1 FROM cartelle c WHERE c.id = al.patient_id)
    AND al.created_at < now() - interval '10 years';
END;
$$;

CREATE EXTENSION IF NOT EXISTS pg_cron;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'purge_expired_patient_audit_log') THEN
    PERFORM cron.unschedule('purge_expired_patient_audit_log');
  END IF;
END $$;

SELECT cron.schedule(
  'purge_expired_patient_audit_log',
  '0 3 1 * *',
  $$SELECT public.purge_expired_patient_audit_log();$$
);

NOTIFY pgrst, 'reload schema';

INSERT INTO schema_migrations (id, note) VALUES
  ('sezione_50_audit_log_centralizzato_retention', 'Trigger di audit centralizzato su 13 tabelle cliniche (sostituisce logAuditEvent client-side, mai affidabile) + retention policy automatica via pg_cron (rapporto + 10 anni, come da registro trattamenti B.1)')
ON CONFLICT (id) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════
-- SEZIONE 51 — CODA DI SINCRONIZZAZIONE FHIR (FSE 2.0)
--
-- Fin qui l'unico export verso il FSE era fse.js: un modulo compilato a mano
-- dal dietista, un documento CDA alla volta, da firmare e caricare
-- manualmente sul portale regionale. Non è un flusso continuo — se cambia un
-- esame, un piano, una diagnosi, nessuno se ne accorge finché il dietista
-- non riapre manualmente l'export.
--
-- Questa sezione aggiunge la parte "flusso continuo" lato database: un
-- trigger, stesso pattern della SEZIONE 50, che segna una cartella come "da
-- risincronizzare" ogni volta che cambia un dato clinico rilevante
-- (patologie/tag, esami, BIA, piano). La costruzione vera e propria del
-- Bundle FHIR (con le mappature LOINC/SNOMED) resta lato applicazione — vedi
-- js/fhir-export.js e api/_fhir.js — perché richiede logica di mappatura
-- terminologica che non ha senso duplicare in PL/pgSQL; qui il trigger si
-- limita a dire "questo paziente ha bisogno di un nuovo invio", non tenta di
-- costruire la risorsa FHIR.
--
-- Una riga per cartella (non una per evento): un paziente con più modifiche
-- nello stesso giorno resta "pending" una sola volta, il job di sync
-- ricostruisce comunque l'intero Bundle aggiornato ad ogni invio, non un
-- delta incrementale.

CREATE TABLE IF NOT EXISTS fhir_export_queue (
  cartella_id uuid PRIMARY KEY REFERENCES cartelle(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending', -- 'pending' | 'sent' | 'failed'
  queued_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  attempts integer NOT NULL DEFAULT 0,
  last_error text
);

ALTER TABLE fhir_export_queue ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "fhir_export_queue_studio_read" ON fhir_export_queue;
CREATE POLICY "fhir_export_queue_studio_read" ON fhir_export_queue
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM cartelle c WHERE c.id = fhir_export_queue.cartella_id
      AND c.user_id = get_studio_owner(auth.uid())
  ));

CREATE INDEX IF NOT EXISTS idx_fhir_export_queue_status ON fhir_export_queue(status);

CREATE OR REPLACE FUNCTION enqueue_fhir_export()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_cartella_id uuid;
BEGIN
  IF TG_TABLE_NAME = 'cartelle' THEN
    v_cartella_id := COALESCE(NEW.id, OLD.id);
  ELSE
    v_cartella_id := COALESCE(NEW.cartella_id, OLD.cartella_id);
  END IF;

  IF v_cartella_id IS NOT NULL THEN
    INSERT INTO fhir_export_queue (cartella_id, status, queued_at, last_error)
    VALUES (v_cartella_id, 'pending', now(), NULL)
    ON CONFLICT (cartella_id) DO UPDATE
      SET status = 'pending', queued_at = now(), last_error = NULL;
  END IF;

  RETURN COALESCE(NEW, OLD);
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'enqueue_fhir_export fallito su %.%: %', TG_TABLE_NAME, TG_OP, SQLERRM;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['cartelle','esami_biochimici','bia_records','piani']
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_enqueue_fhir_export ON %I', tbl);
    EXECUTE format(
      'CREATE TRIGGER trg_enqueue_fhir_export AFTER INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION enqueue_fhir_export()',
      tbl
    );
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';

INSERT INTO schema_migrations (id, note) VALUES
  ('sezione_51_fhir_export_queue', 'Coda fhir_export_queue + trigger su cartelle/esami_biochimici/bia_records/piani: segna una cartella da (ri)sincronizzare verso FSE 2.0 ad ogni scrittura clinica rilevante — lato costruzione Bundle FHIR in js/fhir-export.js + api/_fhir.js, job di invio in api/cron.js (?job=fhir-sync)')
ON CONFLICT (id) DO NOTHING;


-- ═══════════════════════════════════════════════════════════════════════════
-- SEZIONE 52 — Consenso registrazione persistito + gate consenso AI foto pasto
--             + fix creazione profilo paziente (bug scoperto in questa sessione)
--
-- Bug scoperto: la SEZIONE 1 rimuove il trigger on_auth_user_created su
-- auth.users (rischio 500 da GoTrue, vedi commento lì) e lo sostituisce con
-- l'RPC client-side create_profile_for_new_user() — MA quella sostituzione
-- era stata fatta solo per il flusso dietista (NutriPlan-Pro). Il flusso
-- paziente (Diet-Plan-Pro-app-claude, RegisterPage.jsx) continuava a fare
-- affidamento sullo stesso trigger (handle_new_user(), definito nel repo
-- Diet-Plan-Pro-app-claude/supabase-schema.sql) per creare la riga profiles
-- con role='patient' — trigger che su questo progetto NON esiste più.
-- Verificato sul database live: 0 righe in pg_trigger per
-- on_auth_user_created, funzione handle_new_user() orfana (definita, mai
-- eseguita). Nessun paziente reale ha ancora colpito il bug (22/22 utenti
-- attuali hanno un profilo, presumibilmente tutti creati prima della
-- rimozione del trigger, o via altro percorso), ma la prossima
-- autoregistrazione paziente fallirebbe silenziosamente (auth.users creato,
-- profiles mai creato, app bloccata su profilo nullo).
--
-- Fix: stesso pattern già collaudato per il dietista, esteso al paziente.
-- create_patient_profile() è una funzione GEMELLA di
-- create_profile_for_new_user() — SECURITY DEFINER, concessa anche ad anon
-- (funziona senza sessione attiva, subito dopo signUp()) — con una
-- differenza di sicurezza intenzionale ereditata dal trigger originale: il
-- ruolo 'patient' è hardcoded nella funzione, MAI passato come parametro
-- dal client, per lo stesso motivo già documentato nel trigger rimosso
-- (chiunque potrebbe altrimenti passare role='dietitian' via un parametro
-- client-controlled e ottenere accesso alle policy gated su quel ruolo).
--
-- Entrambe le funzioni ora accettano anche `terms_accepted` per persistere
-- terms_accepted_at nella tabella profiles stessa (prima veniva solo passato
-- a supabase.auth.signUp({options:{data:{...}}}), che lo scrive in
-- auth.users.raw_user_meta_data — non leggibile/interrogabile da un admin
-- via la tabella profiles, quindi di fatto inutile ai fini di controllo/
-- audit del consenso).
-- ═══════════════════════════════════════════════════════════════════════════

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='profiles' AND column_name='terms_accepted_at') THEN
    ALTER TABLE profiles ADD COLUMN terms_accepted_at TIMESTAMPTZ;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='profiles' AND column_name='ai_photo_consent_at') THEN
    ALTER TABLE profiles ADD COLUMN ai_photo_consent_at TIMESTAMPTZ;
  END IF;
END $$;

-- create_profile_for_new_user(): ora accetta anche terms_accepted (default
-- false per retro-compatibilità con eventuali chiamate esistenti a 2
-- argomenti — ma va preferita sempre la chiamata a 3 argomenti dal client).
DROP FUNCTION IF EXISTS create_profile_for_new_user(UUID, TEXT);
CREATE OR REPLACE FUNCTION create_profile_for_new_user(uid UUID, user_email TEXT, terms_accepted BOOLEAN DEFAULT false)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, email, approved, is_admin, terms_accepted_at)
  VALUES (uid, user_email, false, false, CASE WHEN terms_accepted THEN NOW() ELSE NULL END)
  ON CONFLICT (id) DO UPDATE SET
    terms_accepted_at = COALESCE(profiles.terms_accepted_at, EXCLUDED.terms_accepted_at);
EXCEPTION WHEN OTHERS THEN
  NULL;
END;
$$;
GRANT EXECUTE ON FUNCTION create_profile_for_new_user(UUID, TEXT, BOOLEAN) TO anon, authenticated;

-- create_patient_profile(): equivalente per il flusso paziente
-- (Diet-Plan-Pro-app-claude) — sostituisce il trigger handle_new_user() che
-- su questo progetto non è più agganciato ad auth.users. role='patient' è
-- SEMPRE hardcoded, mai un parametro.
CREATE OR REPLACE FUNCTION create_patient_profile(
  uid UUID, user_email TEXT, p_full_name TEXT, p_first_name TEXT, p_last_name TEXT,
  terms_accepted BOOLEAN DEFAULT false
)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, first_name, last_name, role, terms_accepted_at)
  VALUES (uid, user_email, p_full_name, p_first_name, p_last_name, 'patient',
          CASE WHEN terms_accepted THEN NOW() ELSE NULL END)
  ON CONFLICT (id) DO UPDATE SET
    full_name  = COALESCE(EXCLUDED.full_name,  profiles.full_name),
    first_name = COALESCE(EXCLUDED.first_name, profiles.first_name),
    last_name  = COALESCE(EXCLUDED.last_name,  profiles.last_name),
    terms_accepted_at = COALESCE(profiles.terms_accepted_at, EXCLUDED.terms_accepted_at);
EXCEPTION WHEN OTHERS THEN
  NULL;
END;
$$;
GRANT EXECUTE ON FUNCTION create_patient_profile(UUID, TEXT, TEXT, TEXT, TEXT, BOOLEAN) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';

INSERT INTO schema_migrations (id, note) VALUES
  ('sezione_52_consent_and_patient_profile_fix', 'terms_accepted_at + ai_photo_consent_at su profiles; create_patient_profile() risolve un bug live — la registrazione paziente dipendeva da un trigger su auth.users rimosso in SEZIONE 1, mai sostituito lato paziente')
ON CONFLICT (id) DO NOTHING;


-- ═══════════════════════════════════════════════════════════════════════════
-- SEZIONE 53 — coach_ai_messages: log delle conversazioni Coach AI paziente
--
-- Il Coach AI (Diet-Plan-Pro-app-claude, api/coach-ai.js) era finora
-- completamente client-side/effimero: nessuna riga scritta da nessuna parte,
-- la conversazione spariva al refresh. Rischio identificato in sessione:
-- nessuna sorveglianza clinica possibile da parte del dietista su cosa il
-- paziente chiede e cosa l'AI risponde. Questa tabella la rende un log
-- reale, in sola lettura per il dietista/studio collegato — stesso schema
-- di accesso già validato per esami_biochimici/patient_audit_log
-- (get_studio_owner, supporta i collaboratori di studio).
--
-- Scrittura: solo il paziente stesso (in pratica solo dal server con il
-- token del paziente, mai con service role — stesso pattern già usato in
-- coach-ai.js per leggere i tag). Nessun UPDATE/DELETE previsto: log
-- d'appendice, non un contenuto editabile.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS coach_ai_messages (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id  UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role        TEXT        NOT NULL CHECK (role IN ('user','assistant')),
  content     TEXT        NOT NULL,
  blocked     BOOLEAN     NOT NULL DEFAULT false, -- true = risposta di rifiuto automatico (es. tag DCA), mai inviata al modello
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_coach_ai_messages_patient ON coach_ai_messages (patient_id, created_at DESC);

ALTER TABLE coach_ai_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "coach_ai_messages_insert_own" ON coach_ai_messages;
CREATE POLICY "coach_ai_messages_insert_own" ON coach_ai_messages
  FOR INSERT WITH CHECK (auth.uid() = patient_id);

DROP POLICY IF EXISTS "coach_ai_messages_select" ON coach_ai_messages;
CREATE POLICY "coach_ai_messages_select" ON coach_ai_messages
  FOR SELECT USING (
    auth.uid() = patient_id
    OR EXISTS (
      SELECT 1 FROM patient_dietitian pd
      WHERE pd.patient_id = coach_ai_messages.patient_id
        AND get_studio_owner(pd.dietitian_id) = get_studio_owner(auth.uid())
    )
  );

-- Colonna consenso esplicito Coach AI (stesso pattern di ai_photo_consent_at,
-- SEZIONE 52) — il consenso alla foto pasto NON copre il Coach AI: sono due
-- funzioni AI distinte con due fornitori distinti (Gemini vs Groq), due
-- consensi distinti.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='profiles' AND column_name='coach_ai_consent_at') THEN
    ALTER TABLE profiles ADD COLUMN coach_ai_consent_at TIMESTAMPTZ;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

INSERT INTO schema_migrations (id, note) VALUES
  ('sezione_53_coach_ai_safety', 'coach_ai_messages (log conversazioni, sola lettura dietista/studio) + profiles.coach_ai_consent_at')
ON CONFLICT (id) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════
-- SEZIONE 54 — profiles.nutrition_goal (obiettivo scelto in onboarding)
--
-- OnboardingFlow.jsx (Diet-Plan-Pro-app-claude) raccoglieva già l'obiettivo
-- del paziente (dimagrire/mantenere/aumentare) ma lo scriveva solo in
-- localStorage: nessuna funzione server (coach-ai.js, food-swap.js) né
-- altra pagina lo leggeva mai — dato morto. Questa colonna lo rende
-- persistente e condivisibile tra client e funzioni server, così l'AI e il
-- framing dei target macro possono usarlo davvero.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS nutrition_goal TEXT CHECK (nutrition_goal IN ('lose','maintain','gain'));

NOTIFY pgrst, 'reload schema';

INSERT INTO schema_migrations (id, note) VALUES
  ('sezione_54_nutrition_goal', 'profiles.nutrition_goal — persiste server-side l''obiettivo scelto in onboarding (prima solo in localStorage, mai letto)')
ON CONFLICT (id) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════
-- SEZIONE 55 — FIX: colonne mancanti terms_accepted_at / ai_photo_consent_at
--
-- La SEZIONE 52 (scritta in una sessione precedente) doveva aggiungere queste
-- due colonne a profiles, ma non risulta mai stata eseguita sul database live
-- — schema_migrations non ha la riga 'sezione_52_...' e le colonne non
-- esistono, verificato query diretta. Nel frattempo AuthContext.jsx (sia
-- NutriPlan-Pro che Diet-Plan-Pro-app-claude) seleziona già
-- ai_photo_consent_at in ogni fetch del profilo: da quando quel codice è
-- stato deployato, OGNI fetch del profilo (login, refresh cache 30min)
-- falliva con HTTP 400 (colonna inesistente) — scoperto dai log del browser
-- del paziente. Rieseguita qui identica alla SEZIONE 52 originale, IF NOT
-- EXISTS quindi innocua da rilanciare.
-- ═══════════════════════════════════════════════════════════════════════════

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='profiles' AND column_name='terms_accepted_at') THEN
    ALTER TABLE profiles ADD COLUMN terms_accepted_at TIMESTAMPTZ;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='profiles' AND column_name='ai_photo_consent_at') THEN
    ALTER TABLE profiles ADD COLUMN ai_photo_consent_at TIMESTAMPTZ;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

INSERT INTO schema_migrations (id, note) VALUES
  ('sezione_55_fix_missing_consent_columns', 'terms_accepted_at + ai_photo_consent_at su profiles — SEZIONE 52 non era mai stata eseguita, causava 400 su ogni fetch profilo')
ON CONFLICT (id) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════
-- SEZIONE 56 — FIX: tabella dietitian_reviews mancante del tutto
--
-- Trovata durante l'incrocio sistematico query-codice/schema-reale di questa
-- sessione: src/components/DietitianReviews.jsx (Diet-Plan-Pro-app-claude)
-- legge/scrive dietitian_reviews in 5 punti, ma la tabella non esiste sul
-- database — ogni lettura/invio/eliminazione di una recensione fallisce.
-- Esisteva già una migration completa e mai eseguita in
-- Diet-Plan-Pro-app-claude/src/sql/dietitian_reviews_migration.sql — questa
-- sezione la riporta identica qui per restare nel pattern SEZIONE unico del
-- database condiviso, così va a segno un solo giro di "esegui l'SQL" invece
-- di due file separati in due repo diversi.
--
-- Regola business: una recensione richiede che il paziente abbia avuto
-- almeno un appuntamento passato e non annullato con quel dietista
-- ("verified experience", stesso principio di Amazon/TripAdvisor).
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS dietitian_reviews (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dietitian_id  UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  patient_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  rating        SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment       TEXT DEFAULT '',
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(dietitian_id, patient_id)
);

CREATE INDEX IF NOT EXISTS idx_dietitian_reviews_dietitian
  ON dietitian_reviews(dietitian_id, created_at DESC);

ALTER TABLE dietitian_reviews ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "read_all_reviews" ON dietitian_reviews;
CREATE POLICY "read_all_reviews" ON dietitian_reviews
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "patient_review_if_had_appointment" ON dietitian_reviews;
CREATE POLICY "patient_review_if_had_appointment" ON dietitian_reviews
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = patient_id
    AND EXISTS (
      SELECT 1 FROM appointments a
      WHERE a.patient_id = auth.uid()
        AND a.dietitian_id = dietitian_reviews.dietitian_id
        AND a.appointment_date < NOW()
        AND COALESCE(a.status, 'pending') <> 'cancelled'
    )
  );

DROP POLICY IF EXISTS "patient_update_own_review" ON dietitian_reviews;
CREATE POLICY "patient_update_own_review" ON dietitian_reviews
  FOR UPDATE TO authenticated
  USING (auth.uid() = patient_id)
  WITH CHECK (auth.uid() = patient_id);

DROP POLICY IF EXISTS "patient_delete_own_review" ON dietitian_reviews;
CREATE POLICY "patient_delete_own_review" ON dietitian_reviews
  FOR DELETE TO authenticated
  USING (auth.uid() = patient_id);

NOTIFY pgrst, 'reload schema';

INSERT INTO schema_migrations (id, note) VALUES
  ('sezione_56_dietitian_reviews', 'Tabella dietitian_reviews + RLS — mai eseguita, DietitianReviews.jsx falliva su ogni lettura/scrittura')
ON CONFLICT (id) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════
-- SEZIONE 57 — tabella segnalazioni_bug (mai creata)
--
-- js/utils.js (_sendBugReport, funzione "Segnala un bug" disponibile su ogni
-- pagina) prova già a scrivere qui, con un fallback via mailto se la tabella
-- manca — quindi NON è un bug (la funzione ha sempre funzionato, solo via
-- email), ma creare la tabella fa sì che le segnalazioni restino anche
-- consultabili/storicizzate lato admin, non solo nella tua casella di posta.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS segnalazioni_bug (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo         TEXT NOT NULL DEFAULT 'altro',
  descrizione  TEXT NOT NULL,
  pagina       TEXT,
  url          TEXT,
  user_id      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  user_email   TEXT,
  user_agent   TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE segnalazioni_bug ENABLE ROW LEVEL SECURITY;

-- Chiunque autenticato può segnalare (stesso principio di client_errors:
-- l'inserimento non deve richiedere privilegi, solo la lettura è ristretta).
DROP POLICY IF EXISTS "segnalazioni_bug_insert_any" ON segnalazioni_bug;
CREATE POLICY "segnalazioni_bug_insert_any" ON segnalazioni_bug
  FOR INSERT TO authenticated, anon
  WITH CHECK (true);

DROP POLICY IF EXISTS "segnalazioni_bug_select_admin" ON segnalazioni_bug;
CREATE POLICY "segnalazioni_bug_select_admin" ON segnalazioni_bug
  FOR SELECT USING (check_is_admin());

NOTIFY pgrst, 'reload schema';

INSERT INTO schema_migrations (id, note) VALUES
  ('sezione_57_segnalazioni_bug', 'Tabella segnalazioni_bug — la funzione "Segnala un bug" scriveva già qui con fallback email, ora anche storicizzata per l''admin')
ON CONFLICT (id) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════
-- SEZIONE 58 — FIX CRITICO: create_patient_profile() mancante,
-- create_profile_for_new_user() rimasta alla firma a 2 parametri
--
-- La SEZIONE 55 (sessione precedente) aveva ripreso da SEZIONE 52 solo le
-- due ALTER TABLE (terms_accepted_at/ai_photo_consent_at), non le due
-- funzioni RPC che erano nella stessa sezione originale — rimaste quindi
-- mai eseguite. Impatto verificato sul database live:
--
--   • create_patient_profile(uid, user_email, p_full_name, p_first_name,
--     p_last_name, terms_accepted) NON ESISTE AFFATTO. AuthContext.jsx
--     (Diet-Plan-Pro-app-claude, signUp()) la chiama subito dopo
--     auth.signUp() — nessun trigger su auth.users crea più la riga
--     profiles (rimosso in SEZIONE 1), quindi OGNI AUTOREGISTRAZIONE
--     PAZIENTE ha creato l'utente in auth.users MA MAI la riga in
--     profiles: l'app restava bloccata su profilo nullo dopo la
--     conferma email. Bug totale, non parziale.
--
--   • create_profile_for_new_user(uid, user_email) esiste ancora nella
--     vecchia firma a 2 parametri (mai sostituita dalla versione a 3
--     parametri con terms_accepted). index.html (NutriPlan-Pro,
--     registrazione dietista) chiama però la RPC passando 3 argomenti
--     (uid, user_email, terms_accepted:true) — PostgREST non trova una
--     funzione con quella firma esatta e rifiuta la chiamata: anche la
--     REGISTRAZIONE DIETISTA falliva.
--
-- Questa sezione ripropone identiche le due definizioni già scritte in
-- SEZIONE 52 (mai perse, solo mai eseguite).
-- ═══════════════════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS create_profile_for_new_user(UUID, TEXT);
CREATE OR REPLACE FUNCTION create_profile_for_new_user(uid UUID, user_email TEXT, terms_accepted BOOLEAN DEFAULT false)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, email, approved, is_admin, terms_accepted_at)
  VALUES (uid, user_email, false, false, CASE WHEN terms_accepted THEN NOW() ELSE NULL END)
  ON CONFLICT (id) DO UPDATE SET
    terms_accepted_at = COALESCE(profiles.terms_accepted_at, EXCLUDED.terms_accepted_at);
EXCEPTION WHEN OTHERS THEN
  NULL;
END;
$$;
GRANT EXECUTE ON FUNCTION create_profile_for_new_user(UUID, TEXT, BOOLEAN) TO anon, authenticated;

CREATE OR REPLACE FUNCTION create_patient_profile(
  uid UUID, user_email TEXT, p_full_name TEXT, p_first_name TEXT, p_last_name TEXT,
  terms_accepted BOOLEAN DEFAULT false
)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, first_name, last_name, role, terms_accepted_at)
  VALUES (uid, user_email, p_full_name, p_first_name, p_last_name, 'patient',
          CASE WHEN terms_accepted THEN NOW() ELSE NULL END)
  ON CONFLICT (id) DO UPDATE SET
    full_name  = COALESCE(EXCLUDED.full_name,  profiles.full_name),
    first_name = COALESCE(EXCLUDED.first_name, profiles.first_name),
    last_name  = COALESCE(EXCLUDED.last_name,  profiles.last_name),
    terms_accepted_at = COALESCE(profiles.terms_accepted_at, EXCLUDED.terms_accepted_at);
EXCEPTION WHEN OTHERS THEN
  NULL;
END;
$$;
GRANT EXECUTE ON FUNCTION create_patient_profile(UUID, TEXT, TEXT, TEXT, TEXT, BOOLEAN) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';

INSERT INTO schema_migrations (id, note) VALUES
  ('sezione_58_fix_missing_signup_rpcs', 'create_patient_profile() (mancante del tutto) + create_profile_for_new_user() a 3 parametri — registrazione paziente E dietista erano entrambe rotte')
ON CONFLICT (id) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════
-- SEZIONE 59 — fix WARN sicurezza: search_path mutabile su 7 funzioni trigger
--
-- Segnalato dall'advisor di sicurezza Supabase (function_search_path_mutable):
-- queste 7 funzioni non fissano search_path, quindi risolvono i nomi di
-- tabella non qualificati (es. "cartelle" invece di "public.cartelle" in
-- _auto_gdpr_consent) in base al search_path della sessione — che in teoria
-- un utente con permessi di creare schema/oggetti potrebbe manipolare per
-- far eseguire codice non previsto a una funzione SECURITY DEFINER. Fix
-- standard: fissare lo schema di risoluzione, indipendentemente dal
-- search_path della sessione chiamante.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER FUNCTION public._auto_gdpr_consent() SET search_path = public;
ALTER FUNCTION public.agenda_events_set_updated_at() SET search_path = public;
ALTER FUNCTION public.cartelle_view_delete() SET search_path = public;
ALTER FUNCTION public.cartelle_view_insert() SET search_path = public;
ALTER FUNCTION public.cartelle_view_update() SET search_path = public;
ALTER FUNCTION public.patient_consents_set_updated_at() SET search_path = public;
ALTER FUNCTION public.prevent_patient_document_tampering() SET search_path = public;

INSERT INTO schema_migrations (id, note) VALUES
  ('sezione_59_fix_search_path_functions', 'SET search_path = public su 7 funzioni trigger — fix WARN advisor sicurezza (function_search_path_mutable)')
ON CONFLICT (id) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════
-- SEZIONE 60 — FIX SICUREZZA: paziente poteva modificare qualunque campo
-- del proprio appuntamento (data, dietista, titolo), non solo annullarlo
--
-- appointments_own (FOR ALL, nessun WITH CHECK) concede al paziente UPDATE
-- su ogni colonna della propria riga. La policy "paziente annulla
-- appuntamento" (pensata per limitare il paziente al solo annullamento) non
-- basta da sola: essendo permissive, le policy si combinano in OR — quella
-- più ampia prevale comunque. Stesso pattern già usato per
-- patient_documents (prevent_patient_document_tampering): un trigger
-- applica il vincolo a prescindere da quale policy abbia concesso
-- l'UPDATE.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.prevent_patient_appointment_tampering()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $$
DECLARE
  allowed TEXT[] := ARRAY['status', 'cancelled_at'];
  old_j JSONB := to_jsonb(OLD);
BEGIN
  IF auth.uid() = OLD.patient_id AND auth.uid() IS DISTINCT FROM OLD.dietitian_id THEN
    IF (to_jsonb(NEW) - allowed) IS DISTINCT FROM (old_j - allowed) THEN
      RAISE EXCEPTION 'Un paziente può solo annullare un appuntamento, non modificarne gli altri dati';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_patient_appointment_tampering ON appointments;
CREATE TRIGGER trg_prevent_patient_appointment_tampering
  BEFORE UPDATE ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION prevent_patient_appointment_tampering();

INSERT INTO schema_migrations (id, note) VALUES
  ('sezione_60_appointments_patient_tampering', 'Trigger: un paziente può aggiornare solo status/cancelled_at sui propri appuntamenti, non riassegnarli o cambiarne data/dietista')
ON CONFLICT (id) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════
-- SEZIONE 61 — FIX SICUREZZA: policy RLS residue/troppo ampie su tabelle
-- cliniche, collegamento paziente-dietista, documenti, moduli anamnesi
--
-- Trovate da un audit sistematico di tutte le 280 policy RLS del database
-- condiviso. Verificato PRIMA di rimuovere ciascuna: nessuna delle policy
-- sotto è usata da un percorso di codice reale in NutriPlan-Pro o
-- Diet-Plan-Pro-app-claude (grep esaustivo di ogni .from(...) rilevante) —
-- sono residui di iterazioni precedenti del modello di permessi, rimasti
-- accanto a policy più recenti e corrette senza essere mai stati rimossi.
-- Postgres unisce le policy permissive in OR: quella più larga vince a
-- prescindere da quante policy strette esistano accanto.
--
-- 1) ncpt_own / bia_records_own / note_specialistiche_own / piani_own /
--    schede_valutazione_own / patient_documents_own (tutte FOR ALL,
--    "auth.uid()=user_id OR auth.uid()=patient_id", NESSUN WITH CHECK):
--    davano al PAZIENTE INSERT/UPDATE/DELETE completo sui propri dati
--    clinici — diagnosi, referti, piani, documenti firmati — invece del
--    solo accesso in lettura (quando visible_to_patient=true) già garantito
--    dalle policy corrette (*_select_patient_visible, *_patient_select,
--    "paziente legge propri/e ..."). Un paziente avrebbe potuto modificare
--    la propria diagnosi NCPT, inventare una misurazione BIA, o cancellare
--    un documento firmato. Il lato dietista resta coperto da
--    *_dietitian_all/*_collaborator_write (con WITH CHECK corretto) — non
--    toccate.
--
-- 2) patient_dietitian_own (FOR ALL, stesso schema): lato dietista
--    ridondante con patient_dietitian_dietitian_all (già con WITH CHECK);
--    lato paziente mai usato da nessun codice reale, e comunque pericoloso
--    (permetterebbe in teoria di alterare/cancellare il proprio
--    collegamento clinico).
--
-- 3) "paziente si auto-registra" (patient_dietitian, INSERT, WITH CHECK
--    solo "auth.uid()=patient_id", NESSUN controllo su cartella_id):
--    verificato che né NutriPlan-Pro né Diet-Plan-Pro-app-claude la usano
--    mai — il collegamento è sempre creato dal dietista via pazienti.html
--    (patient_dietitian_insert_own, che verifica anche il ruolo e che la
--    cartella appartenga davvero al dietista). Rimasta attiva, avrebbe
--    permesso a un paziente di autoassegnarsi qualunque cartella_id
--    esistente — incluso quella di un paziente estraneo — ottenendo
--    accesso in lettura al suo intero fascicolo clinico ovunque sia
--    visible_to_patient=true.
--
-- 4) "dietista crea relazioni" (patient_dietitian, INSERT, WITH CHECK solo
--    "auth.uid()=dietitian_id", nessun controllo sulla cartella): più
--    permissiva di patient_dietitian_insert_own, che copre già il caso
--    reale (verificato in pazienti.html) col controllo di proprietà
--    cartella incluso.
--
-- 5) "Public read by token" / "Public update responses by token" su
--    patient_intake_forms (qual/with_check letteralmente "true"): nessuna
--    pagina in nessuno dei due repo implementa davvero il filtro per
--    token previsto dal nome — funzionalità mai completata. Con
--    l'anon key (pubblica per definizione, incorporata in ogni pagina)
--    chiunque poteva leggere/modificare OGNI modulo di anamnesi mai
--    inviato a qualunque paziente, di qualunque dietista. Se in futuro si
--    vuole completare il flusso "link pubblico senza login", va rifatto
--    con una funzione SECURITY DEFINER che verifica il token lato server
--    (RLS non può confrontare in sicurezza un valore fornito dal client),
--    non con una policy "true".
-- ═══════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "ncpt_own" ON ncpt;
DROP POLICY IF EXISTS "bia_records_own" ON bia_records;
DROP POLICY IF EXISTS "note_specialistiche_own" ON note_specialistiche;
DROP POLICY IF EXISTS "piani_own" ON piani;
DROP POLICY IF EXISTS "schede_valutazione_own" ON schede_valutazione;
DROP POLICY IF EXISTS "patient_documents_own" ON patient_documents;
DROP POLICY IF EXISTS "patient_dietitian_own" ON patient_dietitian;
DROP POLICY IF EXISTS "paziente si auto-registra" ON patient_dietitian;
DROP POLICY IF EXISTS "dietista crea relazioni" ON patient_dietitian;
DROP POLICY IF EXISTS "weight_logs_own" ON weight_logs;
DROP POLICY IF EXISTS "Public read by token" ON patient_intake_forms;
DROP POLICY IF EXISTS "Public update responses by token" ON patient_intake_forms;

INSERT INTO schema_migrations (id, note) VALUES
  ('sezione_61_drop_overpermissive_rls', 'Rimosse 12 policy RLS residue/troppo ampie (clinico, patient_dietitian, patient_documents, patient_intake_forms) — verificato che nessuna sia usata da codice reale prima di rimuoverle')
ON CONFLICT (id) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════
-- SEZIONE 62 — dietitian_credentials: sposta i segreti operativi fuori da
-- profiles (FASE 1 di 2 — additiva, non distruttiva, revert = DROP TABLE)
--
-- Trovato dall'audit RLS: profiles mescola dati che DEVONO restare
-- condivisi (nome, foto) con segreti che NON dovrebbero mai esserlo
-- (password Sistema TS, token WhatsApp Business, ID Stripe, codici
-- fiscali) — le policy che permettono a co-membri di chat/studio/pazienti
-- collegati di leggere il profilo di un dietista (necessarie per mostrarne
-- nome/foto) espongono SEMPRE anche questi campi, perché RLS è per riga,
-- non per colonna: non basta stringere le policy esistenti.
--
-- Questa sezione copia i valori esistenti in una tabella nuova, dedicata,
-- con policy owner+admin-only. Le colonne originali su profiles NON
-- vengono ancora toccate — restano lì, invariate, finché il codice
-- applicativo non è stato aggiornato per leggere/scrivere dalla tabella
-- nuova e verificato che tutto funzioni ancora. Solo allora (SEZIONE 63,
-- da lanciare separatamente, dopo verifica) le colonne originali vengono
-- rimosse da profiles — quello è il passo che chiude davvero la falla,
-- e l'unico dei due non banale da annullare con un git revert del codice.
--
-- Piano di rientro per QUESTA sezione: DROP TABLE dietitian_credentials —
-- profiles resta intatta, nessun dato perso, nessun impatto sull'app.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS dietitian_credentials (
  id                              UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  sts_username                    TEXT,
  sts_password                    TEXT,
  sts_pincode                     TEXT,
  sts_api_username                TEXT,
  sts_api_password                TEXT,
  sts_erogatore_registrato        BOOLEAN,
  wa_access_token                 TEXT,
  wa_app_secret                   TEXT,
  wa_webhook_verify_token         TEXT,
  wa_business_account_id          TEXT,
  wa_phone_number_id              TEXT,
  wa_template_lang                TEXT,
  wa_template_name                TEXT,
  fic_api_token                   TEXT,
  fic_company_id                  TEXT,
  stripe_connect_account_id       TEXT,
  stripe_connect_charges_enabled  BOOLEAN NOT NULL DEFAULT false,
  fiscal_codice_fiscale           TEXT,
  fiscal_partita_iva              TEXT,
  fiscal_indirizzo                TEXT,
  fiscal_cap                      TEXT,
  fiscal_comune                   TEXT,
  fiscal_provincia                TEXT,
  fiscal_regime                   TEXT,
  fiscal_ragione_sociale          TEXT,
  fiscal_progressivo_invio        INTEGER,
  updated_at                      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Copia non distruttiva: profiles non viene toccata.
INSERT INTO dietitian_credentials (
  id, sts_username, sts_password, sts_pincode, sts_api_username, sts_api_password, sts_erogatore_registrato,
  wa_access_token, wa_app_secret, wa_webhook_verify_token, wa_business_account_id, wa_phone_number_id, wa_template_lang, wa_template_name,
  fic_api_token, fic_company_id,
  stripe_connect_account_id, stripe_connect_charges_enabled,
  fiscal_codice_fiscale, fiscal_partita_iva, fiscal_indirizzo, fiscal_cap, fiscal_comune, fiscal_provincia, fiscal_regime, fiscal_ragione_sociale, fiscal_progressivo_invio
)
SELECT
  id, sts_username, sts_password, sts_pincode, sts_api_username, sts_api_password, sts_erogatore_registrato,
  wa_access_token, wa_app_secret, wa_webhook_verify_token, wa_business_account_id, wa_phone_number_id, wa_template_lang, wa_template_name,
  fic_api_token, fic_company_id,
  stripe_connect_account_id, COALESCE(stripe_connect_charges_enabled, false),
  fiscal_codice_fiscale, fiscal_partita_iva, fiscal_indirizzo, fiscal_cap, fiscal_comune, fiscal_provincia, fiscal_regime, fiscal_ragione_sociale, fiscal_progressivo_invio
FROM profiles
WHERE role = 'dietitian'
ON CONFLICT (id) DO NOTHING;

ALTER TABLE dietitian_credentials ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "dietitian_credentials_owner_all" ON dietitian_credentials;
CREATE POLICY "dietitian_credentials_owner_all" ON dietitian_credentials
  FOR ALL USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "dietitian_credentials_admin_read" ON dietitian_credentials;
CREATE POLICY "dietitian_credentials_admin_read" ON dietitian_credentials
  FOR SELECT USING (check_is_admin());

-- Un collaboratore di livello dietista deve poter vedere (sola lettura) le
-- credenziali del titolare dello studio — es. whatsapp.html mostra "numero
-- collegato sì/no" anche a un collaboratore, leggendo lo stato di
-- studioOwnerId, non necessariamente la propria riga. La scrittura resta
-- owner-only: solo il titolare configura le proprie credenziali.
DROP POLICY IF EXISTS "dietitian_credentials_collaborator_read" ON dietitian_credentials;
CREATE POLICY "dietitian_credentials_collaborator_read" ON dietitian_credentials
  FOR SELECT USING (id = get_studio_owner(auth.uid()) AND is_dietitian_level_collaborator(auth.uid()));

-- Le funzioni server (Stripe webhook, Stripe Connect, invio fatture SDI/STS,
-- WhatsApp webhook) usano la service role, che ignora comunque RLS — nessuna
-- policy aggiuntiva necessaria per quei percorsi.

-- stripe_customer_id/stripe_subscription_id NON sono solo del dietista: è
-- l'abbonamento SaaS generico, e anche i pazienti hanno un piano a
-- pagamento (App Pazienti, €5.99/mese) — quindi una tabella "solo
-- dietisti" li avrebbe rotti per metà utenti. Tabella separata, valida per
-- qualunque profilo, stesso principio owner+admin-only.
-- Piano di rientro: DROP TABLE user_payment_credentials — profiles resta
-- intatta, nessun dato perso.
CREATE TABLE IF NOT EXISTS user_payment_credentials (
  id                     UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  stripe_customer_id     TEXT,
  stripe_subscription_id TEXT,
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO user_payment_credentials (id, stripe_customer_id, stripe_subscription_id)
SELECT id, stripe_customer_id, stripe_subscription_id
FROM profiles
WHERE stripe_customer_id IS NOT NULL OR stripe_subscription_id IS NOT NULL
ON CONFLICT (id) DO NOTHING;

ALTER TABLE user_payment_credentials ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_payment_credentials_owner_all" ON user_payment_credentials;
CREATE POLICY "user_payment_credentials_owner_all" ON user_payment_credentials
  FOR ALL USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "user_payment_credentials_admin_read" ON user_payment_credentials;
CREATE POLICY "user_payment_credentials_admin_read" ON user_payment_credentials
  FOR SELECT USING (check_is_admin());

NOTIFY pgrst, 'reload schema';

INSERT INTO schema_migrations (id, note) VALUES
  ('sezione_62_dietitian_credentials_table', 'Nuove tabelle dietitian_credentials e user_payment_credentials (owner+admin only, +collaborator_read su dietitian_credentials) con copia dei segreti operativi/Stripe da profiles — FASE 1 di 2, profiles non ancora modificata')
ON CONFLICT (id) DO NOTHING;
