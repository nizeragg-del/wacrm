-- Migration 027b: Add new node types to flow_nodes CHECK constraint

-- Drop the existing CHECK constraint
ALTER TABLE flow_nodes DROP CONSTRAINT IF EXISTS flow_nodes_node_type_check;

-- Re-create with all node types including new ones
ALTER TABLE flow_nodes ADD CONSTRAINT flow_nodes_node_type_check CHECK (node_type IN (
  'start',
  'send_message',
  'send_buttons',
  'send_list',
  'send_media',
  'collect_input',
  'condition',
  'set_tag',
  'handoff',
  'end',
  'generate_website',
  'create_payment',
  'http_fetch',
  'website_order_check',
  'schedule_reminder',
  'auto_confirm_payment'
));
