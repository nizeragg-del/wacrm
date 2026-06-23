-- Supabase Storage bucket for CNPJ lead files

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'cnpj-files',
  'cnpj-files',
  false,
  524288000,
  ARRAY['application/json', 'text/plain', 'application/x-ndjson']
) ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload to their account folder
CREATE POLICY "Users can upload CNPJ files"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'cnpj-files'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Allow authenticated users to read their own CNPJ files
CREATE POLICY "Users can read own CNPJ files"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'cnpj-files'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Allow authenticated users to delete their own CNPJ files
CREATE POLICY "Users can delete own CNPJ files"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'cnpj-files'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Add storage_path to lead_campaigns
ALTER TABLE lead_campaigns
ADD COLUMN IF NOT EXISTS storage_path TEXT,
ADD COLUMN IF NOT EXISTS file_name TEXT;
