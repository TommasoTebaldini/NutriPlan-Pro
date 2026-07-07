-- ════════════════════════════════════════════════════════════════════════════
-- NutriPlan-Pro — Nuove funzionalità SQL
-- Esegui questo file nel SQL Editor di Supabase
-- ════════════════════════════════════════════════════════════════════════════

-- ─── 1. Gruppi broadcast ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS patient_groups (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  dietitian_id UUID REFERENCES auth.users NOT NULL,
  name TEXT NOT NULL,
  color TEXT DEFAULT '#0F766E',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE patient_groups ENABLE ROW LEVEL SECURITY;
CREATE POLICY "dietitian_own_groups" ON patient_groups
  FOR ALL USING (auth.uid() = dietitian_id);

-- ─── 2. Membri dei gruppi ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS patient_group_members (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  group_id UUID REFERENCES patient_groups(id) ON DELETE CASCADE NOT NULL,
  patient_id UUID REFERENCES auth.users NOT NULL,
  UNIQUE(group_id, patient_id)
);
ALTER TABLE patient_group_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "dietitian_group_members" ON patient_group_members
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM patient_groups
      WHERE id = patient_group_members.group_id
      AND dietitian_id = auth.uid()
    )
  );

-- ─── 3. Messaggi broadcast ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS broadcast_messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  dietitian_id UUID REFERENCES auth.users NOT NULL,
  message_text TEXT NOT NULL,
  message_type TEXT DEFAULT 'chat' CHECK (message_type IN ('chat', 'notification')),
  recipients_count INT DEFAULT 0,
  patient_ids UUID[] DEFAULT '{}',
  group_name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE broadcast_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "dietitian_own_broadcasts" ON broadcast_messages
  FOR ALL USING (auth.uid() = dietitian_id);

-- ─── 4. Studio Associato (Multi-dietitian) ──────────────────────────────────
CREATE TABLE IF NOT EXISTS studio_members (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  admin_id UUID REFERENCES auth.users NOT NULL,
  member_id UUID REFERENCES profiles(id) NOT NULL,
  access_level TEXT DEFAULT 'full' CHECK (access_level IN ('full', 'selected')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(admin_id, member_id)
);
ALTER TABLE studio_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "studio_admin_manage" ON studio_members
  FOR ALL USING (auth.uid() = admin_id OR auth.uid() = member_id);

-- ─── 5. Firme elettroniche ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS patient_signatures (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  patient_id UUID REFERENCES auth.users,
  doc_id UUID,
  signature_url TEXT,
  signed_at TIMESTAMPTZ NOT NULL,
  context TEXT DEFAULT 'documento',
  dietitian_id UUID REFERENCES auth.users,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE patient_signatures ENABLE ROW LEVEL SECURITY;
CREATE POLICY "dietitian_signatures" ON patient_signatures
  FOR ALL USING (auth.uid() = dietitian_id OR auth.uid() = patient_id);

-- ─── 6. Permesso storage per firme ──────────────────────────────────────────
-- Esegui questo separatamente dal pannello Storage di Supabase:
-- 1. Crea un bucket chiamato "patient-signatures" (privato)
-- 2. Aggiungi una policy "Authenticated upload" per INSERT con auth.role() = 'authenticated'
-- 3. Aggiungi una policy "Dietitian read" per SELECT con auth.role() = 'authenticated'

-- ─── 6b. Aggiungi colonna signature_data_url a patient_consents ─────────────
ALTER TABLE patient_consents ADD COLUMN IF NOT EXISTS signature_data_url TEXT;

-- ─── 7. Indice per prestazioni broadcast ────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_broadcast_dietitian ON broadcast_messages(dietitian_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_studio_member ON studio_members(member_id);
CREATE INDEX IF NOT EXISTS idx_studio_admin ON studio_members(admin_id);
CREATE INDEX IF NOT EXISTS idx_group_member ON patient_group_members(group_id, patient_id);

-- ─── 8. Aggiorna RLS cartelle per studio associato ──────────────────────────
-- Se vuoi che i membri dello studio vedano le cartelle dei pazienti dell'admin,
-- aggiorna la policy sulla tabella cartelle (o patient_documents):
-- NOTA: cambia "cartelle_pazienti" con il nome reale della tabella se diverso.

-- Esempio policy per condivisione studio (DA ADATTARE al nome della tua tabella):
-- CREATE POLICY "studio_member_access" ON cartelle_pazienti
--   FOR SELECT USING (
--     dietitian_id = auth.uid()
--     OR EXISTS (
--       SELECT 1 FROM studio_members
--       WHERE admin_id = cartelle_pazienti.dietitian_id
--       AND member_id = auth.uid()
--       AND access_level = 'full'
--     )
--   );
