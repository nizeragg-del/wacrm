-- Migration 027: Update website creation flow with full lifecycle
-- Flow ID: d7e15210-996d-4838-9512-9bb14b5f565c

-- 1. Update trigger keywords (broader set)
UPDATE flows
SET trigger_config = '{
  "keywords": [
    "criar site", "site", "meu site", "quero site",
    "landing page", "fazer site", "site profissional",
    "alterar site", "domínio", "dominio", "publicar",
    "remover site", "novo site", "atualizar site"
  ],
  "match_type": "contains"
}'::jsonb
WHERE id = 'd7e15210-996d-4838-9512-9bb14b5f565c';

-- 2. Delete all existing nodes
DELETE FROM flow_nodes WHERE flow_id = 'd7e15210-996d-4838-9512-9bb14b5f565c';

-- 3. Insert all new nodes
INSERT INTO flow_nodes (id, flow_id, node_key, node_type, config, position_x, position_y) VALUES

-- START: carrega pedido existente do contato
(gen_random_uuid(), 'd7e15210-996d-4838-9512-9bb14b5f565c', 'start', 'start',
 '{"next_node_key": "check_existing_order"}',
 100, 100),

(gen_random_uuid(), 'd7e15210-996d-4838-9512-9bb14b5f565c', 'check_existing_order', 'website_order_check',
 '{"order_var": "existing_order", "next_node_key": "is_returning"}',
 100, 200),

-- CLIENTE RETORNANTE?
(gen_random_uuid(), 'd7e15210-996d-4838-9512-9bb14b5f565c', 'is_returning', 'condition',
 '{"subject": "var", "subject_key": "existing_order", "operator": "present", "true_next": "management_menu", "false_next": "intro"}',
 100, 300),

-- MENU DE GERENCIAMENTO (clientes retornantes)
(gen_random_uuid(), 'd7e15210-996d-4838-9512-9bb14b5f565c', 'management_menu', 'send_list',
 '{
  "text": "Que bom te ver de novo! 😊\n\nVi que você já tem um site conosco. O que deseja fazer?",
  "button_label": "Ver opções",
  "sections": [
    {
      "title": "Gerenciar site",
      "rows": [
        {"reply_id": "view_site", "title": "🔗 Ver meu site", "description": "Abrir o link do seu site publicado", "next_node_key": "show_deploy_url"},
        {"reply_id": "edit_content", "title": "✏️ Alterar conteúdo", "description": "Mudar textos, cores ou layout", "next_node_key": "ask_feedback_mgmt"},
        {"reply_id": "new_site", "title": "🆕 Criar novo site", "description": "Começar um novo projeto do zero", "next_node_key": "intro"}
      ]
    }
  ]
}',
 300, 100),

(gen_random_uuid(), 'd7e15210-996d-4838-9512-9bb14b5f565c', 'show_deploy_url', 'send_message',
 '{"text": "🔗 Seu site está publicado em:\n{{vars.existing_order.deploy_url}}\n\nPrecisa de mais alguma coisa?", "next_node_key": "management_menu"}',
 500, 100),

(gen_random_uuid(), 'd7e15210-996d-4838-9512-9bb14b5f565c', 'ask_feedback_mgmt', 'collect_input',
 '{"prompt_text": "O que você gostaria de alterar no site? Me conta os detalhes!", "var_key": "feedback", "next_node_key": "regenerating_message_mgmt"}',
 300, 200),

(gen_random_uuid(), 'd7e15210-996d-4838-9512-9bb14b5f565c', 'regenerating_message_mgmt', 'send_message',
 '{"text": "Entendi! Vou regenerar o site com suas alterações. 🚀\n\nJá volto com o novo preview!", "next_node_key": "generate_site"}',
 500, 200),

-- FLUXO NORMAL: NOVOS CLIENTES
(gen_random_uuid(), 'd7e15210-996d-4838-9512-9bb14b5f565c', 'intro', 'send_message',
 '{"text": "Olá! 👋 Que bom te ver por aqui!\n\nVou te ajudar a criar um site profissional para o seu negócio em apenas 3 etapas:\n\n📝 *1. Você responde algumas perguntas* (2 minutinhos)\n🤖 *2. Minha IA gera o site completo* (criação automática)\n🚀 *3. Você aprova e eu publico na internet*\n\nVamos começar? É rapidinho!", "next_node_key": "ask_empresa"}',
 100, 500),

(gen_random_uuid(), 'd7e15210-996d-4838-9512-9bb14b5f565c', 'ask_empresa', 'collect_input',
 '{"prompt_text": "Qual o nome da sua empresa ou negócio?", "var_key": "empresa_nome", "next_node_key": "ask_nicho"}',
 100, 600),

