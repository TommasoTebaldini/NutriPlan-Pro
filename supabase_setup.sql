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

-- ═══════════════════════════════════════════════════════════════════════════
-- SEZIONE 63 — fix RLS storage: patient-photos e patient-files leggibili da
-- collaboratori "segretario"
--
-- Trovato da un audit delle policy su storage.objects (non ancora coperto
-- dai giri precedenti, che avevano riguardato solo le tabelle). Le policy
-- INSERT/DELETE di patient_photos_owner_write e patient_files_storage_delete/
-- _insert richiedono correttamente is_dietitian_level_collaborator(auth.uid())
-- — cioè escludono i collaboratori di livello "segretario" dall'accesso a
-- dati clinici, stessa regola già applicata alle tabelle in SEZIONE 60/61.
-- Le policy SELECT gemelle (patient_photos_owner_read,
-- patient_files_storage_select) però NON avevano questo controllo: un
-- collaboratore "segretario" non poteva caricare o cancellare foto/documenti
-- di un paziente, ma poteva comunque leggerli/scaricarli.
--
-- Verificato via grep in NutriPlan-Pro: patient-photos è scritto/letto solo
-- da valutazione.html (lato dietista, foto scattate in visita — pazienti.html
-- e l'app pazienti non vi accedono mai); patient-files è scritto/letto solo
-- da pazienti.html (documenti caricati dal dietista nella scheda paziente).
--
-- Include anche una pulizia di "doc prints select" su document-prints: un
-- terzo ramo OR confrontava dietitian_id con la prima cartella del path,
-- quando js/print-capture.js usa sempre <patient_id>/... — ramo non
-- sfruttabile in pratica (richiederebbe una collisione di UUID) ma morto/
-- fuorviante, rimosso mantenendo i due rami reali (paziente legge i propri
-- documenti, dietista collegato legge quelli del proprio paziente).
--
-- Piano di rientro: le versioni precedenti di queste 3 policy sono qui sopra
-- in chiaro (query pg_policies), volendo si possono ricreare identiche.
-- ═══════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "patient_photos_owner_read" ON storage.objects;
CREATE POLICY "patient_photos_owner_read" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'patient-photos'
    AND EXISTS (
      SELECT 1 FROM cartelle_raw c
      WHERE c.id = (storage.foldername(objects.name))[1]::uuid
        AND c.user_id = get_studio_owner(auth.uid())
    )
    AND is_dietitian_level_collaborator(auth.uid())
  );

DROP POLICY IF EXISTS "patient_files_storage_select" ON storage.objects;
CREATE POLICY "patient_files_storage_select" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'patient-files'
    AND auth.uid() IS NOT NULL
    AND (storage.foldername(name))[1] = (get_studio_owner(auth.uid()))::text
    AND is_dietitian_level_collaborator(auth.uid())
  );

DROP POLICY IF EXISTS "doc prints select" ON storage.objects;
CREATE POLICY "doc prints select" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'document-prints'
    AND (
      (auth.uid())::text = (storage.foldername(objects.name))[1]
      OR EXISTS (
        SELECT 1 FROM patient_dietitian pd
        WHERE (pd.patient_id)::text = (storage.foldername(objects.name))[1]
          AND pd.dietitian_id = auth.uid()
      )
    )
  );

INSERT INTO schema_migrations (id, note) VALUES
  ('sezione_63_storage_rls_collaborator_gap', 'Fix RLS storage.objects: patient_photos_owner_read e patient_files_storage_select ora richiedono is_dietitian_level_collaborator come le policy INSERT/DELETE gemelle (segretari non potevano scrivere ma potevano leggere foto/documenti clinici) — pulito anche un ramo morto/errato in "doc prints select" su document-prints')
ON CONFLICT (id) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════
-- SEZIONE 64 — pulizia performance mirata (advisor "performance" di Supabase)
--
-- L'advisor segnala ~260 policy RLS che rivalutano auth.uid() riga per riga
-- invece che una volta per query (fix: avvolgerlo in "(select auth.uid())"),
-- e quasi 1000 casi di policy permissive sovrapposte sulla stessa azione, su
-- circa 70 tabelle del database — debito preesistente a questa sessione, non
-- toccato qui: è un intervento ampio (centinaia di policy da riscrivere e
-- verificare una per una) che merita una decisione esplicita, non un fix
-- silenzioso in un giro di controllo bug.
--
-- Qui vengono sistemate solo le 2 tabelle create in SEZIONE 62 (comunque di
-- competenza diretta di questa sessione) più 2 indici duplicati segnalati
-- altrove, entrambi interventi a rischio zero:
--   • dietitian_credentials/user_payment_credentials avevano 2-3 policy
--     permissive sovrapposte sullo stesso SELECT (owner_all + admin_read
--     [+ collaborator_read]) — consolidate in una sola policy SELECT con OR,
--     più policy separate INSERT/UPDATE/DELETE solo per il proprietario.
--   • idx_activity_logs_user_date duplica activity_logs_user_date_idx;
--     idx_chat_messages_patient duplica idx_chat_messages_patient_created.
-- ═══════════════════════════════════════════════════════════════════════════

DROP INDEX IF EXISTS idx_activity_logs_user_date;
DROP INDEX IF EXISTS idx_chat_messages_patient;

DROP POLICY IF EXISTS "dietitian_credentials_owner_all" ON dietitian_credentials;
DROP POLICY IF EXISTS "dietitian_credentials_admin_read" ON dietitian_credentials;
DROP POLICY IF EXISTS "dietitian_credentials_collaborator_read" ON dietitian_credentials;

CREATE POLICY "dietitian_credentials_select" ON dietitian_credentials
  FOR SELECT USING (
    (select auth.uid()) = id
    OR check_is_admin()
    OR (id = get_studio_owner((select auth.uid())) AND is_dietitian_level_collaborator((select auth.uid())))
  );
CREATE POLICY "dietitian_credentials_owner_insert" ON dietitian_credentials
  FOR INSERT WITH CHECK ((select auth.uid()) = id);
CREATE POLICY "dietitian_credentials_owner_update" ON dietitian_credentials
  FOR UPDATE USING ((select auth.uid()) = id) WITH CHECK ((select auth.uid()) = id);
CREATE POLICY "dietitian_credentials_owner_delete" ON dietitian_credentials
  FOR DELETE USING ((select auth.uid()) = id);

DROP POLICY IF EXISTS "user_payment_credentials_owner_all" ON user_payment_credentials;
DROP POLICY IF EXISTS "user_payment_credentials_admin_read" ON user_payment_credentials;

CREATE POLICY "user_payment_credentials_select" ON user_payment_credentials
  FOR SELECT USING ((select auth.uid()) = id OR check_is_admin());
CREATE POLICY "user_payment_credentials_owner_insert" ON user_payment_credentials
  FOR INSERT WITH CHECK ((select auth.uid()) = id);
CREATE POLICY "user_payment_credentials_owner_update" ON user_payment_credentials
  FOR UPDATE USING ((select auth.uid()) = id) WITH CHECK ((select auth.uid()) = id);
CREATE POLICY "user_payment_credentials_owner_delete" ON user_payment_credentials
  FOR DELETE USING ((select auth.uid()) = id);

INSERT INTO schema_migrations (id, note) VALUES
  ('sezione_64_perf_new_tables_plus_dup_indexes', 'Consolidate le policy SELECT sovrapposte di dietitian_credentials/user_payment_credentials (fix auth_rls_initplan + multiple_permissive_policies) e rimossi 2 indici duplicati (activity_logs, chat_messages) — il resto del debito performance segnalato dall''advisor (~70 tabelle preesistenti) resta intenzionalmente non toccato, richiede decisione esplicita per l''ampiezza dell''intervento')
ON CONFLICT (id) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════
-- SEZIONE 65 — pulizia performance su larga scala (advisor "performance")
--
-- Copre le ~68 tabelle rimanenti segnalate dall'advisor per due classi di
-- problema, entrambe puramente di performance (nessun cambio di chi può
-- vedere/scrivere cosa):
--   (a) auth_rls_initplan: "auth.uid()"/"auth.role()" nudo dentro USING/WITH
--       CHECK viene rivalutato riga per riga da Postgres invece che una
--       volta per query — fix: avvolgerlo in "(select auth.uid())", stesso
--       risultato booleano, valutato una sola volta (pattern documentato
--       Supabase). Applicato SEMPRE, su ogni policy toccata qui.
--   (b) multiple_permissive_policies: più policy PERMISSIVE sullo stesso
--       comando — Postgres le combina già in OR a runtime, quindi unirle in
--       una sola policy con OR esplicito delle condizioni originali è
--       identico per risultato, solo più veloce da valutare. Applicato SOLO
--       quando la fusione è meccanica e sicura al 100%:
--         • policy duplicate esatte (stesso comando, stessa condizione
--           effettiva) → tenuta una sola, le altre eliminate;
--         • più policy sullo STESSO singolo comando (es. solo SELECT), mai
--           di tipo FOR ALL → unite con OR esplicito, wc unito separatamente
--           dove presente.
--       Una policy FOR ALL che si sovrappone a policy più strette sullo
--       stesso comando viene lasciata SEPARATA (solo avvolta) invece di
--       essere scomposta in 4 policy per comando: la scomposizione
--       ridurrebbe ulteriormente il conteggio ma è un intervento più
--       invasivo e non necessario per la correttezza — qui si dà priorità
--       al rischio zero.
--   Le fusioni rispettano sempre i "roles" originali (public vs
--   authenticated): due policy con roles diversi non vengono MAI fuse
--   insieme, perché farlo allargherebbe l'accesso a un ruolo che prima non
--   la vedeva (es. note_specialistiche/piani avevano alcune policy
--   "authenticated"-only accanto a policy "public" — restano gruppi separati).
--
-- Tabelle ESCLUSE (non toccate qui) e perché:
--   • dietitian_credentials, user_payment_credentials, storage.objects →
--     già sistemate in SEZIONE 63/64.
--   • patient_dietitian → durante la raccolta dati per questa sezione è
--     emerso che la policy "paziente si auto-registra" (INSERT, nessun
--     controllo su cartella_id — un paziente potrebbe autoassegnarsi la
--     cartella di un estraneo) e "dietista crea relazioni" (INSERT senza
--     verifica di proprietà cartella) sono ANCORA ATTIVE sul database live,
--     nonostante il changelog di questa sessione (SEZIONE 61, commit
--     042881d) affermi che siano state rimosse. La SEZIONE 61 risulta
--     scritta e pushata su git ma NON eseguita sul database — verificare
--     con una query su schema_migrations se 'sezione_61_drop_overpermissive_rls'
--     è presente prima di procedere. Tabella lasciata intatta qui: serve
--     attenzione immediata e dedicata, non una pulizia di performance.
--   • patient_intake_forms → stesso problema: le policy "Public read by
--     token" (SELECT, qual=true, LETTURA PUBBLICA di ogni modulo di
--     anamnesi di ogni paziente) e "Public update responses by token"
--     (UPDATE, qual/with_check=true, SCRITTURA PUBBLICA) risultano ANCORA
--     ATTIVE sul database live, anche se il changelog le dà per rimosse
--     nella stessa SEZIONE 61. Stesso sospetto: la sezione non è mai stata
--     eseguita. Tabella lasciata intatta.
--   → AZIONE CONSIGLIATA PRIMA DI TUTTO: verificare se SEZIONE 60/61 di
--     questo stesso file sono state davvero eseguite sul database (query
--     su schema_migrations), e se no rilanciarle per prime — sono fix di
--     sicurezza critici, non di performance.
--
-- ALTRO FINDING (non corretto qui, fuori scopo per una sezione di
-- performance): in ~25 tabelle esiste una coppia "<tabella>_collaborator_write"
-- (FOR ALL, richiede is_dietitian_level_collaborator — esclude i
-- collaboratori "segretario") + "<tabella>_collaborator_read" (FOR SELECT,
-- SENZA quel controllo) — lo stesso identico pattern già corretto per lo
-- storage in SEZIONE 63 (patient-photos/patient-files), ma qui a livello di
-- singola tabella non è mai stato applicato. Esempi: alimenti_custom,
-- bia_records, broadcast_messages, cartelle_raw, diario_alimentare_foto,
-- dietitian_profiles, esami_biochimici, fatture, liste_spesa, ncpt,
-- note_specialistiche, pacchetti, pacchetti_acquistati, patient_consents,
-- patient_documents, patient_files, percorsi_nutrizionali, piani,
-- piani_template, ricette, schede_valutazione, shared_recipes,
-- whatsapp_messages. Non toccato in questa sezione (puramente performance,
-- cambiare chi può leggere cosa richiede la stessa verifica caso-per-caso
-- già fatta per SEZIONE 63) — da affrontare in una sezione dedicata.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── activity_logs ──
DROP POLICY IF EXISTS "activity_logs_own" ON activity_logs;
DROP POLICY IF EXISTS "utente gestisce proprie attività" ON activity_logs;
CREATE POLICY "activity_logs_own" ON activity_logs
  FOR ALL USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);
DROP POLICY IF EXISTS "activity_logs_dietitian_read" ON activity_logs;
CREATE POLICY "activity_logs_dietitian_read" ON activity_logs
  FOR SELECT USING (EXISTS (SELECT 1 FROM patient_dietitian pd WHERE pd.patient_id = activity_logs.user_id AND pd.dietitian_id = (select auth.uid())));

-- ── agenda_events (4 policy a comando singolo ridondanti con agenda_events_own, stessa condizione) ──
DROP POLICY IF EXISTS "agenda_events_delete_own" ON agenda_events;
DROP POLICY IF EXISTS "agenda_events_upsert_own" ON agenda_events;
DROP POLICY IF EXISTS "agenda_events_select_own" ON agenda_events;
DROP POLICY IF EXISTS "agenda_events_update_own" ON agenda_events;
DROP POLICY IF EXISTS "agenda_events_own" ON agenda_events;
CREATE POLICY "agenda_events_own" ON agenda_events
  FOR ALL USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);

-- ── alimenti_custom ──
DROP POLICY IF EXISTS "alimenti_custom_collaborator_write" ON alimenti_custom;
CREATE POLICY "alimenti_custom_collaborator_write" ON alimenti_custom
  FOR ALL USING ((user_id = get_studio_owner((select auth.uid()))) AND is_dietitian_level_collaborator((select auth.uid())))
  WITH CHECK ((user_id = get_studio_owner((select auth.uid()))) AND is_dietitian_level_collaborator((select auth.uid())));
DROP POLICY IF EXISTS "alimenti_custom_owner" ON alimenti_custom;
CREATE POLICY "alimenti_custom_owner" ON alimenti_custom
  FOR ALL USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);
DROP POLICY IF EXISTS "alimenti_custom_collaborator_read" ON alimenti_custom;
CREATE POLICY "alimenti_custom_collaborator_read" ON alimenti_custom
  FOR SELECT USING (user_id = get_studio_owner((select auth.uid())));

-- ── appointments (lasciata strutturalmente intatta: logica sensibile già
--    corretta in SEZIONE 60, qui solo avvolti i riferimenti ad auth.uid()) ──
DROP POLICY IF EXISTS "appointments_own" ON appointments;
CREATE POLICY "appointments_own" ON appointments
  FOR ALL USING (((select auth.uid()) = dietitian_id) OR ((select auth.uid()) = patient_id));
DROP POLICY IF EXISTS "collaboratore gestisce appuntamenti" ON appointments;
CREATE POLICY "collaboratore gestisce appuntamenti" ON appointments
  FOR ALL USING ((dietitian_id = get_studio_owner((select auth.uid()))) OR (EXISTS (SELECT 1 FROM patient_dietitian pd WHERE pd.patient_id = appointments.patient_id AND pd.dietitian_id = get_studio_owner((select auth.uid())))));
DROP POLICY IF EXISTS "dietista gestisce appuntamenti" ON appointments;
CREATE POLICY "dietista gestisce appuntamenti" ON appointments
  FOR ALL USING (((select auth.uid()) = dietitian_id) OR (EXISTS (SELECT 1 FROM patient_dietitian pd WHERE pd.patient_id = appointments.patient_id AND pd.dietitian_id = (select auth.uid()))));
DROP POLICY IF EXISTS "paziente prenota appuntamento" ON appointments;
CREATE POLICY "paziente prenota appuntamento" ON appointments
  FOR INSERT WITH CHECK ((select auth.uid()) = patient_id);
DROP POLICY IF EXISTS "paziente vede i propri appuntamenti" ON appointments;
CREATE POLICY "paziente vede i propri appuntamenti" ON appointments
  FOR SELECT USING ((select auth.uid()) = patient_id);
DROP POLICY IF EXISTS "paziente annulla appuntamento" ON appointments;
CREATE POLICY "paziente annulla appuntamento" ON appointments
  FOR UPDATE TO authenticated USING ((select auth.uid()) = patient_id);

-- ── bia_records ──
DROP POLICY IF EXISTS "bia_records_collaborator_write" ON bia_records;
CREATE POLICY "bia_records_collaborator_write" ON bia_records
  FOR ALL USING ((user_id = get_studio_owner((select auth.uid()))) AND is_dietitian_level_collaborator((select auth.uid())))
  WITH CHECK ((user_id = get_studio_owner((select auth.uid()))) AND is_dietitian_level_collaborator((select auth.uid())));
DROP POLICY IF EXISTS "bia_records_dietitian_all" ON bia_records;
CREATE POLICY "bia_records_dietitian_all" ON bia_records
  FOR ALL USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);
-- "bia_records_own" (FOR ALL, auth.uid()=user_id OR auth.uid()=patient_id, senza
-- WITH CHECK) NON va ricreata: è la stessa policy pericolosa rimossa in SEZIONE
-- 61 (dava al paziente scrittura completa sui propri dati clinici). Letta qui
-- per errore da uno snapshot del DB precedente all'esecuzione di SEZIONE 61 —
-- vedi correzione urgente in coda a questa sezione.
DROP POLICY IF EXISTS "bia_records_collaborator_read" ON bia_records;
DROP POLICY IF EXISTS "bia_records_patient_select" ON bia_records;
DROP POLICY IF EXISTS "bia_records_select_patient_visible" ON bia_records;
DROP POLICY IF EXISTS "paziente legge propri bia" ON bia_records;
DROP POLICY IF EXISTS "bia_records_select_combined" ON bia_records;
CREATE POLICY "bia_records_select_combined" ON bia_records
  FOR SELECT USING (
    (user_id = get_studio_owner((select auth.uid())))
    OR ((visible_to_patient = true) AND (cartella_id IN (SELECT patient_dietitian.cartella_id FROM patient_dietitian WHERE patient_dietitian.patient_id = (select auth.uid()))))
    OR ((visible_to_patient = true) AND is_linked_patient(cartella_id))
    OR ((visible_to_patient = true) AND (((select auth.uid()) = patient_id) OR (EXISTS (SELECT 1 FROM patient_dietitian pd WHERE pd.patient_id = (select auth.uid()) AND pd.cartella_id = bia_records.cartella_id))))
  );

-- ── body_measurements ──
DROP POLICY IF EXISTS "body_measurements_own" ON body_measurements;
DROP POLICY IF EXISTS "utenti vedono le proprie misurazioni" ON body_measurements;
CREATE POLICY "body_measurements_own" ON body_measurements
  FOR ALL USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);

-- ── broadcast_messages ──
DROP POLICY IF EXISTS "broadcast_messages_collaborator_write" ON broadcast_messages;
CREATE POLICY "broadcast_messages_collaborator_write" ON broadcast_messages
  FOR ALL USING ((dietitian_id = get_studio_owner((select auth.uid()))) AND is_dietitian_level_collaborator((select auth.uid())))
  WITH CHECK ((dietitian_id = get_studio_owner((select auth.uid()))) AND is_dietitian_level_collaborator((select auth.uid())));
DROP POLICY IF EXISTS "broadcast_messages_dietitian_own" ON broadcast_messages;
CREATE POLICY "broadcast_messages_dietitian_own" ON broadcast_messages
  FOR ALL USING ((select auth.uid()) = dietitian_id) WITH CHECK ((select auth.uid()) = dietitian_id);
DROP POLICY IF EXISTS "broadcast_messages_collaborator_read" ON broadcast_messages;
CREATE POLICY "broadcast_messages_collaborator_read" ON broadcast_messages
  FOR SELECT USING (dietitian_id = get_studio_owner((select auth.uid())));

-- ── cartelle_raw ──
DROP POLICY IF EXISTS "Cartelle proprie" ON cartelle_raw;
DROP POLICY IF EXISTS "cartelle_dietitian_all" ON cartelle_raw;
DROP POLICY IF EXISTS "cartelle_own" ON cartelle_raw;
CREATE POLICY "cartelle_own" ON cartelle_raw
  FOR ALL USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);
DROP POLICY IF EXISTS "cartelle_collaborator_write" ON cartelle_raw;
CREATE POLICY "cartelle_collaborator_write" ON cartelle_raw
  FOR ALL USING ((user_id = get_studio_owner((select auth.uid()))) AND is_dietitian_level_collaborator((select auth.uid())))
  WITH CHECK ((user_id = get_studio_owner((select auth.uid()))) AND is_dietitian_level_collaborator((select auth.uid())));
DROP POLICY IF EXISTS "cartelle_collaborator_read" ON cartelle_raw;
DROP POLICY IF EXISTS "cartelle_select_linked_patient" ON cartelle_raw;
DROP POLICY IF EXISTS "dietista legge cartelle" ON cartelle_raw;
DROP POLICY IF EXISTS "cartelle_select_combined" ON cartelle_raw;
CREATE POLICY "cartelle_select_combined" ON cartelle_raw
  FOR SELECT USING (
    (user_id = get_studio_owner((select auth.uid())))
    OR is_linked_patient(id)
    OR (EXISTS (SELECT 1 FROM profiles p WHERE p.id = (select auth.uid()) AND p.role = 'dietitian'))
  );

-- ── chat_group_members (1 policy per comando, nessuna sovrapposizione: solo wrap) ──
DROP POLICY IF EXISTS "chat_group_members_creator_delete" ON chat_group_members;
CREATE POLICY "chat_group_members_creator_delete" ON chat_group_members
  FOR DELETE USING (EXISTS (SELECT 1 FROM chat_groups WHERE chat_groups.id = chat_group_members.group_id AND chat_groups.created_by = (select auth.uid())));
DROP POLICY IF EXISTS "chat_group_members_creator_insert" ON chat_group_members;
CREATE POLICY "chat_group_members_creator_insert" ON chat_group_members
  FOR INSERT WITH CHECK (
    (EXISTS (SELECT 1 FROM chat_groups WHERE chat_groups.id = chat_group_members.group_id AND chat_groups.created_by = (select auth.uid())))
    AND ((user_id = (select auth.uid())) OR (EXISTS (SELECT 1 FROM patient_dietitian pd WHERE pd.patient_id = chat_group_members.user_id AND pd.dietitian_id = (select auth.uid()))) OR (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = chat_group_members.user_id AND profiles.role = 'dietitian')))
  );
DROP POLICY IF EXISTS "chat_group_members_select" ON chat_group_members;
CREATE POLICY "chat_group_members_select" ON chat_group_members
  FOR SELECT USING (is_chat_group_member(group_id, (select auth.uid())));
DROP POLICY IF EXISTS "chat_group_members_self_update" ON chat_group_members;
CREATE POLICY "chat_group_members_self_update" ON chat_group_members
  FOR UPDATE USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);

-- ── chat_group_messages (1 policy per comando: solo wrap) ──
DROP POLICY IF EXISTS "chat_group_messages_member_insert" ON chat_group_messages;
CREATE POLICY "chat_group_messages_member_insert" ON chat_group_messages
  FOR INSERT WITH CHECK (((select auth.uid()) = sender_id) AND is_chat_group_member(group_id, (select auth.uid())));
DROP POLICY IF EXISTS "chat_group_messages_member_select" ON chat_group_messages;
CREATE POLICY "chat_group_messages_member_select" ON chat_group_messages
  FOR SELECT USING (is_chat_group_member(group_id, (select auth.uid())) AND ((status = 'sent') OR (sender_id = (select auth.uid()))));
DROP POLICY IF EXISTS "chat_group_messages_sender_update" ON chat_group_messages;
CREATE POLICY "chat_group_messages_sender_update" ON chat_group_messages
  FOR UPDATE USING ((select auth.uid()) = sender_id) WITH CHECK ((select auth.uid()) = sender_id);

-- ── chat_groups (1 policy per comando: solo wrap) ──
DROP POLICY IF EXISTS "chat_groups_creator_delete" ON chat_groups;
CREATE POLICY "chat_groups_creator_delete" ON chat_groups
  FOR DELETE USING ((select auth.uid()) = created_by);
DROP POLICY IF EXISTS "chat_groups_dietitian_insert" ON chat_groups;
CREATE POLICY "chat_groups_dietitian_insert" ON chat_groups
  FOR INSERT WITH CHECK (((select auth.uid()) = created_by) AND (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = (select auth.uid()) AND profiles.role = 'dietitian')));
DROP POLICY IF EXISTS "chat_groups_member_select" ON chat_groups;
CREATE POLICY "chat_groups_member_select" ON chat_groups
  FOR SELECT USING (is_chat_group_member(id, (select auth.uid())) OR (created_by = (select auth.uid())));
DROP POLICY IF EXISTS "chat_groups_creator_update" ON chat_groups;
CREATE POLICY "chat_groups_creator_update" ON chat_groups
  FOR UPDATE USING ((select auth.uid()) = created_by) WITH CHECK ((select auth.uid()) = created_by);

-- ── chat_messages (delete/insert/update _own_or_linked erano duplicati esatti,
--    per singolo comando, della condizione già coperta da "chat visibile ai
--    coinvolti" FOR ALL — eliminati; select_visible resta separata perché più
--    stretta, non un duplicato esatto) ──
DROP POLICY IF EXISTS "chat_messages_delete_own_or_linked" ON chat_messages;
DROP POLICY IF EXISTS "chat_messages_insert_own_or_linked" ON chat_messages;
DROP POLICY IF EXISTS "chat_messages_update_own_or_linked" ON chat_messages;
DROP POLICY IF EXISTS "chat visibile ai coinvolti" ON chat_messages;
CREATE POLICY "chat visibile ai coinvolti" ON chat_messages
  FOR ALL USING (((select auth.uid()) = patient_id) OR (EXISTS (SELECT 1 FROM patient_dietitian pd WHERE pd.patient_id = chat_messages.patient_id AND pd.dietitian_id = (select auth.uid()))))
  WITH CHECK (((select auth.uid()) = patient_id) OR (EXISTS (SELECT 1 FROM patient_dietitian pd WHERE pd.patient_id = chat_messages.patient_id AND pd.dietitian_id = (select auth.uid()))));
DROP POLICY IF EXISTS "chat_messages_own" ON chat_messages;
CREATE POLICY "chat_messages_own" ON chat_messages
  FOR ALL USING (((select auth.uid()) = sender_id) OR ((select auth.uid()) = patient_id));
DROP POLICY IF EXISTS "chat_messages_select_visible" ON chat_messages;
CREATE POLICY "chat_messages_select_visible" ON chat_messages
  FOR SELECT USING (
    (((select auth.uid()) = patient_id) OR (EXISTS (SELECT 1 FROM patient_dietitian pd WHERE pd.patient_id = chat_messages.patient_id AND pd.dietitian_id = (select auth.uid()))))
    AND ((status = 'sent') OR (sender_id = (select auth.uid())))
  );

-- ── clinical_audit_log ──
DROP POLICY IF EXISTS "clinical_audit_log_dietitian_read" ON clinical_audit_log;
DROP POLICY IF EXISTS "clinical_audit_log_own_read" ON clinical_audit_log;
DROP POLICY IF EXISTS "clinical_audit_log_select_combined" ON clinical_audit_log;
CREATE POLICY "clinical_audit_log_select_combined" ON clinical_audit_log
  FOR SELECT USING (
    (EXISTS (SELECT 1 FROM patient_dietitian pd WHERE pd.dietitian_id = (select auth.uid()) AND (((clinical_audit_log.patient_id IS NOT NULL) AND (pd.patient_id = clinical_audit_log.patient_id)) OR ((clinical_audit_log.cartella_id IS NOT NULL) AND (pd.cartella_id = clinical_audit_log.cartella_id)))))
    OR (patient_id = (select auth.uid()))
  );

-- ── coach_ai_messages (1 policy per comando: solo wrap) ──
DROP POLICY IF EXISTS "coach_ai_messages_insert_own" ON coach_ai_messages;
CREATE POLICY "coach_ai_messages_insert_own" ON coach_ai_messages
  FOR INSERT WITH CHECK ((select auth.uid()) = patient_id);
DROP POLICY IF EXISTS "coach_ai_messages_select" ON coach_ai_messages;
CREATE POLICY "coach_ai_messages_select" ON coach_ai_messages
  FOR SELECT USING (((select auth.uid()) = patient_id) OR (EXISTS (SELECT 1 FROM patient_dietitian pd WHERE pd.patient_id = coach_ai_messages.patient_id AND get_studio_owner(pd.dietitian_id) = get_studio_owner((select auth.uid())))));

-- ── consigli_custom ──
DROP POLICY IF EXISTS "Propri consigli" ON consigli_custom;
DROP POLICY IF EXISTS "consigli_custom_own" ON consigli_custom;
CREATE POLICY "consigli_custom_own" ON consigli_custom
  FOR ALL USING ((select auth.uid()) = user_id);

-- ── custom_foods ──
DROP POLICY IF EXISTS "custom_foods_own" ON custom_foods;
DROP POLICY IF EXISTS "users see own data" ON custom_foods;
DROP POLICY IF EXISTS "utenti vedono i propri dati" ON custom_foods;
CREATE POLICY "custom_foods_own" ON custom_foods
  FOR ALL USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);

-- ── custom_meals ──
DROP POLICY IF EXISTS "custom_meals_own" ON custom_meals;
DROP POLICY IF EXISTS "utente gestisce propri pasti" ON custom_meals;
CREATE POLICY "custom_meals_own" ON custom_meals
  FOR ALL USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);

-- ── daily_logs ──
DROP POLICY IF EXISTS "daily_logs_own" ON daily_logs;
DROP POLICY IF EXISTS "users see own data" ON daily_logs;
DROP POLICY IF EXISTS "utenti vedono i propri dati" ON daily_logs;
CREATE POLICY "daily_logs_own" ON daily_logs
  FOR ALL USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);
DROP POLICY IF EXISTS "dietista legge totali giornalieri pazienti" ON daily_logs;
CREATE POLICY "dietista legge totali giornalieri pazienti" ON daily_logs
  FOR SELECT USING (EXISTS (SELECT 1 FROM patient_dietitian pd WHERE pd.patient_id = daily_logs.user_id AND pd.dietitian_id = (select auth.uid())));

