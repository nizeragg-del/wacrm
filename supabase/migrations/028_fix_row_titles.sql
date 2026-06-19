-- Fix: shorten list row titles to ≤24 chars (WhatsApp limit)
-- ask_tipo_site node
UPDATE flow_nodes
SET config = jsonb_set(
  config,
  '{sections,0,rows}',
  '[
    {"reply_id": "sales_page", "title": "Landing Page Vendas", "description": "Foco em conversão — ideal para vender produtos ou serviços", "next_node_key": "confirm"},
    {"reply_id": "institutional", "title": "Site Institucional", "description": "Profissional — ideal para empresas e consultórios", "next_node_key": "confirm"},
    {"reply_id": "portfolio", "title": "Portfólio", "description": "Criativo — ideal para mostrar projetos e trabalhos", "next_node_key": "confirm"},
    {"reply_id": "capture", "title": "Página de Captura", "description": "Geração de leads — ideal para captar emails", "next_node_key": "confirm"}
  ]'::jsonb
)
WHERE flow_id = 'd7e15210-996d-4838-9512-9bb14b5f565c'
  AND node_key = 'ask_tipo_site';