(gen_random_uuid(), 'd7e15210-996d-4838-9512-9bb14b5f565c', 'ask_nicho', 'collect_input',
 '{"prompt_text": "Qual o nicho/ramo do seu negócio? (ex: advocacia, estética, restaurante, academia, imobiliária...)", "var_key": "nicho", "next_node_key": "ask_descricao"}',
 100, 700),

(gen_random_uuid(), 'd7e15210-996d-4838-9512-9bb14b5f565c', 'ask_descricao', 'collect_input',
 '{"prompt_text": "Me conta um pouco mais sobre o que sua empresa faz e qual o principal produto ou serviço que você quer vender.", "var_key": "descricao", "next_node_key": "ask_cores"}',
 100, 800),

(gen_random_uuid(), 'd7e15210-996d-4838-9512-9bb14b5f565c', 'ask_cores', 'collect_input',
 '{"prompt_text": "Tem alguma cor ou paleta de cores que você prefere? Se não souber, me diga o estilo que você gosta (ex: moderno, elegante, divertido, sóbrio) e eu escolho as melhores cores!", "var_key": "cores", "next_node_key": "ask_observacoes"}',
 100, 900),

(gen_random_uuid(), 'd7e15210-996d-4838-9512-9bb14b5f565c', 'ask_observacoes', 'collect_input',
 '{"prompt_text": "Alguma observação extra que você queira adicionar? (opcional — envie só um ponto . se não tiver nada)", "var_key": "observacoes", "next_node_key": "ask_tipo_site"}',
 100, 1000),

(gen_random_uuid(), 'd7e15210-996d-4838-9512-9bb14b5f565c', 'ask_tipo_site', 'send_list',
 '{
  "text": "Qual o modelo de site você prefere?\n\n1 🛒 Landing Page de Vendas — foco em conversão\n2 🏢 Site Institucional — profissional\n3 🎨 Portfólio — criativo\n4 📧 Página de Captura — geração de leads\n\nToque no botão abaixo ou digite o número da opção:",
  "button_label": "Ver modelos",
  "sections": [
    {
      "title": "Escolha seu modelo",
      "rows": [
        {"reply_id": "sales_page", "title": "🛒 Landing Page de Vendas", "description": "Foco em conversão — ideal para vender produtos ou serviços", "next_node_key": "confirm"},
        {"reply_id": "institutional", "title": "🏢 Site Institucional", "description": "Profissional — ideal para empresas e consultórios", "next_node_key": "confirm"},
        {"reply_id": "portfolio", "title": "🎨 Portfólio", "description": "Criativo — ideal para mostrar projetos e trabalhos", "next_node_key": "confirm"},
        {"reply_id": "capture", "title": "📧 Página de Captura", "description": "Geração de leads — ideal para captar emails", "next_node_key": "confirm"}
      ]
    }
  ],
  "capture_reply_var": "tipo_site"
}',
 100, 1100),

(gen_random_uuid(), 'd7e15210-996d-4838-9512-9bb14b5f565c', 'confirm', 'send_buttons',
 '{
  "text": "Perfeito! Aqui está um resumo do seu projeto:\n\n🏢 *Empresa:* {{vars.empresa_nome}}\n📌 *Segmento:* {{vars.nicho}}\n📋 *Descrição:* {{vars.descricao}}\n🎨 *Cores/Estilo:* {{vars.cores}}\n\nTudo certinho? Posso dar o start na criação do seu site agora mesmo? 🚀",
  "buttons": [
    {"reply_id": "start_generate", "title": "Sim, criar!", "next_node_key": "generating_message"},
    {"reply_id": "fix_info", "title": "Corrigir algo", "next_node_key": "ask_empresa"}
  ]
}',
 100, 1200),

(gen_random_uuid(), 'd7e15210-996d-4838-9512-9bb14b5f565c', 'generating_message', 'send_message',
 '{"text": "Solicitação recebida! 🤖\n\nMinha IA já está trabalhando na criação do seu site:\n✨ Gerando layout e design\n📝 Escrevendo os textos\n🎨 Aplicando suas cores\n📸 Capturando previews\n\nIsso leva alguns segundos... Já volto com o resultado! 🚀", "next_node_key": "generate_site"}',
 100, 1300),

(gen_random_uuid(), 'd7e15210-996d-4838-9512-9bb14b5f565c', 'generate_site', 'generate_website',
 '{
  "specs": {
    "empresa_nome_var": "empresa_nome",
    "nicho_var": "nicho",
    "descricao_var": "descricao",
    "cores_var": "cores",
    "observacoes_var": "observacoes"
  },
  "template_type_var": "tipo_site",
  "next_node_key": "approval_prompt"
}',
 100, 1400),

(gen_random_uuid(), 'd7e15210-996d-4838-9512-9bb14b5f565c', 'approval_prompt', 'send_message',
 '{"text": "O link acima é o preview completo do seu site! Abra ele para ver tudo. 😊\n\nDepois de olhar, me diga o que achou!", "next_node_key": "ask_approval"}',
 100, 1500),