-- ── daily_wellness ──
DROP POLICY IF EXISTS "daily_wellness_own" ON daily_wellness;
DROP POLICY IF EXISTS "utente gestisce proprio wellness" ON daily_wellness;
DROP POLICY IF EXISTS "utenti wellness" ON daily_wellness;
CREATE POLICY "daily_wellness_own" ON daily_wellness
  FOR ALL USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);
DROP POLICY IF EXISTS "daily_wellness_insert_patient" ON daily_wellness;
CREATE POLICY "daily_wellness_insert_patient" ON daily_wellness
  FOR INSERT WITH CHECK ((select auth.uid()) = patient_id);
DROP POLICY IF EXISTS "daily_wellness_select_dietitian" ON daily_wellness;
DROP POLICY IF EXISTS "daily_wellness_select_patient" ON daily_wellness;
DROP POLICY IF EXISTS "dietista legge wellness pazienti" ON daily_wellness;
DROP POLICY IF EXISTS "daily_wellness_select_combined" ON daily_wellness;
CREATE POLICY "daily_wellness_select_combined" ON daily_wellness
  FOR SELECT USING (
    (EXISTS (SELECT 1 FROM patient_dietitian WHERE patient_dietitian.dietitian_id = (select auth.uid()) AND patient_dietitian.cartella_id = daily_wellness.cartella_id))
    OR ((select auth.uid()) = patient_id)
    OR (EXISTS (SELECT 1 FROM patient_dietitian pd WHERE pd.patient_id = daily_wellness.user_id AND pd.dietitian_id = (select auth.uid())))
  );
DROP POLICY IF EXISTS "daily_wellness_update_patient" ON daily_wellness;
CREATE POLICY "daily_wellness_update_patient" ON daily_wellness
  FOR UPDATE USING (((select auth.uid()) = patient_id) AND (EXISTS (SELECT 1 FROM patient_dietitian WHERE patient_dietitian.patient_id = (select auth.uid()) AND patient_dietitian.cartella_id = daily_wellness.cartella_id)))
  WITH CHECK (((select auth.uid()) = patient_id) AND (EXISTS (SELECT 1 FROM patient_dietitian WHERE patient_dietitian.patient_id = (select auth.uid()) AND patient_dietitian.cartella_id = daily_wellness.cartella_id)));

-- ── diario_alimentare_foto ──
DROP POLICY IF EXISTS "diario_alimentare_foto_collaborator_write" ON diario_alimentare_foto;
CREATE POLICY "diario_alimentare_foto_collaborator_write" ON diario_alimentare_foto
  FOR ALL USING ((user_id = get_studio_owner((select auth.uid()))) AND is_dietitian_level_collaborator((select auth.uid())))
  WITH CHECK ((user_id = get_studio_owner((select auth.uid()))) AND is_dietitian_level_collaborator((select auth.uid())));
DROP POLICY IF EXISTS "diario_alimentare_foto_dietitian_all" ON diario_alimentare_foto;
CREATE POLICY "diario_alimentare_foto_dietitian_all" ON diario_alimentare_foto
  FOR ALL USING (user_id = (select auth.uid())) WITH CHECK (user_id = (select auth.uid()));
DROP POLICY IF EXISTS "diario_alimentare_foto_collaborator_read" ON diario_alimentare_foto;
CREATE POLICY "diario_alimentare_foto_collaborator_read" ON diario_alimentare_foto
  FOR SELECT USING (user_id = get_studio_owner((select auth.uid())));

-- ── diet_meals — ATTENZIONE: "diet_meals_own" concede accesso FOR ALL a
--    QUALSIASI utente autenticato (qual = auth.role()='authenticated', nessun
--    controllo di proprietà). Segnalato come finding a parte, non corretto
--    qui (fuori scopo per una sezione di performance) — solo avvolto. ──
DROP POLICY IF EXISTS "diet_meals_own" ON diet_meals;
CREATE POLICY "diet_meals_own" ON diet_meals
  FOR ALL USING ((select auth.role()) = 'authenticated');
DROP POLICY IF EXISTS "dietista gestisce pasti" ON diet_meals;
CREATE POLICY "dietista gestisce pasti" ON diet_meals
  FOR ALL USING (EXISTS (SELECT 1 FROM patient_diets pd JOIN patient_dietitian pdt ON pdt.patient_id = pd.user_id WHERE pd.id = diet_meals.diet_id AND pdt.dietitian_id = (select auth.uid())))
  WITH CHECK (EXISTS (SELECT 1 FROM patient_diets pd JOIN patient_dietitian pdt ON pdt.patient_id = pd.user_id WHERE pd.id = diet_meals.diet_id AND pdt.dietitian_id = (select auth.uid())));
DROP POLICY IF EXISTS "accesso pasti dieta propria" ON diet_meals;
DROP POLICY IF EXISTS "users see diet meals" ON diet_meals;
DROP POLICY IF EXISTS "diet_meals_select_own_diet" ON diet_meals;
CREATE POLICY "diet_meals_select_own_diet" ON diet_meals
  FOR SELECT USING (EXISTS (SELECT 1 FROM patient_diets pd WHERE pd.id = diet_meals.diet_id AND pd.user_id = (select auth.uid())));

-- ── dietitian_availability ──
DROP POLICY IF EXISTS "collaboratore gestisce disponibilita" ON dietitian_availability;
CREATE POLICY "collaboratore gestisce disponibilita" ON dietitian_availability
  FOR ALL USING (dietitian_id = get_studio_owner((select auth.uid()))) WITH CHECK (dietitian_id = get_studio_owner((select auth.uid())));
DROP POLICY IF EXISTS "dietitian manage own availability" ON dietitian_availability;
CREATE POLICY "dietitian manage own availability" ON dietitian_availability
  FOR ALL USING ((select auth.uid()) = dietitian_id) WITH CHECK ((select auth.uid()) = dietitian_id);
-- "public read availability" (qual=true) invariata: nessun auth.* da avvolgere.

-- ── dietitian_profiles (roles diversi tra le 2 SELECT: non fuse, vedi header) ──
DROP POLICY IF EXISTS "dietitian_manage_own_profile" ON dietitian_profiles;
CREATE POLICY "dietitian_manage_own_profile" ON dietitian_profiles
  FOR ALL TO authenticated USING ((select auth.uid()) = dietitian_id) WITH CHECK ((select auth.uid()) = dietitian_id);
DROP POLICY IF EXISTS "dietitian_profiles_collaborator_write" ON dietitian_profiles;
CREATE POLICY "dietitian_profiles_collaborator_write" ON dietitian_profiles
  FOR ALL USING ((dietitian_id = get_studio_owner((select auth.uid()))) AND is_dietitian_level_collaborator((select auth.uid())))
  WITH CHECK ((dietitian_id = get_studio_owner((select auth.uid()))) AND is_dietitian_level_collaborator((select auth.uid())));
DROP POLICY IF EXISTS "dietitian_profiles_collaborator_read" ON dietitian_profiles;
CREATE POLICY "dietitian_profiles_collaborator_read" ON dietitian_profiles
  FOR SELECT USING (dietitian_id = get_studio_owner((select auth.uid())));
-- "read_visible_profiles" (TO authenticated, qual=visible=true) invariata: nessun auth.* da avvolgere.

-- ── dietitian_reviews (1 policy per comando, roles già authenticated: solo wrap) ──
DROP POLICY IF EXISTS "patient_delete_own_review" ON dietitian_reviews;
CREATE POLICY "patient_delete_own_review" ON dietitian_reviews
  FOR DELETE TO authenticated USING ((select auth.uid()) = patient_id);
DROP POLICY IF EXISTS "patient_review_if_had_appointment" ON dietitian_reviews;
CREATE POLICY "patient_review_if_had_appointment" ON dietitian_reviews
  FOR INSERT TO authenticated WITH CHECK (
    ((select auth.uid()) = patient_id) AND (EXISTS (SELECT 1 FROM appointments a WHERE a.patient_id = (select auth.uid()) AND a.dietitian_id = dietitian_reviews.dietitian_id AND a.appointment_date < now() AND COALESCE(a.status, 'pending') <> 'cancelled'))
  );
DROP POLICY IF EXISTS "patient_update_own_review" ON dietitian_reviews;
CREATE POLICY "patient_update_own_review" ON dietitian_reviews
  FOR UPDATE TO authenticated USING ((select auth.uid()) = patient_id) WITH CHECK ((select auth.uid()) = patient_id);

-- ── ecm_corsi — ATTENZIONE: "ecm_corsi_auth" concede FOR ALL a QUALSIASI
--    utente autenticato (nessun controllo di proprietà). Segnalato come
--    finding a parte, non corretto qui — solo avvolto. ──
DROP POLICY IF EXISTS "ecm_corsi_admin_write" ON ecm_corsi;
CREATE POLICY "ecm_corsi_admin_write" ON ecm_corsi
  FOR ALL USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = (select auth.uid()) AND profiles.is_admin = true));
DROP POLICY IF EXISTS "ecm_corsi_auth" ON ecm_corsi;
CREATE POLICY "ecm_corsi_auth" ON ecm_corsi
  FOR ALL USING ((select auth.role()) = 'authenticated');

-- ── esami_biochimici ──
DROP POLICY IF EXISTS "esami_biochimici_collaborator_write" ON esami_biochimici;
CREATE POLICY "esami_biochimici_collaborator_write" ON esami_biochimici
  FOR ALL USING ((user_id = get_studio_owner((select auth.uid()))) AND is_dietitian_level_collaborator((select auth.uid())))
  WITH CHECK ((user_id = get_studio_owner((select auth.uid()))) AND is_dietitian_level_collaborator((select auth.uid())));
DROP POLICY IF EXISTS "esami_biochimici_dietitian_all" ON esami_biochimici;
CREATE POLICY "esami_biochimici_dietitian_all" ON esami_biochimici
  FOR ALL USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);
DROP POLICY IF EXISTS "esami_biochimici_collaborator_read" ON esami_biochimici;
CREATE POLICY "esami_biochimici_collaborator_read" ON esami_biochimici
  FOR SELECT USING (user_id = get_studio_owner((select auth.uid())));

-- ── fatture ──
DROP POLICY IF EXISTS "Proprie fatture" ON fatture;
DROP POLICY IF EXISTS "fatture_all_own" ON fatture;
CREATE POLICY "fatture_all_own" ON fatture
  FOR ALL USING ((select auth.uid()) = dietitian_id) WITH CHECK ((select auth.uid()) = dietitian_id);
DROP POLICY IF EXISTS "fatture_collaborator_write" ON fatture;
CREATE POLICY "fatture_collaborator_write" ON fatture
  FOR ALL USING ((dietitian_id = get_studio_owner((select auth.uid()))) AND is_dietitian_level_collaborator((select auth.uid())))
  WITH CHECK ((dietitian_id = get_studio_owner((select auth.uid()))) AND is_dietitian_level_collaborator((select auth.uid())));
DROP POLICY IF EXISTS "fatture_collaborator_read" ON fatture;
DROP POLICY IF EXISTS "fatture_patient_read" ON fatture;
DROP POLICY IF EXISTS "fatture_select_combined" ON fatture;
CREATE POLICY "fatture_select_combined" ON fatture
  FOR SELECT USING ((dietitian_id = get_studio_owner((select auth.uid()))) OR (patient_id = (select auth.uid())));

-- ── food_logs (solo wrap: FOR ALL + 1 SELECT, lasciate separate) ──
DROP POLICY IF EXISTS "food_logs_own" ON food_logs;
CREATE POLICY "food_logs_own" ON food_logs
  FOR ALL USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);
DROP POLICY IF EXISTS "food_logs_dietitian_read" ON food_logs;
CREATE POLICY "food_logs_dietitian_read" ON food_logs
  FOR SELECT USING (EXISTS (SELECT 1 FROM patient_dietitian pd WHERE pd.patient_id = food_logs.user_id AND pd.dietitian_id = (select auth.uid())));

-- ── liste_spesa ──
DROP POLICY IF EXISTS "liste_spesa_collaborator_write" ON liste_spesa;
CREATE POLICY "liste_spesa_collaborator_write" ON liste_spesa
  FOR ALL USING ((user_id = get_studio_owner((select auth.uid()))) AND is_dietitian_level_collaborator((select auth.uid())))
  WITH CHECK ((user_id = get_studio_owner((select auth.uid()))) AND is_dietitian_level_collaborator((select auth.uid())));
DROP POLICY IF EXISTS "liste_spesa_dietitian_all" ON liste_spesa;
CREATE POLICY "liste_spesa_dietitian_all" ON liste_spesa
  FOR ALL USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);
DROP POLICY IF EXISTS "liste_spesa_collaborator_read" ON liste_spesa;
DROP POLICY IF EXISTS "liste_spesa_select_patient_visible" ON liste_spesa;
DROP POLICY IF EXISTS "liste_spesa_select_combined" ON liste_spesa;
CREATE POLICY "liste_spesa_select_combined" ON liste_spesa
  FOR SELECT USING (
    (user_id = get_studio_owner((select auth.uid())))
    OR ((visible_to_patient = true) AND is_linked_patient(cartella_id))
  );

-- ── meal_completions ──
DROP POLICY IF EXISTS "meal_completions_own" ON meal_completions;
DROP POLICY IF EXISTS "paziente gestisce completamenti" ON meal_completions;
CREATE POLICY "meal_completions_own" ON meal_completions
  FOR ALL USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);
DROP POLICY IF EXISTS "dietista legge completamenti" ON meal_completions;
CREATE POLICY "dietista legge completamenti" ON meal_completions
  FOR SELECT USING (EXISTS (SELECT 1 FROM patient_dietitian pd WHERE pd.patient_id = meal_completions.user_id AND pd.dietitian_id = (select auth.uid())));

-- ── meal_plan_items / meal_plans / medication_reminders (1 policy: solo wrap) ──
DROP POLICY IF EXISTS "meal_plan_items_own" ON meal_plan_items;
CREATE POLICY "meal_plan_items_own" ON meal_plan_items
  FOR ALL USING (EXISTS (SELECT 1 FROM meal_plans WHERE meal_plans.id = meal_plan_items.plan_id AND meal_plans.user_id = (select auth.uid())));
DROP POLICY IF EXISTS "meal_plans_own" ON meal_plans;
CREATE POLICY "meal_plans_own" ON meal_plans
  FOR ALL USING ((select auth.uid()) = user_id);
DROP POLICY IF EXISTS "utente gestisce propri farmaci" ON medication_reminders;
CREATE POLICY "utente gestisce propri farmaci" ON medication_reminders
  FOR ALL USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);

-- ── menstrual_cycle ──
DROP POLICY IF EXISTS "menstrual_cycle_own" ON menstrual_cycle;
DROP POLICY IF EXISTS "own" ON menstrual_cycle;
CREATE POLICY "menstrual_cycle_own" ON menstrual_cycle
  FOR ALL USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);
DROP POLICY IF EXISTS "menstrual_cycle_dietitian_read" ON menstrual_cycle;
CREATE POLICY "menstrual_cycle_dietitian_read" ON menstrual_cycle
  FOR SELECT USING (EXISTS (SELECT 1 FROM patient_dietitian pd WHERE pd.patient_id = menstrual_cycle.user_id AND pd.dietitian_id = (select auth.uid())));

-- ── ncpt ──
DROP POLICY IF EXISTS "ncpt_dietitian_all" ON ncpt;
DROP POLICY IF EXISTS "Proprio ncpt" ON ncpt;
CREATE POLICY "ncpt_dietitian_all" ON ncpt
  FOR ALL USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);
DROP POLICY IF EXISTS "ncpt_collaborator_write" ON ncpt;
CREATE POLICY "ncpt_collaborator_write" ON ncpt
  FOR ALL USING ((user_id = get_studio_owner((select auth.uid()))) AND is_dietitian_level_collaborator((select auth.uid())))
  WITH CHECK ((user_id = get_studio_owner((select auth.uid()))) AND is_dietitian_level_collaborator((select auth.uid())));
-- "ncpt_own" NON va ricreata (stesso motivo di bia_records_own sopra).
DROP POLICY IF EXISTS "ncpt_collaborator_read" ON ncpt;
DROP POLICY IF EXISTS "ncpt_patient_select" ON ncpt;
DROP POLICY IF EXISTS "ncpt_select_patient_visible" ON ncpt;
DROP POLICY IF EXISTS "paziente legge propri ncpt" ON ncpt;
DROP POLICY IF EXISTS "ncpt_select_combined" ON ncpt;
CREATE POLICY "ncpt_select_combined" ON ncpt
  FOR SELECT USING (
    (user_id = get_studio_owner((select auth.uid())))
    OR ((visible_to_patient = true) AND (cartella_id IN (SELECT patient_dietitian.cartella_id FROM patient_dietitian WHERE patient_dietitian.patient_id = (select auth.uid()))))
    OR ((visible_to_patient = true) AND is_linked_patient(cartella_id))
    OR ((visible_to_patient = true) AND (((select auth.uid()) = patient_id) OR (EXISTS (SELECT 1 FROM patient_dietitian pd WHERE pd.patient_id = (select auth.uid()) AND pd.cartella_id = ncpt.cartella_id))))
  );

-- ── note_specialistiche (2 SELECT restano "authenticated"-only, non fuse
--    con le 5 "public" — vedi nota sui roles nell'header) ──
DROP POLICY IF EXISTS "Own note" ON note_specialistiche;
DROP POLICY IF EXISTS "note_specialistiche_dietitian_all" ON note_specialistiche;
CREATE POLICY "note_specialistiche_dietitian_all" ON note_specialistiche
  FOR ALL USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);
DROP POLICY IF EXISTS "note_specialistiche_collaborator_write" ON note_specialistiche;
CREATE POLICY "note_specialistiche_collaborator_write" ON note_specialistiche
  FOR ALL USING ((user_id = get_studio_owner((select auth.uid()))) AND is_dietitian_level_collaborator((select auth.uid())))
  WITH CHECK ((user_id = get_studio_owner((select auth.uid()))) AND is_dietitian_level_collaborator((select auth.uid())));
-- "note_specialistiche_own" NON va ricreata (stesso motivo di bia_records_own sopra).
DROP POLICY IF EXISTS "note_specialistiche_collaborator_read" ON note_specialistiche;
DROP POLICY IF EXISTS "note_specialistiche_patient_select" ON note_specialistiche;
DROP POLICY IF EXISTS "note_specialistiche_select_patient_visible" ON note_specialistiche;
DROP POLICY IF EXISTS "patients_read_notes_via_cartella" ON note_specialistiche;
DROP POLICY IF EXISTS "paziente legge proprie note" ON note_specialistiche;
DROP POLICY IF EXISTS "note_specialistiche_select_combined" ON note_specialistiche;
CREATE POLICY "note_specialistiche_select_combined" ON note_specialistiche
  FOR SELECT USING (
    (user_id = get_studio_owner((select auth.uid())))
    OR ((visible_to_patient = true) AND (cartella_id IN (SELECT patient_dietitian.cartella_id FROM patient_dietitian WHERE patient_dietitian.patient_id = (select auth.uid()))))
    OR ((visible_to_patient = true) AND is_linked_patient(cartella_id))
    OR (cartella_id IN (SELECT patient_dietitian.cartella_id FROM patient_dietitian WHERE patient_dietitian.patient_id = (select auth.uid())))
    OR ((visible_to_patient = true) AND (((select auth.uid()) = patient_id) OR (EXISTS (SELECT 1 FROM patient_dietitian pd WHERE pd.patient_id = (select auth.uid()) AND pd.cartella_id = note_specialistiche.cartella_id))))
  );
DROP POLICY IF EXISTS "note_visibili_pazienti" ON note_specialistiche;
DROP POLICY IF EXISTS "read_visible_notes" ON note_specialistiche;
DROP POLICY IF EXISTS "note_specialistiche_select_visible_authenticated" ON note_specialistiche;
CREATE POLICY "note_specialistiche_select_visible_authenticated" ON note_specialistiche
  FOR SELECT TO authenticated USING (visible_to_patient = true);

-- ── pacchetti ──
DROP POLICY IF EXISTS "pacchetti_collaborator_write" ON pacchetti;
CREATE POLICY "pacchetti_collaborator_write" ON pacchetti
  FOR ALL USING ((dietitian_id = get_studio_owner((select auth.uid()))) AND is_dietitian_level_collaborator((select auth.uid())))
  WITH CHECK ((dietitian_id = get_studio_owner((select auth.uid()))) AND is_dietitian_level_collaborator((select auth.uid())));
DROP POLICY IF EXISTS "pacchetti_owner_all" ON pacchetti;
CREATE POLICY "pacchetti_owner_all" ON pacchetti
  FOR ALL USING ((select auth.uid()) = dietitian_id) WITH CHECK ((select auth.uid()) = dietitian_id);
DROP POLICY IF EXISTS "pacchetti_collaborator_read" ON pacchetti;
CREATE POLICY "pacchetti_collaborator_read" ON pacchetti
  FOR SELECT USING (dietitian_id = get_studio_owner((select auth.uid())));

-- ── pacchetti_acquistati ──
DROP POLICY IF EXISTS "pacchetti_acquistati_collaborator_write" ON pacchetti_acquistati;
CREATE POLICY "pacchetti_acquistati_collaborator_write" ON pacchetti_acquistati
  FOR ALL USING ((dietitian_id = get_studio_owner((select auth.uid()))) AND is_dietitian_level_collaborator((select auth.uid())))
  WITH CHECK ((dietitian_id = get_studio_owner((select auth.uid()))) AND is_dietitian_level_collaborator((select auth.uid())));
DROP POLICY IF EXISTS "pacchetti_acquistati_owner_all" ON pacchetti_acquistati;
CREATE POLICY "pacchetti_acquistati_owner_all" ON pacchetti_acquistati
  FOR ALL USING ((select auth.uid()) = dietitian_id) WITH CHECK ((select auth.uid()) = dietitian_id);
DROP POLICY IF EXISTS "pacchetti_acquistati_collaborator_read" ON pacchetti_acquistati;
DROP POLICY IF EXISTS "pacchetti_acquistati_patient_read" ON pacchetti_acquistati;
DROP POLICY IF EXISTS "pacchetti_acquistati_select_combined" ON pacchetti_acquistati;
CREATE POLICY "pacchetti_acquistati_select_combined" ON pacchetti_acquistati
  FOR SELECT USING ((dietitian_id = get_studio_owner((select auth.uid()))) OR ((select auth.uid()) = patient_id));

-- ── patient_audit_log (1 policy per comando: solo wrap) ──
DROP POLICY IF EXISTS "patient_audit_log_studio_insert" ON patient_audit_log;
CREATE POLICY "patient_audit_log_studio_insert" ON patient_audit_log
  FOR INSERT WITH CHECK ((dietitian_id = (select auth.uid())) AND (EXISTS (SELECT 1 FROM cartelle_raw c WHERE c.id = patient_audit_log.patient_id AND c.user_id = get_studio_owner((select auth.uid())))));
DROP POLICY IF EXISTS "patient_audit_log_studio_read" ON patient_audit_log;
CREATE POLICY "patient_audit_log_studio_read" ON patient_audit_log
  FOR SELECT USING (EXISTS (SELECT 1 FROM cartelle_raw c WHERE c.id = patient_audit_log.patient_id AND c.user_id = get_studio_owner((select auth.uid()))));

-- ── patient_consents ──
DROP POLICY IF EXISTS "patient_consents_collaborator_write" ON patient_consents;
CREATE POLICY "patient_consents_collaborator_write" ON patient_consents
  FOR ALL USING ((dietitian_id = get_studio_owner((select auth.uid()))) AND is_dietitian_level_collaborator((select auth.uid())))
  WITH CHECK ((dietitian_id = get_studio_owner((select auth.uid()))) AND is_dietitian_level_collaborator((select auth.uid())));
DROP POLICY IF EXISTS "patient_consents_dietitian_all" ON patient_consents;
CREATE POLICY "patient_consents_dietitian_all" ON patient_consents
  FOR ALL USING ((select auth.uid()) = dietitian_id) WITH CHECK ((select auth.uid()) = dietitian_id);
DROP POLICY IF EXISTS "patient_consents_collaborator_read" ON patient_consents;
DROP POLICY IF EXISTS "patient_consents_patient_select" ON patient_consents;
DROP POLICY IF EXISTS "patient_consents_select_combined" ON patient_consents;
CREATE POLICY "patient_consents_select_combined" ON patient_consents
  FOR SELECT USING (
    (dietitian_id = get_studio_owner((select auth.uid())))
    OR ((visible_to_patient = true) AND (cartella_id IN (SELECT patient_dietitian.cartella_id FROM patient_dietitian WHERE patient_dietitian.patient_id = (select auth.uid()))))
  );
DROP POLICY IF EXISTS "patient_consents_patient_update_sign" ON patient_consents;
CREATE POLICY "patient_consents_patient_update_sign" ON patient_consents
  FOR UPDATE USING (cartella_id IN (SELECT patient_dietitian.cartella_id FROM patient_dietitian WHERE patient_dietitian.patient_id = (select auth.uid())))
  WITH CHECK (cartella_id IN (SELECT patient_dietitian.cartella_id FROM patient_dietitian WHERE patient_dietitian.patient_id = (select auth.uid())));

-- ── patient_diets ──
DROP POLICY IF EXISTS "dietista gestisce diete" ON patient_diets;
CREATE POLICY "dietista gestisce diete" ON patient_diets
  FOR ALL USING (EXISTS (SELECT 1 FROM patient_dietitian pd WHERE pd.patient_id = patient_diets.user_id AND pd.dietitian_id = (select auth.uid())))
  WITH CHECK (EXISTS (SELECT 1 FROM patient_dietitian pd WHERE pd.patient_id = patient_diets.user_id AND pd.dietitian_id = (select auth.uid())));
DROP POLICY IF EXISTS "patient_diets_own" ON patient_diets;
CREATE POLICY "patient_diets_own" ON patient_diets
  FOR ALL USING ((select auth.uid()) = user_id);
DROP POLICY IF EXISTS "pazienti leggono la propria dieta" ON patient_diets;
DROP POLICY IF EXISTS "users see own diet" ON patient_diets;
DROP POLICY IF EXISTS "patient_diets_select_own" ON patient_diets;
CREATE POLICY "patient_diets_select_own" ON patient_diets
  FOR SELECT USING ((select auth.uid()) = user_id);

-- ── patient_documents ──
DROP POLICY IF EXISTS "Own documents" ON patient_documents;
DROP POLICY IF EXISTS "dietista gestisce documenti" ON patient_documents;
CREATE POLICY "dietista gestisce documenti" ON patient_documents
  FOR ALL USING ((select auth.uid()) = dietitian_id) WITH CHECK ((select auth.uid()) = dietitian_id);
DROP POLICY IF EXISTS "patient_documents_collaborator_write" ON patient_documents;
CREATE POLICY "patient_documents_collaborator_write" ON patient_documents
  FOR ALL USING ((dietitian_id = get_studio_owner((select auth.uid()))) AND is_dietitian_level_collaborator((select auth.uid())))
  WITH CHECK ((dietitian_id = get_studio_owner((select auth.uid()))) AND is_dietitian_level_collaborator((select auth.uid())));
-- "patient_documents_own" NON va ricreata (stesso motivo di bia_records_own sopra).
DROP POLICY IF EXISTS "dietista legge propri documenti" ON patient_documents;
DROP POLICY IF EXISTS "patient_documents_collaborator_read" ON patient_documents;
DROP POLICY IF EXISTS "patient_documents_patient_select" ON patient_documents;
DROP POLICY IF EXISTS "patient_documents_select_patient_visible" ON patient_documents;
DROP POLICY IF EXISTS "paziente vede propri documenti" ON patient_documents;
DROP POLICY IF EXISTS "patient_documents_select_combined" ON patient_documents;
CREATE POLICY "patient_documents_select_combined" ON patient_documents
  FOR SELECT USING (
    (dietitian_id = (select auth.uid()))
    OR (dietitian_id = get_studio_owner((select auth.uid())))
    OR ((visible = true) AND (cartella_id IN (SELECT patient_dietitian.cartella_id FROM patient_dietitian WHERE patient_dietitian.patient_id = (select auth.uid()))))
    OR ((visible = true) AND is_linked_patient(cartella_id))
    OR (((select auth.uid()) = patient_id) AND (visible IS NOT FALSE))
  );
DROP POLICY IF EXISTS "paziente firma documento" ON patient_documents;
CREATE POLICY "paziente firma documento" ON patient_documents
  FOR UPDATE USING ((select auth.uid()) = patient_id) WITH CHECK ((select auth.uid()) = patient_id);

-- ── patient_files ──
DROP POLICY IF EXISTS "patient_files_collaborator_write" ON patient_files;
CREATE POLICY "patient_files_collaborator_write" ON patient_files
  FOR ALL USING ((user_id = get_studio_owner((select auth.uid()))) AND is_dietitian_level_collaborator((select auth.uid())))
  WITH CHECK ((user_id = get_studio_owner((select auth.uid()))) AND is_dietitian_level_collaborator((select auth.uid())));
DROP POLICY IF EXISTS "patient_files_dietitian_all" ON patient_files;
CREATE POLICY "patient_files_dietitian_all" ON patient_files
  FOR ALL USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);
DROP POLICY IF EXISTS "patient_files_collaborator_read" ON patient_files;
CREATE POLICY "patient_files_collaborator_read" ON patient_files
  FOR SELECT USING (user_id = get_studio_owner((select auth.uid())));

-- ── patient_signatures / patient_specialty_access (solo wrap) ──
DROP POLICY IF EXISTS "patient_signatures_dietitian_all" ON patient_signatures;
CREATE POLICY "patient_signatures_dietitian_all" ON patient_signatures
  FOR ALL USING ((select auth.uid()) = dietitian_id) WITH CHECK ((select auth.uid()) = dietitian_id);
DROP POLICY IF EXISTS "patient_signatures_patient_read" ON patient_signatures;
CREATE POLICY "patient_signatures_patient_read" ON patient_signatures
  FOR SELECT USING ((select auth.uid()) = patient_id);
DROP POLICY IF EXISTS "specialty_access_dietitian_manage" ON patient_specialty_access;
CREATE POLICY "specialty_access_dietitian_manage" ON patient_specialty_access
  FOR ALL USING (EXISTS (SELECT 1 FROM patient_dietitian pd WHERE pd.patient_id = patient_specialty_access.patient_id AND pd.dietitian_id = (select auth.uid())))
  WITH CHECK (EXISTS (SELECT 1 FROM patient_dietitian pd WHERE pd.patient_id = patient_specialty_access.patient_id AND pd.dietitian_id = (select auth.uid())));
DROP POLICY IF EXISTS "specialty_access_patient_read" ON patient_specialty_access;
CREATE POLICY "specialty_access_patient_read" ON patient_specialty_access
  FOR SELECT USING ((select auth.uid()) = patient_id);

-- ── patients ──
DROP POLICY IF EXISTS "patients_own" ON patients;
DROP POLICY IF EXISTS "users own data" ON patients;
CREATE POLICY "patients_own" ON patients
  FOR ALL USING ((select auth.uid()) = user_id);

