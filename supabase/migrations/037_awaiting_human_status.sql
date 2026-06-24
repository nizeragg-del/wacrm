-- Add 'awaiting_human' status to lead_conversation_state

ALTER TABLE lead_conversation_state DROP CONSTRAINT IF EXISTS lead_conversation_state_flow_status_check;

ALTER TABLE lead_conversation_state
ADD CONSTRAINT lead_conversation_state_flow_status_check CHECK (flow_status IN (
  'initial',
  'collecting_info',
  'website_generated',
  'preview_sent',
  'awaiting_approval',
  'payment_sent',
  'payment_confirmed',
  'deploying',
  'deployed',
  'upsell_pending',
  'upsell_sent',
  'completed',
  'awaiting_human'
));
