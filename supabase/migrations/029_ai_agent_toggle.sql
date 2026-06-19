-- Migration 029: Add AI agent toggle to whatsapp_config

ALTER TABLE whatsapp_config ADD COLUMN IF NOT EXISTS ai_agent_enabled BOOLEAN DEFAULT false;
