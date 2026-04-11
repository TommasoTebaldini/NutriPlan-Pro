-- ═══════════════════════════════════════════════════════════════════
-- PROFILES — Setup completo della tabella profili utente
-- Eseguire questo script nel SQL Editor del progetto Supabase
-- una sola volta al primo setup (oppure ri-eseguirlo: è idempotente).
-- ═══════════════════════════════════════════════════════════════════

-- ─── 1. Crea la tabella se non esiste ────────────────────────────────────────
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

-- ─── 2. Aggiunge colonne mancanti su installazioni esistenti ─────────────────
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

-- ─── 3. Abilita RLS ──────────────────────────────────────────────────────────
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- ─── 4. Policy SELECT: ogni utente può leggere il proprio profilo ─────────────
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'profiles_select_own' AND tablename = 'profiles') THEN
    CREATE POLICY "profiles_select_own" ON profiles
      FOR SELECT USING (auth.uid() = id);
  END IF;
END $$;

-- ─── 5. Policy SELECT: l'admin può leggere tutti i profili ───────────────────
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'profiles_select_admin' AND tablename = 'profiles') THEN
    CREATE POLICY "profiles_select_admin" ON profiles
      FOR SELECT USING (
        EXISTS (
          SELECT 1 FROM profiles p
          WHERE p.id = auth.uid() AND p.is_admin = true
        )
      );
  END IF;
END $$;

-- ─── 6. Policy UPDATE: ogni utente può aggiornare il proprio profilo ─────────
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'profiles_update_own' AND tablename = 'profiles') THEN
    CREATE POLICY "profiles_update_own" ON profiles
      FOR UPDATE USING (auth.uid() = id);
  END IF;
END $$;

-- ─── 7. Policy UPDATE: l'admin può aggiornare qualsiasi profilo ──────────────
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'profiles_update_admin' AND tablename = 'profiles') THEN
    CREATE POLICY "profiles_update_admin" ON profiles
      FOR UPDATE USING (
        EXISTS (
          SELECT 1 FROM profiles p
          WHERE p.id = auth.uid() AND p.is_admin = true
        )
      );
  END IF;
END $$;

-- ─── 8. Policy INSERT: solo utenti autenticati possono inserire il proprio profilo
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'profiles_insert_own' AND tablename = 'profiles') THEN
    CREATE POLICY "profiles_insert_own" ON profiles
      FOR INSERT WITH CHECK (auth.uid() = id);
  END IF;
END $$;

-- ─── 9. Trigger per creare automaticamente il profilo alla registrazione ──────
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO profiles (id, email, approved, is_admin)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE((NEW.raw_user_meta_data->>'approved')::boolean, false),
    false
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ═══════════════════════════════════════════════════════════════════
-- COME ASSEGNARE I PRIVILEGI ADMIN AL PRIMO UTENTE
-- ─────────────────────────────────────────────────────────────────
-- Dopo aver eseguito questo script, per rendere admin il primo
-- utente esegui il seguente comando nel SQL Editor di Supabase,
-- sostituendo l'email con quella dell'utente da promuovere:
--
--   UPDATE profiles
--   SET is_admin = true, approved = true
--   WHERE email = 'tua-email@example.com';
--
-- Dopodiché il pannello Admin Utenti sarà visibile nell'app.
-- ═══════════════════════════════════════════════════════════════════
