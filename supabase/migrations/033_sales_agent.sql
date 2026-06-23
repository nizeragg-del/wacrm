-- Sales Agent - Conversation state tracking

CREATE TABLE lead_conversation_state (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  lead_id UUID REFERENCES captured_leads(id) ON DELETE SET NULL,
  
  -- Flow status
  flow_status TEXT DEFAULT 'initial' CHECK (flow_status IN (
    'initial',           -- Just started, waiting for response
    'collecting_info',   -- Gathering business details
    'website_generated', -- Site created, awaiting approval
    'preview_sent',      -- Preview sent to customer
    'awaiting_approval', -- Waiting for customer to approve
    'payment_sent',      -- PIX sent
    'payment_confirmed', -- Payment received
    'deploying',         -- Deploying site
    'deployed',          -- Site live
    'upsell_pending',    -- Ready for upsell offer
    'upsell_sent',       -- Upsell offer sent
    'completed'          -- All done
  )),
  
  -- Collected business info
  business_name TEXT,
  business_type TEXT,
  address TEXT,
  phone TEXT,
  description TEXT,
  preferences TEXT,
  
  -- Website data
  website_order_id UUID,
  website_url TEXT,
  screenshot_url TEXT,
  
  -- Payment data
  payment_id TEXT,
  payment_status TEXT,
  payment_amount DECIMAL DEFAULT 147.90,
  
  -- Upsell data
  upsell_sent_at TIMESTAMPTZ,
  upsell_type TEXT,
  
  -- Timestamps
  last_message_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_lead_conversation_state_contact ON lead_conversation_state(contact_id);
CREATE INDEX idx_lead_conversation_state_account ON lead_conversation_state(account_id);
CREATE INDEX idx_lead_conversation_state_status ON lead_conversation_state(flow_status);

-- RLS
ALTER TABLE lead_conversation_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own account conversations" ON lead_conversation_state
  FOR SELECT USING (account_id = (SELECT account_id FROM profiles WHERE user_id = auth.uid()));

CREATE POLICY "Users can create conversations for own account" ON lead_conversation_state
  FOR INSERT WITH CHECK (account_id = (SELECT account_id FROM profiles WHERE user_id = auth.uid()));

CREATE POLICY "Users can update own account conversations" ON lead_conversation_state
  FOR UPDATE USING (account_id = (SELECT account_id FROM profiles WHERE user_id = auth.uid()));

CREATE POLICY "Users can delete own account conversations" ON lead_conversation_state
  FOR DELETE USING (account_id = (SELECT account_id FROM profiles WHERE user_id = auth.uid()));
