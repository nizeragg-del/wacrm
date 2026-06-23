import { callWithRotation } from './api-rotation';
import type { ProposalMessageInput } from './types';

export async function generateProposalMessage(
  input: ProposalMessageInput
): Promise<string> {
  const prompt = `Generate a personalized, high-conversion WhatsApp message to send to a business owner.

Business: ${input.business_name}
Type: ${input.business_type}
City: ${input.city}
Sender: ${input.sender_name}
Website URL: ${input.website_url || 'will be provided later'}

Requirements:
- Write in Brazilian Portuguese
- Be warm and personal, NOT robotic or generic
- Reference the specific business name and type
- Mention the city to show local relevance
- Highlight ONE specific benefit relevant to their business type
- Include the website URL naturally if provided
- End with a soft call-to-action (not pushy)
- Use 1-2 emojis max (not excessive)
- Keep it under 200 words
- Sound like a real person, not a sales bot

Example structure:
"Oi, tudo bem? 👋 Sou o [sender]. Me deparei com a [business] quando pesquisava sobre [type] em [city]. [Specific observation about their business]. [Benefit statement]. [Website URL if available]. [Soft CTA]."

Return ONLY the message text, no quotes or explanations.`;

  const systemInstruction = `Você é um copywriter especializado em mensagens de vendas para WhatsApp.
Suas mensagens são personalizadas, humanas e de alta conversão.
Nunca soam robóticas ou genéricas.
Sempre escreve em português brasileiro natural.`;

  return callWithRotation(prompt, systemInstruction);
}
