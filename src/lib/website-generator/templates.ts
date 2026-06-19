import type { WebsiteTemplateType, WebsiteSpecifications } from './types';

interface TemplateDefinition {
  name: string;
  description: string;
  sections: string[];
  promptInstructions: string;
}

const TEMPLATES: Record<WebsiteTemplateType, TemplateDefinition> = {
  sales_page: {
    name: 'Landing Page de Vendas',
    description: 'Página focada em conversão para produtos e serviços',
    sections: [
      'Hero Section — Título impactante, subtítulo, CTA principal',
      'Problema — Identificação da dor do cliente',
      'Solução — Apresentação do produto/serviço como solução',
      'Benefícios — Grid com os principais benefícios',
      'Prova Social — Depoimentos, números, selos de confiança',
      'Garantia — Seção de garantia e segurança',
      'Preços — Tabela de preços ou valor do investimento',
      'FAQ — Perguntas frequentes',
      'CTA Final — Último call-to-action',
    ],
    promptInstructions: `CRIE UMA LANDING PAGE DE VENDAS com foco em conversão.
Use técnicas de copywriting persuasivo.
Hero com headline forte, subtítulo e CTA.
Seção de problema/dor seguida de solução.
Benefícios em grid com ícones.
Depoimentos reais ou mock.
Seção de garantia.
CTA final com urgência.
Rodapé com informações básicas.`,
  },

  institutional: {
    name: 'Site Institucional',
    description: 'Site profissional para empresas e consultórios',
    sections: [
      'Hero Section — Nome da empresa, slogan, CTA',
      'Sobre Nós — História, missão, visão e valores',
      'Serviços — Grid dos serviços oferecidos',
      'Diferenciais — O que nos torna únicos',
      'Clientes/Parceiros — Logos ou depoimentos',
      'Equipe — Fotos e cargos (opcional)',
      'Contato — Formulário, WhatsApp, endereço',
    ],
    promptInstructions: `CRIE UM SITE INSTITUCIONAL profissional e elegante.
Hero com nome da empresa e slogan.
Seção sobre com missão, visão e valores.
Serviços em grid com ícones descritivos.
Diferenciais competitivos.
Depoimentos de clientes.
Seção de contato com botão do WhatsApp.
Design clean, tipografia elegante, cores corporativas.`,
  },

  portfolio: {
    name: 'Portfólio',
    description: 'Galeria de projetos e trabalhos criativos',
    sections: [
      'Hero Section — Nome, especialidade, CTA',
      'Galeria — Grid de projetos com filtros',
      'Destaques — Cases de sucesso em detalhe',
      'Depoimentos — Feedbacks de clientes',
      'Serviços — O que ofereço',
      'Contato — Orçamento e redes sociais',
    ],
    promptInstructions: `CRIE UM PORTFÓLIO criativo e visualmente impactante.
Hero com nome e especialidade.
Galeria em grid com hover effects.
Destaques de projetos com descrição.
Depoimentos em carrossel.
Seção de serviços.
Contato com links para redes sociais.
Design moderno com bastante espaço branco e tipografia marcante.`,
  },

  capture: {
    name: 'Página de Captura',
    description: 'Landing page para geração de leads',
    sections: [
      'Hero — Headline, subtítulo, formulário de email',
      'Benefícios — O que o lead vai ganhar',
      'Prova Social — Números e depoimentos',
      'Garantia — Selo de confiança',
      'CTA — Único foco: conversão',
    ],
    promptInstructions: `CRIE UMA PÁGINA DE CAPTURA com alto foco em conversão.
Hero com headline poderosa e formulário simples (nome + email).
Benefícios do lead magnet em bullets.
Prova social com números.
Garantia de satisfação.
Design limpo, sem distrações, sem menu.
Um único objetivo: capturar o email.`,
  },

  event: {
    name: 'Página de Evento',
    description: 'Landing page para webinars, workshops e cursos',
    sections: [
      'Hero — Nome do evento, data,CTA',
      'Sobre — Descrição do evento',
      'Palestrantes — Grid com fotos e bios',
      'Programação — Agenda dia a dia',
      'Para Quem é — Público alvo',
      'Preços — Inscrição e valores',
      'FAQ — Dúvidas comuns',
      'CTA Final — Última chamada',
    ],
    promptInstructions: `CRIE UMA PÁGINA DE EVENTO com senso de urgência.
Hero com nome do evento, data e contagem regressiva (fake).
Descrição do evento e o que o participante vai aprender.
Palestrantes com fotos e mini bios.
Programação em timeline.
Público alvo em tópicos.
Preços com destaque para o CTA.
FAQ acordeão.
Design dinâmico e moderno.`,
  },
};

