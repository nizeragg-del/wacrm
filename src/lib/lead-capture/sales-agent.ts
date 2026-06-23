import { createClient } from '@supabase/supabase-js';
import { callWithRotation } from './api-rotation';
import { SALES_AGENT_PROMPT } from '@/lib/ai-agent/sales-prompt';

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export interface ConversationState {
  id: string;
  contact_id: string;
  account_id: string;
  lead_id: string | null;
  flow_status: string;
  business_name: string | null;
  business_type: string | null;
  address: string | null;
  phone: string | null;
  description: string | null;
  preferences: string | null;
  website_order_id: string | null;
  website_url: string | null;
  screenshot_url: string | null;
  payment_id: string | null;
  payment_status: string | null;
  payment_amount: number;
  upsell_sent_at: string | null;
  upsell_type: string | null;
  last_message_at: string | null;
  created_at: string;
  updated_at: string;
}

export async function getOrCreateConversationState(
  accountId: string,
  contactId: string,
  leadId?: string
): Promise<ConversationState> {
  const db = getSupabaseAdmin();

  // Try to find existing state
  const { data: existing } = await db
    .from('lead_conversation_state')
    .select('*')
    .eq('account_id', accountId)
    .eq('contact_id', contactId)
    .maybeSingle();

  if (existing) {
    return existing as ConversationState;
  }

  // Create new state
  const { data: newState, error } = await db
    .from('lead_conversation_state')
    .insert({
      account_id: accountId,
      contact_id: contactId,
      lead_id: leadId || null,
      flow_status: 'initial',
    })
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to create conversation state: ${error.message}`);
  }

  return newState as ConversationState;
}

export async function updateConversationState(
  stateId: string,
  updates: Partial<ConversationState>
): Promise<void> {
  const db = getSupabaseAdmin();

  const { error } = await db
    .from('lead_conversation_state')
    .update({
      ...updates,
      updated_at: new Date().toISOString(),
    })
    .eq('id', stateId);

  if (error) {
    throw new Error(`Failed to update conversation state: ${error.message}`);
  }
}

export async function handleSalesConversation(
  accountId: string,
  contactId: string,
  messageText: string,
  leadId?: string
): Promise<string | null> {
  // Get or create conversation state
  const state = await getOrCreateConversationState(accountId, contactId, leadId);

  // Update last message time
  await updateConversationState(state.id, {
    last_message_at: new Date().toISOString(),
  });

  // Build context for AI
  const context = buildConversationContext(state, messageText);

  // Call AI with rotation
  try {
    const reply = await callWithRotation(context, SALES_AGENT_PROMPT);

    if (!reply || reply.trim().length === 0) {
      return null;
    }

    // Parse and execute any actions from the reply
    const { cleanReply, actions } = parseAgentReply(reply);

    // Execute actions
    for (const action of actions) {
      await executeAction(state, action, accountId);
    }

    return cleanReply;
  } catch (error) {
    console.error('[sales-agent] AI call failed:', error);
    return null;
  }
}

function buildConversationContext(state: ConversationState, messageText: string): string {
  const statusMap: Record<string, string> = {
    initial: 'Aguardando primeira resposta do cliente',
    collecting_info: 'Coletando informações do negócio',
    website_generated: 'Site gerado, aguardando aprovação',
    preview_sent: 'Preview enviado, aguardando aprovação',
    awaiting_approval: 'Aguardando aprovação do cliente',
    payment_sent: 'PIX enviado, aguardando pagamento',
    payment_confirmed: 'Pagamento confirmado, fazendo deploy',
    deploying: 'Fazendo deploy do site',
    deployed: 'Site online, aguardando feedback',
    upsell_pending: 'Pronto para oferecer upsell',
    upsell_sent: 'Upsell enviado, aguardando resposta',
    completed: 'Processo finalizado',
  };

  return `
## Estado da Conversa
- Status: ${statusMap[state.flow_status] || state.flow_status}
- Negócio: ${state.business_name || 'Não informado'}
- Tipo: ${state.business_type || 'Não informado'}
- Endereço: ${state.address || 'Não informado'}
- Telefone: ${state.phone || 'Não informado'}
- Descrição: ${state.description || 'Não informado'}
- Site URL: ${state.website_url || 'Não gerado'}
- Pagamento: ${state.payment_status || 'Não enviado'}

## Mensagem do cliente
"${messageText}"

## Instruções
Responda de forma humanizada e Execute as ações necessárias usando os comandos:
[ACTION:GENERATE_WEBSITE] - Para gerar o site
[ACTION:SEND_PREVIEW] - Para enviar preview
[ACTION:SEND_PAYMENT] - Para enviar PIX
[ACTION:DEPLOY] - Para fazer deploy
[ACTION:SEND_UPSELL] - Para oferecer upsell

Responda sempre em português brasileiro.`;
}

function parseAgentReply(reply: string): { cleanReply: string; actions: string[] } {
  const actionRegex = /\[ACTION:(\w+)\]/g;
  const actions: string[] = [];
  let match;

  while ((match = actionRegex.exec(reply)) !== null) {
    actions.push(match[1]);
  }

  const cleanReply = reply.replace(actionRegex, '').trim();

  return { cleanReply, actions };
}

async function executeAction(
  state: ConversationState,
  action: string,
  _accountId: string
): Promise<void> {
  switch (action) {
    case 'GENERATE_WEBSITE':
      // Update status to website_generated
      await updateConversationState(state.id, {
        flow_status: 'website_generated',
      });
      // TODO: Call website generator
      break;

    case 'SEND_PREVIEW':
      // Update status to preview_sent
      await updateConversationState(state.id, {
        flow_status: 'preview_sent',
      });
      // TODO: Send screenshot
      break;

    case 'SEND_PAYMENT':
      // Update status to payment_sent
      await updateConversationState(state.id, {
        flow_status: 'payment_sent',
        payment_status: 'pending',
      });
      // TODO: Create PIX payment
      break;

    case 'DEPLOY':
      // Update status to deploying
      await updateConversationState(state.id, {
        flow_status: 'deploying',
      });
      // TODO: Deploy to GitHub + Vercel
      break;

    case 'SEND_UPSELL':
      // Update status to upsell_sent
      await updateConversationState(state.id, {
        flow_status: 'upsell_sent',
        upsell_sent_at: new Date().toISOString(),
      });
      break;

    default:
      console.warn(`[sales-agent] Unknown action: ${action}`);
  }
}

export async function getConversationsNeedingUpsell(): Promise<ConversationState[]> {
  const db = getSupabaseAdmin();

  // Find conversations deployed more than 7 days ago, no upsell sent
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await db
    .from('lead_conversation_state')
    .select('*')
    .eq('flow_status', 'deployed')
    .lt('updated_at', sevenDaysAgo)
    .is('upsell_sent_at', null)
    .limit(50);

  if (error) {
    console.error('[sales-agent] Failed to fetch upsell candidates:', error);
    return [];
  }

  return (data || []) as ConversationState[];
}
