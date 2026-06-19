-- ============================================================
-- MIGRATION 024 — add website generator node types + seed flow
-- ============================================================

-- 1. Altera a CHECK constraint para aceitar os novos tipos de nó
ALTER TABLE flow_nodes DROP CONSTRAINT IF EXISTS flow_nodes_node_type_check;
ALTER TABLE flow_nodes ADD CONSTRAINT flow_nodes_node_type_check
  CHECK (node_type IN (
    'start', 'send_buttons', 'send_list', 'send_message',
    'collect_input', 'condition', 'set_tag', 'handoff',
    'http_fetch', 'end', 'generate_website', 'create_payment'
  ));

-- 2. Seeds o flow "Criação de Site Automática" para o usuário
DO $$
DECLARE
  v_user_id    UUID;
  v_account_id UUID;
  v_flow_id    UUID;
BEGIN
  -- Busca o usuário pelo email (ajuste se seu email for diferente)
  SELECT id INTO v_user_id FROM auth.users WHERE email = 'dnlmarianoneto@gmail.com';
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'User with email dnlmarianoneto@gmail.com not found in auth.users';
  END IF;

  -- Busca o account_id do perfil
  SELECT account_id INTO v_account_id FROM profiles WHERE user_id = v_user_id;
  IF v_account_id IS NULL THEN
    RAISE EXCEPTION 'Profile not found for user %', v_user_id;
  END IF;

  -- Remove flow anterior (se existir) pra ser idempotente
  DELETE FROM flow_nodes WHERE flow_id IN (
    SELECT id FROM flows WHERE name = 'Criação de Site Automática' AND user_id = v_user_id
  );
  DELETE FROM flows WHERE name = 'Criação de Site Automática' AND user_id = v_user_id;

  -- Insere o flow
  INSERT INTO flows (
    user_id, account_id, name, description, status,
    trigger_type, trigger_config, entry_node_id
  ) VALUES (
    v_user_id, v_account_id,
    'Criação de Site Automática',
    'Capture as especificações do lead, gere uma landing page com IA, envie screenshots, aprove/cobre e faça deploy automático.',
    'draft',
    'keyword',
    '{"keywords":["quero site","criar site","landing page","fazer site","site profissional"],"match_type":"contains"}'::jsonb,
    'start'
  )
  RETURNING id INTO v_flow_id;

  -- Insere os nós
  INSERT INTO flow_nodes (flow_id, node_key, node_type, config, position_x, position_y) VALUES

  (v_flow_id, 'start',              'start',             '{"next_node_key":"intro"}'::jsonb,                                                                               0, 0),

  (v_flow_id, 'intro',              'send_message',      '{"text":"Olá! 👋 Vou te ajudar a criar um site incrível para o seu negócio.\n\nVou fazer algumas perguntas rápidas para entender o que você precisa. Depois, minha IA vai gerar o site, você aprova e eu cuido da publicação!\n\nVamos começar?","next_node_key":"ask_empresa"}'::jsonb, 200, 0),

  (v_flow_id, 'ask_empresa',        'collect_input',     '{"prompt_text":"Qual o nome da sua empresa ou negócio?","var_key":"empresa_nome","next_node_key":"ask_nicho"}'::jsonb, 400, 0),

  (v_flow_id, 'ask_nicho',          'collect_input',     '{"prompt_text":"Qual o nicho/ramo do seu negócio? (ex: advocacia, estética, restaurante, academia, imobiliária...)","var_key":"nicho","next_node_key":"ask_descricao"}'::jsonb, 600, 0),

  (v_flow_id, 'ask_descricao',      'collect_input',     '{"prompt_text":"Me conta um pouco mais sobre o que sua empresa faz e qual o principal produto ou serviço que você quer vender.","var_key":"descricao","next_node_key":"ask_cores"}'::jsonb, 800, 0),

  (v_flow_id, 'ask_cores',          'collect_input',     '{"prompt_text":"Tem alguma cor ou paleta de cores que você prefere? Se não souber, me diga o estilo que você gosta (ex: moderno, elegante, divertido, sóbrio) e eu escolho as melhores cores!","var_key":"cores","next_node_key":"confirm"}'::jsonb, 1000, 0),

  (v_flow_id, 'confirm',            'send_buttons',      '{"text":"Pronto! Com essas informações já posso criar seu site.\n\n📋 Resumo:\n• Empresa: {{vars.empresa_nome}}\n• Nicho: {{vars.nicho}}\n• Descrição: {{vars.descricao}}\n• Cores: {{vars.cores}}\n\nPosso começar a criar?","buttons":[{"reply_id":"start_generate","title":"Sim, criar!","next_node_key":"generating_message"},{"reply_id":"fix_info","title":"Corrigir algo","next_node_key":"ask_empresa"}]}'::jsonb, 1200, 0),

  (v_flow_id, 'generating_message', 'send_message',      '{"text":"Ótimo! 🤖 Dei o comando para minha IA criar seu site.\n\nEla está gerando o HTML, capturando screenshots de cada seção... Isso leva alguns segundos!","next_node_key":"generate_site"}'::jsonb, 1400, 0),

  (v_flow_id, 'generate_site',      'generate_website',  '{"specs":{"empresa_nome_var":"empresa_nome","nicho_var":"nicho","descricao_var":"descricao","cores_var":"cores"},"template_type":"sales_page","next_node_key":"approval_prompt"}'::jsonb, 1600, 0),

  (v_flow_id, 'approval_prompt',    'send_message',      '{"text":"Aqui estão as prévias do seu site! 👆\n\nDê uma olhada em cada seção que enviei acima.","next_node_key":"ask_approval"}'::jsonb, 1800, 0),

  (v_flow_id, 'ask_approval',       'send_buttons',      '{"text":"O que você achou do seu site?","buttons":[{"reply_id":"approve","title":"✅ Aprovado!","next_node_key":"payment_intro"},{"reply_id":"adjust","title":"🔧 Ajustar","next_node_key":"ask_feedback"},{"reply_id":"cancel","title":"❌ Cancelar","next_node_key":"cancel_message"}]}'::jsonb, 2000, 0),

  (v_flow_id, 'ask_feedback',       'collect_input',     '{"prompt_text":"Me conta o que você gostaria de mudar no site? Pode ser sobre cores, texto, layout, seções... O que você acha que precisa melhorar?","var_key":"feedback","next_node_key":"regenerating_message"}'::jsonb, 2200, 0),

  (v_flow_id, 'regenerating_message','send_message',     '{"text":"Entendi! Vou refazer o site com suas alterações. 🚀\n\nIsso leva alguns segundos...","next_node_key":"generate_site"}'::jsonb, 2400, 0),

  (v_flow_id, 'payment_intro',      'send_message',      '{"text":"Que bom que você aprovou! 🎉\n\nAgora vamos finalizar. O valor para criar e publicar seu site é de apenas R$ 197,00.\n\nVou gerar um PIX pra você realizar o pagamento.","next_node_key":"create_payment_node"}'::jsonb, 2600, 0),

  (v_flow_id, 'create_payment_node','create_payment',    '{"order_id_var":"website_order_id","payment_value":197,"next_node_key":"payment_pending"}'::jsonb, 2800, 0),

  (v_flow_id, 'payment_pending',    'send_message',      '{"text":"Enviei o PIX acima! ☝️\n\nAssim que o pagamento for confirmado (geralmente em alguns minutos), vou publicar seu site automaticamente e enviar o link.\n\nQualquer dúvida é só chamar! 😊","next_node_key":"end"}'::jsonb, 3000, 0),

  (v_flow_id, 'cancel_message',     'send_message',      '{"text":"Sem problemas! Se mudar de ideia é só me chamar de volta. 😊\n\nSe tiver qualquer dúvida, estou aqui!","next_node_key":"cancel_end"}'::jsonb, 2200, 200),

  (v_flow_id, 'cancel_end',         'end',               '{}'::jsonb,                                                                                                       2400, 200),

  (v_flow_id, 'end',                'end',               '{}'::jsonb,                                                                                                       3200, 0);

  RAISE NOTICE 'Flow "Criação de Site Automática" criado com ID: %', v_flow_id;
END $$;

-- ============================================================
-- END 024_add_website_flow_node_types.sql
-- ============================================================
