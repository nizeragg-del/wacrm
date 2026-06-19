-- ============================================================
-- MIGRATION 023 - Website Generator
-- Tabela para pedidos de criação de sites
-- ============================================================

CREATE TABLE IF NOT EXISTS website_orders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,

  status TEXT NOT NULL DEFAULT 'collecting'
    CHECK (status IN (
      'collecting',
      'generating',
      'awaiting_approval',
      'regenerating',
      'awaiting_payment',
      'deploying',
      'deployed',
      'cancelled',
      'failed'
    )),

  template_type TEXT NOT NULL
    CHECK (template_type IN ('sales_page', 'institutional', 'portfolio', 'capture', 'event')),

  specifications JSONB NOT NULL DEFAULT '{}',
  feedback TEXT,
  generation_count INT NOT NULL DEFAULT 0,
  max_regenerations INT NOT NULL DEFAULT 3,
  error_message TEXT,

  generated_code TEXT,
  screenshots JSONB DEFAULT '[]',

  asaas_payment_id TEXT,
  asaas_payment_value NUMERIC(10,2),
  pix_qrcode TEXT,
  pix_copiaecola TEXT,

  repo_url TEXT,
  deploy_url TEXT,
  vercel_deployment_id TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_website_orders_account
  ON website_orders(account_id);

CREATE INDEX IF NOT EXISTS idx_website_orders_contact
  ON website_orders(contact_id);

CREATE INDEX IF NOT EXISTS idx_website_orders_status
  ON website_orders(status);

CREATE INDEX IF NOT EXISTS idx_website_orders_asaas_payment
  ON website_orders(asaas_payment_id)
  WHERE asaas_payment_id IS NOT NULL;

ALTER TABLE website_orders ENABLE ROW LEVEL SECURITY;

-- Helper function for RLS policies (idempotent)
CREATE OR REPLACE FUNCTION account_id_from_profile()
RETURNS UUID LANGUAGE SQL STABLE AS $$
  SELECT account_id FROM profiles WHERE user_id = auth.uid();
$$;

DROP POLICY IF EXISTS "Website orders account-scoped SELECT" ON website_orders;
CREATE POLICY "Website orders account-scoped SELECT" ON website_orders FOR SELECT
  USING (account_id = account_id_from_profile());

DROP POLICY IF EXISTS "Website orders account-scoped INSERT" ON website_orders;
CREATE POLICY "Website orders account-scoped INSERT" ON website_orders FOR INSERT
  WITH CHECK (account_id = account_id_from_profile());

DROP POLICY IF EXISTS "Website orders account-scoped UPDATE" ON website_orders;
CREATE POLICY "Website orders account-scoped UPDATE" ON website_orders FOR UPDATE
  USING (account_id = account_id_from_profile());

DROP POLICY IF EXISTS "Website orders account-scoped DELETE" ON website_orders;
CREATE POLICY "Website orders account-scoped DELETE" ON website_orders FOR DELETE
  USING (account_id = account_id_from_profile());

-- ============================================================
-- END 023_website_orders.sql
-- ============================================================
