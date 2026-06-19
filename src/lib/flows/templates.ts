/**
 * Templates de fluxos iniciais.
 *
 * Três fluxos prontos que os usuários podem clonar com um clique em vez de
 * construir do zero. Cada template é um objeto JS simples que descreve
 * a mesma estrutura que o PUT `/api/flows` aceita — nome, config de trigger,
 * entry_node_id, fallback_policy, nodes[] — indexado por um `slug` estável.
 *
 * O caminho de clonagem (`/api/flows` POST com `template_slug`) cria uma
 * nova flow_row + flow_nodes para o usuário. Os `node_key`s são mantidos
 * literalmente (são strings estáveis, não UUIDs, então a clonagem nunca
 * precisa reescrever referências de arestas).
 *
 * Para v1, optamos por um módulo estático único em vez de uma galeria
 * baseada em banco de dados porque: (a) o conjunto é pequeno e muda com
 * releases de código, não com dados; (b) mantém os templates portáveis
 * entre instâncias self-hosted sem migrações; (c) editar no código-fonte
 * é a forma de menor atrito para adicionar o próximo template.
 */

import type {
  AutoConfirmPaymentConfig,
  CollectInputNodeConfig,
  ConditionNodeConfig,
  CreatePaymentNodeConfig,
  GenerateWebsiteNodeConfig,
  HandoffNodeConfig,
  KeywordTriggerConfig,
  ScheduleReminderConfig,
  SendButtonsNodeConfig,
  SendListNodeConfig,
  SendMessageNodeConfig,
  StartNodeConfig,
  WebsiteOrderCheckConfig,
} from "./types";

export type FlowTemplateNodeType =
  | "start"
  | "send_message"
  | "send_buttons"
  | "send_list"
  | "collect_input"
  | "condition"
  | "set_tag"
  | "handoff"
  | "end"
  | "generate_website"
  | "create_payment"
  | "website_order_check"
  | "schedule_reminder"
  | "auto_confirm_payment";

export interface FlowTemplateNode {
  node_key: string;
  node_type: FlowTemplateNodeType;
  config:
    | StartNodeConfig
    | SendMessageNodeConfig
    | SendButtonsNodeConfig
    | SendListNodeConfig
    | CollectInputNodeConfig
    | ConditionNodeConfig
    | HandoffNodeConfig
    | GenerateWebsiteNodeConfig
    | CreatePaymentNodeConfig
    | WebsiteOrderCheckConfig
    | ScheduleReminderConfig
    | AutoConfirmPaymentConfig
    | Record<string, unknown>;
}

export interface FlowTemplate {
  slug: string;
  name: string;
  description: string;
  /** Usado pela galeria para exibir um ícone relevante. Nome lucide-react. */
  icon: "MessageSquare" | "HelpCircle" | "UserPlus" | "Globe" | "CreditCard";
  trigger_type: "keyword" | "first_inbound_message" | "manual";
  trigger_config: KeywordTriggerConfig | Record<string, unknown>;
  entry_node_id: string;
  nodes: FlowTemplateNode[];
}

// ============================================================
// 1. Menu de boas-vindas — o exemplo do briefing do proprietário
// ============================================================
const WELCOME_MENU: FlowTemplate = {
  slug: "welcome_menu",
  name: "Menu de boas-vindas",
  description:
    "Cumprimente clientes que digitam uma palavra-chave e direcione-os ao atendente correto com base em se são novos ou existentes.",
  icon: "MessageSquare",
  trigger_type: "keyword",
  trigger_config: { keywords: ["suporte", "ajuda", "oi"], match_type: "contains" },
  entry_node_id: "start",
  nodes: [
    {
      node_key: "start",
      node_type: "start",
      config: { next_node_key: "welcome" },
    },
    {
      node_key: "welcome",
      node_type: "send_buttons",
      config: {
        text: "Olá! 👋 Bem-vindo ao suporte. Você já é cliente ou é novo por aqui?",
        footer_text: "Toque em um botão abaixo para continuar.",
        buttons: [
          {
            reply_id: "existing",
            title: "Cliente existente",
            next_node_key: "existing_handoff",
          },
          {
            reply_id: "new",
            title: "Novo cliente",
            next_node_key: "new_handoff",
          },
        ],
      } as SendButtonsNodeConfig,
    },
    {
      node_key: "existing_handoff",
      node_type: "handoff",
      config: {
        note: "Cliente existente precisa de assistência — verifique o histórico da conta antes de responder.",
      } as HandoffNodeConfig,
    },
    {
      node_key: "new_handoff",
      node_type: "handoff",
      config: {
        note: "Novo cliente — compartilhe preços e link de onboarding.",
      } as HandoffNodeConfig,
    },
  ],
};

