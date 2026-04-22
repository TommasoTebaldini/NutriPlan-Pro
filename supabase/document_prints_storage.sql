-- ═══════════════════════════════════════════════════════════════════
-- Migration: print_image_url column + document-prints storage bucket
--
-- Adds a `print_image_url TEXT` column to all document tables that have
-- a printable sheet, creates a public Storage bucket `document-prints`
-- and configures RLS so that:
--   * the dietitian linked to a patient (via patient_dietitian) can
--     INSERT / UPDATE / DELETE under  document-prints/<patient_id>/...
--   * the patient themselves and their dietitian can SELECT (read)
--     objects under their own folder
--
-- Run this in the Supabase SQL Editor.  Idempotent.
-- ═══════════════════════════════════════════════════════════════════

-- ─── 1. print_image_url column on every printable-doc table ────────────
DO $$
DECLARE
  t TEXT;
  tbls TEXT[] := ARRAY[
    'patient_documents',
    'piani',
    'ncpt',
    'bia_records',
    'schede_valutazione',
    'consigli',
    'note_specialistiche'
  ];
BEGIN
  FOREACH t IN ARRAY tbls LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables
               WHERE table_schema='public' AND table_name=t) THEN
      EXECUTE format(
        'ALTER TABLE %I ADD COLUMN IF NOT EXISTS print_image_url TEXT',
        t
      );
    END IF;
  END LOOP;
END $$;

-- ─── 2. Storage bucket (public read, RLS-controlled writes) ────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'document-prints',
  'document-prints',
  TRUE,
  10485760,                 -- 10 MB per file
  ARRAY['image/png','image/jpeg','image/webp']
)
ON CONFLICT (id) DO UPDATE
  SET public = EXCLUDED.public,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

-- ─── 3. Storage RLS policies ────────────────────────────────────────────
-- Path convention:  document-prints/<patient_id>/<document_id>.png
-- The first path segment (storage.foldername(name))[1] is the patient UUID.

-- Dietitian linked to the patient: full write access to that patient's folder.
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

-- The patient themselves: read-only access to their own folder.
DROP POLICY IF EXISTS "document_prints_patient_read" ON storage.objects;
CREATE POLICY "document_prints_patient_read" ON storage.objects
  FOR SELECT
  USING (
    bucket_id = 'document-prints'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- The dietitian can also SELECT (already covered by the FOR ALL policy
-- above, but kept explicit for clarity if the bucket is later switched
-- to private = false).

-- ═══════════════════════════════════════════════════════════════════
-- DONE — verify with:
--   SELECT column_name FROM information_schema.columns
--     WHERE table_name='patient_documents' AND column_name='print_image_url';
--   SELECT id, public FROM storage.buckets WHERE id='document-prints';
--   SELECT policyname FROM pg_policies
--     WHERE schemaname='storage' AND tablename='objects'
--     AND policyname LIKE 'document_prints_%';
-- ═══════════════════════════════════════════════════════════════════
