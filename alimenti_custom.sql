-- ═══════════════════════════════════════════════════════════════════
-- Migration: allow dietitians to read their patients' daily_wellness
--            and weight_logs entries (for the "Andamento" view)
-- ═══════════════════════════════════════════════════════════════════

-- daily_wellness: dietitian can SELECT entries for their patients' cartelle
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname = 'daily_wellness_select_dietitian' AND tablename = 'daily_wellness'
  ) THEN
    CREATE POLICY "daily_wellness_select_dietitian" ON daily_wellness
      FOR SELECT USING (
        EXISTS (
          SELECT 1 FROM patient_dietitian
          WHERE patient_dietitian.dietitian_id = auth.uid()
            AND patient_dietitian.cartella_id = daily_wellness.cartella_id
        )
      );
  END IF;
END $$;

-- weight_logs: dietitian can SELECT entries for their patients' cartelle
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname = 'weight_logs_select_dietitian' AND tablename = 'weight_logs'
  ) THEN
    CREATE POLICY "weight_logs_select_dietitian" ON weight_logs
      FOR SELECT USING (
        EXISTS (
          SELECT 1 FROM patient_dietitian
          WHERE patient_dietitian.dietitian_id = auth.uid()
            AND patient_dietitian.cartella_id = weight_logs.cartella_id
        )
      );
  END IF;
END $$;
