import { callWithRotation } from './api-rotation';
import type { ProposalMessageInput } from './types';

export async function generateProposalMessage(
  input: ProposalMessageInput
): Promise<string> {
  // Handle businesses without name
  const businessDisplay = input.business_name === 'Sem nome' 
    ? `uma ${input.business_type}` 
    : `a ${input.business_name}`;

  const prompt = `Generate a personalized, high-conversion WhatsApp message to send to a business owner.

Business: ${input.business_name}
Type: ${input.business_type}
City: ${input.city}
Sender: ${input.sender_name}
Website URL: ${input.website_url || 'will be provided later'}

WHAT WE SELL:
- Professional websites (landing pages, sales pages, institutional sites)
- Modern, mobile-responsive design
- Fast delivery (site ready in seconds)
- Hosted for FREE on Vercel
- Price: R$ 147,90

IMPORTANT RULES:
- Write in Brazilian Portuguese
- NEVER mention scheduling systems, agendas, or appointment management
- Focus ONLY on websites and landing pages
- If business name is "Sem nome", use "uma [business_type]" instead
- Be warm and personal, NOT robotic or generic
- Reference the specific business type and city
- Highlight that they DON'T have a website and we can create one
- Keep it under 150 words
- Sound like a real person, not a sales bot
- Use 1-2 emojis max

Example for business WITH name:
"Oi, tudo bem? 👋 Sou da WACRM. Me deparei com a Clínica Sorriso quando pesquisava sobre clínicas dentárias em São Paulo. Vi que vocês ainda não têm um site profissional. Criamos sites modernos e responsivos por apenas R$ 147,90. Quer ver um exemplo? Sem compromisso!"

Example for business WITHOUT name:
"Oi, tudo bem? 👋 Sou da WACRM. Estava pesquisando sobre clínicas dentárias em São Paulo e vi que algumas não possuem site. Criamos sites profissionais por apenas R$ 147,90. Posso te mostrar um exemplo? Sem compromisso!"

Return ONLY the message text, no quotes or explanations.`;

  const systemInstruction = `Você é um vendedor da WACRM - uma empresa que cria sites profissionais.

O que vendemos:
- Sites profissionais (landing pages, páginas de vendas, sites institucionais)
- Design moderno e responsivo
- Entrega rápida (site pronto em segundos)
- Hospedagem GRÁTIS na Vercel
- Preço: R$ 147,90

NUNCA mencione:
- Sistemas de agendamento
- Gestão de pacientes
- Agenda online
- Prontuários
- Foco APENAS em sites e landing pages

Regras:
- Se o negócio se chama "Sem nome", use "uma [tipo]" em vez do nome
- Escreva em português brasileiro natural
- Seja humano, não robótico
- Mensagens curtas (máx 150 palavras)
- 1-2 emojis no máximo`;

  return callWithRotation(prompt, systemInstruction);
}
