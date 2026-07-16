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

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'document-prints', 'document-prints', TRUE,
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