(gen_random_uuid(), 'd7e15210-996d-4838-9512-9bb14b5f565c', 'ask_approval', 'send_buttons',
 '{
  "text": "📍 *O que você achou do seu site?* \n\n✅ *Aprovado* — Fechou! Vamos para o pagamento e publicação\n🔧 *Ajustar* — Quer mudar alguma coisa? Me diga o que\n❌ *Cancelar* — Sem problemas, pode cancelar",
  "buttons": [
    {"reply_id": "approve", "title": "✅ Aprovado!", "next_node_key": "payment_intro"},
    {"reply_id": "adjust", "title": "🔧 Ajustar", "next_node_key": "ask_feedback"},
    {"reply_id": "cancel", "title": "❌ Cancelar", "next_node_key": "cancel_message"}
  ]
}',
 100, 1600),

-- FEEDBACK / REGENERAÇÃO
(gen_random_uuid(), 'd7e15210-996d-4838-9512-9bb14b5f565c', 'ask_feedback', 'collect_input',
 '{"prompt_text": "Pode ficar à vontade! Me conta o que você gostaria de mudar:\n\n🎨 *Cores:* Quer outra paleta?\n📝 *Textos:* Alterar alguma frase?\n📐 *Layout:* Mudar posição dos elementos?\n➕ *Seções:* Adicionar ou remover algo?\n\nQuanto mais detalhes você der, melhor a IA vai acertar! 😊", "var_key": "feedback", "next_node_key": "regenerating_message"}',
 300, 1600),

(gen_random_uuid(), 'd7e15210-996d-4838-9512-9bb14b5f565c', 'regenerating_message', 'send_message',
 '{"text": "Entendi perfeitamente! Já passei as instruções para a IA refazer o site com suas alterações. 🚀\n\nEla está trabalhando nisso agora... Assim que ficar pronto eu te mostro!", "next_node_key": "generate_site"}',
 300, 1700),

-- PAGAMENTO
(gen_random_uuid(), 'd7e15210-996d-4838-9512-9bb14b5f565c', 'payment_intro', 'send_message',
 '{"text": "Que bom que você aprovou! 🎉\n\nVou gerar o PIX agora. Escaneie o QR Code ou copie o código abaixo:", "next_node_key": "create_payment_node"}',
 100, 1800),

(gen_random_uuid(), 'd7e15210-996d-4838-9512-9bb14b5f565c', 'create_payment_node', 'create_payment',
 '{"order_id_var": "website_order_id", "payment_value": 197, "next_node_key": "payment_pending"}',
 100, 1900),

(gen_random_uuid(), 'd7e15210-996d-4838-9512-9bb14b5f565c', 'payment_pending', 'send_message',
 '{"text": "💰 Valor: R$ 197,00\n⏱ Confirmação automática — assim que o PIX confirmar, publico seu site e te aviso aqui! 🚀\n\nQualquer dúvida, é só mandar.", "next_node_key": "auto_confirm_node"}',
 100, 2000),

-- AUTO-CONFIRM (teste) — em produção, remover e usar webhook
(gen_random_uuid(), 'd7e15210-996d-4838-9512-9bb14b5f565c', 'auto_confirm_node', 'auto_confirm_payment',
 '{"order_id_var": "website_order_id", "delay_seconds": 5, "next_node_key": "schedule_reminder_node"}',
 100, 2100),

-- LEMBRETE DE ABANDONO
(gen_random_uuid(), 'd7e15210-996d-4838-9512-9bb14b5f565c', 'schedule_reminder_node', 'schedule_reminder',
 '{"order_id_var": "website_order_id", "delay_minutes": 30, "message_template": "Oi! 👋 Vi que você ainda não confirmou o pagamento do seu site. O PIX ainda está valendo! Se precisar de ajuda, é só mandar.", "next_node_key": "end"}',
 100, 2200),

-- CANCELAMENTO
(gen_random_uuid(), 'd7e15210-996d-4838-9512-9bb14b5f565c', 'cancel_message', 'send_message',
 '{"text": "Sem problemas! Fique à vontade. 😊\n\nSe mudar de ideia ou quiser criar o site no futuro, é só me mandar uma mensagem com *quero site* que a gente retoma de onde parou!\n\nEstou sempre aqui se precisar. 👋", "next_node_key": "cancel_end"}',
 100, 2300),

(gen_random_uuid(), 'd7e15210-996d-4838-9512-9bb14b5f565c', 'cancel_end', 'end',
 '{}',
 100, 2400),

(gen_random_uuid(), 'd7e15210-996d-4838-9512-9bb14b5f565c', 'end', 'end',
 '{}',
 100, 2500);
