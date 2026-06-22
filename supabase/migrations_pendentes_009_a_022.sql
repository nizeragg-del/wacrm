-- ============================================================
-- MIGRATIONS PENDENTES WaCRM 009 a 022
-- Cole e execute no SQL Editor do Supabase (em ordem)
-- Todas sao idempotentes - seguras de re-executar
-- ============================================================

-- ============================================================
-- 009_message_actions.sql
-- ============================================================

-- ============================================================
-- Chat actions: reply linkage + reactions
--
-- Adds two things the chat UI now needs:
--
--   1. `messages.reply_to_message_id` a self-FK so a message can
--      point at the message it replies to. We use the internal UUID
--      (not Meta's message_id text), because Meta IDs aren't unique
--      across phone numbers and can't be FK-constrained. The webhook
--      resolves `context.id` from Meta into our internal UUID before
--      writing. ON DELETE SET NULL a deleted parent must not nuke
--      its replies (which today never happens, but the constraint
--      should match intent).
--
--   2. `message_reactions` table one row per (message, actor).
--      Reactions arrive concurrently from agents (UI) and customers
--      (webhook). A row-level uniqueness constraint enforces "one
--      reaction per actor per message" without read-modify-write
--      games on a JSONB column.
--
--      `conversation_id` is denormalised purely so Supabase Realtime
--      can filter on it with a plain `eq`. Realtime can't join.
--
-- Idempotent safe to run multiple times.
-- ============================================================

-- ============================================================
-- 1. Reply linkage on messages
-- ============================================================
ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS reply_to_message_id UUID
  REFERENCES messages(id) ON DELETE SET NULL;

-- Partial index most messages aren't replies, so skip nulls.
CREATE INDEX IF NOT EXISTS idx_messages_reply_to
  ON messages(reply_to_message_id)
  WHERE reply_to_message_id IS NOT NULL;

-- ============================================================
-- 2. message_reactions
-- ============================================================
CREATE TABLE IF NOT EXISTS message_reactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  actor_type TEXT NOT NULL CHECK (actor_type IN ('customer', 'agent')),
  actor_id UUID,
  emoji TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (message_id, actor_type, actor_id)
);

CREATE INDEX IF NOT EXISTS idx_message_reactions_conversation
  ON message_reactions(conversation_id);

CREATE INDEX IF NOT EXISTS idx_message_reactions_message
  ON message_reactions(message_id);

ALTER TABLE message_reactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users see reactions on their conversations" ON message_reactions;
CREATE POLICY "Users see reactions on their conversations" ON message_reactions FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM conversations c
    WHERE c.id = message_reactions.conversation_id
      AND c.user_id = auth.uid()
  ));

DROP POLICY IF EXISTS "Users insert reactions on their conversations" ON message_reactions;
CREATE POLICY "Users insert reactions on their conversations" ON message_reactions FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM conversations c
    WHERE c.id = message_reactions.conversation_id
      AND c.user_id = auth.uid()
  ));

DROP POLICY IF EXISTS "Users delete their own agent reactions" ON message_reactions;
CREATE POLICY "Users delete their own agent reactions" ON message_reactions FOR DELETE
  USING (
    actor_type = 'agent'
    AND actor_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM conversations c
      WHERE c.id = message_reactions.conversation_id
        AND c.user_id = auth.uid()
    )
  );

-- ============================================================
-- END 009_message_actions.sql
-- ============================================================


-- ============================================================
-- 010_flows.sql
-- ============================================================

-- ============================================================
-- Automated conversation flows
--
-- Four tables supporting the visual flow builder:
--   flows        parent row (name, trigger type, status)
--   flow_nodes   nodes in the graph (node_key is the stable id
--                used in edges, not the PK)
--   flow_runs    one row per active / historical run
--   flow_run_events   ordered event log for debugging
--
-- The node config lives in a JSONB column because each node_type
-- has a different shape. The engine maps node_type to a
-- discriminated TypeScript union -- see src/lib/flows/types.ts.
--
-- RLS: these are admin-client tables (service-role bypass for the
-- engine). We create a single permissive policy so Supabase's
-- dashboard can inspect rows without hitting RLS errors.
-- ============================================================