// ============================================================
// 2. Bot de FAQ — respostas via mensagem de lista, totalmente automatizado
// ============================================================
const FAQ_BOT: FlowTemplate = {
  slug: "faq_bot",
  name: "Bot de FAQ",
  description:
    "Responda perguntas frequentes automaticamente. O cliente escolhe um tópico de uma lista; o bot responde com a resposta e encerra.",
  icon: "HelpCircle",
  trigger_type: "keyword",
  trigger_config: {
    keywords: ["faq", "pergunta", "informação"],
    match_type: "contains",
  },
  entry_node_id: "start",
  nodes: [
    {
      node_key: "start",
      node_type: "start",
      config: { next_node_key: "topics" },
    },
    {
      node_key: "topics",
      node_type: "send_list",
      config: {
        text: "Em que posso ajudar?",
        button_label: "Ver tópicos",
        sections: [
          {
            title: "Perguntas comuns",
            rows: [
              {
                reply_id: "hours",
                title: "Horário de funcionamento",
                next_node_key: "answer_hours",
              },
              {
                reply_id: "pricing",
                title: "Preços",
                next_node_key: "answer_pricing",
              },
              {
                reply_id: "refunds",
                title: "Política de reembolso",
                next_node_key: "answer_refunds",
              },
            ],
          },
          {
            title: "Outros",
            rows: [
              {
                reply_id: "human",
                title: "Falar com um humano",
                next_node_key: "human_handoff",
              },
            ],
          },
        ],
      } as SendListNodeConfig,
    },
    {
      node_key: "answer_hours",
      node_type: "send_message",
      config: {
        text: "Estamos abertos de seg a sex, das 9h às 18h, horário local. O suporte nos fins de semana é limitado a questões urgentes.",
        next_node_key: "end",
      } as SendMessageNodeConfig,
    },
    {
      node_key: "answer_pricing",
      node_type: "send_message",
      config: {
        text: "Nossos preços começam em R$ 49/mês. Visite https://example.com/pricing para ver todos os detalhes.",
        next_node_key: "end",
      } as SendMessageNodeConfig,
    },
    {
      node_key: "answer_refunds",
      node_type: "send_message",
      config: {
        text: "Reembolsos são aceitos em até 30 dias após a compra. Responda com seu número de pedido e processaremos.",
        next_node_key: "end",
      } as SendMessageNodeConfig,
    },
    {
      node_key: "human_handoff",
      node_type: "handoff",
      config: {
        note: "Cliente solicitou falar com um humano pelo bot de FAQ.",
      } as HandoffNodeConfig,
    },
    {
      node_key: "end",
      node_type: "end",
      config: {},
    },
  ],
};

// ============================================================
// 3. Captação de leads — cadeia de collect_input, termina em handoff
// ============================================================
const LEAD_CAPTURE: FlowTemplate = {
  slug: "lead_capture",
  name: "Captação de leads",
  description:
    "Cumprimente contatos novos, capture nome + email + empresa e faça handoff para o time de vendas com as respostas na nota.",
  icon: "UserPlus",
  trigger_type: "first_inbound_message",
  trigger_config: {},
  entry_node_id: "start",
  nodes: [
    {
      node_key: "start",
      node_type: "start",
      config: { next_node_key: "intro" },
    },
    {
      node_key: "intro",
      node_type: "send_message",
      config: {
        text: "Bem-vindo! 👋 Vou fazer algumas perguntas rápidas para direcionar você à pessoa certa.",
        next_node_key: "ask_name",
      } as SendMessageNodeConfig,
    },
    {
      node_key: "ask_name",
      node_type: "collect_input",
      config: {
        prompt_text: "Qual é o seu nome?",
        var_key: "name",
        next_node_key: "ask_email",
      } as CollectInputNodeConfig,
    },
    {
      node_key: "ask_email",
      node_type: "collect_input",
      config: {
        prompt_text: "Obrigado, {{vars.name}}! Qual é o seu email profissional?",
        var_key: "email",
        next_node_key: "ask_company",
      } as CollectInputNodeConfig,
    },
    {
      node_key: "ask_company",
      node_type: "collect_input",
      config: {
        prompt_text: "Quase lá — qual é o nome da sua empresa?",
        var_key: "company",
        next_node_key: "handoff",
      } as CollectInputNodeConfig,
    },
    {
      node_key: "handoff",
      node_type: "handoff",
      config: {
        note: "Novo lead — nome={{vars.name}}, email={{vars.email}}, empresa={{vars.company}}.",
      } as HandoffNodeConfig,
    },
  ],
};

