-- Add CNPJ job tracking columns to autopilot_config

ALTER TABLE autopilot_config
ADD COLUMN IF NOT EXISTS cnpj_storage_paths JSONB,
ADD COLUMN IF NOT EXISTS cnpj_file_name TEXT,
ADD COLUMN IF NOT EXISTS cnpj_target_leads INT DEFAULT 100,
ADD COLUMN IF NOT EXISTS cnpj_job_status TEXT DEFAULT NULL CHECK (cnpj_job_status IN ('pending', 'running', 'completed', 'failed'));
