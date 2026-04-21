-- ═══════════════════════════════════════════════════════════════════
-- Migration: add sleep_hours and activity columns to daily_wellness
-- ═══════════════════════════════════════════════════════════════════
ALTER TABLE daily_wellness
  ADD COLUMN IF NOT EXISTS sleep_hours NUMERIC(4,1);

ALTER TABLE daily_wellness
  ADD COLUMN IF NOT EXISTS activity TEXT;
