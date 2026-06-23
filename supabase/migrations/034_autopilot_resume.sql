-- Add last_processed_line to autopilot_config for CNPJ resume

ALTER TABLE autopilot_config 
ADD COLUMN IF NOT EXISTS last_processed_line INT DEFAULT 0;

-- Update existing configs
UPDATE autopilot_config SET last_processed_line = 0 WHERE last_processed_line IS NULL;
