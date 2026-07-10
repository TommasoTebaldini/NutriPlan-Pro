-- ════════════════════════════════════════════════════════════════════════════
-- NutriPlan-Pro — Nuove funzionalità SQL
-- Esegui questo file nel SQL Editor di Supabase
-- ════════════════════════════════════════════════════════════════════════════

-- ─── 1-3. Gruppi broadcast / membri / messaggi broadcast ────────────────────
-- SUPERATE: mai eseguite in produzione (solo pazienti, nessuna chat
-- persistente). Sostituite da chat_groups/chat_group_members/
-- chat_group_messages + broadcast_messages in supabase_setup.sql (SEZIONE 16),
-- che supportano gruppi misti dietisti+pazienti con chat persistente stile
-- WhatsApp. Non eseguire questo blocco.

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
