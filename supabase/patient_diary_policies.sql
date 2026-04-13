-- ═══════════════════════════════════════════════════════════════════
-- Migration: enable patients to write their food/wellness diary and
--            enable Supabase Realtime on diary tables so the dietitian
--            sees updates live.
--
-- Run this script in the Supabase SQL Editor AFTER:
--   1. patient_dietitian.sql
--   2. patient_portal_policies.sql
-- This script is idempotent and can be re-run safely.
-- ═══════════════════════════════════════════════════════════════════

-- ─── 1. Ensure daily_wellness has a patient_id column ───────────────
ALTER TABLE daily_wellness
  ADD COLUMN IF NOT EXISTS patient_id UUID REFERENCES auth.users;

-- ─── 2. Ensure weight_logs has a patient_id column ──────────────────
ALTER TABLE weight_logs
  ADD COLUMN IF NOT EXISTS patient_id UUID REFERENCES auth.users;

-- ─── 3. RLS: patients can INSERT their own daily_wellness entries ────
ALTER TABLE daily_wellness ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname = 'daily_wellness_insert_patient' AND tablename = 'daily_wellness'
  ) THEN
    CREATE POLICY "daily_wellness_insert_patient" ON daily_wellness
      FOR INSERT WITH CHECK (
        auth.uid() = patient_id
        AND EXISTS (
          SELECT 1 FROM patient_dietitian
          WHERE patient_dietitian.patient_id = auth.uid()
            AND patient_dietitian.cartella_id = daily_wellness.cartella_id
        )
      );
  END IF;
END $$;

-- ─── 4. RLS: patients can SELECT their own daily_wellness entries ────
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname = 'daily_wellness_select_patient' AND tablename = 'daily_wellness'
  ) THEN
    CREATE POLICY "daily_wellness_select_patient" ON daily_wellness
      FOR SELECT USING (
        auth.uid() = patient_id
        OR EXISTS (
          SELECT 1 FROM patient_dietitian
          WHERE patient_dietitian.patient_id = auth.uid()
            AND patient_dietitian.cartella_id = daily_wellness.cartella_id
        )
      );
  END IF;
END $$;

-- ─── 5. RLS: patients can INSERT their own weight_logs entries ───────
ALTER TABLE weight_logs ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname = 'weight_logs_insert_patient' AND tablename = 'weight_logs'
  ) THEN
    CREATE POLICY "weight_logs_insert_patient" ON weight_logs
      FOR INSERT WITH CHECK (
        auth.uid() = patient_id
        AND EXISTS (
          SELECT 1 FROM patient_dietitian
          WHERE patient_dietitian.patient_id = auth.uid()
            AND patient_dietitian.cartella_id = weight_logs.cartella_id
        )
      );
  END IF;
END $$;

-- ─── 6. RLS: patients can SELECT their own weight_logs entries ───────
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname = 'weight_logs_select_patient' AND tablename = 'weight_logs'
  ) THEN
    CREATE POLICY "weight_logs_select_patient" ON weight_logs
      FOR SELECT USING (
        auth.uid() = patient_id
        OR EXISTS (
          SELECT 1 FROM patient_dietitian
          WHERE patient_dietitian.patient_id = auth.uid()
            AND patient_dietitian.cartella_id = weight_logs.cartella_id
        )
      );
  END IF;
END $$;

-- ─── 7. REPLICA IDENTITY FULL for Realtime RLS enforcement ──────────
ALTER TABLE daily_wellness REPLICA IDENTITY FULL;
ALTER TABLE weight_logs    REPLICA IDENTITY FULL;

-- ─── 8. Add diary tables to supabase_realtime publication ───────────
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['daily_wellness', 'weight_logs'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE %I', t);
    END IF;
  END LOOP;
END $$;
