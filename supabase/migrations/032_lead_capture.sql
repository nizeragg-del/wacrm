-- Lead Capture tables for automated client prospecting

-- Campaigns table
CREATE TABLE lead_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  name TEXT NOT NULL,
  location TEXT NOT NULL,
  category TEXT NOT NULL,
  radius_meters INT DEFAULT 5000,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed')),
  total_found INT DEFAULT 0,
  total_without_website INT DEFAULT 0,
  total_contacted INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Captured leads table
CREATE TABLE captured_leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID REFERENCES lead_campaigns(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  business_name TEXT NOT NULL,
  business_type TEXT,
  address TEXT,
  phone TEXT,
  email TEXT,
  osm_id BIGINT,
  latitude DECIMAL(10, 8),
  longitude DECIMAL(11, 8),
  has_website BOOLEAN DEFAULT FALSE,
  website_url TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'contacted', 'responded', 'converted')),
  proposal_message TEXT,
  whatsapp_message_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_lead_campaigns_account_id ON lead_campaigns(account_id);
CREATE INDEX idx_lead_campaigns_status ON lead_campaigns(status);
CREATE INDEX idx_captured_leads_campaign_id ON captured_leads(campaign_id);
CREATE INDEX idx_captured_leads_account_id ON captured_leads(account_id);
CREATE INDEX idx_captured_leads_contact_id ON captured_leads(contact_id);
CREATE INDEX idx_captured_leads_status ON captured_leads(status);

-- Unique constraint: prevent duplicate phone numbers per account
-- (a phone can only be contacted once per account, across all campaigns)
CREATE UNIQUE INDEX idx_captured_leads_phone_account 
  ON captured_leads(phone, account_id) 
  WHERE status IN ('contacted', 'converted');

-- RLS policies
ALTER TABLE lead_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE captured_leads ENABLE ROW LEVEL SECURITY;

-- lead_campaigns: users can only see their own account's campaigns
CREATE POLICY "Users can view own account campaigns"
  ON lead_campaigns FOR SELECT
  USING (account_id = (
    SELECT account_id FROM profiles WHERE user_id = auth.uid()
  ));

CREATE POLICY "Users can create campaigns for own account"
  ON lead_campaigns FOR INSERT
  WITH CHECK (account_id = (
    SELECT account_id FROM profiles WHERE user_id = auth.uid()
  ));

CREATE POLICY "Users can update own account campaigns"
  ON lead_campaigns FOR UPDATE
  USING (account_id = (
    SELECT account_id FROM profiles WHERE user_id = auth.uid()
  ));

CREATE POLICY "Users can delete own account campaigns"
  ON lead_campaigns FOR DELETE
  USING (account_id = (
    SELECT account_id FROM profiles WHERE user_id = auth.uid()
  ));

-- captured_leads: users can only see their own account's leads
CREATE POLICY "Users can view own account leads"
  ON captured_leads FOR SELECT
  USING (account_id = (
    SELECT account_id FROM profiles WHERE user_id = auth.uid()
  ));

CREATE POLICY "Users can create leads for own account"
  ON captured_leads FOR INSERT
  WITH CHECK (account_id = (
    SELECT account_id FROM profiles WHERE user_id = auth.uid()
  ));

CREATE POLICY "Users can update own account leads"
  ON captured_leads FOR UPDATE
  USING (account_id = (
    SELECT account_id FROM profiles WHERE user_id = auth.uid()
  ));

CREATE POLICY "Users can delete own account leads"
  ON captured_leads FOR DELETE
  USING (account_id = (
    SELECT account_id FROM profiles WHERE user_id = auth.uid()
  ));

-- RPC function to atomically increment contacted counter
CREATE OR REPLACE FUNCTION increment_campaign_contacted(p_campaign_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE lead_campaigns
  SET total_contacted = total_contacted + 1,
      updated_at = NOW()
  WHERE id = p_campaign_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
