-- Migration 030: Simplify website flow to text-only replies
-- Replaces send_buttons/send_list with send_message + collect_input + condition nodes
-- Flow ID: d7e15210-996d-4838-9512-9bb14b5f565c

-- Delete only the nodes we're replacing
DELETE FROM flow_nodes
WHERE flow_id = 'd7e15210-996d-4838-9512-9bb14b5f565c'
AND node_key IN (
  'management_menu', 'ask_tipo_site', 'confirm', 'ask_approval',
  'generate_site'
);

-- ============================================================
-- 1. MANAGEMENT MENU (replaces send_list)
-- ============================================================

INSERT INTO flow_nodes (id, flow_id, node_key, node_type, config, position_x, position_y) VALUES
(gen_random_uuid(), 'd7e15210-996d-4838-9512-9bb14b5f565c', 'management_menu', 'send_message',
 '{"text": "Que bom te ver de novo! 😊\n\nVocê já tem um site conosco. O que deseja fazer?\n\n1️⃣ Ver meu site\n2️⃣ Alterar conteúdo\n3️⃣ Criar novo site\n\nDigite 1, 2 ou 3:", "next_node_key": "mgmt_input"}',
 300, 100);

INSERT INTO flow_nodes (id, flow_id, node_key, node_type, config, position_x, position_y) VALUES
(gen_random_uuid(), 'd7e15210-996d-4838-9512-9bb14b5f565c', 'mgmt_input', 'collect_input',
 '{"prompt_text": ".", "var_key": "mgmt_choice", "next_node_key": "mgmt_c1"}',
 300, 150);

INSERT INTO flow_nodes (id, flow_id, node_key, node_type, config, position_x, position_y) VALUES
(gen_random_uuid(), 'd7e15210-996d-4838-9512-9bb14b5f565c', 'mgmt_c1', 'condition',
 '{"subject": "var", "subject_key": "mgmt_choice", "operator": "equals", "value": "1", "true_next": "show_deploy_url", "false_next": "mgmt_c2"}',
 300, 200);

INSERT INTO flow_nodes (id, flow_id, node_key, node_type, config, position_x, position_y) VALUES
(gen_random_uuid(), 'd7e15210-996d-4838-9512-9bb14b5f565c', 'mgmt_c2', 'condition',
 '{"subject": "var", "subject_key": "mgmt_choice", "operator": "equals", "value": "2", "true_next": "ask_feedback_mgmt", "false_next": "mgmt_c3"}',
 300, 250);

INSERT INTO flow_nodes (id, flow_id, node_key, node_type, config, position_x, position_y) VALUES
(gen_random_uuid(), 'd7e15210-996d-4838-9512-9bb14b5f565c', 'mgmt_c3', 'condition',
 '{"subject": "var", "subject_key": "mgmt_choice", "operator": "equals", "value": "3", "true_next": "intro", "false_next": "mgmt_invalid"}',
 300, 300);

INSERT INTO flow_nodes (id, flow_id, node_key, node_type, config, position_x, position_y) VALUES
(gen_random_uuid(), 'd7e15210-996d-4838-9512-9bb14b5f565c', 'mgmt_invalid', 'send_message',
 '{"text": "Não entendi! 😅\n\nDigite 1, 2 ou 3:", "next_node_key": "mgmt_input"}',
 300, 350);

-- ============================================================
-- 2. ASK TIPO SITE (replaces send_list)
-- 4 branches, each with its own generate_website + hardcoded type
-- ============================================================

INSERT INTO flow_nodes (id, flow_id, node_key, node_type, config, position_x, position_y) VALUES
(gen_random_uuid(), 'd7e15210-996d-4838-9512-9bb14b5f565c', 'ask_tipo_site', 'send_message',
 '{"text": "Qual o modelo de site você prefere?\n\n1️⃣ Landing Page de Vendas\n2️⃣ Site Institucional\n3️⃣ Portfólio\n4️⃣ Página de Captura\n\nDigite 1, 2, 3 ou 4:", "next_node_key": "tipo_input"}',
 100, 1100);

INSERT INTO flow_nodes (id, flow_id, node_key, node_type, config, position_x, position_y) VALUES
(gen_random_uuid(), 'd7e15210-996d-4838-9512-9bb14b5f565c', 'tipo_input', 'collect_input',
 '{"prompt_text": ".", "var_key": "tipo_choice", "next_node_key": "tipo_c1"}',
 100, 1150);

INSERT INTO flow_nodes (id, flow_id, node_key, node_type, config, position_x, position_y) VALUES
(gen_random_uuid(), 'd7e15210-996d-4838-9512-9bb14b5f565c', 'tipo_c1', 'condition',
 '{"subject": "var", "subject_key": "tipo_choice", "operator": "equals", "value": "1", "true_next": "gen_sales", "false_next": "tipo_c2"}',
 100, 1200);