// ============================================================
// 4. Criação de site — gere landing pages via IA
// ============================================================
const WEBSITE_CREATION: FlowTemplate = {
  slug: "website_creation",
  name: "Criação de Site Automática",
  description:
    "Capture as especificações do lead, gere uma landing page com IA, envie screenshots, aprove/cobre e faça deploy automático. Suporta clientes retornantes com menu de gerenciamento.",
  icon: "Globe",
  trigger_type: "keyword",
  trigger_config: {
    keywords: [
      "criar site", "site", "meu site", "quero site",
      "landing page", "fazer site", "site profissional",
      "alterar site", "domínio", "dominio", "publicar",
      "remover site", "novo site", "atualizar site",
    ],
    match_type: "contains",
  },
  entry_node_id: "start",
  nodes: [
    // ── START: carrega pedido existente do contato ──
    {
      node_key: "start",
      node_type: "start",
      config: { next_node_key: "check_existing_order" } as StartNodeConfig,
    },
    {
      node_key: "check_existing_order",
      node_type: "website_order_check",
      config: {
        order_var: "existing_order",
        next_node_key: "is_returning",
      } as WebsiteOrderCheckConfig,
    },
    // ── CLIENTE RETORNANTE? ──
    {
      node_key: "is_returning",
      node_type: "condition",
      config: {
        subject: "var",
        subject_key: "existing_order",
        operator: "present",
        true_next: "management_menu",
        false_next: "intro",
      } as ConditionNodeConfig,
    },
    // ── MENU DE GERENCIAMENTO (clientes retornantes) ──
    {
      node_key: "management_menu",
      node_type: "send_list",
      config: {
        text: "Que bom te ver de novo! 😊\n\nVi que você já tem um site conosco. O que deseja fazer?",
        button_label: "Ver opções",
        sections: [
          {
            title: "Gerenciar site",
            rows: [
              { reply_id: "view_site", title: "🔗 Ver meu site", description: "Abrir o link do seu site publicado", next_node_key: "show_deploy_url" },
              { reply_id: "edit_content", title: "✏️ Alterar conteúdo", description: "Mudar textos, cores ou layout", next_node_key: "ask_feedback_mgmt" },
              { reply_id: "new_site", title: "🆕 Criar novo site", description: "Começar um novo projeto do zero", next_node_key: "intro" },
            ],
          },
        ],
      } as SendListNodeConfig,
    },
    {
      node_key: "show_deploy_url",
      node_type: "send_message",
      config: {
        text: "🔗 Seu site está publicado em:\n{{vars.existing_order.deploy_url}}\n\nPrecisa de mais alguma coisa?",
        next_node_key: "management_menu",
      } as SendMessageNodeConfig,
    },
    {
      node_key: "ask_feedback_mgmt",
      node_type: "collect_input",
      config: {
        prompt_text: "O que você gostaria de alterar no site? Me conta os detalhes!",
        var_key: "feedback",
        next_node_key: "regenerating_message_mgmt",
      } as CollectInputNodeConfig,
    },
    {
      node_key: "regenerating_message_mgmt",
      node_type: "send_message",
      config: {
        text: "Entendi! Vou regenerar o site com suas alterações. 🚀\n\nJá volto com o novo preview!",
        next_node_key: "generate_site",
      } as SendMessageNodeConfig,
    },
    // ── FLUXO NORMAL: NOVOS CLIENTES ──
    {
      node_key: "intro",
      node_type: "send_message",
      config: {
        text: "Olá! 👋 Que bom te ver por aqui!\n\nVou te ajudar a criar um site profissional para o seu negócio em apenas 3 etapas:\n\n📝 *1. Você responde algumas perguntas* (2 minutinhos)\n🤖 *2. Minha IA gera o site completo* (criação automática)\n🚀 *3. Você aprova e eu publico na internet*\n\nVamos começar? É rapidinho!",
        next_node_key: "ask_empresa",
      } as SendMessageNodeConfig,
    },
    {
      node_key: "ask_empresa",
      node_type: "collect_input",
      config: {
        prompt_text: "Qual o nome da sua empresa ou negócio?",
        var_key: "empresa_nome",
        next_node_key: "ask_nicho",
      } as CollectInputNodeConfig,
    },
    {
      node_key: "ask_nicho",
      node_type: "collect_input",
      config: {
        prompt_text: "Qual o nicho/ramo do seu negócio? (ex: advocacia, estética, restaurante, academia, imobiliária...)",
        var_key: "nicho",
        next_node_key: "ask_descricao",
      } as CollectInputNodeConfig,
    },
    {
      node_key: "ask_descricao",
      node_type: "collect_input",
      config: {
        prompt_text: "Me conta um pouco mais sobre o que sua empresa faz e qual o principal produto ou serviço que você quer vender.",
        var_key: "descricao",
        next_node_key: "ask_cores",
      } as CollectInputNodeConfig,
    },
    {
      node_key: "ask_cores",
      node_type: "collect_input",
      config: {
        prompt_text: "Tem alguma cor ou paleta de cores que você prefere? Se não souber, me diga o estilo que você gosta (ex: moderno, elegante, divertido, sóbrio) e eu escolho as melhores cores!",
        var_key: "cores",
        next_node_key: "ask_observacoes",
      } as CollectInputNodeConfig,
    },
    {
      node_key: "ask_observacoes",
      node_type: "collect_input",
      config: {
        prompt_text: "Alguma observação extra que você queira adicionar? (opcional — envie só um ponto . se não tiver nada)",
        var_key: "observacoes",
        next_node_key: "ask_tipo_site",
      } as CollectInputNodeConfig,
    },
    {
      node_key: "ask_tipo_site",
      node_type: "send_list",
      config: {
        text: "Qual o modelo de site você prefere?\n\n1 🛒 Landing Page de Vendas — foco em conversão\n2 🏢 Site Institucional — profissional\n3 🎨 Portfólio — criativo\n4 📧 Página de Captura — geração de leads\n\nToque no botão abaixo ou digite o número da opção:",
        button_label: "Ver modelos",
        sections: [
          {
            title: "Escolha seu modelo",
            rows: [
              { reply_id: "sales_page", title: "🛒 Landing Page de Vendas", description: "Foco em conversão — ideal para vender produtos ou serviços", next_node_key: "confirm" },
              { reply_id: "institutional", title: "🏢 Site Institucional", description: "Profissional — ideal para empresas e consultórios", next_node_key: "confirm" },
              { reply_id: "portfolio", title: "🎨 Portfólio", description: "Criativo — ideal para mostrar projetos e trabalhos", next_node_key: "confirm" },
              { reply_id: "capture", title: "📧 Página de Captura", description: "Geração de leads — ideal para captar emails", next_node_key: "confirm" },
            ],
          },
        ],
        capture_reply_var: "tipo_site",
      } as SendListNodeConfig,
    },
    {
      node_key: "confirm",
      node_type: "send_buttons",
      config: {
        text: "Perfeito! Aqui está um resumo do seu projeto:\n\n🏢 *Empresa:* {{vars.empresa_nome}}\n📌 *Segmento:* {{vars.nicho}}\n📋 *Descrição:* {{vars.descricao}}\n🎨 *Cores/Estilo:* {{vars.cores}}\n\nTudo certinho? Posso dar o start na criação do seu site agora mesmo? 🚀",
        buttons: [
          { reply_id: "start_generate", title: "Sim, criar!", next_node_key: "generating_message" },
          { reply_id: "fix_info", title: "Corrigir algo", next_node_key: "ask_empresa" },
        ],
      } as SendButtonsNodeConfig,
    },
    {
      node_key: "generating_message",
      node_type: "send_message",
      config: {
        text: "Solicitação recebida! 🤖\n\nMinha IA já está trabalhando na criação do seu site:\n✨ Gerando layout e design\n📝 Escrevendo os textos\n🎨 Aplicando suas cores\n📸 Capturando previews\n\nIsso leva alguns segundos... Já volto com o resultado! 🚀",
        next_node_key: "generate_site",
      } as SendMessageNodeConfig,
    },
    {
      node_key: "generate_site",
      node_type: "generate_website",
      config: {
        specs: {
          empresa_nome_var: "empresa_nome",
          nicho_var: "nicho",
          descricao_var: "descricao",
          cores_var: "cores",
          observacoes_var: "observacoes",
        },
        template_type_var: "tipo_site",
        next_node_key: "approval_prompt",
      } as GenerateWebsiteNodeConfig,
    },
    {
      node_key: "approval_prompt",
      node_type: "send_message",
      config: {
        text: "O link acima é o preview completo do seu site! Abra ele para ver tudo. 😊\n\nDepois de olhar, me diga o que achou!",
        next_node_key: "ask_approval",
      } as SendMessageNodeConfig,
    },
    {
      node_key: "ask_approval",
      node_type: "send_buttons",
      config: {
        text: "📍 *O que você achou do seu site?* \n\n✅ *Aprovado* — Fechou! Vamos para o pagamento e publicação\n🔧 *Ajustar* — Quer mudar alguma coisa? Me diga o que\n❌ *Cancelar* — Sem problemas, pode cancelar",
        buttons: [
          { reply_id: "approve", title: "✅ Aprovado!", next_node_key: "payment_intro" },
          { reply_id: "adjust", title: "🔧 Ajustar", next_node_key: "ask_feedback" },
          { reply_id: "cancel", title: "❌ Cancelar", next_node_key: "cancel_message" },
        ],
      } as SendButtonsNodeConfig,
    },
    {
      node_key: "ask_feedback",
      node_type: "collect_input",
      config: {
        prompt_text: "Pode ficar à vontade! Me conta o que você gostaria de mudar:\n\n🎨 *Cores:* Quer outra paleta?\n📝 *Textos:* Alterar alguma frase?\n📐 *Layout:* Mudar posição dos elementos?\n➕ *Seções:* Adicionar ou remover algo?\n\nQuanto mais detalhes você der, melhor a IA vai acertar! 😊",
        var_key: "feedback",
        next_node_key: "regenerating_message",
      } as CollectInputNodeConfig,
    },
    {
      node_key: "regenerating_message",
      node_type: "send_message",
      config: {
        text: "Entendi perfeitamente! Já passei as instruções para a IA refazer o site com suas alterações. 🚀\n\nEla está trabalhando nisso agora... Assim que ficar pronto eu te mostro!",
        next_node_key: "generate_site",
      } as SendMessageNodeConfig,
    },
    // ── PAGAMENTO ──
    {
      node_key: "payment_intro",
      node_type: "send_message",
      config: {
        text: "Que bom que você aprovou! 🎉\n\nVou gerar o PIX agora. Escaneie o QR Code ou copie o código abaixo:",
        next_node_key: "create_payment_node",
      } as SendMessageNodeConfig,
    },
    {
      node_key: "create_payment_node",
      node_type: "create_payment",
      config: {
        order_id_var: "website_order_id",
        payment_value: 197,
        next_node_key: "payment_pending",
      } as CreatePaymentNodeConfig,
    },
    {
      node_key: "payment_pending",
      node_type: "send_message",
      config: {
        text: "💰 Valor: R$ 197,00\n⏱ Confirmação automática — assim que o PIX confirmar, publico seu site e te aviso aqui! 🚀\n\nQualquer dúvida, é só mandar.",
        next_node_key: "auto_confirm_node",
      } as SendMessageNodeConfig,
    },
    // ── AUTO-CONFIRM (teste) — em produção, remover e usar webhook ──
    {
      node_key: "auto_confirm_node",
      node_type: "auto_confirm_payment",
      config: {
        order_id_var: "website_order_id",
        delay_seconds: 5,
        next_node_key: "end",
      } as AutoConfirmPaymentConfig,
    },
    // ── LEMBRETE DE ABANDONO ──
    {
      node_key: "schedule_reminder_node",
      node_type: "schedule_reminder",
      config: {
        order_id_var: "website_order_id",
        delay_minutes: 30,
        message_template: "Oi! 👋 Vi que você ainda não confirmou o pagamento do seu site. O PIX ainda está valendo! Se precisar de ajuda, é só mandar.",
        next_node_key: "end",
      } as ScheduleReminderConfig,
    },
    // ── CANCELAMENTO ──
    {
      node_key: "cancel_message",
      node_type: "send_message",
      config: {
        text: "Sem problemas! Fique à vontade. 😊\n\nSe mudar de ideia ou quiser criar o site no futuro, é só me mandar uma mensagem com *quero site* que a gente retoma de onde parou!\n\nEstou sempre aqui se precisar. 👋",
        next_node_key: "cancel_end",
      } as SendMessageNodeConfig,
    },
    {
      node_key: "cancel_end",
      node_type: "end",
      config: {} as Record<string, never>,
    },
    {
      node_key: "end",
      node_type: "end",
      config: {} as Record<string, never>,
    },
  ],
};

// ============================================================
// Registry
// ============================================================

const TEMPLATES: Record<string, FlowTemplate> = {
  welcome_menu: WELCOME_MENU,
  faq_bot: FAQ_BOT,
  lead_capture: LEAD_CAPTURE,
  website_creation: WEBSITE_CREATION,
};

export function getFlowTemplate(slug: string): FlowTemplate | null {
  return TEMPLATES[slug] ?? null;
}

export function listFlowTemplates(): FlowTemplate[] {
  return Object.values(TEMPLATES);
}