-- ── patologie_custom ──
DROP POLICY IF EXISTS "Patologie proprie" ON patologie_custom;
DROP POLICY IF EXISTS "patologie_custom_own" ON patologie_custom;
CREATE POLICY "patologie_custom_own" ON patologie_custom
  FOR ALL USING ((select auth.uid()) = user_id);

-- ── percorsi_nutrizionali ──
DROP POLICY IF EXISTS "percorsi_dietitian_all" ON percorsi_nutrizionali;
CREATE POLICY "percorsi_dietitian_all" ON percorsi_nutrizionali
  FOR ALL USING (dietitian_id = (select auth.uid())) WITH CHECK (dietitian_id = (select auth.uid()));
DROP POLICY IF EXISTS "percorsi_nutrizionali_collaborator_write" ON percorsi_nutrizionali;
CREATE POLICY "percorsi_nutrizionali_collaborator_write" ON percorsi_nutrizionali
  FOR ALL USING ((dietitian_id = get_studio_owner((select auth.uid()))) AND is_dietitian_level_collaborator((select auth.uid())))
  WITH CHECK ((dietitian_id = get_studio_owner((select auth.uid()))) AND is_dietitian_level_collaborator((select auth.uid())));
DROP POLICY IF EXISTS "percorsi_nutrizionali_collaborator_read" ON percorsi_nutrizionali;
DROP POLICY IF EXISTS "percorsi_patient_read" ON percorsi_nutrizionali;
DROP POLICY IF EXISTS "percorsi_select_combined" ON percorsi_nutrizionali;
CREATE POLICY "percorsi_select_combined" ON percorsi_nutrizionali
  FOR SELECT USING ((dietitian_id = get_studio_owner((select auth.uid()))) OR (patient_id = (select auth.uid())));

-- ── piani (2 SELECT restano "authenticated"-only, non fuse con le altre 5 pubbliche) ──
DROP POLICY IF EXISTS "Utenti vedono solo i propri piani" ON piani;
DROP POLICY IF EXISTS "piani_dietitian_all" ON piani;
CREATE POLICY "piani_dietitian_all" ON piani
  FOR ALL USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);
DROP POLICY IF EXISTS "piani_collaborator_write" ON piani;
CREATE POLICY "piani_collaborator_write" ON piani
  FOR ALL USING ((user_id = get_studio_owner((select auth.uid()))) AND is_dietitian_level_collaborator((select auth.uid())))
  WITH CHECK ((user_id = get_studio_owner((select auth.uid()))) AND is_dietitian_level_collaborator((select auth.uid())));
-- "piani_own" NON va ricreata (stesso motivo di bia_records_own sopra).
DROP POLICY IF EXISTS "patients_read_piani_via_cartella" ON piani;
DROP POLICY IF EXISTS "paziente legge propri piani" ON piani;
DROP POLICY IF EXISTS "piani_collaborator_read" ON piani;
DROP POLICY IF EXISTS "piani_patient_select" ON piani;
DROP POLICY IF EXISTS "piani_select_patient_visible" ON piani;
DROP POLICY IF EXISTS "piani_select_combined" ON piani;
CREATE POLICY "piani_select_combined" ON piani
  FOR SELECT USING (
    (cartella_id IN (SELECT patient_dietitian.cartella_id FROM patient_dietitian WHERE patient_dietitian.patient_id = (select auth.uid())))
    OR ((visible_to_patient = true) AND (((select auth.uid()) = patient_id) OR (EXISTS (SELECT 1 FROM patient_dietitian pd WHERE pd.patient_id = (select auth.uid()) AND pd.cartella_id = piani.cartella_id))))
    OR (user_id = get_studio_owner((select auth.uid())))
    OR ((visible_to_patient = true) AND is_linked_patient(cartella_id))
  );
DROP POLICY IF EXISTS "piani_visibili_pazienti" ON piani;
DROP POLICY IF EXISTS "read_visible_piani" ON piani;
DROP POLICY IF EXISTS "piani_select_visible_authenticated" ON piani;
CREATE POLICY "piani_select_visible_authenticated" ON piani
  FOR SELECT TO authenticated USING (visible_to_patient = true);

-- ── piani_template ──
DROP POLICY IF EXISTS "piani_template_collaborator_write" ON piani_template;
CREATE POLICY "piani_template_collaborator_write" ON piani_template
  FOR ALL USING ((user_id = get_studio_owner((select auth.uid()))) AND is_dietitian_level_collaborator((select auth.uid())))
  WITH CHECK ((user_id = get_studio_owner((select auth.uid()))) AND is_dietitian_level_collaborator((select auth.uid())));
DROP POLICY IF EXISTS "template_own" ON piani_template;
CREATE POLICY "template_own" ON piani_template
  FOR ALL USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);
DROP POLICY IF EXISTS "piani_template_collaborator_read" ON piani_template;
DROP POLICY IF EXISTS "template_shared_read" ON piani_template;
DROP POLICY IF EXISTS "piani_template_select_combined" ON piani_template;
CREATE POLICY "piani_template_select_combined" ON piani_template
  FOR SELECT USING (
    (user_id = get_studio_owner((select auth.uid())))
    OR ((shared = true) AND (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = (select auth.uid()) AND profiles.role = 'dietitian')))
  );

-- ── profiles (fusione sicura ora che i segreti operativi/Stripe sono già
--    stati spostati fuori da questa tabella in SEZIONE 62) ──
DROP POLICY IF EXISTS "profiles_select_admin" ON profiles;
DROP POLICY IF EXISTS "profiles_select_group_co_members" ON profiles;
DROP POLICY IF EXISTS "profiles_select_linked_dietitians" ON profiles;
DROP POLICY IF EXISTS "profiles_select_linked_patients" ON profiles;
DROP POLICY IF EXISTS "profiles_select_own" ON profiles;
DROP POLICY IF EXISTS "profiles_select_studio_mates" ON profiles;
DROP POLICY IF EXISTS "profiles_select_combined" ON profiles;
CREATE POLICY "profiles_select_combined" ON profiles
  FOR SELECT USING (
    check_is_admin()
    OR (EXISTS (SELECT 1 FROM chat_group_members m1 JOIN chat_group_members m2 ON m1.group_id = m2.group_id WHERE m1.user_id = (select auth.uid()) AND m2.user_id = profiles.id))
    OR (EXISTS (SELECT 1 FROM patient_dietitian WHERE patient_dietitian.dietitian_id = profiles.id AND patient_dietitian.patient_id = (select auth.uid())))
    OR (EXISTS (SELECT 1 FROM patient_dietitian WHERE patient_dietitian.patient_id = profiles.id AND patient_dietitian.dietitian_id = get_studio_owner((select auth.uid()))))
    OR ((select auth.uid()) = id)
    OR (get_studio_owner(id) = get_studio_owner((select auth.uid())))
  );
DROP POLICY IF EXISTS "profiles_insert_own" ON profiles;
CREATE POLICY "profiles_insert_own" ON profiles
  FOR INSERT WITH CHECK ((select auth.uid()) = id);
DROP POLICY IF EXISTS "profiles_update_admin" ON profiles;
DROP POLICY IF EXISTS "profiles_update_own" ON profiles;
DROP POLICY IF EXISTS "profiles_update_combined" ON profiles;
CREATE POLICY "profiles_update_combined" ON profiles
  FOR UPDATE USING (check_is_admin() OR ((select auth.uid()) = id));

-- ── progress_photos ──
DROP POLICY IF EXISTS "progress_photos_own" ON progress_photos;
DROP POLICY IF EXISTS "utenti vedono le proprie foto" ON progress_photos;
CREATE POLICY "progress_photos_own" ON progress_photos
  FOR ALL USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);

-- ── public_foods (1 policy per comando, roles già authenticated: solo wrap) ──
DROP POLICY IF EXISTS "Owners can delete own public_foods" ON public_foods;
CREATE POLICY "Owners can delete own public_foods" ON public_foods
  FOR DELETE TO authenticated USING ((select auth.uid()) = created_by);
DROP POLICY IF EXISTS "Owners can update own public_foods" ON public_foods;
CREATE POLICY "Owners can update own public_foods" ON public_foods
  FOR UPDATE TO authenticated USING ((select auth.uid()) = created_by);
-- "Authenticated users can insert public_foods" (wc=true) e "All authenticated
-- users can read public_foods" (qual=true) invariate: nessun auth.* da avvolgere.

-- ── push_subscriptions — ATTENZIONE: "push_subscriptions_service_read" è
--    leggibile con qual=true da qualunque ruolo con grant sulla tabella, non
--    solo dal service role — segnalato come finding a parte, non corretto
--    qui (nessun auth.* da avvolgere comunque). ──
DROP POLICY IF EXISTS "own" ON push_subscriptions;
DROP POLICY IF EXISTS "push_subscriptions_own" ON push_subscriptions;
CREATE POLICY "push_subscriptions_own" ON push_subscriptions
  FOR ALL USING ((select auth.uid()) = user_id);

-- ── quiz_results (1 policy: solo wrap) ──
DROP POLICY IF EXISTS "own" ON quiz_results;
CREATE POLICY "own" ON quiz_results
  FOR ALL USING ((select auth.uid()) = user_id);

-- ── ricette ──
DROP POLICY IF EXISTS "elimina ricette" ON ricette;
CREATE POLICY "elimina ricette" ON ricette
  FOR DELETE USING ((select auth.uid()) = user_id);
DROP POLICY IF EXISTS "inserisci ricette" ON ricette;
CREATE POLICY "inserisci ricette" ON ricette
  FOR INSERT WITH CHECK ((select auth.uid()) = user_id);
DROP POLICY IF EXISTS "modifica ricette" ON ricette;
CREATE POLICY "modifica ricette" ON ricette
  FOR UPDATE USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);
DROP POLICY IF EXISTS "ricette_collaborator_write" ON ricette;
CREATE POLICY "ricette_collaborator_write" ON ricette
  FOR ALL USING ((user_id = get_studio_owner((select auth.uid()))) AND is_dietitian_level_collaborator((select auth.uid())))
  WITH CHECK ((user_id = get_studio_owner((select auth.uid()))) AND is_dietitian_level_collaborator((select auth.uid())));
DROP POLICY IF EXISTS "leggi ricette proprie e pubbliche" ON ricette;
DROP POLICY IF EXISTS "ricette_collaborator_read" ON ricette;
DROP POLICY IF EXISTS "ricette_select_combined" ON ricette;
CREATE POLICY "ricette_select_combined" ON ricette
  FOR SELECT USING (((select auth.uid()) = user_id) OR (is_public = true) OR (user_id = get_studio_owner((select auth.uid()))));

-- ── schede_valutazione ──
DROP POLICY IF EXISTS "Proprie schede" ON schede_valutazione;
DROP POLICY IF EXISTS "schede_valutazione_dietitian_all" ON schede_valutazione;
CREATE POLICY "schede_valutazione_dietitian_all" ON schede_valutazione
  FOR ALL USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);
DROP POLICY IF EXISTS "schede_valutazione_collaborator_write" ON schede_valutazione;
CREATE POLICY "schede_valutazione_collaborator_write" ON schede_valutazione
  FOR ALL USING ((user_id = get_studio_owner((select auth.uid()))) AND is_dietitian_level_collaborator((select auth.uid())))
  WITH CHECK ((user_id = get_studio_owner((select auth.uid()))) AND is_dietitian_level_collaborator((select auth.uid())));
-- "schede_valutazione_own" NON va ricreata (stesso motivo di bia_records_own sopra).
DROP POLICY IF EXISTS "paziente legge proprie schede" ON schede_valutazione;
DROP POLICY IF EXISTS "schede_valutazione_collaborator_read" ON schede_valutazione;
DROP POLICY IF EXISTS "schede_valutazione_patient_select" ON schede_valutazione;
DROP POLICY IF EXISTS "schede_valutazione_select_patient_visible" ON schede_valutazione;
DROP POLICY IF EXISTS "schede_valutazione_select_combined" ON schede_valutazione;
CREATE POLICY "schede_valutazione_select_combined" ON schede_valutazione
  FOR SELECT USING (
    ((visible_to_patient = true) AND (((select auth.uid()) = patient_id) OR (EXISTS (SELECT 1 FROM patient_dietitian pd WHERE pd.patient_id = (select auth.uid()) AND pd.cartella_id = schede_valutazione.cartella_id))))
    OR (user_id = get_studio_owner((select auth.uid())))
    OR ((visible_to_patient = true) AND (cartella_id IN (SELECT patient_dietitian.cartella_id FROM patient_dietitian WHERE patient_dietitian.patient_id = (select auth.uid()))))
    OR ((visible_to_patient = true) AND is_linked_patient(cartella_id))
  );

-- ── shared_recipes ──
DROP POLICY IF EXISTS "dietitian shares recipes" ON shared_recipes;
CREATE POLICY "dietitian shares recipes" ON shared_recipes
  FOR ALL USING ((select auth.uid()) = dietitian_id);
DROP POLICY IF EXISTS "shared_recipes_collaborator_write" ON shared_recipes;
CREATE POLICY "shared_recipes_collaborator_write" ON shared_recipes
  FOR ALL USING ((dietitian_id = get_studio_owner((select auth.uid()))) AND is_dietitian_level_collaborator((select auth.uid())))
  WITH CHECK ((dietitian_id = get_studio_owner((select auth.uid()))) AND is_dietitian_level_collaborator((select auth.uid())));
DROP POLICY IF EXISTS "patient reads received recipes" ON shared_recipes;
DROP POLICY IF EXISTS "shared_recipes_collaborator_read" ON shared_recipes;
DROP POLICY IF EXISTS "shared_recipes_select_combined" ON shared_recipes;
CREATE POLICY "shared_recipes_select_combined" ON shared_recipes
  FOR SELECT USING (((select auth.uid()) = patient_id) OR (dietitian_id = get_studio_owner((select auth.uid()))));
DROP POLICY IF EXISTS "patient marks viewed" ON shared_recipes;
CREATE POLICY "patient marks viewed" ON shared_recipes
  FOR UPDATE USING ((select auth.uid()) = patient_id) WITH CHECK ((select auth.uid()) = patient_id);

-- ── studio_collaborators / studio_members / usage_counters / user_achievements (solo wrap) ──
DROP POLICY IF EXISTS "studio_collaborators_titolare_manage" ON studio_collaborators;
CREATE POLICY "studio_collaborators_titolare_manage" ON studio_collaborators
  FOR ALL USING ((select auth.uid()) = titolare_id) WITH CHECK ((select auth.uid()) = titolare_id);
DROP POLICY IF EXISTS "studio_collaborators_collaborator_read" ON studio_collaborators;
CREATE POLICY "studio_collaborators_collaborator_read" ON studio_collaborators
  FOR SELECT USING ((select auth.uid()) = collaborator_id);
DROP POLICY IF EXISTS "admin_own" ON studio_members;
CREATE POLICY "admin_own" ON studio_members
  FOR ALL USING (((select auth.uid()) = admin_id) OR ((select auth.uid()) = member_id));
DROP POLICY IF EXISTS "usage_counters_own_read" ON usage_counters;
CREATE POLICY "usage_counters_own_read" ON usage_counters
  FOR SELECT USING (((select auth.uid()) = user_id) OR check_is_admin());
DROP POLICY IF EXISTS "user_achievements_own" ON user_achievements;
CREATE POLICY "user_achievements_own" ON user_achievements
  FOR ALL USING ((select auth.uid()) = user_id);

-- ── water_logs ──
DROP POLICY IF EXISTS "users see own data" ON water_logs;
DROP POLICY IF EXISTS "utenti vedono i propri dati" ON water_logs;
DROP POLICY IF EXISTS "water_logs_own" ON water_logs;
CREATE POLICY "water_logs_own" ON water_logs
  FOR ALL USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);
DROP POLICY IF EXISTS "water_logs_dietitian_read" ON water_logs;
CREATE POLICY "water_logs_dietitian_read" ON water_logs
  FOR SELECT USING (EXISTS (SELECT 1 FROM patient_dietitian pd WHERE pd.patient_id = water_logs.user_id AND pd.dietitian_id = (select auth.uid())));

-- ── weekly_checkins (solo wrap: FOR ALL + 1 SELECT, lasciate separate) ──
DROP POLICY IF EXISTS "weekly_checkins_own" ON weekly_checkins;
CREATE POLICY "weekly_checkins_own" ON weekly_checkins
  FOR ALL USING ((select auth.uid()) = user_id);
DROP POLICY IF EXISTS "weekly_checkins_dietitian_read" ON weekly_checkins;
CREATE POLICY "weekly_checkins_dietitian_read" ON weekly_checkins
  FOR SELECT USING (EXISTS (SELECT 1 FROM patient_dietitian WHERE patient_dietitian.patient_id = weekly_checkins.user_id AND patient_dietitian.dietitian_id = (select auth.uid())));

-- ── weight_logs ──
DROP POLICY IF EXISTS "utente gestisce proprio peso" ON weight_logs;
CREATE POLICY "utente gestisce proprio peso" ON weight_logs
  FOR ALL USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);
-- "weight_logs_own" NON va ricreata (stesso motivo di bia_records_own sopra).
DROP POLICY IF EXISTS "weight_logs_insert_patient" ON weight_logs;
CREATE POLICY "weight_logs_insert_patient" ON weight_logs
  FOR INSERT WITH CHECK (((select auth.uid()) = patient_id) AND (EXISTS (SELECT 1 FROM patient_dietitian WHERE patient_dietitian.patient_id = (select auth.uid()) AND patient_dietitian.cartella_id = weight_logs.cartella_id)));
DROP POLICY IF EXISTS "dietista legge peso pazienti" ON weight_logs;
DROP POLICY IF EXISTS "weight_logs_select_dietitian" ON weight_logs;
DROP POLICY IF EXISTS "weight_logs_select_patient" ON weight_logs;
DROP POLICY IF EXISTS "weight_logs_select_combined" ON weight_logs;
CREATE POLICY "weight_logs_select_combined" ON weight_logs
  FOR SELECT USING (
    (EXISTS (SELECT 1 FROM patient_dietitian pd WHERE pd.patient_id = weight_logs.user_id AND pd.dietitian_id = (select auth.uid())))
    OR (EXISTS (SELECT 1 FROM patient_dietitian WHERE patient_dietitian.dietitian_id = (select auth.uid()) AND patient_dietitian.cartella_id = weight_logs.cartella_id))
    OR (((select auth.uid()) = patient_id) OR (EXISTS (SELECT 1 FROM patient_dietitian WHERE patient_dietitian.patient_id = (select auth.uid()) AND patient_dietitian.cartella_id = weight_logs.cartella_id)))
  );
DROP POLICY IF EXISTS "weight_logs_update_patient" ON weight_logs;
CREATE POLICY "weight_logs_update_patient" ON weight_logs
  FOR UPDATE USING (((select auth.uid()) = patient_id) AND (EXISTS (SELECT 1 FROM patient_dietitian WHERE patient_dietitian.patient_id = (select auth.uid()) AND patient_dietitian.cartella_id = weight_logs.cartella_id)))
  WITH CHECK (((select auth.uid()) = patient_id) AND (EXISTS (SELECT 1 FROM patient_dietitian WHERE patient_dietitian.patient_id = (select auth.uid()) AND patient_dietitian.cartella_id = weight_logs.cartella_id)));

-- ── whatsapp_messages ──
DROP POLICY IF EXISTS "dietitian_own_whatsapp_messages" ON whatsapp_messages;
CREATE POLICY "dietitian_own_whatsapp_messages" ON whatsapp_messages
  FOR ALL USING ((select auth.uid()) = dietitian_id) WITH CHECK ((select auth.uid()) = dietitian_id);
DROP POLICY IF EXISTS "whatsapp_messages_collaborator_write" ON whatsapp_messages;
CREATE POLICY "whatsapp_messages_collaborator_write" ON whatsapp_messages
  FOR ALL USING ((dietitian_id = get_studio_owner((select auth.uid()))) AND is_dietitian_level_collaborator((select auth.uid())))
  WITH CHECK ((dietitian_id = get_studio_owner((select auth.uid()))) AND is_dietitian_level_collaborator((select auth.uid())));
DROP POLICY IF EXISTS "whatsapp_messages_collaborator_read" ON whatsapp_messages;
CREATE POLICY "whatsapp_messages_collaborator_read" ON whatsapp_messages
  FOR SELECT USING (dietitian_id = get_studio_owner((select auth.uid())));

INSERT INTO schema_migrations (id, note) VALUES
  ('sezione_65_perf_rls_bulk_cleanup', 'Pulizia performance su larga scala: auth.uid()/auth.role() avvolti in (select ...) su ~66 tabelle (fix auth_rls_initplan) + consolidamento di decine di policy permissive duplicate/sovrapposte sullo stesso comando in una sola (fix multiple_permissive_policies), nessun cambio di chi vede/scrive cosa. ESCLUSE patient_dietitian e patient_intake_forms: durante la raccolta dati è emerso che policy pericolose di SEZIONE 61 (paziente si auto-registra, Public read/update by token) risultano ANCORA ATTIVE sul database live nonostante il changelog le dia per rimosse — verificare urgentemente se SEZIONE 60/61 sono state davvero eseguite prima di qualunque altra modifica a queste 2 tabelle. Trovato anche un pattern sistemico su ~25 tabelle (collaborator_read senza is_dietitian_level_collaborator, stesso bug già corretto per lo storage in SEZIONE 63) non corretto qui, fuori scopo per una sezione di performance.')
ON CONFLICT (id) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════
-- SEZIONE 65b — FIX REGRESSIONE: la prima stesura di SEZIONE 65 aveva
-- ricreato 7 policy pericolose appena rimosse da SEZIONE 61
--
-- La raccolta dati per SEZIONE 65 ha letto lo stato del database PRIMA che
-- SEZIONE 61 venisse eseguita (le due sezioni sono state lanciate nella
-- stessa sessione ravvicinata) — di conseguenza SEZIONE 65 ha trattato
-- ncpt_own/bia_records_own/note_specialistiche_own/piani_own/
-- schede_valutazione_own/patient_documents_own/weight_logs_own (tutte FOR
-- ALL, auth.uid()=user_id-o-patient_id, SENZA WITH CHECK — le stesse
-- policy che davano al paziente scrittura completa sui propri dati
-- clinici, rimosse da SEZIONE 61) come policy legittime da "ottimizzare"
-- invece che da lasciare cancellate, ricreandole avvolte in (select
-- auth.uid()) ma altrettanto pericolose. Il file sorgente è già stato
-- corretto per non ricrearle più (i blocchi CREATE POLICY corrispondenti
-- sono stati rimossi da SEZIONE 65) — questa sezione ripete solo i DROP,
-- idempotenti, per riportare in linea un database su cui fosse già stata
-- eseguita la versione precedente (difettosa) di SEZIONE 65.
-- ═══════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "ncpt_own" ON ncpt;
DROP POLICY IF EXISTS "bia_records_own" ON bia_records;
DROP POLICY IF EXISTS "note_specialistiche_own" ON note_specialistiche;
DROP POLICY IF EXISTS "piani_own" ON piani;
DROP POLICY IF EXISTS "schede_valutazione_own" ON schede_valutazione;
DROP POLICY IF EXISTS "patient_documents_own" ON patient_documents;
DROP POLICY IF EXISTS "weight_logs_own" ON weight_logs;

INSERT INTO schema_migrations (id, note) VALUES
  ('sezione_65b_fix_regressione_own_policies', 'Ri-drop delle 7 policy _own pericolose (ncpt/bia_records/note_specialistiche/piani/schede_valutazione/patient_documents/weight_logs) reintrodotte per errore dalla prima stesura di SEZIONE 65 — vedi commento sopra')
ON CONFLICT (id) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════
-- SEZIONE 66 — FIX SICUREZZA: gap collaboratore "segretario" su 10 tabelle
-- + 3 policy residue che concedevano accesso a qualunque utente autenticato
--
-- Trovato continuando l'audit dopo SEZIONE 63 (stesso bug, lì corretto solo
-- per lo storage): 10 tabelle hanno una coppia "<tabella>_collaborator_write"
-- (FOR ALL, richiede correttamente is_dietitian_level_collaborator — esclude
-- i collaboratori "segretario" dai dati clinici/sensibili) e una
-- "<tabella>_collaborator_read" gemella SENZA quel controllo — un
-- collaboratore "segretario" non può scrivere ma può leggere. Tra le tabelle
-- coinvolte: esami_biochimici (esami clinici), patient_files, whatsapp_messages
-- (messaggi privati), patient_intake_forms (moduli anamnesi), diario_alimentare_foto.
-- Verificato via query diretta su pg_policies (join tra le coppie write/read
-- per is_dietitian_level_collaborator nel solo qual della write) — 10 coppie
-- trovate, non ~25 come stimato in SEZIONE 65 (quella era una stima
-- approssimativa dell'agente che aveva scritto SEZIONE 65).
--
-- Trovate anche 3 policy residue che concedevano accesso non ristretto,
-- verificate contro il codice reale prima di rimuoverle (nessun percorso
-- legittimo le usa, coperte da policy più strette già esistenti):
--   • diet_meals_own (FOR ALL, "auth.role()=authenticated", NESSUN controllo
--     di proprietà): un paziente qualunque avrebbe potuto modificare/
--     cancellare i pasti del piano di un altro paziente. pazienti.html
--     (unico inserimento reale, dietista) è già coperto da "dietista
--     gestisce pasti"; le letture lato paziente sono coperte da
--     diet_meals_select_own_diet.
--   • ecm_corsi_auth (FOR ALL, "auth.role()=authenticated"): qualunque
--     utente autenticato, incluso un paziente, avrebbe potuto alterare il
--     catalogo corsi ECM. admin.html (scrittura) è già coperto da
--     ecm_corsi_admin_write, ecm.html (sola lettura) da ecm_corsi_read_all.
--   • push_subscriptions_service_read (SELECT, qual=true, roles=public):
--     endpoint e chiavi di cifratura push di OGNI utente leggibili da
--     chiunque. Il nome suggerisce fosse pensata per il service role, che
--     però ignora comunque RLS (non gli serve una policy) — verificato che
--     l'unico lettore server-side reale (api/send-push.js, Diet-Plan-Pro-
--     app-claude) usa già la service role key, non l'anon/authenticated.
-- ═══════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "alimenti_custom_collaborator_read" ON alimenti_custom;
CREATE POLICY "alimenti_custom_collaborator_read" ON alimenti_custom
  FOR SELECT USING (user_id = get_studio_owner((select auth.uid())) AND is_dietitian_level_collaborator((select auth.uid())));

DROP POLICY IF EXISTS "broadcast_messages_collaborator_read" ON broadcast_messages;
CREATE POLICY "broadcast_messages_collaborator_read" ON broadcast_messages
  FOR SELECT USING (dietitian_id = get_studio_owner((select auth.uid())) AND is_dietitian_level_collaborator((select auth.uid())));

DROP POLICY IF EXISTS "diario_alimentare_foto_collaborator_read" ON diario_alimentare_foto;
CREATE POLICY "diario_alimentare_foto_collaborator_read" ON diario_alimentare_foto
  FOR SELECT USING (user_id = get_studio_owner((select auth.uid())) AND is_dietitian_level_collaborator((select auth.uid())));

DROP POLICY IF EXISTS "dietitian_profiles_collaborator_read" ON dietitian_profiles;
CREATE POLICY "dietitian_profiles_collaborator_read" ON dietitian_profiles
  FOR SELECT USING (dietitian_id = get_studio_owner((select auth.uid())) AND is_dietitian_level_collaborator((select auth.uid())));

DROP POLICY IF EXISTS "esami_biochimici_collaborator_read" ON esami_biochimici;
CREATE POLICY "esami_biochimici_collaborator_read" ON esami_biochimici
  FOR SELECT USING (user_id = get_studio_owner((select auth.uid())) AND is_dietitian_level_collaborator((select auth.uid())));

DROP POLICY IF EXISTS "pacchetti_collaborator_read" ON pacchetti;
CREATE POLICY "pacchetti_collaborator_read" ON pacchetti
  FOR SELECT USING (dietitian_id = get_studio_owner((select auth.uid())) AND is_dietitian_level_collaborator((select auth.uid())));

DROP POLICY IF EXISTS "patient_dietitian_collaborator_read" ON patient_dietitian;
CREATE POLICY "patient_dietitian_collaborator_read" ON patient_dietitian
  FOR SELECT USING (dietitian_id = get_studio_owner((select auth.uid())) AND is_dietitian_level_collaborator((select auth.uid())));

DROP POLICY IF EXISTS "patient_files_collaborator_read" ON patient_files;
CREATE POLICY "patient_files_collaborator_read" ON patient_files
  FOR SELECT USING (user_id = get_studio_owner((select auth.uid())) AND is_dietitian_level_collaborator((select auth.uid())));

DROP POLICY IF EXISTS "patient_intake_forms_collaborator_read" ON patient_intake_forms;
CREATE POLICY "patient_intake_forms_collaborator_read" ON patient_intake_forms
  FOR SELECT USING (dietitian_id = get_studio_owner((select auth.uid())) AND is_dietitian_level_collaborator((select auth.uid())));

DROP POLICY IF EXISTS "whatsapp_messages_collaborator_read" ON whatsapp_messages;
CREATE POLICY "whatsapp_messages_collaborator_read" ON whatsapp_messages
  FOR SELECT USING (dietitian_id = get_studio_owner((select auth.uid())) AND is_dietitian_level_collaborator((select auth.uid())));

DROP POLICY IF EXISTS "diet_meals_own" ON diet_meals;
DROP POLICY IF EXISTS "ecm_corsi_auth" ON ecm_corsi;
DROP POLICY IF EXISTS "push_subscriptions_service_read" ON push_subscriptions;

INSERT INTO schema_migrations (id, note) VALUES
  ('sezione_66_collaborator_read_gap_plus_residual_policies', 'Aggiunto is_dietitian_level_collaborator alle policy _collaborator_read di 10 tabelle (stesso bug di SEZIONE 63, qui a livello tabella) — segretari potevano leggere ma non scrivere dati clinici/sensibili. Rimosse anche 3 policy residue verificate come non necessarie (diet_meals_own e ecm_corsi_auth davano accesso a qualunque utente autenticato, push_subscriptions_service_read dava lettura pubblica di endpoint/chiavi push di ogni utente)')