INSERT INTO flow_nodes (id, flow_id, node_key, node_type, config, position_x, position_y) VALUES
(gen_random_uuid(), 'd7e15210-996d-4838-9512-9bb14b5f565c', 'tipo_c2', 'condition',
 '{"subject": "var", "subject_key": "tipo_choice", "operator": "equals", "value": "2", "true_next": "gen_institutional", "false_next": "tipo_c3"}',
 100, 1250);

INSERT INTO flow_nodes (id, flow_id, node_key, node_type, config, position_x, position_y) VALUES
(gen_random_uuid(), 'd7e15210-996d-4838-9512-9bb14b5f565c', 'tipo_c3', 'condition',
 '{"subject": "var", "subject_key": "tipo_choice", "operator": "equals", "value": "3", "true_next": "gen_portfolio", "false_next": "tipo_c4"}',
 100, 1300);

INSERT INTO flow_nodes (id, flow_id, node_key, node_type, config, position_x, position_y) VALUES
(gen_random_uuid(), 'd7e15210-996d-4838-9512-9bb14b5f565c', 'tipo_c4', 'condition',
 '{"subject": "var", "subject_key": "tipo_choice", "operator": "equals", "value": "4", "true_next": "gen_capture", "false_next": "tipo_invalid"}',
 100, 1350);

INSERT INTO flow_nodes (id, flow_id, node_key, node_type, config, position_x, position_y) VALUES
(gen_random_uuid(), 'd7e15210-996d-4838-9512-9bb14b5f565c', 'tipo_invalid', 'send_message',
 '{"text": "Não entendi! 😅\n\nDigite 1, 2, 3 ou 4:", "next_node_key": "tipo_input"}',
 100, 1400);

-- 4 generate_website nodes, one per type (hardcoded template_type)
-- All converge to approval_prompt

INSERT INTO flow_nodes (id, flow_id, node_key, node_type, config, position_x, position_y) VALUES
(gen_random_uuid(), 'd7e15210-996d-4838-9512-9bb14b5f565c', 'gen_sales', 'generate_website',
 '{"specs": {"empresa_nome_var": "empresa_nome", "nicho_var": "nicho", "descricao_var": "descricao", "cores_var": "cores", "observacoes_var": "observacoes"}, "template_type": "sales_page", "next_node_key": "approval_prompt"}',
 100, 1450);

INSERT INTO flow_nodes (id, flow_id, node_key, node_type, config, position_x, position_y) VALUES
(gen_random_uuid(), 'd7e15210-996d-4838-9512-9bb14b5f565c', 'gen_institutional', 'generate_website',
 '{"specs": {"empresa_nome_var": "empresa_nome", "nicho_var": "nicho", "descricao_var": "descricao", "cores_var": "cores", "observacoes_var": "observacoes"}, "template_type": "institutional", "next_node_key": "approval_prompt"}',
 200, 1450);

INSERT INTO flow_nodes (id, flow_id, node_key, node_type, config, position_x, position_y) VALUES
(gen_random_uuid(), 'd7e15210-996d-4838-9512-9bb14b5f565c', 'gen_portfolio', 'generate_website',
 '{"specs": {"empresa_nome_var": "empresa_nome", "nicho_var": "nicho", "descricao_var": "descricao", "cores_var": "cores", "observacoes_var": "observacoes"}, "template_type": "portfolio", "next_node_key": "approval_prompt"}',
 300, 1450);

INSERT INTO flow_nodes (id, flow_id, node_key, node_type, config, position_x, position_y) VALUES
(gen_random_uuid(), 'd7e15210-996d-4838-9512-9bb14b5f565c', 'gen_capture', 'generate_website',
 '{"specs": {"empresa_nome_var": "empresa_nome", "nicho_var": "nicho", "descricao_var": "descricao", "cores_var": "cores", "observacoes_var": "observacoes"}, "template_type": "capture", "next_node_key": "approval_prompt"}',
 400, 1450);

-- ============================================================
-- 3. CONFIRM (replaces send_buttons)
-- ============================================================

INSERT INTO flow_nodes (id, flow_id, node_key, node_type, config, position_x, position_y) VALUES
(gen_random_uuid(), 'd7e15210-996d-4838-9512-9bb14b5f565c', 'confirm', 'send_message',
 '{"text": "Perfeito! Resumo do seu projeto:\n\n🏢 *Empresa:* {{vars.empresa_nome}}\n📌 *Segmento:* {{vars.nicho}}\n📋 *Descrição:* {{vars.descricao}}\n🎨 *Cores/Estilo:* {{vars.cores}}\n\nTudo certo?\n\n1️⃣ Sim, criar!\n2️⃣ Corrigir algo\n\nDigite 1 ou 2:", "next_node_key": "confirm_input"}',
 100, 1200);