CREATE TABLE IF NOT EXISTS flows (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL,
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  trigger_type TEXT NOT NULL CHECK (trigger_type IN ('keyword', 'first_inbound_message', 'manual')),
  trigger_config JSONB NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'archived')),
  entry_node_id TEXT,
  fallback_policy JSONB,
  execution_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS flow_nodes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  flow_id UUID NOT NULL REFERENCES flows(id) ON DELETE CASCADE,
  node_key TEXT NOT NULL,
  node_type TEXT NOT NULL,
  config JSONB NOT NULL DEFAULT '{}',
  position JSONB NOT NULL DEFAULT '{"x": 0, "y": 0}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (flow_id, node_key)
);

CREATE TABLE IF NOT EXISTS flow_runs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  flow_id UUID NOT NULL REFERENCES flows(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'handed_off', 'expired', 'error', 'paused_by_agent')),
  current_node_key TEXT NOT NULL,
  vars JSONB NOT NULL DEFAULT '{}',
  reprompt_count INT NOT NULL DEFAULT 0,
  last_prompt_message_id TEXT,
  last_advanced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  end_reason TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  CONSTRAINT fk_flow_runs_flow FOREIGN KEY (flow_id, current_node_key)
    REFERENCES flow_nodes(flow_id, node_key) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS flow_run_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  flow_run_id UUID NOT NULL REFERENCES flow_runs(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  node_key TEXT,
  payload JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Partial unique index -- only one active run per contact per account.
-- Built as a non-unique filtered index where the WHERE clause expresses
-- uniqueness (two rows can't simultaneously satisfy the WHERE).
CREATE UNIQUE INDEX IF NOT EXISTS idx_one_active_run_per_contact
  ON flow_runs(account_id, contact_id)
  WHERE status = 'active';

-- Indexes for the runner's hot path lookups.
CREATE INDEX IF NOT EXISTS idx_flow_runs_contact_active
  ON flow_runs(contact_id, status)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_flow_run_events_run
  ON flow_run_events(flow_run_id, event_type);

CREATE INDEX IF NOT EXISTS idx_flow_nodes_flow
  ON flow_nodes(flow_id);

-- RLS: permissive SELECT policies so the dashboard can inspect.
ALTER TABLE flows ENABLE ROW LEVEL SECURITY;
ALTER TABLE flow_nodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE flow_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE flow_run_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Flows are admin-managed" ON flows;
CREATE POLICY "Flows are admin-managed" ON flows
  FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Flow nodes are admin-managed" ON flow_nodes;
CREATE POLICY "Flow nodes are admin-managed" ON flow_nodes
  FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Flow runs are admin-managed" ON flow_runs;
CREATE POLICY "Flow runs are admin-managed" ON flow_runs
  FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Flow run events are admin-managed" ON flow_run_events;
CREATE POLICY "Flow run events are admin-managed" ON flow_run_events
  FOR ALL USING (true) WITH CHECK (true);

-- ============================================================
-- END 010_flows.sql
-- ============================================================


-- ============================================================
-- 011_automation_steps.sql
-- ============================================================

-- ============================================================
-- Automation steps + execution tracking
--
-- Tables:
--   automation_steps           ordered steps within an automation
--   automation_logs            per-execution log (status, results)
--   automation_pending_executions  delayed / scheduled steps
-- ============================================================

CREATE TABLE IF NOT EXISTS automation_steps (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  automation_id UUID NOT NULL REFERENCES automations(id) ON DELETE CASCADE,
  parent_step_id UUID REFERENCES automation_steps(id) ON DELETE CASCADE,
  branch TEXT CHECK (branch IN ('yes', 'no')),
  step_type TEXT NOT NULL,
  config JSONB NOT NULL DEFAULT '{}',
  position INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_automation_steps_automation
  ON automation_steps(automation_id, position);

CREATE TABLE IF NOT EXISTS automation_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  automation_id UUID NOT NULL REFERENCES automations(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'success', 'failed')),
  steps_executed JSONB DEFAULT '[]',
  error_message TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_automation_logs_automation
  ON automation_logs(automation_id);

CREATE TABLE IF NOT EXISTS automation_pending_executions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  automation_id UUID NOT NULL REFERENCES automations(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
  automation_log_id UUID REFERENCES automation_logs(id) ON DELETE CASCADE,
  step_index INT NOT NULL,
  step_type TEXT NOT NULL,
  config JSONB NOT NULL DEFAULT '{}',
  context JSONB NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'done', 'failed')),
  run_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pending_executions_due
  ON automation_pending_executions(run_at, status)
  WHERE status = 'pending';

ALTER TABLE automation_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE automation_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE automation_pending_executions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Automation steps are admin-managed" ON automation_steps;
CREATE POLICY "Automation steps are admin-managed" ON automation_steps
  FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Automation logs are admin-managed" ON automation_logs;
CREATE POLICY "Automation logs are admin-managed" ON automation_logs
  FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Pending executions are admin-managed" ON automation_pending_executions;
CREATE POLICY "Pending executions are admin-managed" ON automation_pending_executions
  FOR ALL USING (true) WITH CHECK (true);

-- ============================================================
-- END 011_automation_steps.sql
-- ============================================================


-- ============================================================
-- 012_tables.sql
-- ============================================================

-- ============================================================
-- Pipeline, broadcast, tag, and custom-field tables
--
-- This migration adds the remaining feature tables:
--   pipelines / pipeline_stages / deals  sales pipeline
--   broadcasts / broadcast_recipients    campaign sending
--   tags / contact_tags                  contact labeling
--   custom_fields / contact_custom_values  per-contact metadata
--   contact_notes                        per-contact notes
--   message_templates                    WABA template cache
-- ============================================================

-- -----------------------------------------------------------
-- Pipelines (sales CRM)
-- -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS pipelines (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL,
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pipeline_stages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  pipeline_id UUID NOT NULL REFERENCES pipelines(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#6B7280',
  position INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS deals (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL,
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  pipeline_id UUID NOT NULL REFERENCES pipelines(id) ON DELETE CASCADE,
  stage_id UUID NOT NULL REFERENCES pipeline_stages(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  value NUMERIC(12, 2),
  currency TEXT NOT NULL DEFAULT 'BRL',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- -----------------------------------------------------------
-- Broadcasts
-- -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS broadcasts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL,
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  template_name TEXT,
  template_params JSONB DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'scheduled', 'sending', 'sent', 'failed')),
  scheduled_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS broadcast_recipients (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  broadcast_id UUID NOT NULL REFERENCES broadcasts(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  phone TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'delivered', 'read', 'replied', 'failed')),
  whatsapp_message_id TEXT,
  sent_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  read_at TIMESTAMPTZ,
  replied_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- -----------------------------------------------------------
-- Tags
-- -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS tags (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL,
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#6B7280',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS contact_tags (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  tag_id UUID NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (contact_id, tag_id)
);

-- -----------------------------------------------------------
-- Custom fields
-- -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS custom_fields (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL,
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  field_name TEXT NOT NULL,
  field_type TEXT NOT NULL DEFAULT 'text',
  field_options JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS contact_custom_values (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  custom_field_id UUID NOT NULL REFERENCES custom_fields(id) ON DELETE CASCADE,
  value TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (contact_id, custom_field_id)
);

-- -----------------------------------------------------------
-- Contact notes
-- -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS contact_notes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  note_text TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- -----------------------------------------------------------
-- Message templates (Meta WABA template cache)
-- -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS message_templates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL,
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  language TEXT NOT NULL DEFAULT 'pt_BR',
  category TEXT NOT NULL DEFAULT 'UTILITY',
  header_type TEXT,
  header_text TEXT,
  header_media_url TEXT,
  body_text TEXT NOT NULL,
  footer_text TEXT,
  buttons JSONB DEFAULT '[]',
  sample_values JSONB DEFAULT '[]',
  meta_template_id TEXT,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('APPROVED', 'PENDING', 'REJECTED', 'PAUSED', 'DISABLED', 'DRAFT', 'IN_APPEAL', 'PENDING_DELETION')),
  quality_score TEXT CHECK (quality_score IN ('GREEN', 'YELLOW', 'RED')),
  rejection_reason TEXT,
  submission_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (account_id, name, language)
);

CREATE INDEX IF NOT EXISTS idx_message_templates_account
  ON message_templates(account_id);

-- RLS for all new tables
ALTER TABLE pipelines ENABLE ROW LEVEL SECURITY;
ALTER TABLE pipeline_stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE deals ENABLE ROW LEVEL SECURITY;
ALTER TABLE broadcasts ENABLE ROW LEVEL SECURITY;
ALTER TABLE broadcast_recipients ENABLE ROW LEVEL SECURITY;
ALTER TABLE tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE contact_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE custom_fields ENABLE ROW LEVEL SECURITY;
ALTER TABLE contact_custom_values ENABLE ROW LEVEL SECURITY;
ALTER TABLE contact_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE message_templates ENABLE ROW LEVEL SECURITY;

-- RLS policies (all account-scoped)
CREATE OR REPLACE FUNCTION account_id_from_profile()
RETURNS UUID LANGUAGE SQL STABLE AS $$
  SELECT account_id FROM profiles WHERE user_id = auth.uid();
$$;

DROP POLICY IF EXISTS "Account-scoped SELECT" ON pipelines;
CREATE POLICY "Account-scoped SELECT" ON pipelines FOR SELECT
  USING (account_id = account_id_from_profile());

DROP POLICY IF EXISTS "Account-scoped INSERT" ON pipelines;
CREATE POLICY "Account-scoped INSERT" ON pipelines FOR INSERT
  WITH CHECK (account_id = account_id_from_profile());

DROP POLICY IF EXISTS "Account-scoped UPDATE" ON pipelines;
CREATE POLICY "Account-scoped UPDATE" ON pipelines FOR UPDATE
  USING (account_id = account_id_from_profile());

DROP POLICY IF EXISTS "Account-scoped DELETE" ON pipelines;
CREATE POLICY "Account-scoped DELETE" ON pipelines FOR DELETE
  USING (account_id = account_id_from_profile());

-- Apply same pattern to all tables
DO $$ DECLARE
  tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['pipeline_stages','deals','broadcasts','broadcast_recipients','tags','contact_tags','custom_fields','contact_custom_values','contact_notes','message_templates']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS "Account-scoped SELECT" ON %I', tbl);
    EXECUTE format('CREATE POLICY "Account-scoped SELECT" ON %I FOR SELECT USING (account_id = account_id_from_profile())', tbl);
    EXECUTE format('DROP POLICY IF EXISTS "Account-scoped INSERT" ON %I', tbl);
    EXECUTE format('CREATE POLICY "Account-scoped INSERT" ON %I FOR INSERT WITH CHECK (account_id = account_id_from_profile())', tbl);
    EXECUTE format('DROP POLICY IF EXISTS "Account-scoped UPDATE" ON %I', tbl);
    EXECUTE format('CREATE POLICY "Account-scoped UPDATE" ON %I FOR UPDATE USING (account_id = account_id_from_profile())', tbl);
    EXECUTE format('DROP POLICY IF EXISTS "Account-scoped DELETE" ON %I', tbl);
    EXECUTE format('CREATE POLICY "Account-scoped DELETE" ON %I FOR DELETE USING (account_id = account_id_from_profile())', tbl);
  END LOOP;
END $$;

-- ============================================================
-- END 012_tables.sql
-- ============================================================


-- ============================================================
-- 013_account_invitations.sql
-- ============================================================


-- ============================================================
-- 014_tags_unique.sql
-- ============================================================


-- ============================================================
-- 015_add_avatar_url.sql
-- ============================================================


-- ============================================================
-- 016_add_whatsapp_config_verify_token.sql
-- ============================================================


-- ============================================================
-- 017_account_sharing
-- ============================================================


-- ============================================================
-- 018_automations_rls_multi_user.sql
-- ============================================================


-- ============================================================
-- 019_rebuild_automations.sql
-- ============================================================


-- ============================================================
-- 020_contacts_extras.sql
-- ============================================================


-- ============================================================
-- 021_broadcast_rls.sql
-- ============================================================


-- ============================================================
-- 022_contact_phone_normalized.sql
-- ============================================================