ON CONFLICT (id) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════
-- SEZIONE 67 — FIX SICUREZZA: decrypt_text/encrypt_text erano un oracolo di
-- decifratura chiamabile da chiunque via RPC, bypassando la RLS
--
-- Trovato dall'advisor di sicurezza (anon/authenticated_security_definer_
-- function_executable): decrypt_text(bytea)/encrypt_text(text) — le funzioni
-- che il pilota di cifratura campi sensibili (cartelle.note, vedi
-- [[project_field_encryption]]) usa per decifrare/cifrare in modo
-- trasparente tramite la vista "cartelle" — avevano EXECUTE concesso a
-- PUBLIC (il default di Postgres alla creazione, mai revocato). Essendo
-- funzioni nello schema public, PostgREST le espone automaticamente come
-- /rest/v1/rpc/decrypt_text: qualunque utente autenticato poteva chiamarla
-- direttamente con QUALUNQUE blob cifrato e ottenere il testo in chiaro,
-- bypassando completamente la RLS di cartelle_raw — un secondo canale che
-- vanifica lo scopo della cifratura se un ciphertext altrui viene ottenuto
-- per qualunque altra via. _enc_key() (la funzione che legge la chiave da
-- Vault) non ha questo problema: verificato che ha zero grant PUBLIC.
--
-- Fix: la vista "cartelle" ha security_invoker=true (corretto, la RLS di
-- cartelle_raw resta quella di chi interroga) — questo significa che il
-- ruolo "authenticated" deve poter eseguire decrypt_text/encrypt_text
-- perché la vista (e i trigger INSTEAD OF che scrivono note_enc) funzionino,
-- quindi non si può semplicemente revocare l'EXECUTE. La soluzione standard
-- Supabase è spostare le funzioni fuori dallo schema "public" (che PostgREST
-- espone come RPC) nello schema "extensions" (già usato da pgcrypto stesso,
-- non esposto da PostgREST) — la vista e i trigger continuano a funzionare
-- perché referenziano la funzione col percorso completo, ma
-- /rest/v1/rpc/decrypt_text smette di esistere.
--
-- IMPORTANTE — verificare dopo aver eseguito: aprire una cartella con nota
-- clinica in pazienti.html e controllare che la nota si legga e si possa
-- salvare correttamente (lettura via vista "cartelle", scrittura via
-- trigger INSTEAD OF). Piano di rientro se qualcosa si rompe:
--   ALTER FUNCTION extensions.decrypt_text(bytea) SET SCHEMA public;
--   ALTER FUNCTION extensions.encrypt_text(text) SET SCHEMA public;
-- (poi ripristinare le definizioni di vista/trigger sotto usando
-- "public.decrypt_text"/"public.encrypt_text" invece di "extensions.").
-- ═══════════════════════════════════════════════════════════════════════════

ALTER FUNCTION public.decrypt_text(bytea) SET SCHEMA extensions;
ALTER FUNCTION public.encrypt_text(text) SET SCHEMA extensions;

REVOKE EXECUTE ON FUNCTION extensions.decrypt_text(bytea) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION extensions.encrypt_text(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION extensions.decrypt_text(bytea) TO authenticated;
GRANT EXECUTE ON FUNCTION extensions.encrypt_text(text) TO authenticated;

CREATE OR REPLACE VIEW public.cartelle
  WITH (security_invoker = true) AS
SELECT
  id, user_id, nome, cognome, ddn, sesso, codice_fiscale, telefono,
  tags, archived, gdpr_consenso, gdpr_consenso_at, created_at,
  extensions.decrypt_text(note_enc) AS note
FROM cartelle_raw;

CREATE OR REPLACE FUNCTION public.cartelle_view_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $$
DECLARE r public.cartelle_raw;
BEGIN
  INSERT INTO public.cartelle_raw
    (id, user_id, nome, cognome, ddn, sesso, codice_fiscale, telefono,
     tags, archived, gdpr_consenso, gdpr_consenso_at, created_at, note_enc)
  VALUES
    (COALESCE(NEW.id, gen_random_uuid()), NEW.user_id, NEW.nome, NEW.cognome, NEW.ddn, NEW.sesso,
     NEW.codice_fiscale, NEW.telefono, NEW.tags, COALESCE(NEW.archived, false),
     NEW.gdpr_consenso, NEW.gdpr_consenso_at, COALESCE(NEW.created_at, now()),
     extensions.encrypt_text(NEW.note))
  RETURNING * INTO r;
  NEW.id := r.id;
  NEW.created_at := r.created_at;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.cartelle_view_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $$
BEGIN
  UPDATE public.cartelle_raw SET
    nome = NEW.nome, cognome = NEW.cognome, ddn = NEW.ddn, sesso = NEW.sesso,
    codice_fiscale = NEW.codice_fiscale, telefono = NEW.telefono, tags = NEW.tags,
    archived = NEW.archived, gdpr_consenso = NEW.gdpr_consenso,
    gdpr_consenso_at = NEW.gdpr_consenso_at,
    note_enc = extensions.encrypt_text(NEW.note)
  WHERE id = OLD.id;
  RETURN NEW;
END;
$$;

INSERT INTO schema_migrations (id, note) VALUES
  ('sezione_67_fix_decrypt_encrypt_rpc_exposure', 'decrypt_text/encrypt_text spostate da public a extensions (non esposto da PostgREST) — erano chiamabili da chiunque via /rest/v1/rpc con qualunque blob cifrato, bypassando la RLS di cartelle_raw. Vista cartelle e trigger cartelle_view_insert/update aggiornati per referenziare extensions.decrypt_text/encrypt_text, EXECUTE concesso solo ad authenticated')
ON CONFLICT (id) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════
-- SEZIONE 68 — FIX SICUREZZA: patient_dietitian, INSERT/UPDATE senza
-- controllo di proprietà sulla cartella (variante del bug di SEZIONE 61) +
-- pulizia performance sulle stesse policy (rimaste escluse da SEZIONE 65)
--
-- Continuando la pulizia performance rimasta in sospeso su patient_dietitian
-- (escluso da SEZIONE 65 per il problema stale-read poi risolto), è emerso
-- che DUE policy FOR ALL ancora attive hanno lo stesso identico difetto della
-- policy "dietista crea relazioni" già rimossa in SEZIONE 61 (WITH CHECK
-- basato solo su auth.uid()=dietitian_id, NESSUN controllo che cartella_id
-- appartenga davvero a quel dietista/studio) — la SEZIONE 61 aveva trovato e
-- rimosso una policy con questo difetto, ma ne sono rimaste altre due con lo
-- stesso problema sotto nomi diversi, mai controllate insieme:
--
-- • patient_dietitian_dietitian_all (titolare): un dietista poteva INSERT/
--   UPDATE un patient_dietitian con dietitian_id=se stesso e QUALUNQUE
--   cartella_id, incluso quello di un paziente di un altro dietista —
--   ottenendo così una "relazione" usata altrove come prova di autorizzazione
--   per leggere i dati clinici di quel paziente.
-- • patient_dietitian_collaborator_write (collaboratore): stesso problema,
--   ma per un collaboratore di studio — poteva agganciare al proprio studio
--   la cartella di un paziente di QUALUNQUE altro dietista nel sistema
--   (non solo del proprio studio), verificato che nessun controllo su
--   cartella_id fosse presente.
--
-- Verificato via grep: l'unico INSERT reale (pazienti.html,
-- confermaCollegamento) è protetto solo lato client (l'utente sceglie la
-- cartella dalla propria UI) — la RLS è l'unica barriera reale contro una
-- chiamata diretta all'API che aggiri il client. Nessun UPDATE reale in
-- nessuno dei due repo: "dietista aggiorna relazioni" e la parte UPDATE di
-- _dietitian_all risultano inutilizzate, ma corrette comunque per coerenza
-- e sicurezza futura.
--
-- Fix: aggiunto lo stesso controllo già usato da patient_dietitian_insert_own
-- (cartella_id IS NULL OR appartiene a una cartella del dietista/studio) al
-- WITH CHECK di entrambe le policy — la USING resta invariata (leggere/
-- cancellare una riga già esistente dove si è già il dietitian_id non è a
-- rischio, il problema riguardava solo la creazione/modifica di nuove righe).
--
-- Consolidate anche le 5 policy SELECT in una sola (stesso pattern SEZIONE
-- 65): "accesso patient_dietitian" era un duplicato puro (stessa condizione
-- già coperta dalla policy combinata "public", quindi ridondante per
-- qualunque ruolo authenticated); rimosse "patient_dietitian_delete_own" e
-- "dietista aggiorna relazioni" perché ridondanti con _dietitian_all (DELETE
-- e UPDATE, stessa condizione). auth.uid() avvolto in (select ...) ovunque.
-- ═══════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "patient_dietitian_dietitian_all" ON patient_dietitian;
CREATE POLICY "patient_dietitian_dietitian_all" ON patient_dietitian
  FOR ALL
  USING ((select auth.uid()) = dietitian_id)
  WITH CHECK (
    (select auth.uid()) = dietitian_id
    AND (cartella_id IS NULL OR cartella_id IN (
      SELECT cartelle_raw.id FROM cartelle_raw WHERE cartelle_raw.user_id = (select auth.uid())
    ))
  );

DROP POLICY IF EXISTS "patient_dietitian_collaborator_write" ON patient_dietitian;
CREATE POLICY "patient_dietitian_collaborator_write" ON patient_dietitian
  FOR ALL
  USING ((dietitian_id = get_studio_owner((select auth.uid()))) AND is_dietitian_level_collaborator((select auth.uid())))
  WITH CHECK (
    (dietitian_id = get_studio_owner((select auth.uid())))
    AND is_dietitian_level_collaborator((select auth.uid()))
    AND (cartella_id IS NULL OR cartella_id IN (
      SELECT cartelle_raw.id FROM cartelle_raw WHERE cartelle_raw.user_id = get_studio_owner((select auth.uid()))
    ))
  );

DROP POLICY IF EXISTS "patient_dietitian_delete_own" ON patient_dietitian;
DROP POLICY IF EXISTS "dietista aggiorna relazioni" ON patient_dietitian;

DROP POLICY IF EXISTS "patient_dietitian_insert_own" ON patient_dietitian;
CREATE POLICY "patient_dietitian_insert_own" ON patient_dietitian
  FOR INSERT WITH CHECK (
    ((select auth.uid()) = dietitian_id)
    AND (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = (select auth.uid()) AND profiles.role = 'dietitian'))
    AND (cartella_id IS NULL OR cartella_id IN (
      SELECT cartelle_raw.id FROM cartelle_raw WHERE cartelle_raw.user_id = (select auth.uid())
    ))
  );

DROP POLICY IF EXISTS "accesso patient_dietitian" ON patient_dietitian;
DROP POLICY IF EXISTS "patient_dietitian_patient_select" ON patient_dietitian;
DROP POLICY IF EXISTS "patient_dietitian_select_own" ON patient_dietitian;
DROP POLICY IF EXISTS "visibile ai coinvolti" ON patient_dietitian;
DROP POLICY IF EXISTS "patient_dietitian_collaborator_read" ON patient_dietitian;
DROP POLICY IF EXISTS "patient_dietitian_select_combined" ON patient_dietitian;
CREATE POLICY "patient_dietitian_select_combined" ON patient_dietitian
  FOR SELECT USING (
    (select auth.uid()) = dietitian_id
    OR (select auth.uid()) = patient_id
    OR (dietitian_id = get_studio_owner((select auth.uid())) AND is_dietitian_level_collaborator((select auth.uid())))
  );

INSERT INTO schema_migrations (id, note) VALUES
  ('sezione_68_fix_patient_dietitian_cartella_check', 'Fix sicurezza: aggiunto controllo proprietà cartella_id al WITH CHECK di patient_dietitian_dietitian_all e _collaborator_write (stesso difetto della policy rimossa in SEZIONE 61, sopravvissuto sotto altri nomi) — un dietista o collaboratore poteva agganciare al proprio studio la cartella di un paziente altrui. Consolidate anche le 5 policy SELECT in una, rimosse 2 policy UPDATE/DELETE ridondanti, auth.uid() avvolto ovunque')
ON CONFLICT (id) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════
-- SEZIONE 69 — pulizia performance su patient_intake_forms (ultima tabella
-- rimasta esclusa da SEZIONE 65, verificato che non ha lo stesso problema di
-- patient_dietitian: non ha una colonna cartella_id da poter falsificare,
-- solo dietitian_id/patient_id diretti — nessun fix di sicurezza necessario
-- qui, solo avvolgere auth.uid() e rimuovere una policy diventata ridondante)
--
-- patient_intake_forms_collaborator_read (SELECT) è diventata un duplicato
-- puro di patient_intake_forms_collaborator_write (FOR ALL, stessa identica
-- condizione da quando SEZIONE 66 le ha allineate) — una policy FOR ALL
-- applica già il proprio USING anche a SELECT, quindi quella dedicata non
-- aggiunge alcun accesso in più. Rimossa.
-- ═══════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "Dietitian manages own intake forms" ON patient_intake_forms;
CREATE POLICY "Dietitian manages own intake forms" ON patient_intake_forms
  FOR ALL USING (dietitian_id = (select auth.uid()));

DROP POLICY IF EXISTS "patient_intake_forms_collaborator_write" ON patient_intake_forms;
CREATE POLICY "patient_intake_forms_collaborator_write" ON patient_intake_forms
  FOR ALL
  USING ((dietitian_id = get_studio_owner((select auth.uid()))) AND is_dietitian_level_collaborator((select auth.uid())))
  WITH CHECK ((dietitian_id = get_studio_owner((select auth.uid()))) AND is_dietitian_level_collaborator((select auth.uid())));

DROP POLICY IF EXISTS "patient_intake_forms_collaborator_read" ON patient_intake_forms;

INSERT INTO schema_migrations (id, note) VALUES
  ('sezione_69_perf_patient_intake_forms', 'Ultima tabella rimasta da SEZIONE 65: auth.uid() avvolto in (select ...), rimossa patient_intake_forms_collaborator_read diventata duplicato puro di _collaborator_write dopo SEZIONE 66. Verificato che patient_intake_forms non ha il problema di sicurezza di SEZIONE 68 (nessuna colonna cartella_id)')
ON CONFLICT (id) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════
-- SEZIONE 70 — FIX SICUREZZA CRITICO: qualunque dietista poteva leggere le
-- cartelle (nome, DDN, codice fiscale, telefono, nota clinica decifrata) di
-- QUALUNQUE altro dietista sulla piattaforma, senza alcun legame di studio
--
-- Trovato continuando l'audit dopo SEZIONE 68/69: "cartelle_select_combined"
-- (consolidata in SEZIONE 65 a partire da una policy preesistente "dietista
-- legge cartelle", mai documentata nel file — verosimilmente creata a mano
-- dal Dashboard Supabase in una sessione precedente, nessuna traccia in git)
-- ha un terzo ramo OR:
--   EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'dietitian')
-- che NON referenzia affatto la riga di cartelle_raw in esame — controlla
-- solo che CHI CHIAMA sia un dietista, condizione identica per ogni riga
-- della tabella. Risultato: qualunque account con role='dietitian' (soglia
-- banale da raggiungere, basta registrarsi) poteva leggere OGNI cartella di
-- OGNI paziente di OGNI altro dietista sulla piattaforma — inclusa la nota
-- clinica, decifrata in automatico dalla vista "cartelle" (SEZIONE 40/67).
--
-- Confronto con piani_template_select_combined (stesso "EXISTS ... role =
-- 'dietitian'" ma dentro "(shared = true) AND (...)"): lì è corretto, un
-- modello condiviso apposta con gli altri dietisti — la differenza è che
-- piani_template ha una colonna "shared" che ancora la condizione alla riga.
-- cartelle_raw non ha (e non deve avere) l'equivalente: le cartelle pazienti
-- non sono mai pensate per essere condivise fuori dal proprio studio.
--
-- Verificato via grep esaustivo (24 file, ogni singola chiamata
-- .from('cartelle')/.from('cartelle_raw') in entrambi i repo): tutte
-- filtrano già per studioOwnerId||currentUser.id — nessun percorso di
-- codice reale, nessuna funzione admin, nessun sistema di referral tra
-- dietisti dipende da questo accesso incrociato. Sicuro da rimuovere.
-- ═══════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "cartelle_select_combined" ON cartelle_raw;
CREATE POLICY "cartelle_select_combined" ON cartelle_raw
  FOR SELECT USING (
    (user_id = get_studio_owner((select auth.uid())))
    OR is_linked_patient(id)
  );

INSERT INTO schema_migrations (id, note) VALUES
  ('sezione_70_fix_cartelle_cross_dietitian_read', 'Fix sicurezza critico: rimosso da cartelle_select_combined un ramo OR non correlato alla riga (EXISTS(...role=''dietitian''), vero per qualunque dietista su qualunque riga) che permetteva a QUALUNQUE dietista di leggere le cartelle — inclusa la nota clinica decifrata — di QUALUNQUE altro dietista, senza legame di studio. Verificato via grep esaustivo che nessun codice reale dipenda da questo accesso incrociato')
ON CONFLICT (id) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════
-- SEZIONE 71 — FIX: find_dietitian_by_email() chiamabile da anonimi
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Trovato dall'advisor di sicurezza Supabase (get_advisors) durante l'audit
-- successivo alla SEZIONE 70: find_dietitian_by_email(p_email TEXT), pur
-- avendo GRANT EXECUTE ... TO authenticated esplicito, restava comunque
-- chiamabile anche da anon/utenti non loggati — Postgres concede EXECUTE a
-- PUBLIC su ogni funzione per default alla creazione, e il GRANT esplicito
-- ad "authenticated" non revoca quel grant implicito (stesso difetto già
-- corretto per extensions.decrypt_text/encrypt_text in SEZIONE 67).
--
-- Impatto: chiunque, senza account, poteva enumerare email e scoprire se
-- appartengono a un account dietista approvato, ottenendone nome e cognome —
-- nessun dato clinico o paziente, ma un'enumerazione di indirizzi email +
-- nome reale, non necessaria per la funzione (usata SOLO in
-- impostazioni.html → addCollaborator(), dietro login dietista, per
-- collegare un collaboratore di studio via email — verificato via grep
-- esaustivo su entrambi i repo: nessun altro chiamante, mai usata
-- nell'app paziente).
--
-- Fix: REVOKE EXECUTE FROM PUBLIC (chiude l'accesso anonimo) + guardia
-- esplicita nel corpo della funzione che richiede a chi chiama di essere
-- già un account dietista approvato (stesso stile di guardia già usato in
-- delete_own_dietitian_account) — così anche un paziente autenticato non
-- può più usarla, coerente con l'unico utilizzo reale della funzione.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION find_dietitian_by_email(p_email TEXT)
RETURNS TABLE(id UUID, nome TEXT, cognome TEXT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.id, p.nome, p.cognome
  FROM profiles p
  WHERE p.email = p_email AND p.role = 'dietitian' AND p.approved = true
    AND EXISTS (
      SELECT 1 FROM profiles caller
      WHERE caller.id = auth.uid() AND caller.role = 'dietitian' AND caller.approved = true
    )
  LIMIT 1;
$$;

REVOKE EXECUTE ON FUNCTION find_dietitian_by_email(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION find_dietitian_by_email(TEXT) TO authenticated;

INSERT INTO schema_migrations (id, note) VALUES
  ('sezione_71_fix_find_dietitian_by_email_anon', 'Fix sicurezza: find_dietitian_by_email() era chiamabile da anon nonostante il GRANT esplicito a authenticated (il GRANT a PUBLIC di default alla creazione non viene mai revocato automaticamente — stesso difetto di SEZIONE 67). Permetteva enumerazione email/nome di dietisti approvati senza login. Aggiunta REVOKE EXECUTE FROM PUBLIC + guardia nel corpo che richiede a chi chiama di essere un dietista approvato, coerente con l''unico uso reale (impostazioni.html addCollaborator, dietro login dietista)')
ON CONFLICT (id) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════
-- SEZIONE 72 — CORREZIONE: REVOKE FROM PUBLIC non basta, serve REVOKE FROM anon
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Verificando lo stato live dopo la SEZIONE 71 (pg_proc.proacl), find_dietitian_
-- by_email() risultava ANCORA eseguibile da anon: "REVOKE EXECUTE ... FROM
-- PUBLIC" revoca solo il grant implicito che Postgres concede a PUBLIC alla
-- creazione di una funzione, ma questo progetto Supabase concede ANCHE un
-- grant ESPLICITO e diretto ad anon/authenticated/service_role su ogni
-- funzione dello schema public al momento della creazione (proacl mostrava
-- "anon=X/postgres" come voce a sé, non ereditata da PUBLIC) — un REVOKE
-- da PUBLIC non tocca un grant esplicito separato fatto a un ruolo specifico.
-- Stesso identico difetto verificato anche su extensions.decrypt_text/
-- encrypt_text (SEZIONE 67): anon ha ancora il grant esplicito lì.
--
-- Severità reale invariata: find_dietitian_by_email() resta comunque
-- innocua per anon grazie alla guardia aggiunta nel corpo in SEZIONE 71
-- (auth.uid() è NULL per anon, quindi la EXISTS sul chiamante fallisce
-- sempre — zero risultati, nessuna enumerazione possibile). decrypt_text/
-- encrypt_text restano innocue perché extensions non è tra gli schemi
-- esposti da PostgREST (nessuna rotta /rest/v1/rpc/... le raggiunge) e un
-- client browser non ha mai accesso diretto al protocollo Postgres. Questa
-- sezione chiude comunque il gap sui permessi per allineare l'ACL reale a
-- quanto dichiarato nelle sezioni precedenti (difesa in profondità).
-- ═══════════════════════════════════════════════════════════════════════════

REVOKE EXECUTE ON FUNCTION find_dietitian_by_email(TEXT) FROM anon;
REVOKE EXECUTE ON FUNCTION extensions.decrypt_text(bytea) FROM anon;
REVOKE EXECUTE ON FUNCTION extensions.encrypt_text(text) FROM anon;

INSERT INTO schema_migrations (id, note) VALUES
  ('sezione_72_fix_explicit_anon_grants_not_public', 'Correzione: REVOKE EXECUTE FROM PUBLIC (SEZIONE 67 e 71) non basta quando esiste anche un grant esplicito diretto ad anon (verificato via pg_proc.proacl) — questo progetto concede grant espliciti per ruolo alla creazione di ogni funzione, non solo il grant implicito a PUBLIC. Aggiunto REVOKE EXECUTE ... FROM anon esplicito su find_dietitian_by_email/decrypt_text/encrypt_text. Nessuna delle tre era comunque sfruttabile nel frattempo (guardia nel corpo per la prima, extensions non esposto da PostgREST per le altre due), ma l''ACL ora riflette correttamente l''intento dichiarato')
ON CONFLICT (id) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════
-- SEZIONE 73 — chat_messages: aggiunta dietitian_id per evitare lettura
-- incrociata della chat se un paziente ha più dietisti indipendenti
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Scoperto continuando l'audit dopo la SEZIONE 72: chat_messages non ha MAI
-- avuto una colonna che leghi un messaggio a UNO specifico dietista — solo
-- patient_id. Le policy RLS attuali concedono lettura a "qualunque dietista
-- collegato a questo paziente" (EXISTS su patient_dietitian), il che è
-- corretto quando un paziente ha un solo studio (titolare + collaboratori,
-- che condividono legittimamente l'accesso), ma NON quando un paziente è
-- collegato a due dietisti INDIPENDENTI (studi diversi) — scenario reale e
-- già possibile oggi tramite confermaCollegamento() in pazienti.html, che
-- permette a un dietista di collegare qualunque account paziente esistente
-- al proprio studio. In quel caso il secondo dietista potrebbe leggere
-- l'intera chat scambiata con il primo, senza alcun legame con quei messaggi.
--
-- Verificato via query diretta: OGGI nessun paziente ha 2+ dietitian_id
-- distinti in patient_dietitian (0 righe), quindi il rischio non si è ancora
-- concretizzato — ma è strutturale e latente, non richiede altro che un
-- singolo collegamento futuro per attivarsi.
--
-- Fix in due parti:
-- 1) Questa SEZIONE (SQL, retrocompatibile, non richiede modifiche urgenti
--    al codice JS): aggiunge dietitian_id, lo retro-popola per le righe
--    esistenti (sicuro e univoco oggi, verificato sopra), aggiorna le due
--    policy che concedono accesso "a qualunque dietista collegato" perché
--    richiedano ANCHE dietitian_id IS NULL (righe storiche, nessun rischio
--    dato il backfill) OR dietitian_id = lo specifico dietista/studio che
--    legge — senza rompere l'invio/lettura attuale, dato che il codice JS
--    non passa ancora dietitian_id negli insert (la colonna resta NULL per
--    i nuovi messaggi finché non viene aggiornato il codice).
-- 2) Un secondo giro (JS, SEZIONE successiva) aggiornerà tutti i punti che
--    fanno insert su chat_messages (chat.html, broadcast.html,
--    patient-portal.html lato dietista; ChatPage.jsx, CheckinPage.jsx,
--    DietPage.jsx lato paziente) per valorizzare dietitian_id sempre —
--    da spedire SOLO dopo che questa SEZIONE risulta eseguita, per non
--    rompere l'invio messaggi nel frattempo (stesso ordine "SQL prima, poi
--    codice dipendente" seguito per ogni SEZIONE di questa sessione).
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS dietitian_id UUID REFERENCES auth.users(id);

UPDATE chat_messages cm
SET dietitian_id = pd.dietitian_id
FROM patient_dietitian pd
WHERE pd.patient_id = cm.patient_id
  AND cm.dietitian_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_chat_messages_dietitian_id ON chat_messages(dietitian_id);

DROP POLICY IF EXISTS "chat visibile ai coinvolti" ON chat_messages;
CREATE POLICY "chat visibile ai coinvolti" ON chat_messages
  FOR ALL USING (
    (patient_id = (select auth.uid()))
    OR (
      EXISTS (
        SELECT 1 FROM patient_dietitian pd
        WHERE pd.patient_id = chat_messages.patient_id
          AND pd.dietitian_id = get_studio_owner((select auth.uid()))
      )
      AND (dietitian_id IS NULL OR dietitian_id = get_studio_owner((select auth.uid())))
    )
  )
  WITH CHECK (
    (patient_id = (select auth.uid()))
    OR (
      EXISTS (
        SELECT 1 FROM patient_dietitian pd
        WHERE pd.patient_id = chat_messages.patient_id
          AND pd.dietitian_id = get_studio_owner((select auth.uid()))
      )
      AND (dietitian_id IS NULL OR dietitian_id = get_studio_owner((select auth.uid())))
    )
  );

DROP POLICY IF EXISTS "chat_messages_select_visible" ON chat_messages;
CREATE POLICY "chat_messages_select_visible" ON chat_messages
  FOR SELECT USING (
    (
      (patient_id = (select auth.uid()))
      OR (
        EXISTS (
          SELECT 1 FROM patient_dietitian pd
          WHERE pd.patient_id = chat_messages.patient_id
            AND pd.dietitian_id = get_studio_owner((select auth.uid()))
        )
        AND (dietitian_id IS NULL OR dietitian_id = get_studio_owner((select auth.uid())))
      )
    )
    AND (status = 'sent' OR sender_id = (select auth.uid()))
  );

INSERT INTO schema_migrations (id, note) VALUES
  ('sezione_73_chat_messages_dietitian_id', 'Aggiunta chat_messages.dietitian_id (nullable, retro-popolata dalle relazioni patient_dietitian esistenti — verificato 0 pazienti con 2+ dietisti oggi, backfill univoco e sicuro). Aggiornate le policy "chat visibile ai coinvolti" e "chat_messages_select_visible" per richiedere dietitian_id IS NULL (righe storiche) OR dietitian_id = lo studio di chi legge, invece del solo "qualunque dietista collegato al paziente". Chiude una lettura incrociata della chat, oggi non ancora sfruttabile (nessun paziente con relazioni multiple) ma strutturalmente possibile dato che pazienti.html permette di collegare qualunque account paziente esistente a un nuovo studio. Il codice JS che valorizza dietitian_id sui nuovi messaggi arriva in una sezione/commit separato, da spedire solo a migrazione confermata eseguita')
ON CONFLICT (id) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════
-- SEZIONE 74 — FIX: log_clinical_change() etichettava il DIETISTA come
-- "patient_id" nel registro di audit clinico per alcune tabelle
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Continuando l'audit sul lato database (trigger/funzioni non ancora
-- riverificati, dopo l'estesa revisione RLS delle sezioni precedenti):
-- log_clinical_change() (il trigger AFTER su 12 tabelle cliniche) usa
--   COALESCE(NULLIF(patient_id,''), NULLIF(user_id,''))
-- per popolare clinical_audit_log.patient_id — assumendo che, in assenza di
-- una colonna patient_id, "user_id" identifichi comunque il paziente.
--
-- Falso per esami_biochimici e liste_spesa: verificato via pg_policies che
-- la loro colonna user_id è il DIETISTA (policy "esami_biochimici_dietitian_
-- all"/"liste_spesa_dietitian_all": auth.uid() = user_id), non il paziente
-- — hanno solo cartella_id per identificare il paziente, già gestito
-- correttamente dal CASE esistente. Stesso problema per cartelle_raw (solo
-- user_id = dietista, nessuna colonna patient_id: molte cartelle non hanno
-- nemmeno un account paziente collegato).
--
-- Effetto: ogni voce di clinical_audit_log per queste 3 tabelle registrava
-- silenziosamente l'id del DIETISTA nel campo pensato per identificare IL
-- PAZIENTE — un registro di audit clinico/GDPR che risponde male alla
-- domanda che dovrebbe rispondere ("cosa è cambiato sui dati di QUESTO
-- paziente"). Le altre 9 tabelle con questo trigger hanno tutte una vera
-- colonna patient_id (bia_records, ncpt, note_specialistiche, schede_
-- valutazione, chat_messages, patient_documents) o un user_id che è
-- genuinamente il paziente (menstrual_cycle, patient_diets — dati
-- paziente-owned, verificato via pg_policies) — non affette.
--
-- Fix: rimosso il fallback a user_id. Se una tabella non ha una vera
-- colonna patient_id, il campo resta NULL (onesto: "non tracciato a
-- questo livello di granularità") invece di riportare un id sbagliato.
-- Storico NON corretto retroattivamente (un registro di audit non va
-- riscritto silenziosamente) — se serve, è una decisione separata.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION log_clinical_change()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
    -- SEZIONE 74: NIENTE fallback a user_id — su esami_biochimici/
    -- liste_spesa/cartelle_raw user_id è il dietista, non il paziente.
    NULLIF(v_row->>'patient_id','')::uuid,
    CASE WHEN TG_TABLE_NAME IN ('cartelle','cartelle_raw') THEN (v_row->>'id')::uuid
         ELSE NULLIF(v_row->>'cartella_id','')::uuid END
  );

  RETURN NULL;
END;
$$;

INSERT INTO schema_migrations (id, note) VALUES
  ('sezione_74_fix_log_clinical_change_patient_id', 'Fix correttezza registro audit clinico: log_clinical_change() usava COALESCE(patient_id, user_id) per clinical_audit_log.patient_id, ma su esami_biochimici/liste_spesa/cartelle_raw user_id è il DIETISTA (verificato via pg_policies: policy "..._dietitian_all" con auth.uid()=user_id), non il paziente — ogni voce di audit per queste 3 tabelle registrava l''id del dietista nel campo "patient_id". Rimosso il fallback: resta NULL quando non c''è una vera colonna patient_id, invece di riportare un id sbagliato. Storico non corretto retroattivamente')
ON CONFLICT (id) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════
-- SEZIONE 75 — FIX SICUREZZA: chiave service_role in chiaro nei trigger di
-- notifica webhook (notify-chat-message, notify-diet-update, notify-document)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Scoperto continuando l'audit lato database: questi 3 trigger AFTER INSERT/
-- UPDATE (su chat_messages, patient_diets, patient_documents) sono stati
-- creati a mano dal Dashboard Supabase (nessuna traccia in git) usando
-- supabase_functions.http_request(url, method, headers, params, timeout) —
-- il wrapper legacy dei Database Webhook che richiede gli header, incluso
-- "Authorization: Bearer <service_role JWT>", come ARGOMENTO LETTERALE del
-- trigger. Risultato: pg_get_triggerdef()/information_schema.triggers
-- espongono in chiaro un JWT service_role valido 10 anni (bypassa OGNI RLS)
-- a chiunque abbia accesso diretto al database (dashboard, stringa di
-- connessione, backup) — non raggiungibile dall'app (PostgREST non espone
-- pg_catalog/information_schema a anon/authenticated) e non presente nella
-- cronologia git di questo file, ma comunque un debito di sicurezza reale.
--
-- Fix: sostituisce supabase_functions.http_request con pg_net.http_post
-- dentro una funzione wrapper che legge il secret da Supabase Vault A OGNI
-- CHIAMATA (mai scritto nella definizione del trigger, mai in questo file
-- committato — il valore stesso viene generato casualmente dalla SQL
-- sotto, non hardcoded). Payload ricostruito identico a quello che
-- supabase_functions.http_request generava in automatico
-- ({type, table, schema, record, old_record}), verificato contro
-- notify-on-event/index.ts (Diet-Plan-Pro-app-claude) che lo consuma.
--
-- notify-on-event già supporta nativamente un secret DEDICATO e separato
-- dalla service_role per l'autenticazione del webhook (variabile
-- WEBHOOK_TOKEN, vedi il file — nessuna modifica lato Edge Function
-- necessaria): dopo aver eseguito questa sezione, il valore generato nel
-- Vault va impostato come secret WEBHOOK_TOKEN della funzione
-- notify-on-event (`supabase secrets set WEBHOOK_TOKEN=<valore>` o da
-- Dashboard), sostituendo la dipendenza dalla service_role key.
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM vault.decrypted_secrets WHERE name = 'notify_on_event_webhook_token') THEN
    PERFORM vault.create_secret(
      encode(gen_random_bytes(32), 'hex'),
      'notify_on_event_webhook_token',
      'Segreto condiviso per i trigger webhook chat_messages/patient_diets/patient_documents verso la Edge Function notify-on-event (Diet-Plan-Pro-app-claude). Va impostato come secret WEBHOOK_TOKEN della funzione dopo l''esecuzione di SEZIONE 75.'
    );
  END IF;
END $$;

CREATE OR REPLACE FUNCTION notify_on_event_webhook()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_token TEXT;
BEGIN
  SELECT decrypted_secret INTO v_token
  FROM vault.decrypted_secrets
  WHERE name = 'notify_on_event_webhook_token';

  IF v_token IS NOT NULL THEN
    PERFORM net.http_post(
      url := 'https://hvdwqowkhutfsdpiubxe.supabase.co/functions/v1/notify-on-event',
      body := jsonb_build_object(
        'type', TG_OP,
        'table', TG_TABLE_NAME,
        'schema', TG_TABLE_SCHEMA,
        'record', CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE to_jsonb(NEW) END,
        'old_record', CASE WHEN TG_OP IN ('UPDATE','DELETE') THEN to_jsonb(OLD) ELSE NULL END
      ),
      headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_token),
      timeout_milliseconds := 5000
    );
  END IF;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS "notify-chat-message" ON chat_messages;
CREATE TRIGGER "notify-chat-message" AFTER INSERT ON chat_messages
  FOR EACH ROW EXECUTE FUNCTION notify_on_event_webhook();

DROP TRIGGER IF EXISTS "notify-diet-update" ON patient_diets;
CREATE TRIGGER "notify-diet-update" AFTER INSERT OR UPDATE ON patient_diets
  FOR EACH ROW EXECUTE FUNCTION notify_on_event_webhook();

DROP TRIGGER IF EXISTS "notify-document" ON patient_documents;
CREATE TRIGGER "notify-document" AFTER INSERT ON patient_documents
  FOR EACH ROW EXECUTE FUNCTION notify_on_event_webhook();

INSERT INTO schema_migrations (id, note) VALUES
  ('sezione_75_fix_webhook_triggers_service_role_leak', 'Fix sicurezza: i trigger notify-chat-message/notify-diet-update/notify-document (creati a mano dal Dashboard, nessuna traccia in git) usavano supabase_functions.http_request con un JWT service_role (valido 10 anni, bypassa ogni RLS) scritto in chiaro come argomento del trigger — visibile via pg_get_triggerdef()/information_schema.triggers a chiunque avesse accesso diretto al database. Non raggiungibile dall''app (PostgREST non espone pg_catalog), ma debito di sicurezza reale. Sostituito con pg_net.http_post dentro un wrapper che legge un secret dedicato da Supabase Vault ad ogni chiamata (mai nella definizione del trigger, mai in questo file). Il secret è generato casualmente dalla SQL stessa, mai hardcoded. Va impostato come WEBHOOK_TOKEN nei secret della Edge Function notify-on-event (che lo supporta già nativamente) dopo l''esecuzione di questa sezione')
ON CONFLICT (id) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════
-- SEZIONE 76 — FIX AFFIDABILITÀ CRITICO: le RPC di creazione profilo alla
-- registrazione ingoiavano silenziosamente QUALUNQUE errore
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Continuando l'audit lato database: create_patient_profile() e create_
-- profile_for_new_user() sono, dalla SEZIONE 52/58, l'UNICO meccanismo che
-- crea la riga profiles alla registrazione — verificato che NON esiste più
-- alcun trigger su auth.users (rimosso, come già documentato nei commenti
-- del codice chiamante in AuthContext.jsx/index.html). Entrambe le funzioni
-- però avevano un blocco "EXCEPTION WHEN OTHERS THEN NULL" che ingoia
-- QUALUNQUE errore imprevisto durante l'INSERT (non solo il conflitto già
-- gestito correttamente da ON CONFLICT DO UPDATE) — se qualcosa va storto
-- (una futura colonna NOT NULL senza default, un vincolo violato, un lag
-- di replica sulla foreign key verso auth.users), la RPC ritorna comunque
-- "successo" al chiamante, l'utente risulta registrato in auth.users ma
-- SENZA alcuna riga in profiles, e non c'è alcun errore da nessuna parte
-- (né nei log della funzione, né nel client) per capire perché — l'esatto
-- bug che la SEZIONE 58 era nata per risolvere, reintrodotto silenziosamente
-- dal proprio meccanismo di sicurezza.
--
-- Fix: rimosso il blocco EXCEPTION. ON CONFLICT DO UPDATE resta la sola
-- protezione necessaria (rende la funzione già sicura da richiamare più
-- volte); qualunque altro errore ora si propaga al chiamante invece di
-- sparire. Aggiornato anche il codice JS che chiama queste RPC (index.html,
-- AuthContext.jsx — commit separato) per controllare l'errore invece di
-- ignorarlo, così un fallimento reale mostra un messaggio invece di un
-- falso "registrazione completata".
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION create_patient_profile(uid UUID, user_email TEXT, p_full_name TEXT, p_first_name TEXT, p_last_name TEXT, terms_accepted BOOLEAN DEFAULT false)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, first_name, last_name, role, terms_accepted_at)
  VALUES (uid, user_email, p_full_name, p_first_name, p_last_name, 'patient',
          CASE WHEN terms_accepted THEN NOW() ELSE NULL END)
  ON CONFLICT (id) DO UPDATE SET
    full_name  = COALESCE(EXCLUDED.full_name,  profiles.full_name),
    first_name = COALESCE(EXCLUDED.first_name, profiles.first_name),
    last_name  = COALESCE(EXCLUDED.last_name,  profiles.last_name),
    terms_accepted_at = COALESCE(profiles.terms_accepted_at, EXCLUDED.terms_accepted_at);