INSERT INTO flow_nodes (id, flow_id, node_key, node_type, config, position_x, position_y) VALUES
(gen_random_uuid(), 'd7e15210-996d-4838-9512-9bb14b5f565c', 'confirm_input', 'collect_input',
 '{"prompt_text": ".", "var_key": "confirm_choice", "next_node_key": "confirm_c1"}',
 100, 1250);

INSERT INTO flow_nodes (id, flow_id, node_key, node_type, config, position_x, position_y) VALUES
(gen_random_uuid(), 'd7e15210-996d-4838-9512-9bb14b5f565c', 'confirm_c1', 'condition',
 '{"subject": "var", "subject_key": "confirm_choice", "operator": "equals", "value": "1", "true_next": "generating_message", "false_next": "confirm_c2"}',
 100, 1300);

INSERT INTO flow_nodes (id, flow_id, node_key, node_type, config, position_x, position_y) VALUES
(gen_random_uuid(), 'd7e15210-996d-4838-9512-9bb14b5f565c', 'confirm_c2', 'condition',
 '{"subject": "var", "subject_key": "confirm_choice", "operator": "equals", "value": "2", "true_next": "ask_empresa", "false_next": "confirm_invalid"}',
 100, 1350);

INSERT INTO flow_nodes (id, flow_id, node_key, node_type, config, position_x, position_y) VALUES
(gen_random_uuid(), 'd7e15210-996d-4838-9512-9bb14b5f565c', 'confirm_invalid', 'send_message',
 '{"text": "Não entendi! 😅\n\nDigite 1 para criar ou 2 para corrigir:", "next_node_key": "confirm_input"}',
 100, 1400);

-- ============================================================
-- 4. ASK APPROVAL (replaces send_buttons)
-- ============================================================

INSERT INTO flow_nodes (id, flow_id, node_key, node_type, config, position_x, position_y) VALUES
(gen_random_uuid(), 'd7e15210-996d-4838-9512-9bb14b5f565c', 'ask_approval', 'send_message',
 '{"text": "📍 *O que você achou do seu site?*\n\n1️⃣ Aprovado — Vamos pagar!\n2️⃣ Ajustar — Mudar alguma coisa\n3️⃣ Cancelar\n\nDigite 1, 2 ou 3:", "next_node_key": "approval_input"}',
 100, 1600);

INSERT INTO flow_nodes (id, flow_id, node_key, node_type, config, position_x, position_y) VALUES
(gen_random_uuid(), 'd7e15210-996d-4838-9512-9bb14b5f565c', 'approval_input', 'collect_input',
 '{"prompt_text": ".", "var_key": "approval_choice", "next_node_key": "approval_c1"}',
 100, 1650);

INSERT INTO flow_nodes (id, flow_id, node_key, node_type, config, position_x, position_y) VALUES
(gen_random_uuid(), 'd7e15210-996d-4838-9512-9bb14b5f565c', 'approval_c1', 'condition',
 '{"subject": "var", "subject_key": "approval_choice", "operator": "equals", "value": "1", "true_next": "payment_intro", "false_next": "approval_c2"}',
 100, 1700);

INSERT INTO flow_nodes (id, flow_id, node_key, node_type, config, position_x, position_y) VALUES
(gen_random_uuid(), 'd7e15210-996d-4838-9512-9bb14b5f565c', 'approval_c2', 'condition',
 '{"subject": "var", "subject_key": "approval_choice", "operator": "equals", "value": "2", "true_next": "ask_feedback", "false_next": "approval_c3"}',
 100, 1750);

INSERT INTO flow_nodes (id, flow_id, node_key, node_type, config, position_x, position_y) VALUES
(gen_random_uuid(), 'd7e15210-996d-4838-9512-9bb14b5f565c', 'approval_c3', 'condition',
 '{"subject": "var", "subject_key": "approval_choice", "operator": "equals", "value": "3", "true_next": "cancel_message", "false_next": "approval_invalid"}',
 100, 1800);

INSERT INTO flow_nodes (id, flow_id, node_key, node_type, config, position_x, position_y) VALUES
(gen_random_uuid(), 'd7e15210-996d-4838-9512-9bb14b5f565c', 'approval_invalid', 'send_message',
 '{"text": "Não entendi! 😅\n\nDigite 1 (aprovado), 2 (ajustar) ou 3 (cancelar):", "next_node_key": "approval_input"}',
 100, 1850);
