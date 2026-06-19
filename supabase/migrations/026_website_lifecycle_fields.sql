-- Migration 026: Add lifecycle fields to website_orders + scheduled_reminders

-- New columns for website_orders
ALTER TABLE website_orders ADD COLUMN IF NOT EXISTS whatsapp_number TEXT;
ALTER TABLE website_orders ADD COLUMN IF NOT EXISTS has_logo BOOLEAN DEFAULT false;
ALTER TABLE website_orders ADD COLUMN IF NOT EXISTS logo_url TEXT;
ALTER TABLE website_orders ADD COLUMN IF NOT EXISTS custom_domain TEXT;
ALTER TABLE website_orders ADD COLUMN IF NOT EXISTS upsell_domain_bought BOOLEAN DEFAULT false;
ALTER TABLE website_orders ADD COLUMN IF NOT EXISTS preview_expires_at TIMESTAMPTZ;

-- Scheduled reminders for abandonment recovery
CREATE TABLE IF NOT EXISTS scheduled_reminders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID REFERENCES website_orders(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL,
  conversation_id UUID NOT NULL,
  account_id UUID NOT NULL,
  user_id UUID NOT NULL,
  remind_at TIMESTAMPTZ NOT NULL,
  message_template TEXT NOT NULL,
  sent BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_scheduled_reminders_pending
  ON scheduled_reminders(sent, remind_at)
  WHERE sent = false;

ALTER TABLE scheduled_reminders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role manages scheduled_reminders" ON scheduled_reminders;
CREATE POLICY "Service role manages scheduled_reminders" ON scheduled_reminders
  FOR ALL USING (auth.role() = 'service_role');