END;
$$;

CREATE OR REPLACE FUNCTION create_profile_for_new_user(uid UUID, user_email TEXT, terms_accepted BOOLEAN DEFAULT false)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, email, approved, is_admin, terms_accepted_at)
  VALUES (uid, user_email, false, false, CASE WHEN terms_accepted THEN NOW() ELSE NULL END)
  ON CONFLICT (id) DO UPDATE SET
    terms_accepted_at = COALESCE(profiles.terms_accepted_at, EXCLUDED.terms_accepted_at);
END;
$$;

INSERT INTO schema_migrations (id, note) VALUES
  ('sezione_76_fix_signup_rpc_swallowed_exceptions', 'Fix affidabilità critico: create_patient_profile()/create_profile_for_new_user() — uniche funzioni che creano la riga profiles alla registrazione, dato che il trigger su auth.users non esiste più — avevano EXCEPTION WHEN OTHERS THEN NULL, che ingoiava qualunque errore imprevisto durante l''INSERT lasciando l''utente con un account auth.users ma nessun profilo, senza errore da nessuna parte. Rimosso il blocco: ON CONFLICT DO UPDATE resta l''unica protezione necessaria (idempotente per design), gli errori reali ora si propagano al chiamante')
ON CONFLICT (id) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════
-- SEZIONE 77 — FIX SICUREZZA CRITICO: policy RLS residua "chat_messages_own"
-- vanificava il filtro status='sent' dei messaggi programmati
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Stesso pattern già visto in SEZIONE 61 (policy permissive residue che
-- sopravvivono accanto a policy più corrette e ne vanificano la restrizione,
-- perché Postgres unisce le policy permissive in OR — la più larga vince).
--
-- chat_messages ha oggi 3 policy:
--   1) "chat visibile ai coinvolti" (FOR ALL) — corretta, con vincolo
--      dietitian_id da SEZIONE 73.
--   2) "chat_messages_select_visible" (FOR SELECT) — corretta, aggiunge
--      "AND (status='sent' OR sender_id=me)" per nascondere ai destinatari
--      i messaggi programmati non ancora inviati (funzionalità "Programma
--      invio" di chat.html).
--   3) "chat_messages_own" (FOR ALL, USING "sender_id=me OR patient_id=me",
--      NESSUN filtro status) — residuo di un'iterazione precedente del
--      modello di permessi, mai rimosso. Essendo FOR ALL si applica ANCHE
--      a SELECT, e concede lettura al paziente (patient_id=me) a
--      PRESCINDERE dallo status — quindi un messaggio con status='scheduled'
--      diventa comunque leggibile dal paziente tramite questa policy, anche
--      se "chat_messages_select_visible" lo nascondeva correttamente.
--      Risultato concreto: i messaggi che il dietista programma per un
--      orario futuro (chat.html, "📅 Programma invio") sono visibili al
--      paziente SUBITO, non all'ora prevista — la funzionalità di
--      programmazione non protegge la privacy come inteso.
--
-- Verificato prima di rimuovere: "chat_messages_own" è un sottoinsieme di
-- "chat visibile ai coinvolti" per ogni caso d'uso reale.
--   - Lettura/scrittura come paziente (patient_id=me): già coperta
--     identicamente da "chat visibile ai coinvolti" (patient_id=me).
--   - Lettura/scrittura come dietista (sender_id=me): già coperta da
--     "chat visibile ai coinvolti" tramite la relazione patient_dietitian +
--     dietitian_id — verificato che l'INSERT di un dietista non valorizza
--     dietitian_id (resta NULL, il codice JS di scrittura dietitian_id
--     annunciato in SEZIONE 73 non è ancora stato spedito), quindi la
--     condizione "dietitian_id IS NULL" della policy corretta è sempre
--     soddisfatta oggi per i nuovi messaggi dietista.
-- Nessun percorso di codice reale (grep esaustivo di .from('chat_messages')
-- in chat.html, broadcast.html, patient-portal.html, ChatPage.jsx,
-- CheckinPage.jsx, DietPage.jsx) dipende da un caso coperto SOLO da
-- "chat_messages_own" e non dalle altre due.
--
-- IMPORTANTE — verificare dopo aver eseguito: aprire chat.html, programmare
-- un messaggio per qualche minuto nel futuro, controllare che NON compaia
-- subito nell'app paziente (ChatPage.jsx) e che compaia solo dopo l'orario
-- programmato (o dopo l'invio manuale, se il job che marca status='sent'
-- non è ancora schedulato). Controllare anche che l'invio normale (non
-- programmato) e la ricezione di messaggi vocali/foto continuino a
-- funzionare su entrambi i lati.
-- Piano di rientro se qualcosa si rompe:
--   CREATE POLICY "chat_messages_own" ON chat_messages FOR ALL
--     USING ((select auth.uid()) = sender_id OR (select auth.uid()) = patient_id);
-- ═══════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "chat_messages_own" ON chat_messages;

INSERT INTO schema_migrations (id, note) VALUES
  ('sezione_77_fix_chat_messages_scheduled_leak', 'Rimossa la policy RLS residua "chat_messages_own" (FOR ALL, sender_id=me OR patient_id=me, nessun filtro status) su chat_messages — permissiva e unita in OR con "chat_messages_select_visible", vanificava il filtro status=''sent'' che nasconde ai destinatari i messaggi programmati non ancora inviati (i pazienti vedevano i messaggi programmati dal dietista subito, non all''orario previsto). Verificato che "chat visibile ai coinvolti" + "chat_messages_select_visible" coprono già tutti i percorsi di codice reali (lettura/scrittura paziente e dietista) senza bisogno della policy rimossa')
ON CONFLICT (id) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════
-- SEZIONE 78 — FIX SICUREZZA CRITICO: policy RLS "*_select_visible_authenticated"
-- su note_specialistiche e piani espone dati clinici a QUALUNQUE utente
-- autenticato, di qualunque studio, senza alcuna relazione col paziente
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Stesso pattern di SEZIONE 61/77 (policy permissiva residua che si somma in
-- OR alle policy corrette e ne vanifica lo scoping), trovato continuando
-- l'audit su note_specialistiche/piani: entrambe hanno, oltre alla policy
-- "*_select_combined" corretta (verifica proprietà dietista O relazione
-- patient_dietitian reale O is_linked_patient), una TERZA policy SELECT
-- residua:
--   note_specialistiche_select_visible_authenticated: USING (visible_to_patient = true)
--   piani_select_visible_authenticated:                USING (visible_to_patient = true)
-- Nessun controllo di proprietà, nessuna relazione paziente-dietista, nessun
-- filtro su cartella_id/patient_id — SOLO un booleano sulla riga stessa.
-- Essendo policy SELECT permissive, si sommano in OR a "*_select_combined":
-- qualunque utente autenticato (paziente O dietista, di QUALUNQUE studio,
-- anche senza alcuna relazione con quella cartella) può leggere OGNI nota
-- specialistica o piano alimentare marcato visible_to_patient=true di
-- QUALUNQUE paziente sulla piattaforma — non solo i propri. Più grave del
-- gap chat_messages di SEZIONE 77: qui non serve nemmeno una relazione
-- paziente-dietista pregressa, basta essere autenticati sulla piattaforma.
--
-- Verificato prima di rimuovere: "*_select_combined" copre già ogni caso
-- legittimo (dietista proprietario/collaboratore, paziente collegato con
-- visible_to_patient=true) — la policy "*_select_visible_authenticated" non
-- aggiunge nessun caso reale, solo la falla. Nessun percorso di codice (grep
-- su note_specialistiche/piani in entrambi i repo) si aspetta di leggere
-- dati clinici di pazienti non collegati.
--
-- IMPORTANTE — verificare dopo aver eseguito: aprire una cartella paziente
-- in pazienti.html, controllare che note specialistiche e piani alimentari
-- marcati "visibile al paziente" continuino a essere leggibili normalmente
-- sia dal dietista proprietario sia dall'app paziente collegata.
-- Piano di rientro (da NON eseguire se non in caso di rottura confermata,
-- riapre la falla):
--   CREATE POLICY "note_specialistiche_select_visible_authenticated" ON note_specialistiche FOR SELECT USING (visible_to_patient = true);
--   CREATE POLICY "piani_select_visible_authenticated" ON piani FOR SELECT USING (visible_to_patient = true);
-- ═══════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "note_specialistiche_select_visible_authenticated" ON note_specialistiche;
DROP POLICY IF EXISTS "piani_select_visible_authenticated" ON piani;

INSERT INTO schema_migrations (id, note) VALUES
  ('sezione_78_fix_cross_tenant_phi_leak', 'Rimosse le policy RLS residue "note_specialistiche_select_visible_authenticated" e "piani_select_visible_authenticated" (USING visible_to_patient=true, nessuno scoping su proprietà/relazione paziente-dietista) — permettevano a QUALUNQUE utente autenticato della piattaforma di leggere note specialistiche e piani alimentari di QUALUNQUE paziente, anche senza alcuna relazione con quel paziente/dietista. Le policy "*_select_combined" già coprono correttamente tutti i casi legittimi')
ON CONFLICT (id) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════
-- SEZIONE 79 — CIFRATURA APPLICATIVA: estensione a note_specialistiche.nota
-- e ncpt.{valutazione,diagnosi,intervento,monitoraggio}
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Stesso pattern "vista trasparente" del pilota su cartelle.note (SEZIONE 40,
-- corretto in SEZIONE 67 per non esporre encrypt_text/decrypt_text come RPC
-- pubblica — qui si usa direttamente extensions.encrypt_text/decrypt_text,
-- non public., seguendo la versione già corretta). Zero modifiche al codice
-- client: chat.html/pazienti.html/ChatPage.jsx continuano a fare
-- .from('note_specialistiche')/.from('ncpt') come prima, la vista fa da
-- passthrough trasparente cifrando/decifrando.
--
-- Escluso deliberatamente da questa sezione: chat_messages.content — NON
-- applicare questo pattern lì senza prima riprogettare la lettura realtime.
-- Verificato oggi (grep .on('postgres_changes', {table:'chat_messages'})
-- sia in chat.html che in ChatPage.jsx) che ENTRAMBE le app usano Supabase
-- Realtime su questa tabella per i messaggi live: Realtime legge il WAL
-- della tabella BASE, non la vista — un client sottoscritto continuerebbe a
-- ricevere `content` cifrato (bytea) nel payload realtime invece del testo,
-- rompendo silenziosamente la chat in tempo reale. cartelle/note_
-- specialistiche/ncpt non hanno mai avuto sottoscrizioni realtime (verificato
-- stesso grep, zero risultati), quindi non hanno questo problema.
--
-- Escluso anche patient_intake_forms.responses: colonna JSONB (non text),
-- il pattern encrypt_text/decrypt_text opera su text/bytea — servirebbe un
-- cast responses::text prima di cifrare e ::jsonb dopo aver decifrato, mai
-- verificato che sia lossless per ogni struttura JSON reale già salvata.
-- Inoltre la feature "link pubblico senza login" di questa tabella è già
-- stata trovata incompleta/mai avviata da nessuna pagina (SEZIONE 61,
-- "Public read/update by token" rimosse perché codice morto) — priorità
-- bassa, da riprendere in una sessione dedicata se si completa quella
-- feature.
--
-- IMPORTANTE — verificare dopo aver eseguito (stesso protocollo di SEZIONE
-- 40): aprire una cartella paziente in pazienti.html, leggere/scrivere una
-- nota specialistica e una valutazione NCPT esistenti, controllare che si
-- leggano/salvino correttamente. Poi ispezionare direttamente
-- note_specialistiche_raw.nota_enc/ncpt_raw.valutazione_enc dal SQL Editor
-- e confermare che sia bytea illeggibile, non testo in chiaro.
-- Dopo conferma in produzione per qualche giorno, droppare le colonne
-- *_plain_deprecated (irreversibile, NON incluso in questa sezione):
--   ALTER TABLE note_specialistiche_raw DROP COLUMN nota_plain_deprecated;
--   ALTER TABLE ncpt_raw DROP COLUMN valutazione_plain_deprecated, DROP COLUMN diagnosi_plain_deprecated, DROP COLUMN intervento_plain_deprecated, DROP COLUMN monitoraggio_plain_deprecated;
-- ═══════════════════════════════════════════════════════════════════════════

-- ── note_specialistiche ──────────────────────────────────────────────────
ALTER TABLE note_specialistiche ADD COLUMN IF NOT EXISTS nota_enc bytea;
UPDATE note_specialistiche SET nota_enc = extensions.encrypt_text(nota) WHERE nota IS NOT NULL AND nota_enc IS NULL;

ALTER TABLE note_specialistiche RENAME TO note_specialistiche_raw;
ALTER TABLE note_specialistiche_raw RENAME COLUMN nota TO nota_plain_deprecated;

CREATE VIEW public.note_specialistiche WITH (security_invoker = true) AS
SELECT id, cartella_id, user_id, tipo, extensions.decrypt_text(nota_enc) AS nota, dati,
       created_at, updated_at, visible_to_patient, patient_id, print_image_url,
       print_image_url_compact, print_image_url_simple, print_image_url_alldays, print_format
FROM note_specialistiche_raw;

CREATE OR REPLACE FUNCTION public.note_specialistiche_view_insert()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE r public.note_specialistiche_raw;
BEGIN
  INSERT INTO public.note_specialistiche_raw
    (id, cartella_id, user_id, tipo, nota_enc, dati, created_at, updated_at,
     visible_to_patient, patient_id, print_image_url, print_image_url_compact,
     print_image_url_simple, print_image_url_alldays, print_format)
  VALUES
    (COALESCE(NEW.id, gen_random_uuid()), NEW.cartella_id, NEW.user_id, NEW.tipo,
     extensions.encrypt_text(NEW.nota), NEW.dati, COALESCE(NEW.created_at, now()),
     COALESCE(NEW.updated_at, now()), NEW.visible_to_patient, NEW.patient_id,
     NEW.print_image_url, NEW.print_image_url_compact, NEW.print_image_url_simple,
     NEW.print_image_url_alldays, NEW.print_format)
  RETURNING * INTO r;
  NEW.id := r.id;
  NEW.created_at := r.created_at;
  NEW.updated_at := r.updated_at;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS note_specialistiche_view_insert_trg ON public.note_specialistiche;
CREATE TRIGGER note_specialistiche_view_insert_trg INSTEAD OF INSERT ON public.note_specialistiche
  FOR EACH ROW EXECUTE FUNCTION public.note_specialistiche_view_insert();

CREATE OR REPLACE FUNCTION public.note_specialistiche_view_update()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  UPDATE public.note_specialistiche_raw SET
    tipo = NEW.tipo, nota_enc = extensions.encrypt_text(NEW.nota), dati = NEW.dati,
    updated_at = now(), visible_to_patient = NEW.visible_to_patient,
    patient_id = NEW.patient_id, print_image_url = NEW.print_image_url,
    print_image_url_compact = NEW.print_image_url_compact,
    print_image_url_simple = NEW.print_image_url_simple,
    print_image_url_alldays = NEW.print_image_url_alldays, print_format = NEW.print_format
  WHERE id = OLD.id;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS note_specialistiche_view_update_trg ON public.note_specialistiche;
CREATE TRIGGER note_specialistiche_view_update_trg INSTEAD OF UPDATE ON public.note_specialistiche
  FOR EACH ROW EXECUTE FUNCTION public.note_specialistiche_view_update();

CREATE OR REPLACE FUNCTION public.note_specialistiche_view_delete()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  DELETE FROM public.note_specialistiche_raw WHERE id = OLD.id;
  RETURN OLD;
END;
$$;
DROP TRIGGER IF EXISTS note_specialistiche_view_delete_trg ON public.note_specialistiche;
CREATE TRIGGER note_specialistiche_view_delete_trg INSTEAD OF DELETE ON public.note_specialistiche
  FOR EACH ROW EXECUTE FUNCTION public.note_specialistiche_view_delete();

GRANT SELECT, INSERT, UPDATE, DELETE ON public.note_specialistiche TO authenticated;

-- ── ncpt ──────────────────────────────────────────────────────────────────
ALTER TABLE ncpt ADD COLUMN IF NOT EXISTS valutazione_enc bytea;
ALTER TABLE ncpt ADD COLUMN IF NOT EXISTS diagnosi_enc bytea;
ALTER TABLE ncpt ADD COLUMN IF NOT EXISTS intervento_enc bytea;
ALTER TABLE ncpt ADD COLUMN IF NOT EXISTS monitoraggio_enc bytea;
UPDATE ncpt SET
  valutazione_enc  = extensions.encrypt_text(valutazione)  WHERE valutazione  IS NOT NULL AND valutazione_enc  IS NULL;
UPDATE ncpt SET
  diagnosi_enc     = extensions.encrypt_text(diagnosi)     WHERE diagnosi     IS NOT NULL AND diagnosi_enc     IS NULL;
UPDATE ncpt SET
  intervento_enc   = extensions.encrypt_text(intervento)   WHERE intervento   IS NOT NULL AND intervento_enc   IS NULL;
UPDATE ncpt SET
  monitoraggio_enc = extensions.encrypt_text(monitoraggio) WHERE monitoraggio IS NOT NULL AND monitoraggio_enc IS NULL;

ALTER TABLE ncpt RENAME TO ncpt_raw;
ALTER TABLE ncpt_raw RENAME COLUMN valutazione  TO valutazione_plain_deprecated;
ALTER TABLE ncpt_raw RENAME COLUMN diagnosi     TO diagnosi_plain_deprecated;
ALTER TABLE ncpt_raw RENAME COLUMN intervento   TO intervento_plain_deprecated;
ALTER TABLE ncpt_raw RENAME COLUMN monitoraggio TO monitoraggio_plain_deprecated;

CREATE VIEW public.ncpt WITH (security_invoker = true) AS
SELECT id, cartella_id, user_id,
       extensions.decrypt_text(valutazione_enc)  AS valutazione,
       extensions.decrypt_text(diagnosi_enc)     AS diagnosi,
       extensions.decrypt_text(intervento_enc)   AS intervento,
       extensions.decrypt_text(monitoraggio_enc) AS monitoraggio,
       created_at, updated_at, visible_to_patient, patient_id, print_image_url
FROM ncpt_raw;

CREATE OR REPLACE FUNCTION public.ncpt_view_insert()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE r public.ncpt_raw;
BEGIN
  INSERT INTO public.ncpt_raw
    (id, cartella_id, user_id, valutazione_enc, diagnosi_enc, intervento_enc, monitoraggio_enc,
     created_at, updated_at, visible_to_patient, patient_id, print_image_url)
  VALUES
    (COALESCE(NEW.id, gen_random_uuid()), NEW.cartella_id, NEW.user_id,
     extensions.encrypt_text(NEW.valutazione), extensions.encrypt_text(NEW.diagnosi),
     extensions.encrypt_text(NEW.intervento), extensions.encrypt_text(NEW.monitoraggio),
     COALESCE(NEW.created_at, now()), COALESCE(NEW.updated_at, now()),
     NEW.visible_to_patient, NEW.patient_id, NEW.print_image_url)
  RETURNING * INTO r;
  NEW.id := r.id;
  NEW.created_at := r.created_at;
  NEW.updated_at := r.updated_at;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS ncpt_view_insert_trg ON public.ncpt;
CREATE TRIGGER ncpt_view_insert_trg INSTEAD OF INSERT ON public.ncpt
  FOR EACH ROW EXECUTE FUNCTION public.ncpt_view_insert();

CREATE OR REPLACE FUNCTION public.ncpt_view_update()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  UPDATE public.ncpt_raw SET
    valutazione_enc  = extensions.encrypt_text(NEW.valutazione),
    diagnosi_enc     = extensions.encrypt_text(NEW.diagnosi),
    intervento_enc   = extensions.encrypt_text(NEW.intervento),
    monitoraggio_enc = extensions.encrypt_text(NEW.monitoraggio),
    updated_at = now(), visible_to_patient = NEW.visible_to_patient,
    patient_id = NEW.patient_id, print_image_url = NEW.print_image_url
  WHERE id = OLD.id;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS ncpt_view_update_trg ON public.ncpt;
CREATE TRIGGER ncpt_view_update_trg INSTEAD OF UPDATE ON public.ncpt
  FOR EACH ROW EXECUTE FUNCTION public.ncpt_view_update();

CREATE OR REPLACE FUNCTION public.ncpt_view_delete()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  DELETE FROM public.ncpt_raw WHERE id = OLD.id;
  RETURN OLD;
END;
$$;
DROP TRIGGER IF EXISTS ncpt_view_delete_trg ON public.ncpt;
CREATE TRIGGER ncpt_view_delete_trg INSTEAD OF DELETE ON public.ncpt
  FOR EACH ROW EXECUTE FUNCTION public.ncpt_view_delete();

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ncpt TO authenticated;

NOTIFY pgrst, 'reload schema';

INSERT INTO schema_migrations (id, note) VALUES
  ('sezione_79_field_encryption_note_ncpt', 'Estesa la cifratura applicativa (pattern vista trasparente di SEZIONE 40/67) a note_specialistiche.nota e ncpt.{valutazione,diagnosi,intervento,monitoraggio}. Tabelle rinominate *_raw, viste trasparenti con security_invoker=true (RLS del chiamante invariata), trigger INSTEAD OF INSERT/UPDATE/DELETE. Zero modifiche richieste al codice client. Esclusa deliberatamente chat_messages.content (rotture Realtime — verificato che entrambe le app sottoscrivono postgres_changes su questa tabella) e patient_intake_forms.responses (colonna JSONB, feature del link pubblico già morta)')