export function getTemplate(type: WebsiteTemplateType): TemplateDefinition {
  return TEMPLATES[type] || TEMPLATES.sales_page;
}

export function buildGenerationPrompt(specs: WebsiteSpecifications): string {
  const template = getTemplate(specs.template_type);

  const sectionsList = template.sections
    .map((s, i) => `${i + 1}. ${s}`)
    .join('\n');

  const colors =
    specs.cores ||
    'Cores modernas e profissionais (a sua escolha, combinando com o nicho)';
  const referencia = specs.referencia_url
    ? `\nUse este site como referência de estilo: ${specs.referencia_url}`
    : '';

  const valor = specs.produto_servico_valor
    ? `\nValor do produto/serviço: R$ ${specs.produto_servico_valor}`
    : '';

  const observacoes = specs.oberservacoes
    ? `\nObservações adicionais: ${specs.oberservacoes}`
    : '';

  return `Gere uma página HTML completa com CSS profissional no próprio arquivo.

INFORMAÇÕES DA EMPRESA:
- Nome: ${specs.empresa_nome}
- Nicho: ${specs.nicho}
- Descrição: ${specs.descricao}
- Cores desejadas: ${colors}${referencia}${valor}${observacoes}

TIPO DE PÁGINA: ${template.name}
${template.description}

ESTRUTURA DE SEÇÕES (OBRIGATÓRIO):
${sectionsList}

${template.promptInstructions}

REGRAS TÉCNICAS:
1. HTML5 válido com todo o CSS dentro de uma tag <style> no <head>. Não use Tailwind, frameworks CSS, JavaScript ou scripts externos
2. Design responsivo (mobile-first, use unidades rem em vez de px, overflow-x-hidden no body)
3. Use a paleta de cores informada (ou crie uma combinando se não foi especificada)
4. Inclua Google Fonts (Inter ou similar)
5. Use caracteres tipográficos, CSS ou imagens para elementos visuais. Não dependa de bibliotecas JavaScript de ícones
6. Botões de CTA com gradiente e hover effect
7. SEO básico (meta tags, title, description, Open Graph)
8. Navegação suave (smooth scroll)
9. Botão flutuante do WhatsApp usando um link <a> comum
10. NUNCA use opacity: 0 em NENHUM elemento — todo conteúdo deve estar VISÍVEL imediatamente ao carregar a página. Animações são opcionais e devem apenas REALÇAR elementos já visíveis (ex: hover effects, transform em cards ao passar mouse, transições suaves em botões). Se quiser animação de entrada, use CSS puro com @keyframes que parte de opacity: 1 e não depende de JavaScript para exibir o conteúdo.
11. CONTRASTE: texto sobre fundo colorido deve ter contraste mínimo de 4.5:1 (WCAG AA). Use texto branco em fundos escuros e texto quase preto em fundos claros.
12. IMAGENS: use <img> com atributo alt descritivo e loading="lazy". Prefira placehold.co para imagens mock. NUNCA use URLs do unsplash.com/photos/ (elas quebram).
13. TOQUE EM MOBILE: botões e links devem ter área mínima de 44×44px (use padding adequado).
14. Menus mobile, FAQ e conteúdos expansíveis devem funcionar apenas com HTML e CSS. Para FAQ, prefira <details> e <summary>
15. Não inclua nenhuma tag <script>, atributo de evento como onclick, iframe, object ou embed
16. Código completo em UM ÚNICO ARQUIVO HTML
17. Retorne APENAS o código HTML, sem markdown, sem explicações

IMPORTANTE: Retorne SOMENTE o HTML puro. Sem tags de código, sem markdown. Apenas o HTML.
`;
}
