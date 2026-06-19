import { supabaseAdmin } from '@/lib/flows/admin-client';
import { buildGenerationPrompt, getTemplate } from './templates';
import { captureScreenshots } from './screenshots';
import { sanitizeGeneratedHtml } from './security';
import {
  callWebsiteProvider,
  getProviderOrder,
  type WebsiteGenerationResult,
} from './providers';
import type {
  WebsiteOrder,
  WebsiteOrderStatus,
  WebsiteSection,
  WebsiteSpecifications,
} from './types';

const MAX_GENERATED_HTML_BYTES = 750_000;

function prepareGeneratedHtml(html: string, label: string): string {
  if (!/<\/html>\s*$/i.test(html)) {
    throw new Error(
      `${label} HTML is incomplete (missing closing </html> tag)`
    );
  }
  const sanitized = sanitizeGeneratedHtml(html);
  if (Buffer.byteLength(sanitized, 'utf8') > MAX_GENERATED_HTML_BYTES) {
    throw new Error(`${label} HTML is too large`);
  }
  return sanitized;
}

async function generatePreparedHtml(
  prompt: string,
  systemInstruction: string,
  label: string
): Promise<WebsiteGenerationResult> {
  const providers = getProviderOrder();
  let lastError: Error | null = null;

  for (const provider of providers) {
    try {
      const result = await callWebsiteProvider(
        provider,
        prompt,
        systemInstruction
      );
      return {
        ...result,
        html: prepareGeneratedHtml(result.html, label),
      };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      console.error(
        `[generator] ${provider} generation failed:`,
        lastError.message
      );
    }
  }

  throw lastError || new Error('Website generation failed');
}

export async function createWebsiteOrder(params: {
  account_id: string;
  contact_id: string;
  conversation_id: string;
  specifications: WebsiteSpecifications;
}): Promise<WebsiteOrder> {
  const db = supabaseAdmin();

  const { data, error } = await db
    .from('website_orders')
    .insert({
      account_id: params.account_id,
      contact_id: params.contact_id,
      conversation_id: params.conversation_id,
      status: 'collecting',
      template_type: params.specifications.template_type,
      specifications: params.specifications,
      generation_count: 0,
      max_regenerations: 3,
    })
    .select()
    .single();

  if (error)
    throw new Error(`Failed to create website order: ${error.message}`);
  return data as WebsiteOrder;
}

export async function updateOrderStatus(
  orderId: string,
  status: WebsiteOrderStatus,
  extra: Record<string, unknown> = {}
): Promise<void> {
  const db = supabaseAdmin();
  const { error } = await db
    .from('website_orders')
    .update({ status, updated_at: new Date().toISOString(), ...extra })
    .eq('id', orderId);

  if (error) throw new Error(`Failed to update order: ${error.message}`);
}

export async function generateWebsite(
  orderId: string,
  specifications: WebsiteSpecifications
): Promise<{
  generated_code: string;
  screenshots: WebsiteSection[];
}> {
  await updateOrderStatus(orderId, 'generating');

  const prompt = buildGenerationPrompt(specifications);
  const systemInstruction = `Você é um especialista em criação de landing pages de alta conversão.
Você domina HTML, CSS, design responsivo e copywriting persuasivo.
Sempre entrega código limpo, moderno e funcional.
O resultado deve funcionar sem JavaScript e sem etapa de compilação.
Nunca use opacity: 0 ou visibility: hidden em seções do site — o conteúdo deve estar sempre visível imediatamente ao carregar a página.
Use contraste mínimo de 4.5:1 entre texto e fundo (WCAG AA).
Imagens devem ter alt descritivo e loading="lazy". Prefira placehold.co para imagens mock, nunca use unsplash.com/photos/.
Botões e links devem ter área mínima de toque de 44×44px.
Use overflow-x-hidden no body para evitar scroll horizontal em mobile.
Use unidades rem em vez de px para fontes e espaçamentos.`;

  const generation = await generatePreparedHtml(
    prompt,
    systemInstruction,
    'Generated'
  );
  const html = generation.html;
  console.info(
    `[generator] website generated with ${generation.provider}/${generation.model}`
  );

  const template = getTemplate(specifications.template_type);
  const screenshots = await captureScreenshots(html, template.sections);

  const db = supabaseAdmin();
  const { error } = await db
    .from('website_orders')
    .update({
      generated_code: html,
      screenshots,
      status: 'awaiting_approval',
      updated_at: new Date().toISOString(),
    })
    .eq('id', orderId);

  if (error) {
    console.error('[generator] failed to save generated website:', error);
  }

  return { generated_code: html, screenshots };
}

export async function regenerateWebsite(
  orderId: string,
  feedback: string,
  accountId?: string
): Promise<{
  generated_code: string;
  screenshots: WebsiteSection[];
}> {
  const db = supabaseAdmin();

  const { data: order, error: loadError } = await db
    .from('website_orders')
    .select('*')
    .eq('id', orderId)
    .match(accountId ? { account_id: accountId } : {})
    .single();

  if (loadError || !order) throw new Error('Order not found');

  const orderData = order as WebsiteOrder;

  if (orderData.generation_count >= orderData.max_regenerations) {
    throw new Error('Maximum regenerations reached');
  }

  await updateOrderStatus(orderId, 'regenerating', { feedback });

  const specs = orderData.specifications;
  const prompt = buildGenerationPrompt(specs);
  const systemInstruction = `Você é um especialista em landing pages.
O cliente pediu alterações no site gerado anteriormente.
Feedback do cliente: ${feedback}
Refaça o site considerando TODO o feedback acima.
O resultado deve funcionar sem JavaScript e sem etapa de compilação.
Nunca use opacity: 0 ou visibility: hidden em seções do site — o conteúdo deve estar sempre visível imediatamente ao carregar a página.
Use contraste mínimo de 4.5:1 entre texto e fundo (WCAG AA).
Imagens devem ter alt descritivo e loading="lazy". Prefira placehold.co para imagens mock, nunca use unsplash.com/photos/.
Botões e links devem ter área mínima de toque de 44×44px.
Use overflow-x-hidden no body para evitar scroll horizontal em mobile.
Use unidades rem em vez de px para fontes e espaçamentos.`;

  const generation = await generatePreparedHtml(
    prompt,
    systemInstruction,
    'Regenerated'
  );
  const html = generation.html;
  console.info(
    `[generator] website regenerated with ${generation.provider}/${generation.model}`
  );

  const template = getTemplate(specs.template_type);
  const screenshots = await captureScreenshots(html, template.sections);

  const { error } = await db
    .from('website_orders')
    .update({
      generated_code: html,
      screenshots,
      status: 'awaiting_approval',
      generation_count: orderData.generation_count + 1,
      feedback: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', orderId);

  if (error) {
    console.error('[generator] failed to save regenerated website:', error);
  }

  return { generated_code: html, screenshots };
}
