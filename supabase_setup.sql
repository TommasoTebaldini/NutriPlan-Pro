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

-- Log peso giornaliero (compilato dal paziente)
CREATE TABLE IF NOT EXISTS weight_logs (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id    UUID        REFERENCES auth.users(id),
  cartella_id   UUID        REFERENCES cartelle(id) ON DELETE CASCADE,
  weight        NUMERIC,
  logged_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

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
    (ARRAY['patologie','fad'],'fad',false,'SINPE — Società Italiana di Nutrizione Parenterale ed Enterale','Nutrizione Artificiale Domiciliare (NAD): indicazioni, gestione e complicanze',10,'8 ore FAD','€ 50–100',ARRAY['Dietisti','Infermieri','Medici'],'Corso FAD sulla gestione della NAD: indicazioni cliniche, formule nutrizionali, dispositivi per accesso vascolare, monitoraggio metabolico e gestione complicanze.',ARRAY['NAD','NED','Nutrizione enterale domiciliare','Nutrizione parenterale','PICC','Gestione complicanze'],'https://www.sinpe.it/formazione',NULL,'2026-12-31','Verificare su sito SINPE'),
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
    (ARRAY['patologie','fad'],'fad',false,'ADI / SINPE — Nutrizione Artificiale','Nutrizione nel Paziente Critico in ICU: dalle Linee Guida alla Pratica',12,'10 ore FAD','€ 80–140 (soci/non soci)',ARRAY['Dietisti','Medici intensivisti','Infermieri di area critica'],'Corso FAD su nutrizione in ICU: timing enterale precoce, protocolli ESPEN 2023, instabilità emodinamica, ARDS, insufficienza multiorgano.',ARRAY['ICU','Terapia intensiva','Nutrizione enterale precoce','ARDS','ESPEN ICU','Instabilità emodinamica','Insufficienza multiorgano'],'https://www.sinpe.it/formazione',NULL,'2026-12-31','Verificare su sito SINPE'),
    (ARRAY['nutrizione','fad'],'fad',false,'SINU — Società Italiana di Nutrizione Umana','Interazioni Farmaco-Nutriente: dal Warfarin agli Inibitori di Pompa',8,'6 ore FAD','Gratuito per soci SINU / € 50 non soci',ARRAY['Dietisti','Farmacisti','Medici','Infermieri'],'Percorso FAD sulle principali interazioni farmaco-nutriente: warfarin/vitamina K, MAO-inibitori/tiramina, pompelmo, farmaci antiretrovirali.',ARRAY['Warfarin','Vitamina K','Interazioni farmaco-nutriente','MAO-inibitori','Tiramina','Nutrizione enterale','Pompelmo'],'https://www.sinu.it/formazione',NULL,'2026-12-31','Accesso continuativo — verificare su sito SINU'),
    (ARRAY['patologie','fad'],'fad',false,'ADI — Associazione Italiana di Dietetica e Nutrizione Clinica','Nutrizione nella Chirurgia Bariatrica: Percorso Nutrizionale Pre e Post-operatorio',10,'8 ore FAD','€ 70–120 (soci/non soci)',ARRAY['Dietisti','Chirurghi bariatrici','Medici endocrinologi'],'Corso FAD su bariatrica: valutazione preoperatoria, dieta iperproteica ipocalorica, supplementazione micronutrienti (ferro, B12, calcio, vitamina D), dumping syndrome.',ARRAY['Chirurgia bariatrica','Bypass gastrico','Sleeve gastrectomy','Dumping syndrome','Carenze micronutrienti','Supplementazione','Vitamina B12'],'https://www.adiitalia.net/formazione',NULL,'2026-12-31','Verificare disponibilità su sito ADI Italia'),
    (ARRAY['patologie','fad'],'fad',false,'AIC — Associazione Italiana Celiachia','Celiachia e Sensibilità al Glutine: dalla Diagnosi alla Gestione Dietetica Ottimale',8,'6 ore FAD','€ 40–70',ARRAY['Dietisti','Gastroenterologi','MMG','Infermieri'],'Corso FAD su celiachia: criteri diagnostici ESPGHAN 2020, SGNC, dieta senza glutine, etichettatura, contaminazione crociata, follow-up.',ARRAY['Celiachia','SGNC','Dieta senza glutine','ESPGHAN','Etichettatura','Contaminazione crociata','Anti-tTG','EMA'],'https://www.celiachia.it/formazione',NULL,'2026-12-31','Verificare disponibilità su sito AIC'),
    (ARRAY['nutrizione','fad'],'fad',false,'SIN — Società Italiana di Neonatologia / SID','Nutrizione e Integrazione in Gravidanza: Micronutrienti, DHA, Folati e Oltre',10,'8 ore FAD','€ 60–100',ARRAY['Dietisti','Ginecologi','Ostetriche','MMG'],'Percorso FAD su fabbisogni in gravidanza, supplementazione (acido folico, ferro, iodio, vitamina D, DHA, zinco, B12), nausea e vomito gravidici.',ARRAY['Gravidanza','Acido folico','DHA','Ferro in gravidanza','Vitamina D','Iodio','Peso gestazionale','Allattamento','Nausea gravidica'],'https://www.siditalia.it/formazione',NULL,'2026-12-31','Verificare disponibilità su sito SID'),
    (ARRAY['nutrizione','fad'],'fad',false,'ANDID — Associazione Nazionale Dietisti','Counseling Nutrizionale Motivazionale: Tecniche e Strumenti per il Dietista',8,'6 ore FAD','€ 50–80 (soci/non soci)',ARRAY['Dietisti','Nutrizionisti'],'Corso FAD su Motivational Interviewing, processi cognitivi nel cambiamento, SMART, gestione ambivalenza, educazione terapeutica strutturata.',ARRAY['Motivational Interviewing','Counseling','Cambiamento comportamentale','SMART','Ascolto attivo','Educazione terapeutica','Aderenza'],'https://www.andid.it/formazione',NULL,'2026-12-31','Accesso continuativo — verificare su sito ANDID'),
    (ARRAY['nutrizione','fad'],'fad',false,'ANDID — Associazione Nazionale Dietisti','Dietetica Digitale e Telemedicina: Strumenti Innovativi per il Dietista',6,'5 ore FAD','€ 40–60 (soci/non soci)',ARRAY['Dietisti','Nutrizionisti'],'Corso FAD su trasformazione digitale: software per pianificazione alimentare, telemedicina, wearables, CGM, IA in nutrizione, GDPR.',ARRAY['Telemedicina','App nutrizionali','CGM','Intelligenza artificiale','GDPR','Telemonitoraggio','Digital health','Wearables'],'https://www.andid.it/formazione',NULL,'2026-12-31','Accesso continuativo — verificare su sito ANDID'),
    (ARRAY['nutrizione','residenziale'],'residenziale',false,'SINPE — Società Italiana di Nutrizione Parenterale ed Enterale','Congresso Nazionale SINPE 2026 — Nutrizione Artificiale: Innovazioni e Nuove LG',16,'2 giorni (27–28 novembre 2026)','€ 200–380 (soci/non soci)',ARRAY['Dietisti','Medici','Infermieri','Farmacisti'],'Congresso annuale SINPE: nuove linee guida ESPEN/SINPE 2025-2026, NAD/NPD, dispositivi per accesso enterale e vascolare, workshop pratici.',ARRAY['Nutrizione artificiale','SINPE','ESPEN','NAD','NPD','Nutrizione enterale','Nutrizione parenterale','Workshop'],'https://www.sinpe.it/congresso','2026-11-27','2026-11-28','Iscrizioni aperte — verificare su sito SINPE'),
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
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='patient_dietitian_insert_own' AND tablename='patient_dietitian') THEN
    CREATE POLICY "patient_dietitian_insert_own" ON patient_dietitian
      FOR INSERT WITH CHECK (auth.uid() = dietitian_id);
  END IF;
END $$;
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

-- Aggiunge le tabelle alla pubblicazione Realtime (idempotente)
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'patient_documents','piani','ncpt','bia_records',
    'schede_valutazione','note_specialistiche',
    'daily_wellness','weight_logs','agenda_events'
  ] LOOP
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