ON CONFLICT (id) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════
-- SEZIONE 80 — CIFRATURA APPLICATIVA: chat_messages.content, con migrazione
-- da postgres_changes a "Broadcast from Database" per non rompere il realtime
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Motivo per cui questa tabella era stata esclusa in SEZIONE 79: Supabase
-- Realtime "postgres_changes" legge il replication stream (WAL) della
-- tabella BASE, non la vista — cifrare content in chat_messages_raw senza
-- cambiare altro avrebbe fatto arrivare ai client bytea cifrato invece del
-- testo nei payload realtime, rompendo silenziosamente la chat live.
--
-- Soluzione: pattern ufficiale Supabase "Broadcast from Database"
-- (https://supabase.com/docs/guides/realtime/broadcast). Invece di far
-- leggere ai client il WAL grezzo, un trigger AFTER INSERT/UPDATE su
-- chat_messages_raw DECIFRA il contenuto e lo invia esplicitamente via
-- `realtime.send()` su un topic privato `chat:<patient_id>` — stesso schema
-- di autorizzazione già usato dalla tabella (patient_id=me OR dietista dello
-- studio collegato), replicato come policy RLS su `realtime.messages`
-- (tabella dedicata di Supabase per l'autorizzazione dei canali broadcast,
-- RLS abilitata di default, ZERO policy esistenti prima di questa sezione —
-- verificato che nessun'altra feature del progetto usa già Broadcast).
--
-- **Cambio richiesto lato client (commit separato, stesso giorno)**:
--   - chat.html: canale `sb.channel('chat-'+patientId)` con
--     `.on('postgres_changes', {table:'chat_messages', event:'INSERT'}, ...)`
--     diventa `sb.channel('chat:'+patientId, {config:{private:true}})` con
--     `.on('broadcast', {event:'INSERT'}, payload => { const msg = payload.payload; ... })`.
--   - ChatPage.jsx: stesso cambio, topic `chat:`+user.id (== patientId
--     quando il lettore è il paziente stesso — canale UNICO condiviso dalle
--     due app, prima erano due nomi diversi 'chat-X'/'chat-patient-X' che
--     comunque puntavano alla stessa tabella via postgres_changes). Il
--     listener UPDATE (read_at) diventa broadcast event 'UPDATE'. Il
--     listener sulla tabella `profiles` (stato online dietista) NON cambia,
--     resta su un canale separato via postgres_changes — non riguarda dati
--     cifrati.
--
-- **IMPORTANTE — questo è l'unico punto del lavoro di oggi che richiede
-- test dal vivo con due sessioni browser reali (dietista + paziente),
-- perché il meccanismo websocket non è testabile da qui**: dopo aver
-- eseguito SQL + deploy del codice client, aprire chat.html e ChatPage.jsx
-- in due browser/sessioni diverse per la stessa coppia dietista-paziente,
-- mandare un messaggio da un lato e verificare che compaia SUBITO
-- dall'altro senza refresh manuale. Testare anche: messaggio vocale, foto,
-- videochiamata (message_type:'video_call'), segno di lettura (spunta
-- doppia blu). Piano di rientro se il realtime non funziona più (i
-- messaggi si vedono solo ricaricando la pagina, non più in tempo reale):
--   1. Rollback del solo codice client ai canali `postgres_changes`
--      precedenti (git revert del commit indicato sopra) — la tabella resta
--      cifrata, il caricamento iniziale (.select()) via vista continua a
--      funzionare normalmente, si perde solo l'aggiornamento istantaneo
--      (bisogna ricaricare per vedere nuovi messaggi) finché non si
--      indaga il problema di broadcast con più calma.
--   2. Se serve annullare anche la cifratura: stesso pattern di rollback
--      delle sezioni precedenti (ripristinare vista/colonna con
--      content_plain_deprecated), non incluso qui per non incoraggiarlo
--      senza necessità.
--
-- ── chat_messages: cifratura content ────────────────────────────────────
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS content_enc bytea;
UPDATE chat_messages SET content_enc = extensions.encrypt_text(content) WHERE content IS NOT NULL AND content_enc IS NULL;

ALTER TABLE chat_messages RENAME TO chat_messages_raw;
ALTER TABLE chat_messages_raw RENAME COLUMN content TO content_plain_deprecated;

-- La tabella non serve più nella publication postgres_changes: dopo il
-- passaggio a broadcast nessun client vi si iscrive più in quel modo, e
-- lasciarla dentro esporrebbe inutilmente content_enc (bytea cifrato) a
-- qualunque eventuale client residuo non aggiornato che tentasse ancora
-- postgres_changes su questa tabella.
ALTER PUBLICATION supabase_realtime DROP TABLE public.chat_messages_raw;

CREATE VIEW public.chat_messages WITH (security_invoker = true) AS
SELECT id, patient_id, sender_id, sender_role, extensions.decrypt_text(content_enc) AS content,
       read_at, created_at, message_type, file_url, file_name, duration_seconds,
       type, status, scheduled_at, dietitian_id
FROM chat_messages_raw;

CREATE OR REPLACE FUNCTION public.chat_messages_view_insert()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE r public.chat_messages_raw;
BEGIN
  INSERT INTO public.chat_messages_raw
    (id, patient_id, sender_id, sender_role, content_enc, read_at, created_at,
     message_type, file_url, file_name, duration_seconds, type, status, scheduled_at, dietitian_id)
  VALUES
    (COALESCE(NEW.id, gen_random_uuid()), NEW.patient_id, NEW.sender_id, NEW.sender_role,
     extensions.encrypt_text(NEW.content), NEW.read_at, COALESCE(NEW.created_at, now()),
     NEW.message_type, NEW.file_url, NEW.file_name, NEW.duration_seconds,
     NEW.type, NEW.status, NEW.scheduled_at, NEW.dietitian_id)
  RETURNING * INTO r;
  NEW.id := r.id;
  NEW.created_at := r.created_at;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS chat_messages_view_insert_trg ON public.chat_messages;
CREATE TRIGGER chat_messages_view_insert_trg INSTEAD OF INSERT ON public.chat_messages
  FOR EACH ROW EXECUTE FUNCTION public.chat_messages_view_insert();

CREATE OR REPLACE FUNCTION public.chat_messages_view_update()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  UPDATE public.chat_messages_raw SET
    content_enc = extensions.encrypt_text(NEW.content),
    read_at = NEW.read_at, message_type = NEW.message_type, file_url = NEW.file_url,
    file_name = NEW.file_name, duration_seconds = NEW.duration_seconds,
    type = NEW.type, status = NEW.status, scheduled_at = NEW.scheduled_at,
    dietitian_id = NEW.dietitian_id
  WHERE id = OLD.id;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS chat_messages_view_update_trg ON public.chat_messages;
CREATE TRIGGER chat_messages_view_update_trg INSTEAD OF UPDATE ON public.chat_messages
  FOR EACH ROW EXECUTE FUNCTION public.chat_messages_view_update();

CREATE OR REPLACE FUNCTION public.chat_messages_view_delete()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  DELETE FROM public.chat_messages_raw WHERE id = OLD.id;
  RETURN OLD;
END;
$$;
DROP TRIGGER IF EXISTS chat_messages_view_delete_trg ON public.chat_messages;
CREATE TRIGGER chat_messages_view_delete_trg INSTEAD OF DELETE ON public.chat_messages
  FOR EACH ROW EXECUTE FUNCTION public.chat_messages_view_delete();

GRANT SELECT, INSERT, UPDATE, DELETE ON public.chat_messages TO authenticated;

-- ── Broadcast from Database: decifra e invia ai canali chat:<patient_id> ──
CREATE OR REPLACE FUNCTION public.chat_messages_broadcast()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_payload jsonb;
BEGIN
  v_payload := jsonb_build_object(
    'id', COALESCE(NEW.id, OLD.id),
    'patient_id', COALESCE(NEW.patient_id, OLD.patient_id),
    'dietitian_id', COALESCE(NEW.dietitian_id, OLD.dietitian_id),
    'sender_id', COALESCE(NEW.sender_id, OLD.sender_id),
    'sender_role', COALESCE(NEW.sender_role, OLD.sender_role),
    'content', extensions.decrypt_text(COALESCE(NEW.content_enc, OLD.content_enc)),
    'message_type', COALESCE(NEW.message_type, OLD.message_type),
    'file_url', COALESCE(NEW.file_url, OLD.file_url),
    'file_name', COALESCE(NEW.file_name, OLD.file_name),
    'duration_seconds', COALESCE(NEW.duration_seconds, OLD.duration_seconds),
    'type', COALESCE(NEW.type, OLD.type),
    'status', COALESCE(NEW.status, OLD.status),
    'scheduled_at', COALESCE(NEW.scheduled_at, OLD.scheduled_at),
    'read_at', COALESCE(NEW.read_at, OLD.read_at),
    'created_at', COALESCE(NEW.created_at, OLD.created_at)
  );

  PERFORM realtime.send(
    v_payload,
    TG_OP,
    'chat:' || COALESCE(NEW.patient_id, OLD.patient_id)::text,
    true
  );
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_chat_messages_broadcast ON public.chat_messages_raw;
CREATE TRIGGER trg_chat_messages_broadcast
  AFTER INSERT OR UPDATE ON public.chat_messages_raw
  FOR EACH ROW EXECUTE FUNCTION public.chat_messages_broadcast();

-- ── Autorizzazione canali broadcast (Realtime Authorization) ─────────────
-- Stessa logica della policy "chat visibile ai coinvolti" su chat_messages:
-- il topic ha forma 'chat:<patient_id>' — chi legge deve essere il paziente
-- stesso o un dietista dello studio collegato a quel paziente.
DROP POLICY IF EXISTS "chat_broadcast_select" ON realtime.messages;
CREATE POLICY "chat_broadcast_select" ON realtime.messages
  FOR SELECT
  TO authenticated
  USING (
    realtime.topic() ~ '^chat:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    AND (
      substring(realtime.topic() from 6)::uuid = (SELECT auth.uid())
      OR EXISTS (
        SELECT 1 FROM patient_dietitian pd
        WHERE pd.patient_id = substring(realtime.topic() from 6)::uuid
          AND pd.dietitian_id = get_studio_owner((SELECT auth.uid()))
      )
    )
  );

NOTIFY pgrst, 'reload schema';

INSERT INTO schema_migrations (id, note) VALUES
  ('sezione_80_field_encryption_chat_broadcast', 'Cifrata chat_messages.content (pattern vista trasparente) + migrazione da postgres_changes a Broadcast from Database (trigger AFTER INSERT/UPDATE che decifra e invia via realtime.send() al topic chat:<patient_id>, policy RLS su realtime.messages che replica lo scoping paziente/dietista-studio esistente). Rimossa chat_messages_raw dalla publication supabase_realtime. Richiede aggiornamento codice client (chat.html, ChatPage.jsx) da postgres_changes a canale broadcast privato — commit separato stesso giorno. Unico punto che richiede test dal vivo con due sessioni browser, non verificabile da qui')
ON CONFLICT (id) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════
-- SEZIONE 81 — FIX BUG SEZIONE 80: invio messaggi rotto, NOT NULL residuo su
-- content_plain_deprecated
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Trovato dal test dal vivo richiesto in SEZIONE 80 (esattamente il motivo
-- per cui era stato chiesto): inviare un messaggio da chat.html falliva con
-- "null value in column content_plain_deprecated ... violates not-null
-- constraint". Causa: la colonna `content` originale di chat_messages era
-- NOT NULL (a differenza di cartelle.note/note_specialistiche.nota/ncpt.*,
-- tutte nullable — verificato con query diretta su information_schema.columns
-- che SOLO questa colonna tra le 4 migrazioni odierne aveva il vincolo).
-- Il rename a content_plain_deprecated in SEZIONE 80 ha portato con sé il
-- vincolo, ma chat_messages_view_insert() non scrive più su quella colonna
-- (solo su content_enc) — quindi resta NULL a ogni nuovo INSERT, violando
-- il NOT NULL. Non capitato prima d'ora perché SEZIONE 80 non era ancora
-- stata testata con un invio reale.
--
-- Fix: rimuovere il vincolo. La colonna è comunque "congelata" (nessun
-- codice la scrive più, serve solo da rete di sicurezza ispezionabile prima
-- del drop finale, stesso pattern delle altre 3 tabelle) — non ha senso
-- che blocchi gli INSERT nuovi.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE chat_messages_raw ALTER COLUMN content_plain_deprecated DROP NOT NULL;

INSERT INTO schema_migrations (id, note) VALUES
  ('sezione_81_fix_chat_messages_not_null_regression', 'Rimosso il vincolo NOT NULL residuo su chat_messages_raw.content_plain_deprecated (ereditato dalla colonna content originale, mai smesso di essere valorizzata dal trigger di INSERT della vista dopo SEZIONE 80) — bloccava l''invio di OGNI nuovo messaggio in chat. Trovato dal test dal vivo richiesto nella sezione precedente. Verificato che le altre 3 tabelle cifrate oggi (cartelle_raw, note_specialistiche_raw, ncpt_raw) non hanno lo stesso problema, le loro colonne *_plain_deprecated erano già nullable in origine')
ON CONFLICT (id) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════
-- SEZIONE 82 — FIX SICUREZZA: search_path mutabile sulle 9 funzioni trigger
-- create oggi (SEZIONE 79+80), stesso problema già risolto per altre 7
-- funzioni in una sezione precedente ("SEZIONE 59 — fix WARN sicurezza:
-- search_path mutabile su 7 funzioni trigger") ma non applicato a queste
-- nuove, segnalato dall'advisor di sicurezza Supabase (function_search_path_
-- mutable) subito dopo l'esecuzione di SEZIONE 80.
--
-- Funzioni con search_path non fissato: {note_specialistiche,ncpt,
-- chat_messages}_view_{insert,update,delete} — le 9 funzioni INSTEAD OF
-- delle viste cifrate di oggi. Rischio: senza un search_path fisso, un
-- ruolo che riuscisse a creare oggetti in uno schema che precede "public"
-- nel search_path della sessione potrebbe far risolvere un riferimento non
-- qualificato verso un oggetto malevolo invece di quello atteso. Verificato
-- che tutte e 9 le funzioni referenziano SEMPRE gli oggetti con lo schema
-- esplicito (public.xxx_raw, extensions.encrypt_text/decrypt_text) — quindi
-- `search_path = ''` (vuoto, il più restrittivo possibile) è sicuro da
-- applicare senza cambiare alcun comportamento, stesso valore già usato in
-- chat_messages_broadcast() di SEZIONE 80.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER FUNCTION public.note_specialistiche_view_insert() SET search_path = '';
ALTER FUNCTION public.note_specialistiche_view_update() SET search_path = '';
ALTER FUNCTION public.note_specialistiche_view_delete() SET search_path = '';
ALTER FUNCTION public.ncpt_view_insert() SET search_path = '';
ALTER FUNCTION public.ncpt_view_update() SET search_path = '';
ALTER FUNCTION public.ncpt_view_delete() SET search_path = '';
ALTER FUNCTION public.chat_messages_view_insert() SET search_path = '';
ALTER FUNCTION public.chat_messages_view_update() SET search_path = '';
ALTER FUNCTION public.chat_messages_view_delete() SET search_path = '';

INSERT INTO schema_migrations (id, note) VALUES
  ('sezione_82_fix_search_path_view_triggers', 'Fissato search_path='''' sulle 9 funzioni INSTEAD OF create in SEZIONE 79/80 (note_specialistiche/ncpt/chat_messages view insert/update/delete) — segnalate dall''advisor di sicurezza (function_search_path_mutable) subito dopo l''esecuzione. Verificato che tutte referenziano già gli oggetti con schema esplicito, nessun cambio di comportamento atteso')
ON CONFLICT (id) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════
-- SEZIONE 83 — FIX CRITICO: appointment_slots concede scrittura pubblica,
-- bypassa completamente le RLS di appointments
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Trovato dall'analisi approfondita del 2026-08-25 (audit live via MCP
-- Supabase). appointment_slots è una vista SECURITY DEFINER (owner postgres,
-- bypassa RLS) su appointments, pensata per esporre solo dietitian_id/data/
-- durata/stato senza rivelare patient_id — ma essendo auto-aggiornabile
-- (nessun DISTINCT/JOIN/aggregazione) e senza security_invoker, Postgres le
-- ha assegnato di default i grant pieni arwdDxtm su anon e authenticated,
-- non solo SELECT. Risultato: chiunque avesse anche solo la anon key
-- pubblica (già nel bundle client di entrambe le app) poteva fare
-- PATCH/DELETE su /rest/v1/appointment_slots per modificare o cancellare
-- QUALSIASI appuntamento di QUALSIASI dietista/paziente, bypassando tutte
-- le policy RLS di appointments (visto che la vista, essendo owned da
-- postgres senza security_invoker, non le applica affatto).
--
-- Verificato live: pg_class.relacl per appointment_slots conteneva
-- {anon=arwdDxtm/postgres, authenticated=arwdDxtm/postgres, ...}.
--
-- Fix: la vista deve restare leggibile (nasconde patient_id di proposito,
-- design intenzionale) ma non scrivibile — le scritture devono continuare
-- a passare solo dalla tabella base appointments, dove le RLS granulari
-- (paziente prenota/annulla, dietista/collaboratore gestisce) si applicano
-- correttamente.
-- ═══════════════════════════════════════════════════════════════════════════

REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.appointment_slots FROM anon, authenticated;
GRANT SELECT ON public.appointment_slots TO anon, authenticated;

INSERT INTO schema_migrations (id, note) VALUES
  ('sezione_83_fix_appointment_slots_public_write', 'appointment_slots (vista SECURITY DEFINER su appointments) aveva grant di scrittura pieni per anon/authenticated (relacl arwdDxtm), permettendo di modificare/cancellare qualsiasi appuntamento bypassando le RLS di appointments. Revocati INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER da anon e authenticated, lasciato solo SELECT. Trovato dall''audit di sicurezza del 2026-08-25')
ON CONFLICT (id) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════
-- SEZIONE 84 — FIX CRITICO: get_user_agenda_events(uuid) — IDOR, nessun
-- controllo ownership, eseguibile da anon
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Trovato dall'analisi approfondita del 2026-08-25. La funzione è
-- SECURITY DEFINER (bypassa le RLS di agenda_events, che sono corrette:
-- agenda_events_own → auth.uid() = user_id) ma non replica internamente
-- alcun controllo di ownership su p_user_id, ed è eseguibile anche da anon
-- (has_function_privilege('anon', ..., 'EXECUTE') = true). Chiunque, anche
-- senza login, poteva chiamare rpc/get_user_agenda_events con un UUID
-- qualsiasi e leggere l'intera agenda di quell'utente.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.get_user_agenda_events(p_user_id uuid)
 RETURNS SETOF agenda_events
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
  SELECT * FROM agenda_events
  WHERE user_id = p_user_id AND p_user_id = auth.uid()
  ORDER BY data ASC, ora ASC;
$$;

REVOKE EXECUTE ON FUNCTION public.get_user_agenda_events(uuid) FROM anon;

INSERT INTO schema_migrations (id, note) VALUES
  ('sezione_84_fix_get_user_agenda_events_idor', 'get_user_agenda_events(uuid) era SECURITY DEFINER senza alcun controllo che p_user_id coincidesse con l''utente chiamante, eseguibile anche da anon — IDOR che permetteva di leggere l''agenda di qualsiasi utente conoscendone lo UUID. Aggiunto AND p_user_id = auth.uid() alla query interna e revocato EXECUTE da anon. Trovato dall''audit di sicurezza del 2026-08-25')
ON CONFLICT (id) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════
-- SEZIONE 85 — FIX CRITICO: bypass di visible_to_patient su
-- note_specialistiche_select_combined e piani_select_combined
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Trovato dall'analisi approfondita del 2026-08-25. Entrambe le policy
-- (SEZIONE 65, mai più toccate — SEZIONE 78 ha corretto un'ALTRA policy
-- leaky con nome simile su queste stesse tabelle, *_select_visible_
-- authenticated, ma il suo commento affermava erroneamente che "*_select_
-- combined copre già ogni caso legittimo", non notando questo bug nella
-- policy che stava vouchando) hanno un branch OR — identico, copy-paste,
-- a un branch adiacente correttamente protetto — a cui manca la guardia
-- "visible_to_patient = true":
--   note_specialistiche_select_combined, branch 4 di 5 (senza guardia):
--     cartella_id IN (SELECT cartella_id FROM patient_dietitian WHERE patient_id = auth.uid())
--   piani_select_combined, branch 1 di 4 (senza guardia):
--     cartella_id IN (SELECT cartella_id FROM patient_dietitian WHERE patient_id = auth.uid())
-- Ogni altro branch della stessa policy applica correttamente "AND
-- visible_to_patient = true" prima della stessa condizione — il branch
-- senza guardia la rende del tutto inutile: qualsiasi paziente collegato a
-- una cartella può leggere OGNI nota specialistica e OGNI piano alimentare
-- di quella cartella, incluse le bozze/valutazioni che il dietista ha
-- esplicitamente marcato come non visibili al paziente (es. appunti su
-- sospetto disturbo alimentare in attesa di conferma) — dato sanitario
-- special-category, GDPR art.9, esposto al soggetto interessato in un modo
-- che il titolare (il dietista) non intendeva.
--
-- Confermato live via pg_policies, non solo nel file .sql. Fix: rimuovere
-- il branch non protetto da entrambe le policy — i branch rimanenti
-- coprono già ogni caso legittimo di accesso paziente (stesso schema già
-- usato altrove nelle stesse policy), quindi nessuna perdita di accesso
-- legittimo.
-- ═══════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "note_specialistiche_select_combined" ON public.note_specialistiche_raw;
CREATE POLICY "note_specialistiche_select_combined" ON public.note_specialistiche_raw
  FOR SELECT USING (
    (user_id = get_studio_owner((select auth.uid())))
    OR ((visible_to_patient = true) AND (cartella_id IN (SELECT patient_dietitian.cartella_id FROM patient_dietitian WHERE patient_dietitian.patient_id = (select auth.uid()))))
    OR ((visible_to_patient = true) AND is_linked_patient(cartella_id))
    OR ((visible_to_patient = true) AND (((select auth.uid()) = patient_id) OR (EXISTS (SELECT 1 FROM patient_dietitian pd WHERE pd.patient_id = (select auth.uid()) AND pd.cartella_id = note_specialistiche_raw.cartella_id))))
  );

DROP POLICY IF EXISTS "piani_select_combined" ON public.piani;
CREATE POLICY "piani_select_combined" ON public.piani
  FOR SELECT USING (
    ((visible_to_patient = true) AND (((select auth.uid()) = patient_id) OR (EXISTS (SELECT 1 FROM patient_dietitian pd WHERE pd.patient_id = (select auth.uid()) AND pd.cartella_id = piani.cartella_id))))
    OR (user_id = get_studio_owner((select auth.uid())))
    OR ((visible_to_patient = true) AND is_linked_patient(cartella_id))
  );

INSERT INTO schema_migrations (id, note) VALUES
  ('sezione_85_fix_visible_to_patient_bypass', 'note_specialistiche_select_combined e piani_select_combined (SEZIONE 65) avevano un branch OR copy-paste senza la guardia "visible_to_patient=true" presente in ogni altro branch — un paziente poteva leggere note specialistiche e piani alimentari marcati esplicitamente non visibili dal dietista. Rimosso il branch non protetto da entrambe le policy, verificato live via pg_policies prima e dopo. Trovato dall''audit di sicurezza del 2026-08-25')
ON CONFLICT (id) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════
-- SEZIONE 86 — FIX ALTO: increment_usage_and_check bypassabile da anon
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Trovato dall'analisi approfondita del 2026-08-25. Il controllo ownership
-- era "IF auth.uid() IS NOT NULL AND auth.uid() != p_user_id THEN RAISE
-- EXCEPTION" — se auth.uid() è NULL (chiamata anonima), il controllo viene
-- saltato del tutto: un utente non autenticato poteva passare qualsiasi
-- p_user_id e incrementare/leggere i contatori-quota (usage_counters) per
-- conto di altri utenti, alterandone i limiti di utilizzo delle feature
-- (DoS mirato sulle quote).
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.increment_usage_and_check(p_user_id uuid, p_scope text, p_period text, p_max bigint)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
DECLARE
  new_count BIGINT;
BEGIN
  IF auth.uid() IS NULL OR auth.uid() != p_user_id THEN
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

REVOKE EXECUTE ON FUNCTION public.increment_usage_and_check(uuid,text,text,bigint) FROM anon;

INSERT INTO schema_migrations (id, note) VALUES
  ('sezione_86_fix_increment_usage_anon_bypass', 'increment_usage_and_check saltava del tutto il controllo ownership quando auth.uid() era NULL (chiamata anonima), permettendo a chiunque di alterare i contatori-quota (usage_counters) di altri utenti. Cambiato il controllo da "IS NOT NULL AND !=" a "IS NULL OR !=" (richiede sempre auth.uid()=p_user_id) e revocato EXECUTE da anon. Trovato dall''audit di sicurezza del 2026-08-25')
ON CONFLICT (id) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════
-- SEZIONE 87 — FIX ALTO: appointments_own troppo permissiva (DELETE
-- paziente senza audit), profili sovrascrivibili via RPC anonima
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Trovato dall'analisi approfondita del 2026-08-25.
--
-- Parte 1 — appointments_own (ALL, dietitian_id=auth.uid() OR patient_id=
-- auth.uid()) coesiste, PERMISSIVE quindi sommata in OR, con le policy
-- granulari "paziente vede i propri appuntamenti" (SELECT), "paziente
-- prenota appuntamento" (INSERT), "paziente annulla appuntamento" (UPDATE)
-- — che insieme già coprono ogni azione legittima del paziente. Essendo
-- ALL, appointments_own da sola concede anche DELETE, che nessuna policy
-- granulare prevede (il nome/intento è "annulla", non "cancella"): un
-- paziente può cancellare fisicamente e senza traccia un proprio
-- appuntamento (es. per far sparire un no-show), aggirando anche il
-- trigger prevent_patient_appointment_tampering (blocca solo UPDATE dei
-- campi non ammessi, non tocca affatto DELETE). Nessun trigger di audit
-- (log_clinical_change) era collegato ad appointments, a differenza di
-- patient_documents/cartelle_raw/ecc.
--
-- Fix: rimossa la policy ridondante (i pazienti mantengono SELECT/INSERT/
-- UPDATE-limitato tramite le policy granulari già esistenti, perdono la
-- sola DELETE diretta; dietista/collaboratore invariati, restano gestiti
-- dalle policy "dietista gestisce appuntamenti"/"collaboratore gestisce
-- appuntamenti" che sono ALL e includono già il DELETE per loro).
-- Aggiunto trigger di audit standard (stesso pattern già usato su 11 altre
-- tabelle cliniche).
-- ═══════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "appointments_own" ON public.appointments;

DROP TRIGGER IF EXISTS trg_audit_appointments ON public.appointments;
CREATE TRIGGER trg_audit_appointments
AFTER INSERT OR UPDATE OR DELETE ON public.appointments
FOR EACH ROW EXECUTE FUNCTION log_clinical_change();

INSERT INTO schema_migrations (id, note) VALUES
  ('sezione_87_fix_appointments_own_and_audit', 'appointments_own (policy ALL ridondante con le 3 policy granulari paziente) concedeva ai pazienti anche il DELETE fisico degli appuntamenti (non solo "annulla" via UPDATE status), senza traccia di audit. Rimossa la policy ridondante — dietista/collaboratore/paziente mantengono l''accesso legittimo tramite le policy granulari già esistenti — e aggiunto trigger trg_audit_appointments (log_clinical_change), stesso pattern già usato su 11 altre tabelle cliniche. Trovato dall''audit di sicurezza del 2026-08-25')
ON CONFLICT (id) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════
-- SEZIONE 88 — CIFRATURA APPLICATIVA + MFA: dietitian_credentials
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Trovato dall'analisi approfondita del 2026-08-25: dietitian_credentials è
-- l'unica tabella dell'intero schema con credenziali di servizi terzi in
-- chiaro (password/PIN Sistema TS, token/app-secret WhatsApp Business,
-- token Fatture in Cloud) — il WhatsApp Business token è attivamente in
-- uso. Non è tra le 18 tabelle con mfa_required, e nessun campo passa dal
-- pattern vista-cifrata pgcrypto/Vault già collaudato su cartelle.note
-- (SEZIONE 40), note_specialistiche/ncpt (SEZIONE 79), chat_messages
-- (SEZIONE 80). Stesso pattern "vista trasparente" applicato qui, zero
-- modifiche richieste al codice client (impostazioni.html continua a fare
-- .from('dietitian_credentials') come prima).
--
-- Colonne cifrate: sts_password, sts_pincode, sts_api_password,
-- wa_access_token, wa_app_secret, wa_webhook_verify_token, fic_api_token.
-- Restano in chiaro: gli *_username/*_id/*_lang/*_name (identificatori, non
-- segreti) e i dati fiscali (fiscal_*, già protetti da RLS owner-only e non
-- credenziali di autenticazione verso terzi).
--
-- id qui referenzia direttamente profiles(id) (non un gen_random_uuid()
-- indipendente come nelle altre viste cifrate) — il trigger INSERT usa
-- NEW.id direttamente, mai un fallback generato, per rispettare il vincolo
-- FK dietitian_credentials_id_fkey.
--
-- IMPORTANTE — verificare dopo aver eseguito (stesso protocollo di SEZIONE
-- 40/79/80): aprire impostazioni.html, leggere/salvare le credenziali STS
-- e WhatsApp di un dietista di test, controllare che funzionino ancora
-- (incluso l'invio reale di un messaggio WhatsApp se possibile). Poi
-- ispezionare direttamente dietitian_credentials_raw.wa_access_token_enc
-- dal SQL Editor e confermare che sia bytea illeggibile, non testo in
-- chiaro. Dopo conferma in produzione, droppare le colonne
-- *_plain_deprecated (irreversibile, NON incluso in questa sezione).
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE dietitian_credentials ADD COLUMN IF NOT EXISTS sts_password_enc bytea;
ALTER TABLE dietitian_credentials ADD COLUMN IF NOT EXISTS sts_pincode_enc bytea;
ALTER TABLE dietitian_credentials ADD COLUMN IF NOT EXISTS sts_api_password_enc bytea;
ALTER TABLE dietitian_credentials ADD COLUMN IF NOT EXISTS wa_access_token_enc bytea;
ALTER TABLE dietitian_credentials ADD COLUMN IF NOT EXISTS wa_app_secret_enc bytea;
ALTER TABLE dietitian_credentials ADD COLUMN IF NOT EXISTS wa_webhook_verify_token_enc bytea;
ALTER TABLE dietitian_credentials ADD COLUMN IF NOT EXISTS fic_api_token_enc bytea;

UPDATE dietitian_credentials SET sts_password_enc = extensions.encrypt_text(sts_password) WHERE sts_password IS NOT NULL AND sts_password_enc IS NULL;
UPDATE dietitian_credentials SET sts_pincode_enc = extensions.encrypt_text(sts_pincode) WHERE sts_pincode IS NOT NULL AND sts_pincode_enc IS NULL;
UPDATE dietitian_credentials SET sts_api_password_enc = extensions.encrypt_text(sts_api_password) WHERE sts_api_password IS NOT NULL AND sts_api_password_enc IS NULL;
UPDATE dietitian_credentials SET wa_access_token_enc = extensions.encrypt_text(wa_access_token) WHERE wa_access_token IS NOT NULL AND wa_access_token_enc IS NULL;
UPDATE dietitian_credentials SET wa_app_secret_enc = extensions.encrypt_text(wa_app_secret) WHERE wa_app_secret IS NOT NULL AND wa_app_secret_enc IS NULL;
UPDATE dietitian_credentials SET wa_webhook_verify_token_enc = extensions.encrypt_text(wa_webhook_verify_token) WHERE wa_webhook_verify_token IS NOT NULL AND wa_webhook_verify_token_enc IS NULL;
UPDATE dietitian_credentials SET fic_api_token_enc = extensions.encrypt_text(fic_api_token) WHERE fic_api_token IS NOT NULL AND fic_api_token_enc IS NULL;

ALTER TABLE dietitian_credentials RENAME TO dietitian_credentials_raw;
ALTER TABLE dietitian_credentials_raw RENAME COLUMN sts_password TO sts_password_plain_deprecated;
ALTER TABLE dietitian_credentials_raw RENAME COLUMN sts_pincode TO sts_pincode_plain_deprecated;
ALTER TABLE dietitian_credentials_raw RENAME COLUMN sts_api_password TO sts_api_password_plain_deprecated;
ALTER TABLE dietitian_credentials_raw RENAME COLUMN wa_access_token TO wa_access_token_plain_deprecated;
ALTER TABLE dietitian_credentials_raw RENAME COLUMN wa_app_secret TO wa_app_secret_plain_deprecated;
ALTER TABLE dietitian_credentials_raw RENAME COLUMN wa_webhook_verify_token TO wa_webhook_verify_token_plain_deprecated;
ALTER TABLE dietitian_credentials_raw RENAME COLUMN fic_api_token TO fic_api_token_plain_deprecated;

CREATE VIEW public.dietitian_credentials WITH (security_invoker = true) AS
SELECT id, sts_username,
       extensions.decrypt_text(sts_password_enc) AS sts_password,
       extensions.decrypt_text(sts_pincode_enc) AS sts_pincode,
       sts_api_username,
       extensions.decrypt_text(sts_api_password_enc) AS sts_api_password,
       sts_erogatore_registrato,
       extensions.decrypt_text(wa_access_token_enc) AS wa_access_token,
       extensions.decrypt_text(wa_app_secret_enc) AS wa_app_secret,
       extensions.decrypt_text(wa_webhook_verify_token_enc) AS wa_webhook_verify_token,
       wa_business_account_id, wa_phone_number_id, wa_template_lang, wa_template_name,
       extensions.decrypt_text(fic_api_token_enc) AS fic_api_token,
       fic_company_id, stripe_connect_account_id, stripe_connect_charges_enabled,
       fiscal_codice_fiscale, fiscal_partita_iva, fiscal_indirizzo, fiscal_cap,
       fiscal_comune, fiscal_provincia, fiscal_regime, fiscal_ragione_sociale,
       fiscal_progressivo_invio, updated_at
FROM dietitian_credentials_raw;

CREATE OR REPLACE FUNCTION public.dietitian_credentials_view_insert()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO public.dietitian_credentials_raw
    (id, sts_username, sts_password_enc, sts_pincode_enc, sts_api_username, sts_api_password_enc,
     sts_erogatore_registrato, wa_access_token_enc, wa_app_secret_enc, wa_webhook_verify_token_enc,
     wa_business_account_id, wa_phone_number_id, wa_template_lang, wa_template_name,
     fic_api_token_enc, fic_company_id, stripe_connect_account_id, stripe_connect_charges_enabled,
     fiscal_codice_fiscale, fiscal_partita_iva, fiscal_indirizzo, fiscal_cap, fiscal_comune,
     fiscal_provincia, fiscal_regime, fiscal_ragione_sociale, fiscal_progressivo_invio, updated_at)
  VALUES
    (NEW.id, NEW.sts_username, extensions.encrypt_text(NEW.sts_password), extensions.encrypt_text(NEW.sts_pincode),
     NEW.sts_api_username, extensions.encrypt_text(NEW.sts_api_password),
     COALESCE(NEW.sts_erogatore_registrato, false),
     extensions.encrypt_text(NEW.wa_access_token), extensions.encrypt_text(NEW.wa_app_secret),
     extensions.encrypt_text(NEW.wa_webhook_verify_token),
     NEW.wa_business_account_id, NEW.wa_phone_number_id, NEW.wa_template_lang, NEW.wa_template_name,
     extensions.encrypt_text(NEW.fic_api_token), NEW.fic_company_id, NEW.stripe_connect_account_id,
     COALESCE(NEW.stripe_connect_charges_enabled, false),
     NEW.fiscal_codice_fiscale, NEW.fiscal_partita_iva, NEW.fiscal_indirizzo, NEW.fiscal_cap,
     NEW.fiscal_comune, NEW.fiscal_provincia, NEW.fiscal_regime, NEW.fiscal_ragione_sociale,
     NEW.fiscal_progressivo_invio, COALESCE(NEW.updated_at, now()));
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS dietitian_credentials_view_insert_trg ON public.dietitian_credentials;
CREATE TRIGGER dietitian_credentials_view_insert_trg INSTEAD OF INSERT ON public.dietitian_credentials
  FOR EACH ROW EXECUTE FUNCTION public.dietitian_credentials_view_insert();

CREATE OR REPLACE FUNCTION public.dietitian_credentials_view_update()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  UPDATE public.dietitian_credentials_raw SET
    sts_username = NEW.sts_username,
    sts_password_enc = extensions.encrypt_text(NEW.sts_password),
    sts_pincode_enc = extensions.encrypt_text(NEW.sts_pincode),
    sts_api_username = NEW.sts_api_username,
    sts_api_password_enc = extensions.encrypt_text(NEW.sts_api_password),
    sts_erogatore_registrato = NEW.sts_erogatore_registrato,
    wa_access_token_enc = extensions.encrypt_text(NEW.wa_access_token),
    wa_app_secret_enc = extensions.encrypt_text(NEW.wa_app_secret),
    wa_webhook_verify_token_enc = extensions.encrypt_text(NEW.wa_webhook_verify_token),
    wa_business_account_id = NEW.wa_business_account_id,
    wa_phone_number_id = NEW.wa_phone_number_id,
    wa_template_lang = NEW.wa_template_lang,
    wa_template_name = NEW.wa_template_name,
    fic_api_token_enc = extensions.encrypt_text(NEW.fic_api_token),
    fic_company_id = NEW.fic_company_id,
    stripe_connect_account_id = NEW.stripe_connect_account_id,
    stripe_connect_charges_enabled = NEW.stripe_connect_charges_enabled,
    fiscal_codice_fiscale = NEW.fiscal_codice_fiscale,
    fiscal_partita_iva = NEW.fiscal_partita_iva,
    fiscal_indirizzo = NEW.fiscal_indirizzo,
    fiscal_cap = NEW.fiscal_cap,
    fiscal_comune = NEW.fiscal_comune,
    fiscal_provincia = NEW.fiscal_provincia,
    fiscal_regime = NEW.fiscal_regime,
    fiscal_ragione_sociale = NEW.fiscal_ragione_sociale,
    fiscal_progressivo_invio = NEW.fiscal_progressivo_invio,
    updated_at = now()
  WHERE id = OLD.id;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS dietitian_credentials_view_update_trg ON public.dietitian_credentials;
CREATE TRIGGER dietitian_credentials_view_update_trg INSTEAD OF UPDATE ON public.dietitian_credentials
  FOR EACH ROW EXECUTE FUNCTION public.dietitian_credentials_view_update();

CREATE OR REPLACE FUNCTION public.dietitian_credentials_view_delete()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  DELETE FROM public.dietitian_credentials_raw WHERE id = OLD.id;
  RETURN OLD;
END;
$$;
DROP TRIGGER IF EXISTS dietitian_credentials_view_delete_trg ON public.dietitian_credentials;
CREATE TRIGGER dietitian_credentials_view_delete_trg INSTEAD OF DELETE ON public.dietitian_credentials
  FOR EACH ROW EXECUTE FUNCTION public.dietitian_credentials_view_delete();

GRANT SELECT, INSERT, UPDATE, DELETE ON public.dietitian_credentials TO authenticated;

ALTER FUNCTION public.dietitian_credentials_view_insert() SET search_path = '';
ALTER FUNCTION public.dietitian_credentials_view_update() SET search_path = '';
ALTER FUNCTION public.dietitian_credentials_view_delete() SET search_path = '';

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema = 'public' AND table_name = 'dietitian_credentials_raw' AND table_type = 'BASE TABLE') THEN
    EXECUTE 'DROP POLICY IF EXISTS "mfa_required" ON public.dietitian_credentials_raw';
    EXECUTE 'CREATE POLICY "mfa_required" ON public.dietitian_credentials_raw AS RESTRICTIVE FOR ALL '
            'USING (public.mfa_ok()) WITH CHECK (public.mfa_ok())';
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

INSERT INTO schema_migrations (id, note) VALUES
  ('sezione_88_field_encryption_dietitian_credentials', 'Estesa la cifratura applicativa (pattern vista trasparente di SEZIONE 40/79/80) a dietitian_credentials: sts_password, sts_pincode, sts_api_password, wa_access_token, wa_app_secret, wa_webhook_verify_token, fic_api_token — unica tabella dello schema con credenziali di terzi in chiaro (WhatsApp Business token attivamente in uso). Tabella rinominata *_raw, vista trasparente security_invoker=true, trigger INSTEAD OF INSERT/UPDATE/DELETE, search_path fissato sui trigger. Aggiunto anche mfa_required RESTRICTIVE (mancava). Zero modifiche richieste al codice client. Trovato dall''audit di sicurezza del 2026-08-25')
ON CONFLICT (id) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════
-- SEZIONE 89 — FIX ALTO: create_patient_profile / create_profile_for_new_user
-- permettevano di sovrascrivere nome/cognome di un profilo altrui
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Trovato dall'analisi approfondita del 2026-08-25. Il ramo ON CONFLICT
-- (id) DO UPDATE usava COALESCE(EXCLUDED.full_name, profiles.full_name) —
-- ma l'attaccante controlla sempre p_full_name/p_first_name/p_last_name
-- (parametri della funzione), quindi COALESCE non protegge nulla in
-- pratica: chiunque conosca lo UUID di un profilo esistente può chiamare
-- la RPC (SECURITY DEFINER, senza verifica auth.uid()=uid — intenzionale
-- per motivi diversi, vedi SEZIONE 52: permette il flusso di signup prima
-- che la sessione sia stabilita, e hardcoda role='patient' per bloccare
-- l'escalation di privilegio) e sovrascriverne SEMPRE nome/cognome.
--
-- Fix minimale che non rompe il flusso signup senza sessione: il ramo ON
-- CONFLICT smette di toccare i campi anagrafici, aggiorna solo
-- terms_accepted_at (comportamento già presente, unico che ha senso
-- riproporre su un profilo già esistente).
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.create_patient_profile(uid uuid, user_email text, p_full_name text, p_first_name text, p_last_name text, terms_accepted boolean DEFAULT false)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, first_name, last_name, role, terms_accepted_at)
  VALUES (uid, user_email, p_full_name, p_first_name, p_last_name, 'patient',
          CASE WHEN terms_accepted THEN NOW() ELSE NULL END)
  ON CONFLICT (id) DO UPDATE SET
    terms_accepted_at = COALESCE(profiles.terms_accepted_at, EXCLUDED.terms_accepted_at);
END;
$$;

CREATE OR REPLACE FUNCTION public.create_profile_for_new_user(uid uuid, user_email text, terms_accepted boolean DEFAULT false)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, approved, is_admin, terms_accepted_at)
  VALUES (uid, user_email, false, false, CASE WHEN terms_accepted THEN NOW() ELSE NULL END)
  ON CONFLICT (id) DO UPDATE SET
    terms_accepted_at = COALESCE(profiles.terms_accepted_at, EXCLUDED.terms_accepted_at);
END;
$$;

INSERT INTO schema_migrations (id, note) VALUES
  ('sezione_89_fix_create_profile_overwrite', 'create_patient_profile/create_profile_for_new_user sovrascrivevano sempre full_name/first_name/last_name di un profilo esistente nel ramo ON CONFLICT (il COALESCE non protegge nulla perché l''attaccante controlla sempre i parametri EXCLUDED) — chiunque conoscesse lo UUID di un profilo poteva rinominarlo via RPC anonima/non verificata. Rimosso l''overwrite dei campi anagrafici dal ramo ON CONFLICT, mantenuto solo l''aggiornamento di terms_accepted_at. Trovato dall''audit di sicurezza del 2026-08-25')
ON CONFLICT (id) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════
-- SEZIONE 90 — MFA: estensione a 4 tabelle sensibili non ancora coperte
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Trovato dall'analisi approfondita del 2026-08-25, confrontando le
-- tabelle con dati sensibili contro le 18 già protette da mfa_required
-- (migrazione 20260721150000__enforce_2fa_rls.sql): medication_reminders
-- (farmaci, dato sanitario), whatsapp_messages (testo messaggi con
-- pazienti, parallelo a chat_messages_raw che è cifrato+MFA), coach_ai_
-- messages (conversazioni su alimentazione/salute con l'AI coach),
-- weekly_checkins (testo libero paziente→dietista). patient_intake_forms
-- deliberatamente ESCLUSA, stessa motivazione di SEZIONE 79 (feature del
-- link pubblico già morta — confermato di nuovo oggi: 1 sola riga in
-- tabella, ultima creata il 2026-07-04).
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  t text;
  tables text[] := ARRAY['medication_reminders', 'whatsapp_messages', 'coach_ai_messages', 'weekly_checkins'];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables
               WHERE table_schema = 'public' AND table_name = t AND table_type = 'BASE TABLE') THEN
      EXECUTE format('DROP POLICY IF EXISTS "mfa_required" ON public.%I', t);
      EXECUTE format(
        'CREATE POLICY "mfa_required" ON public.%I AS RESTRICTIVE FOR ALL '
        'USING (public.mfa_ok()) WITH CHECK (public.mfa_ok())', t);
    END IF;
  END LOOP;
END $$;

INSERT INTO schema_migrations (id, note) VALUES
  ('sezione_90_mfa_4_tabelle_sensibili', 'Estesa mfa_required RESTRICTIVE (stesso pattern di 20260721150000__enforce_2fa_rls.sql) a medication_reminders, whatsapp_messages, coach_ai_messages, weekly_checkins — dati sensibili non ancora coperti dall''audit precedente. patient_intake_forms esclusa deliberatamente (feature morta, stessa motivazione SEZIONE 79). Trovato dall''audit di sicurezza del 2026-08-25')
ON CONFLICT (id) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════
-- SEZIONE 91 — PERFORMANCE: 5 policy con auth.uid() non wrappato
-- (auth_rls_initplan)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Trovato dall'analisi approfondita del 2026-08-25 (advisor Supabase,
-- auth_rls_initplan, WARN). auth.uid() non wrappato in (select auth.uid())
-- viene rivalutato per ogni riga invece che una sola volta per query — solo
-- un problema di performance su tabelle grandi, non di sicurezza. Le altre
-- ~70 tabelle dello schema usano già il pattern wrappato.
-- ═══════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "Dietitian manages own intake forms" ON public.patient_intake_forms;
CREATE POLICY "Dietitian manages own intake forms" ON public.patient_intake_forms
  FOR ALL USING (dietitian_id = (select auth.uid()));

DROP POLICY IF EXISTS "patient_intake_forms_collaborator_write" ON public.patient_intake_forms;
CREATE POLICY "patient_intake_forms_collaborator_write" ON public.patient_intake_forms
  FOR ALL
  USING ((dietitian_id = get_studio_owner((select auth.uid()))) AND is_dietitian_level_collaborator((select auth.uid())))
  WITH CHECK ((dietitian_id = get_studio_owner((select auth.uid()))) AND is_dietitian_level_collaborator((select auth.uid())));

DROP POLICY IF EXISTS "own" ON public.fasting_logs;
CREATE POLICY "own" ON public.fasting_logs
  FOR ALL USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "dietitian_push_subs_own" ON public.dietitian_push_subscriptions;
CREATE POLICY "dietitian_push_subs_own" ON public.dietitian_push_subscriptions
  FOR ALL
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "dietitian_todos_owner_all" ON public.dietitian_todos;
CREATE POLICY "dietitian_todos_owner_all" ON public.dietitian_todos
  FOR ALL
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

INSERT INTO schema_migrations (id, note) VALUES
  ('sezione_91_perf_auth_rls_initplan', 'Wrappato auth.uid() in (select auth.uid()) nelle 5 policy segnalate dall''advisor Supabase (auth_rls_initplan): patient_intake_forms (2 policy), fasting_logs, dietitian_push_subscriptions, dietitian_todos — solo ottimizzazione performance, nessun cambio di comportamento. Trovato dall''audit di sicurezza del 2026-08-25')
ON CONFLICT (id) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════
-- SEZIONE 92 — DIFESA IN PROFONDITÀ: EXECUTE revocato su funzioni
-- SECURITY DEFINER che non devono essere chiamabili direttamente
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Trovato dall'analisi approfondita del 2026-08-25 (advisor Supabase,
-- anon_security_definer_function_executable / authenticated_security_
-- definer_function_executable, WARN). Nessuna di queste funzioni è
-- sfruttabile oggi (le funzioni trigger falliscono comunque se chiamate
-- via RPC, mancando TG_OP/NEW/OLD fuori contesto trigger; i 3 helper RLS
-- restano authenticated perché richiamati dentro le policy stesse — vedi
-- nota sotto), ma revocare EXECUTE dove non serve riduce la superficie
-- d'attacco in caso di bug futuri.
--
-- Funzioni trigger/event-trigger, mai chiamate via RPC da codice
-- applicativo — revocato EXECUTE da PUBLIC (quindi anche anon e
-- authenticated): l'esecuzione automatica dei trigger non richiede che il
-- ruolo che ha innescato l'evento abbia EXECUTE sulla funzione.
--
-- Helper usati DENTRO le policy RLS (is_chat_group_member,
-- is_dietitian_level_collaborator, get_studio_owner) — questi DEVONO
-- restare eseguibili da authenticated (la valutazione della policy avviene
-- nel contesto del ruolo che esegue la query, non del definer), revocato
-- EXECUTE solo da anon dato che non serve a utenti non loggati e accettano
-- uno uid arbitrario senza verificarlo (minor info-leak se lasciati ad
-- anon: oracle booleano su membership/ruolo di terzi).
-- ═══════════════════════════════════════════════════════════════════════════

REVOKE EXECUTE ON FUNCTION
  public.prevent_role_self_update(),
  public.prevent_self_privilege_escalation(),
  public.log_clinical_change(),
  public.notify_on_event_webhook(),
  public.handle_new_user(),
  public._auto_gdpr_consent(),
  public.chat_messages_broadcast(),
  public.prevent_patient_appointment_tampering(),
  public.prevent_patient_document_tampering()
FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION
  public.is_chat_group_member(uuid, uuid),
  public.is_dietitian_level_collaborator(uuid),
  public.get_studio_owner(uuid)
FROM anon;

INSERT INTO schema_migrations (id, note) VALUES
  ('sezione_92_revoke_execute_security_definer', 'Difesa in profondità (advisor Supabase security_definer_function_executable, WARN): revocato EXECUTE da PUBLIC/anon/authenticated su 9 funzioni trigger-only mai chiamate via RPC applicativa; revocato EXECUTE da solo anon (restano authenticated) su 3 helper usati dentro le policy RLS (is_chat_group_member, is_dietitian_level_collaborator, get_studio_owner). Nessuna era sfruttabile oggi, riduzione preventiva della superficie d''attacco. Trovato dall''audit di sicurezza del 2026-08-25')
ON CONFLICT (id) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════
-- SEZIONE 93 — FIX: auto-link paziente→dietista via link d'invito
-- (Diet-Plan-Pro-app-claude) accettava un UUID qualsiasi, non validato
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Trovato dall'analisi approfondita del 2026-08-25 (audit sicurezza app
-- paziente). RegisterPage.jsx legge ?ref=<uuid> dalla query string e
-- AuthContext.jsx, al primo SIGNED_IN dopo la registrazione, fa un INSERT
-- diretto client-side su patient_dietitian con quel UUID come dietitian_id,
-- senza alcuna validazione che sia un dietista reale/approvato.
--
-- Verificato qui lato database: la RLS attuale (patient_dietitian_insert_
-- own, WITH CHECK auth.uid() = dietitian_id) in realtà blocca già questo
-- INSERT per un paziente che si autoregistra (il suo auth.uid() è il
-- paziente, non il dietista) — quindi l'auto-link è oggi silenziosamente
-- SEMPRE FALLITO (bug funzionale, non exploit attivo: l'errore RLS viene
-- ignorato dal client, che si limita a non rimuovere pending_dietitian_ref
-- da localStorage). Resta comunque una base di codice fragile: userebbe
-- solo bastasse allentare in futuro quella RLS (es. per farla funzionare
-- davvero) perché il varco si aprisse subito, dato che il client non
-- valida NULLA sull'UUID prima di provare l'insert.
--
-- Fix: una RPC SECURITY DEFINER dedicata che (a) fa funzionare davvero
-- l'auto-link (risolve anche il bug funzionale), (b) valida che
-- p_dietitian_id sia effettivamente un dietista con account approvato
-- prima di collegarlo, (c) usa SEMPRE auth.uid() per patient_id, mai un
-- parametro lato client. Non implementa un token d'invito firmato/one-time
-- (richiederebbe modifiche anche lato generazione del link in NutriPlan-
-- Pro, fuori scope di questa sezione) — resta quindi possibile per un
-- paziente autoregistrarsi a QUALSIASI dietista approvato di cui conosca
-- lo UUID, non solo a quello che gli ha inviato il link; ma non più a UUID
-- arbitrari/inventati/di account non-dietista.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.link_patient_to_dietitian_via_ref(p_dietitian_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Richiede un utente autenticato';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = p_dietitian_id AND role = 'dietitian' AND approved = true
  ) THEN
    RETURN false;
  END IF;
  INSERT INTO public.patient_dietitian (patient_id, dietitian_id)
  VALUES (auth.uid(), p_dietitian_id)
  ON CONFLICT (patient_id, dietitian_id) DO NOTHING;
  RETURN true;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.link_patient_to_dietitian_via_ref(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.link_patient_to_dietitian_via_ref(uuid) TO authenticated;

INSERT INTO schema_migrations (id, note) VALUES
  ('sezione_93_fix_patient_dietitian_ref_link', 'RegisterPage.jsx/AuthContext.jsx (Diet-Plan-Pro-app-claude) inserivano patient_dietitian con un dietitian_id preso senza validazione da ?ref= in query string. La RLS attuale blocca già l''insert diretto per un paziente (auth.uid()=dietitian_id richiesto), rendendo l''auto-link oggi sempre fallito silenziosamente — bug funzionale oltre che base fragile. Aggiunta RPC link_patient_to_dietitian_via_ref(uuid) SECURITY DEFINER che valida che il target sia un dietista con account approvato prima di collegarlo, usa sempre auth.uid() per patient_id. Il codice client (repo Diet-Plan-Pro-app-claude) va aggiornato per chiamare questa RPC invece dell''insert diretto. Trovato dall''audit di sicurezza del 2026-08-25')
ON CONFLICT (id) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════
-- SEZIONE 94 — FIX di SEZIONE 83/84/86/92/93: "REVOKE ... FROM anon" non
-- toglie nulla se la funzione ha ancora il grant di default a PUBLIC
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Trovato verificando dal vivo (pg_proc.proacl / pg_class.relacl) l'esito
-- reale delle SEZIONE 83-93 dopo l'esecuzione da parte dell'utente il
-- 2026-08-25, richiesta esplicitamente come controllo di conferma.
--
-- Bug: ogni funzione riceve EXECUTE su PUBLIC (il ruolo implicito di cui
-- tutti i ruoli sono membri) al momento della CREATE FUNCTION, salvo
-- REVOKE esplicito. "REVOKE EXECUTE ... FROM anon" toglie solo un
-- eventuale grant diretto ad anon — se anon non l'aveva mai avuto
-- direttamente (lo eredita da PUBLIC, come qui), il comando è un no-op e
-- has_function_privilege('anon', ...) resta true. Confermato dal vivo su
-- get_user_agenda_events (SEZIONE 84), increment_usage_and_check (SEZIONE
-- 86), is_chat_group_member/is_dietitian_level_collaborator/get_studio_
-- owner (SEZIONE 92), link_patient_to_dietitian_via_ref (SEZIONE 93):
-- proacl mostrava ancora "=X/postgres" (il grant a PUBLIC) su tutte.
--
-- Impatto pratico ridotto per 3 delle 4 funzioni "critiche": get_user_
-- agenda_events, increment_usage_and_check e link_patient_to_dietitian_
-- via_ref hanno già, nel corpo stesso della funzione (SEZIONE 84/86/93),
-- un controllo che fallisce silenziosamente/con eccezione quando
-- auth.uid() è NULL (chiamata anonima) — quindi anon può ancora ESEGUIRLE
-- ma senza ottenere alcun dato/effetto utile, l'IDOR/bypass di fondo era
-- già chiuso dal fix sul corpo della funzione. Resta invece pienamente
-- aperto (anche se già BASSO/info-leak, non critico) il caso degli helper
-- RLS is_chat_group_member/is_dietitian_level_collaborator/get_studio_
-- owner, che non hanno alcun controllo su auth.uid() e restano interamente
-- eseguibili da anon.
--
-- Fix corretto: REVOKE ... FROM PUBLIC (non da anon), poi ri-GRANT
-- esplicito a authenticated dove serve ancora (gli helper usati dentro le
-- RLS restano utilizzabili da chi è loggato; get_user_agenda_events/
-- increment_usage_and_check/link_patient_to_dietitian_via_ref restano
-- utilizzabili solo da authenticated).
-- ═══════════════════════════════════════════════════════════════════════════

REVOKE EXECUTE ON FUNCTION public.get_user_agenda_events(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_user_agenda_events(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.increment_usage_and_check(uuid,text,text,bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.increment_usage_and_check(uuid,text,text,bigint) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.link_patient_to_dietitian_via_ref(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.link_patient_to_dietitian_via_ref(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION
  public.is_chat_group_member(uuid, uuid),
  public.is_dietitian_level_collaborator(uuid),
  public.get_studio_owner(uuid)
FROM PUBLIC;
GRANT EXECUTE ON FUNCTION
  public.is_chat_group_member(uuid, uuid),
  public.is_dietitian_level_collaborator(uuid),
  public.get_studio_owner(uuid)
TO authenticated;

-- appointment_slots (SEZIONE 83): la REVOKE originale elencava INSERT/
-- UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER ma non MAINTAIN (privilegio
-- introdotto in Postgres 17, lettera 'm' in relacl) — non era nella lista
-- perché dimenticato, non perché intenzionale. Su una vista MAINTAIN non ha
-- un effetto pratico rilevante (VACUUM/ANALYZE/REINDEX/CLUSTER si applicano
-- alle tabelle, non alle viste), ma va comunque tolto per coerenza con
-- "solo SELECT" dichiarato nel commento della SEZIONE 83.
REVOKE MAINTAIN ON public.appointment_slots FROM anon, authenticated;

INSERT INTO schema_migrations (id, note) VALUES
  ('sezione_94_fix_revoke_from_public_not_anon', 'Verifica live post-esecuzione SEZIONE 83-93 (2026-08-25) ha trovato che "REVOKE EXECUTE ... FROM anon" nelle SEZIONE 84/86/92/93 non aveva effetto reale: le funzioni avevano ancora EXECUTE concesso a PUBLIC (grant di default alla CREATE FUNCTION, mai revocato), da cui anon eredita comunque il privilegio. Corretto con REVOKE ... FROM PUBLIC + GRANT esplicito a authenticated su get_user_agenda_events, increment_usage_and_check, link_patient_to_dietitian_via_ref, is_chat_group_member, is_dietitian_level_collaborator, get_studio_owner. Aggiunto anche REVOKE MAINTAIN su appointment_slots (SEZIONE 83 aveva dimenticato questo privilegio, introdotto in PG17, oltre a INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER)')
ON CONFLICT (id) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════
-- SEZIONE 95 — Enforcement server-side del limite ricette Free (Diet-Plan-
-- Pro-app-claude), unico limite Free/Pro realmente legato ai dati
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Trovato dall'analisi architetturale del 2026-08-25: l'enforcement Free/
-- Pro (ProGate.jsx, useSubscription.js) è interamente lato client. Per la
-- stragrande maggioranza delle feature "Pro" (grafici avanzati, PDF,
-- micronutrienti, storico peso più lungo...) questo è corretto e non
-- richiede fix server-side: sono la STESSA riga di dati già leggibile
-- dall'utente (le sue proprie misurazioni/log), solo presentata in modo
-- più ricco — non esiste un confine di sicurezza da far rispettare al
-- database, solo una scelta di prodotto su cosa mostrare nella UI.
--
-- L'UNICA eccezione reale è FREE_RECIPES_LIMIT = 5 in RecipesPage.jsx: un
-- vero limite di MUTAZIONE (quante righe puoi creare), oggi controllato
-- solo lato client — un utente Free poteva creare ricette illimitate
-- chiamando /rest/v1/ricette direttamente, bypassando il controllo React.
--
-- IMPORTANTE — PAYMENTS_ACTIVE è oggi false (src/hooks/useSubscription.js):
-- finché è così, il client tratta OGNI paziente come Pro (isPro sempre
-- true), quindi in produzione oggi nessuno ha davvero il limite di 5
-- ricette. Se il trigger sotto controllasse solo profiles.subscription_
-- plan (che di default è 'free' per tutti nel DB, anche se il client li
-- tratta da Pro), bloccherebbe SUBITO tutti gli utenti attuali a 5
-- ricette — una regressione reale, non quello che si vuole ora. Per
-- restare coerente col comportamento del client, il trigger controlla
-- prima payments_active() (funzione SQL, di default false, da allineare
-- a mano quando si flippa PAYMENTS_ACTIVE lato client — vedi commento in
-- useSubscription.js) e non applica alcun limite finché resta false.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.payments_active()
RETURNS boolean LANGUAGE sql IMMUTABLE AS $$ SELECT false $$;

CREATE OR REPLACE FUNCTION public.check_free_recipe_limit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_plan text;
  v_expires timestamptz;
  v_count int;
BEGIN
  IF NOT public.payments_active() THEN
    RETURN NEW; -- pre-lancio: tutti trattati come Pro, stesso comportamento del client
  END IF;

  SELECT subscription_plan, subscription_expires_at INTO v_plan, v_expires
  FROM public.profiles WHERE id = NEW.user_id;

  IF v_plan = 'pro' AND (v_expires IS NULL OR v_expires > now()) THEN
    RETURN NEW;
  END IF;

  SELECT count(*) INTO v_count FROM public.ricette WHERE user_id = NEW.user_id;
  IF v_count >= 5 THEN
    RAISE EXCEPTION 'Limite di 5 ricette raggiunto nel piano Free. Passa al Pro per ricette illimitate.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_check_free_recipe_limit ON public.ricette;
CREATE TRIGGER trg_check_free_recipe_limit
BEFORE INSERT ON public.ricette
FOR EACH ROW EXECUTE FUNCTION public.check_free_recipe_limit();

REVOKE EXECUTE ON FUNCTION public.check_free_recipe_limit() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.payments_active() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.payments_active() TO anon, authenticated;

INSERT INTO schema_migrations (id, note) VALUES
  ('sezione_95_free_recipe_limit_server_side', 'Aggiunto enforcement server-side del limite di 5 ricette Free (unico limite Free/Pro legato a una vera mutazione dati, non solo a cosa mostra la UI) — un utente Free poteva creare ricette illimitate chiamando /rest/v1/ricette direttamente. Trigger BEFORE INSERT su ricette, gated da payments_active() (nuova funzione, default false) per restare coerente col comportamento attuale del client mentre PAYMENTS_ACTIVE=false in useSubscription.js — non applica alcun limite finché entrambi non vengono flippati a true insieme. Deliberatamente NON replicato per il limite "storico 7 giorni" del diario: quello è un pacing/UX sui dati GIA'' di proprietà dell''utente, non una mutazione, e altre feature (sfide, report settimanali, achievement) leggono già storico oltre 7 giorni per tutti indipendentemente dal piano — un blocco RLS lì romperebbe quelle. Trovato dall''audit architetturale del 2026-08-25')
ON CONFLICT (id) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════
-- SEZIONE 96 — FIX bug di concorrenza in pagamenti.html/api/fatture.js
-- (fatturazione elettronica), trovati da code review 2026-08-28
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Bug 1: fiscal_progressivo_invio (progressivo FatturaPA, condiviso a
-- livello di studio) veniva letto, incrementato in JS e riscritto senza
-- alcuna protezione atomica (pagamenti.html, generaFatturaElettronica()).
-- Due collaboratori (o due tab) che generano l'XML quasi in contemporanea
-- possono leggere lo stesso valore di partenza e scrivere due XML con lo
-- stesso ProgressivoInvio — non valido per la trasmissione SDI. Fix: RPC
-- increment_fiscal_progressivo() che fa un singolo UPDATE...RETURNING
-- atomico direttamente sulla tabella sottostante la vista cifrata di
-- SEZIONE 88 (dietitian_credentials_raw — fiscal_progressivo_invio non è
-- una colonna cifrata, bypassare la vista qui è sicuro e più semplice).
--
-- Bug 2: numero_fattura (generateNumeroFattura() in pagamenti.html) è
-- calcolato come max(esistenti)+1 solo lato client, dall'array in memoria —
-- stessa finestra di collisione fra collaboratori concorrenti. A differenza
-- del progressivo, questo campo resta volutamente MODIFICABILE a mano
-- dall'utente (continuità con numerazioni esterne pregresse), quindi non è
-- sostituibile con una sola RPC "alloca e basta": la difesa vera è un
-- vincolo di unicità a livello DB (mai esistito) + l'app che intercetta il
-- conflitto e fa rigenerare il numero, invece di lasciar passare due
-- fatture con lo stesso numero in silenzio.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.increment_fiscal_progressivo()
RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_owner UUID := get_studio_owner(auth.uid());
  v_new   INTEGER;
BEGIN
  UPDATE dietitian_credentials_raw
  SET fiscal_progressivo_invio = COALESCE(fiscal_progressivo_invio, 0) + 1
  WHERE id = v_owner
  RETURNING fiscal_progressivo_invio INTO v_new;

  IF v_new IS NULL THEN
    RAISE EXCEPTION 'Dati fiscali del dietista non trovati (completa Impostazioni → Dati fiscali)';
  END IF;
  RETURN v_new;
END;
$$;
REVOKE ALL ON FUNCTION public.increment_fiscal_progressivo() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.increment_fiscal_progressivo() TO authenticated;

-- Vincolo di unicità mancante su numero_fattura per studio — seconda difesa
-- (oltre al fix client in salvaFattura() che intercetta il conflitto e fa
-- rigenerare il numero) anche per righe inserite da percorsi diversi da
-- pagamenti.html in futuro.
CREATE UNIQUE INDEX IF NOT EXISTS idx_fatture_numero_unique
  ON fatture (dietitian_id, numero_fattura) WHERE numero_fattura IS NOT NULL;

NOTIFY pgrst, 'reload schema';

INSERT INTO schema_migrations (id, note) VALUES
  ('sezione_96_fatturazione_concorrenza', 'Fix bug di concorrenza trovati da code review 2026-08-28 nell''area fatturazione: (1) fiscal_progressivo_invio ora incrementato atomicamente via RPC increment_fiscal_progressivo() invece che letto/incrementato/riscritto lato client — evita ProgressivoInvio duplicati tra XML FatturaPA generati da collaboratori/tab concorrenti; (2) aggiunto vincolo UNIQUE (dietitian_id, numero_fattura) su fatture, con il client (pagamenti.html) che ora intercetta il conflitto e rigenera il numero invece di lasciar passare fatture duplicate in silenzio. Vedi anche i fix sull''aliquota IVA in api/fatture.js e sul calcolo imponibile in js/fatturapa.js, stessa sessione, non richiedono migrazione SQL.')
ON CONFLICT (id) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════
-- SEZIONE 97 — FIX bug di concorrenza nelle edge function Stripe, trovati da
-- code review 2026-08-29
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Bug 1: create-checkout-session/create-patient-checkout-session leggevano
-- stripe_customer_id e, se assente, ne creavano uno nuovo su Stripe scritto
-- con un upsert INCONDIZIONATO — due richieste concorrenti dello stesso
-- utente potevano creare due customer Stripe distinti, col secondo upsert
-- che sovrascriveva in silenzio il primo (customer orfano, stato
-- imprevedibile). Fix: RPC claim_stripe_customer_id(), UPSERT con COALESCE
-- lato DB che fa vincere sempre il primo customer_id scritto, mai un blind
-- overwrite. Usata dal nuovo helper condiviso getOrCreateStripeCustomer()
-- in supabase/functions/_shared/stripeHelpers.ts.
--
-- Bug 2: create-invoice-checkout-session controllava fatture.stato='pagato'
-- solo al momento della creazione della sessione — due checkout concorrenti
-- per la stessa fattura (doppio click, due tab) potevano entrambi superare
-- il controllo, entrambi essere pagati, e stripe-webhook segnare 'pagato'
-- due volte: il paziente pagava due volte la stessa fattura. Fix: nuova
-- colonna stripe_checkout_pending_at + RPC claim_fattura_checkout() come
-- mutex applicativo (finestra di 30 minuti, poi si autolibera per non
-- bloccare un paziente che ha semplicemente abbandonato un checkout senza
-- pagare — non riceviamo nessun evento server-side in quel caso).
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.claim_stripe_customer_id(p_user_id UUID, p_customer_id TEXT)
RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_id TEXT;
BEGIN
  INSERT INTO user_payment_credentials (id, stripe_customer_id)
  VALUES (p_user_id, p_customer_id)
  ON CONFLICT (id) DO UPDATE
    SET stripe_customer_id = COALESCE(user_payment_credentials.stripe_customer_id, EXCLUDED.stripe_customer_id)
  RETURNING stripe_customer_id INTO v_id;
  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.claim_stripe_customer_id(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_stripe_customer_id(UUID, TEXT) TO service_role;

ALTER TABLE fatture ADD COLUMN IF NOT EXISTS stripe_checkout_pending_at TIMESTAMPTZ;

CREATE OR REPLACE FUNCTION public.claim_fattura_checkout(p_fattura_id UUID, p_patient_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_claimed BOOLEAN := false;
BEGIN
  UPDATE fatture
  SET stripe_checkout_pending_at = now()
  WHERE id = p_fattura_id
    AND patient_id = p_patient_id
    AND stato <> 'pagato'
    AND (stripe_checkout_pending_at IS NULL OR stripe_checkout_pending_at < now() - interval '30 minutes')
  RETURNING true INTO v_claimed;
  RETURN COALESCE(v_claimed, false);
END;
$$;
REVOKE ALL ON FUNCTION public.claim_fattura_checkout(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_fattura_checkout(UUID, UUID) TO service_role;

NOTIFY pgrst, 'reload schema';

INSERT INTO schema_migrations (id, note) VALUES
  ('sezione_97_stripe_edge_functions_concorrenza', 'Fix bug di concorrenza nelle edge function Stripe (code review 2026-08-29): claim_stripe_customer_id() rende atomica la creazione/registrazione del customer Stripe (create-checkout-session, create-patient-checkout-session) invece di un upsert incondizionato che poteva sovrascrivere in silenzio un customer già registrato da una richiesta concorrente; claim_fattura_checkout() + nuova colonna fatture.stripe_checkout_pending_at fanno da mutex applicativo (finestra 30 minuti) contro il doppio pagamento della stessa fattura da due checkout concorrenti (create-invoice-checkout-session). Vedi anche i fix lato edge function (webhook idempotente su stato<>''pagato'', gestione async_payment_succeeded/failed, controllo ruolo su create-checkout-session, messaggi di errore generici verso il client, helper condivisi in _shared/stripeHelpers.ts) nella stessa sessione, non richiedono ulteriore SQL.')
ON CONFLICT (id) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════
-- SEZIONE 98 — FIX SICUREZZA CRITICO: patient_intake_forms leggibile/scrivibile
-- da chiunque (RLS by-token sempre vera) + bia_records eseguito storicamente
-- senza RLS, trovati da code review 2026-08-30
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Bug 1: supabase/anamnesi.sql creava due policy "Public read/update by
-- token" con USING(true) — leggibili/scrivibili da CHIUNQUE avesse la anon
-- key, non solo da chi conosce il token della riga specifica (RLS valuta la
-- singola riga, non può da sola verificare che il chiamante conosca il
-- token — quel confronto va fatto esplicitamente in una funzione). Con più
-- policy permissive sullo stesso comando, Postgres le unisce in OR: questa
-- da sola bypassava completamente "Dietitian manages own intake forms",
-- esponendo l'anamnesi di QUALSIASI paziente di QUALSIASI dietista.
-- Rimosse: nessun codice client usa oggi l'accesso anonimo via token (vedi
-- commento in supabase/anamnesi.sql).
--
-- Bug 2: il messaggio mostrato al dietista quando bia_records non esiste
-- ancora (bia.html, ramo "tabella non trovata") includeva testualmente
-- `ALTER TABLE bia_records DISABLE ROW LEVEL SECURITY` nell'SQL di setup
-- suggerito — un dietista che lo eseguisse creerebbe la tabella di dati
-- clinici (composizione corporea) senza ALCUNA RLS, protetta solo dai
-- filtri `.eq('user_id',...)` lato JS. Corretto anche il testo in bia.html
-- (ENABLE + policy owner) per chi non ha ancora creato la tabella; questa
-- sezione copre chi l'ha già creata seguendo il testo vecchio.
-- ═══════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "Public read by token" ON patient_intake_forms;
DROP POLICY IF EXISTS "Public update responses by token" ON patient_intake_forms;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='bia_records') THEN
    EXECUTE 'ALTER TABLE public.bia_records ENABLE ROW LEVEL SECURITY';
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='bia_records' AND policyname='bia_records_own') THEN
      EXECUTE 'CREATE POLICY "bia_records_own" ON public.bia_records FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id)';
    END IF;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

INSERT INTO schema_migrations (id, note) VALUES
  ('sezione_98_fix_rls_anamnesi_bia', 'Rimosse le policy "Public read/update by token" su patient_intake_forms (USING(true), bypassavano completamente la policy owner-only per QUALSIASI riga — nessun codice client le usa). Riabilitata RLS + policy owner su bia_records nel caso sia già stata creata seguendo l''SQL di setup precedente (che disabilitava RLS esplicitamente) — corretto anche il testo suggerito in bia.html per chi deve ancora crearla. Trovato da code review 2026-08-30.')
ON CONFLICT (id) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════
-- SEZIONE 99 — FIX: cancellazione eventi agenda non sincronizzata tra
-- dispositivi, trovato da code review 2026-08-30
-- ═══════════════════════════════════════════════════════════════════════════
--
-- agenda.html teneva un "tombstone" delle cancellazioni SOLO in localStorage
-- (dietplan_deleted_events), che protegge solo il browser che ha cancellato:
-- un secondo dispositivo, ignaro della cancellazione, vedeva l'evento ancora
-- nella propria cache locale come "non ancora sincronizzato" e lo
-- ri-caricava su Supabase al prossimo giro, annullando silenziosamente la
-- cancellazione per tutti. Fix: la cancellazione diventa un soft-delete
-- (colonna deleted_at) invece di una DELETE reale — la riga resta sul
-- server come tombstone visibile a QUALSIASI dispositivo dello stesso
-- utente tramite la normale select, non solo a chi ha cancellato.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE agenda_events ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- Il feed iCal (get_user_agenda_events, usato con la sola anon key) non deve
-- includere gli eventi soft-cancellati.
CREATE OR REPLACE FUNCTION get_user_agenda_events(p_user_id UUID)
RETURNS SETOF agenda_events LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT * FROM agenda_events WHERE user_id = p_user_id AND deleted_at IS NULL ORDER BY data ASC, ora ASC;
$$;

NOTIFY pgrst, 'reload schema';

INSERT INTO schema_migrations (id, note) VALUES
  ('sezione_99_agenda_soft_delete', 'agenda_events.deleted_at aggiunta per rendere la cancellazione un soft-delete invece di una DELETE reale — il tombstone locale (dietplan_deleted_events in localStorage) proteggeva solo il browser che cancellava, non gli altri dispositivi dello stesso utente, che potevano far risorgere silenziosamente un evento cancellato altrove. get_user_agenda_events() (feed iCal) aggiornata per escludere le righe soft-cancellate. Lato client: deleteCurrentEvent() ora fa UPDATE deleted_at invece di DELETE, loadEventsFromSupabase() filtra le righe con deleted_at e ne aggiunge gli id all''insieme "non resuscitare" insieme al tombstone locale. Trovato da code review 2026-08-30.')
ON CONFLICT (id) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════
-- SEZIONE 100 — Rimuove il sistema di chat di gruppo (chat_groups), sostituito
-- dalla chat 1:1 paziente↔dietista (chat_messages, SEZIONE 80) — trovato e
-- disattivato lato client il 2026-08-31
-- ═══════════════════════════════════════════════════════════════════════════
--
-- chat_groups/chat_group_members/chat_group_messages erano un secondo
-- sistema di chat, parallelo e mai collegato al pannello del dietista
-- (chat.html legge solo chat_messages/chat_messages_raw). L'app pazienti
-- (Diet-Plan-Pro-app-claude) apriva a volte questo thread come schermata
-- predefinita: i messaggi scritti lì venivano salvati correttamente sul
-- server ma il dietista non li avrebbe mai visti. Il codice client che lo
-- usava (ChatPage.jsx: ChatListView/GroupThreadView) è già stato rimosso;
-- questa sezione elimina le tabelle, la funzione di supporto e le policy
-- storage rimaste orfane. Solo dati di test nel DB al momento della
-- rimozione (1 gruppo, 2 membri, 2 messaggi).
--
-- Il bucket storage "group-chat-media" (messaggi vocali del gruppo) resta
-- per ora: se vuoto puoi eliminarlo manualmente da Storage → group-chat-media
-- nella dashboard Supabase.
-- ═══════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "group_chat_media_insert" ON storage.objects;
DROP POLICY IF EXISTS "group_chat_media_select" ON storage.objects;

DROP TABLE IF EXISTS chat_group_messages CASCADE;
DROP TABLE IF EXISTS chat_group_members CASCADE;
DROP TABLE IF EXISTS chat_groups CASCADE;

DROP FUNCTION IF EXISTS is_chat_group_member(uuid, uuid);

NOTIFY pgrst, 'reload schema';

INSERT INTO schema_migrations (id, note) VALUES
  ('sezione_100_drop_chat_groups', 'Rimosse le tabelle chat_groups/chat_group_members/chat_group_messages, la funzione is_chat_group_member() e le policy storage group_chat_media_insert/select — sistema di chat di gruppo parallelo, mai collegato al pannello del dietista (bug trovato e verificato dal vivo il 2026-08-31: i messaggi dei pazienti in quel thread non arrivavano mai al dietista). Codice client già rimosso da ChatPage.jsx. Bucket storage group-chat-media lasciato intatto (da svuotare/eliminare manualmente se non serve più).')
ON CONFLICT (id) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════
-- SEZIONE 101 — Broadcast from Database per due sottoscrizioni realtime
-- rimaste morte dopo le viste cifrate SEZIONE 79 (ncpt/note_specialistiche)
-- e SEZIONE 80 (chat_messages) — trovato durante il 3° giro di scansione
-- ciclica bug del 2026-09-01. NON ANCORA ESEGUITA: l'accesso MCP a questo
-- progetto Supabase in questa sessione è read-only (execute_sql rifiuta
-- CREATE FUNCTION/POLICY con "cannot execute ... in a read-only
-- transaction"), quindi va eseguita manualmente dal pannello Supabase
-- (SQL Editor) prima che le due modifiche client sotto abbiano effetto.
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Stesso problema di fondo già risolto per chat_messages/chat.html (SEZIONE
-- 80) e per NotificationContext.jsx/BottomNav.jsx nell'app paziente:
-- postgres_changes ascolta lo stream di replica della TABELLA fisica, non
-- della vista — su una vista non arriva mai nulla. Qui riguarda altri due
-- punti rimasti sul vecchio pattern:
--   1. patient-portal.html (setupDocsRealtime): il refresh dei documenti del
--      paziente non si aggiornava mai in automatico quando il dietista
--      pubblicava/modificava un NCPt o una scheda specialistica (note_
--      specialistiche) — solo bia_records/schede_valutazione/liste_spesa
--      (tabelle vere) funzionavano. Il paziente doveva ricaricare la pagina.
--   2. js/utils.js (badge "posta in arrivo" iniettato in tutte le pagine del
--      dietista tramite _subscribeRealtime): non si aggiornava mai in tempo
--      reale quando un paziente scriveva o quando un messaggio veniva letto.
--
-- ── (1) topic docs:<cartella_id> — segnale leggero: il client
-- (scheduleDocsRefresh) rifà solo una fetch, non serve un payload decifrato.
CREATE OR REPLACE FUNCTION public.docs_broadcast()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM realtime.send(
    jsonb_build_object('table', TG_TABLE_NAME, 'op', TG_OP),
    TG_OP,
    'docs:' || COALESCE(NEW.cartella_id, OLD.cartella_id)::text,
    true
  );
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_ncpt_docs_broadcast ON public.ncpt_raw;
CREATE TRIGGER trg_ncpt_docs_broadcast
  AFTER INSERT OR UPDATE OR DELETE ON public.ncpt_raw
  FOR EACH ROW EXECUTE FUNCTION public.docs_broadcast();

DROP TRIGGER IF EXISTS trg_note_specialistiche_docs_broadcast ON public.note_specialistiche_raw;
CREATE TRIGGER trg_note_specialistiche_docs_broadcast
  AFTER INSERT OR UPDATE OR DELETE ON public.note_specialistiche_raw
  FOR EACH ROW EXECUTE FUNCTION public.docs_broadcast();

DROP POLICY IF EXISTS "docs_broadcast_select" ON realtime.messages;
CREATE POLICY "docs_broadcast_select" ON realtime.messages
  FOR SELECT
  TO authenticated
  USING (
    realtime.topic() ~ '^docs:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    AND EXISTS (
      SELECT 1 FROM patient_dietitian pd
      WHERE pd.cartella_id = substring(realtime.topic() from 6)::uuid
        AND pd.patient_id = (SELECT auth.uid())
    )
  );

-- ── (2) topic inbox:<dietitian_id> — segnale per il badge "non letti" del
-- dietista/collaboratori. dietitian_id su chat_messages_raw è sempre l'id
-- dello studio (titolare), mai del collaboratore che invia — stesso pattern
-- già documentato in chat.html/ChatPage.jsx per la stanza videochiamata.
-- Trigger separato da chat_messages_broadcast() (SEZIONE 80) per non
-- rischiare di toccare quello già in produzione e verificato dal vivo.
CREATE OR REPLACE FUNCTION public.chat_inbox_broadcast()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF COALESCE(NEW.dietitian_id, OLD.dietitian_id) IS NULL THEN
    RETURN NULL;
  END IF;
  PERFORM realtime.send(
    jsonb_build_object('patient_id', COALESCE(NEW.patient_id, OLD.patient_id)),
    TG_OP,
    'inbox:' || COALESCE(NEW.dietitian_id, OLD.dietitian_id)::text,
    true
  );
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_chat_inbox_broadcast ON public.chat_messages_raw;
CREATE TRIGGER trg_chat_inbox_broadcast
  AFTER INSERT OR UPDATE ON public.chat_messages_raw
  FOR EACH ROW EXECUTE FUNCTION public.chat_inbox_broadcast();

DROP POLICY IF EXISTS "inbox_broadcast_select" ON realtime.messages;
CREATE POLICY "inbox_broadcast_select" ON realtime.messages
  FOR SELECT
  TO authenticated
  USING (
    realtime.topic() ~ '^inbox:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    AND get_studio_owner((SELECT auth.uid())) = substring(realtime.topic() from 7)::uuid
  );

NOTIFY pgrst, 'reload schema';

INSERT INTO schema_migrations (id, note) VALUES
  ('sezione_101_docs_inbox_broadcast', 'Broadcast from Database per due canali rimasti su postgres_changes contro viste cifrate (mai un evento): docs:<cartella_id> (trigger su ncpt_raw/note_specialistiche_raw, refresh documenti paziente in patient-portal.html) e inbox:<dietitian_id> (trigger su chat_messages_raw, badge non letti in js/utils.js). Policy RLS su realtime.messages via patient_dietitian.cartella_id e get_studio_owner(). Codice client aggiornato nello stesso commit (patient-portal.html, js/utils.js/js/utils.min.js) da postgres_changes a canale broadcast privato. NON eseguita da questa sessione (accesso MCP Supabase read-only) — va lanciata manualmente dal SQL Editor prima che il codice client abbia effetto; fino ad allora il comportamento resta quello di prima (nessun refresh/badge in tempo reale, invariato).')
ON CONFLICT (id) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════
-- SEZIONE 102 — ROLLBACK URGENTE DI SEZIONE 100: chat_groups/chat_group_
-- members/chat_group_messages NON erano un sistema orfano, sono la chat di
-- gruppo stile WhatsApp usata davvero da broadcast.html/whatsapp.html
-- (dietista → gruppi di pazienti) — SEZIONE 100 le ha eliminate per errore,
-- verificato durante il 6° giro di scansione ciclica del 2026-09-02.
--
-- Cosa è successo: nella sessione dell'8/31 avevo trovato che l'app pazienti
-- (Diet-Plan-Pro-app-claude, ChatPage.jsx) apriva a volte come schermata
-- predefinita un thread "di gruppo" (chat_group_messages) invece della vera
-- chat 1:1 col dietista (chat_messages) — messaggi scritti lì dal paziente
-- non arrivavano mai al dietista. Diagnosi corretta per quel sintomo, ma la
-- conclusione "sistema orfano, nessun altro consumer" era sbagliata: avevo
-- controllato solo il repo Diet-Plan-Pro-app-claude, MAI NutriPlan-Pro, dove
-- broadcast.html/whatsapp.html usano queste stesse tabelle per davvero (il
-- dietista crea gruppi di pazienti e ci scrive, i pazienti li leggono/
-- rispondono dall'app — feature reale, non residua). Il "gruppo" di test che
-- avevo trovato (1 gruppo "Tommaso Tebaldini", 2 membri, 2 messaggi) non era
-- test del sistema patient-side: era un messaggio VERO mandato dal dietista
-- via broadcast.html/whatsapp.html.
--
-- Danno causato da SEZIONE 100, oltre alla perdita delle 3 tabelle:
-- DROP TABLE ... CASCADE ha eliminato in silenzio anche la policy RLS
-- "profiles_select_combined" (SEZIONE 65), l'UNICA policy SELECT rimasta
-- sulla tabella profiles — da quel momento NESSUNO (dietista o paziente) può
-- leggere ALCUN profilo via RLS, propria riga inclusa. Verificato dal vivo:
-- pg_policy su public.profiles mostrava solo profiles_insert_own e
-- profiles_update_combined, nessuna policy SELECT. Probabile rottura visibile
-- su gran parte dell'app dal momento in cui SEZIONE 100 è stata eseguita.
--
-- Questa sezione ricrea tabelle/indici/RLS/policy/funzione/bucket storage/
-- realtime esattamente come risultavano prima di SEZIONE 100 (ricostruito da
-- git history di supabase_setup.sql: SEZIONE 16/17/18/27/65/92/94), inclusa
-- profiles_select_combined. Il codice client per la UI di gruppo lato
-- paziente (ChatPage.jsx) va ripristinato separatamente (commit collegato
-- nel repo Diet-Plan-Pro-app-claude).
-- ═══════════════════════════════════════════════════════════════════════════

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

ALTER TABLE chat_group_messages ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'text' CHECK (type IN ('text','voice'));
ALTER TABLE chat_group_messages ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'sent' CHECK (status IN ('sent','scheduled'));
ALTER TABLE chat_group_messages ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMPTZ;

ALTER TABLE chat_groups          ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_group_members   ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_group_messages  ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION is_chat_group_member(gid UUID, uid UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM chat_group_members WHERE group_id = gid AND user_id = uid);
$$;
REVOKE EXECUTE ON FUNCTION is_chat_group_member(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION is_chat_group_member(UUID, UUID) TO authenticated;

-- ── Policy finali (versione SEZIONE 65, con auth.uid() wrappato per performance) ──
DROP POLICY IF EXISTS "chat_group_members_creator_delete" ON chat_group_members;
CREATE POLICY "chat_group_members_creator_delete" ON chat_group_members
  FOR DELETE USING (EXISTS (SELECT 1 FROM chat_groups WHERE chat_groups.id = chat_group_members.group_id AND chat_groups.created_by = (select auth.uid())));
DROP POLICY IF EXISTS "chat_group_members_creator_insert" ON chat_group_members;
CREATE POLICY "chat_group_members_creator_insert" ON chat_group_members
  FOR INSERT WITH CHECK (
    (EXISTS (SELECT 1 FROM chat_groups WHERE chat_groups.id = chat_group_members.group_id AND chat_groups.created_by = (select auth.uid())))
    AND ((user_id = (select auth.uid())) OR (EXISTS (SELECT 1 FROM patient_dietitian pd WHERE pd.patient_id = chat_group_members.user_id AND pd.dietitian_id = (select auth.uid()))) OR (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = chat_group_members.user_id AND profiles.role = 'dietitian')))
  );
DROP POLICY IF EXISTS "chat_group_members_select" ON chat_group_members;
CREATE POLICY "chat_group_members_select" ON chat_group_members
  FOR SELECT USING (is_chat_group_member(group_id, (select auth.uid())));
DROP POLICY IF EXISTS "chat_group_members_self_update" ON chat_group_members;
CREATE POLICY "chat_group_members_self_update" ON chat_group_members
  FOR UPDATE USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "chat_group_messages_member_insert" ON chat_group_messages;
CREATE POLICY "chat_group_messages_member_insert" ON chat_group_messages
  FOR INSERT WITH CHECK (((select auth.uid()) = sender_id) AND is_chat_group_member(group_id, (select auth.uid())));
DROP POLICY IF EXISTS "chat_group_messages_member_select" ON chat_group_messages;
CREATE POLICY "chat_group_messages_member_select" ON chat_group_messages
  FOR SELECT USING (is_chat_group_member(group_id, (select auth.uid())) AND ((status = 'sent') OR (sender_id = (select auth.uid()))));
DROP POLICY IF EXISTS "chat_group_messages_sender_update" ON chat_group_messages;
CREATE POLICY "chat_group_messages_sender_update" ON chat_group_messages
  FOR UPDATE USING ((select auth.uid()) = sender_id) WITH CHECK ((select auth.uid()) = sender_id);

DROP POLICY IF EXISTS "chat_groups_creator_delete" ON chat_groups;
CREATE POLICY "chat_groups_creator_delete" ON chat_groups
  FOR DELETE USING ((select auth.uid()) = created_by);
DROP POLICY IF EXISTS "chat_groups_dietitian_insert" ON chat_groups;
CREATE POLICY "chat_groups_dietitian_insert" ON chat_groups
  FOR INSERT WITH CHECK (((select auth.uid()) = created_by) AND (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = (select auth.uid()) AND profiles.role = 'dietitian')));
DROP POLICY IF EXISTS "chat_groups_member_select" ON chat_groups;
CREATE POLICY "chat_groups_member_select" ON chat_groups
  FOR SELECT USING (is_chat_group_member(id, (select auth.uid())) OR (created_by = (select auth.uid())));
DROP POLICY IF EXISTS "chat_groups_creator_update" ON chat_groups;
CREATE POLICY "chat_groups_creator_update" ON chat_groups
  FOR UPDATE USING ((select auth.uid()) = created_by) WITH CHECK ((select auth.uid()) = created_by);

-- ── profiles_select_combined: CASCADE-eliminata insieme a chat_group_members
-- (referenziata in una EXISTS interna) — è l'UNICA policy SELECT su profiles,
-- senza questa nessuno può leggere alcun profilo. Priorità massima.
DROP POLICY IF EXISTS "profiles_select_combined" ON profiles;
CREATE POLICY "profiles_select_combined" ON profiles
  FOR SELECT USING (
    check_is_admin()
    OR (EXISTS (SELECT 1 FROM chat_group_members m1 JOIN chat_group_members m2 ON m1.group_id = m2.group_id WHERE m1.user_id = (select auth.uid()) AND m2.user_id = profiles.id))
    OR (EXISTS (SELECT 1 FROM patient_dietitian WHERE patient_dietitian.dietitian_id = profiles.id AND patient_dietitian.patient_id = (select auth.uid())))
    OR (EXISTS (SELECT 1 FROM patient_dietitian WHERE patient_dietitian.patient_id = profiles.id AND patient_dietitian.dietitian_id = get_studio_owner((select auth.uid()))))
    OR ((select auth.uid()) = id)
    OR (get_studio_owner(id) = get_studio_owner((select auth.uid())))
  );

-- Realtime per chat_group_messages (vedi SEZIONE 14)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'chat_group_messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE chat_group_messages;
  END IF;
END $$;

-- Storage bucket messaggi vocali di gruppo + policy
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('group-chat-media', 'group-chat-media', false, 10485760,
        ARRAY['audio/webm','audio/ogg','audio/mp4','audio/mpeg'])
ON CONFLICT (id) DO UPDATE SET
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

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

NOTIFY pgrst, 'reload schema';

INSERT INTO schema_migrations (id, note) VALUES
  ('sezione_102_rollback_sezione_100', 'ROLLBACK di SEZIONE 100: chat_groups/chat_group_members/chat_group_messages non erano un sistema orfano ma la chat di gruppo reale usata da broadcast.html/whatsapp.html (NutriPlan-Pro) — la diagnosi originale aveva controllato solo il repo Diet-Plan-Pro-app-claude. Ricreate tabelle/indici/RLS/policy (versione finale SEZIONE 65)/funzione is_chat_group_member (grant finale SEZIONE 94)/bucket storage/realtime. Ripristinata anche profiles_select_combined, cascade-eliminata insieme a chat_group_members: era l''UNICA policy SELECT su profiles, la sua assenza bloccava la lettura di QUALSIASI profilo per chiunque. Trovato durante il 6° giro di scansione ciclica del 2026-09-02.')
ON CONFLICT (id) DO NOTHING;
