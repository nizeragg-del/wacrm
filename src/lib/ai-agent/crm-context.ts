import { supabaseAdmin } from '@/lib/flows/admin-client'

interface CrmContext {
  contact: {
    name?: string
    company?: string
    email?: string
    phone: string
    created_at: string
  }
  tags: string[]
  recentMessages: {
    sender_type: string
    content_text?: string
    created_at: string
  }[]
  activeOrders: {
    id: string
    status: string
    deploy_url?: string
    empresa_nome?: string
  }[]
  conversationStatus: string
}

export async function fetchCrmContext(
  accountId: string,
  contactId: string,
  conversationId: string,
): Promise<CrmContext> {
  const db = supabaseAdmin()

  const [contactResult, tagsResult, messagesResult, ordersResult, convResult] =
    await Promise.all([
      db
        .from('contacts')
        .select('name, company, email, phone, created_at')
        .eq('id', contactId)
        .eq('account_id', accountId)
        .maybeSingle(),

      db
        .from('contact_tags')
        .select('tags(name)')
        .eq('contact_id', contactId),

      db
        .from('messages')
        .select('sender_type, content_text, created_at')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: false })
        .limit(20),

      db
        .from('website_orders')
        .select('id, status, deploy_url, empresa_nome')
        .eq('contact_id', contactId)
        .eq('account_id', accountId)
        .order('created_at', { ascending: false })
        .limit(5),

      db
        .from('conversations')
        .select('status')
        .eq('id', conversationId)
        .maybeSingle(),
    ])

  return {
    contact: {
      name: contactResult.data?.name ?? undefined,
      company: contactResult.data?.company ?? undefined,
      email: contactResult.data?.email ?? undefined,
      phone: contactResult.data?.phone ?? '',
      created_at: contactResult.data?.created_at ?? new Date().toISOString(),
    },
    tags: (tagsResult.data ?? []).map(
      (t: { tags: { name: string }[] }) => t.tags?.[0]?.name ?? '',
    ).filter(Boolean),
    recentMessages: (messagesResult.data ?? []).reverse(),
    activeOrders: (ordersResult.data ?? []) as CrmContext['activeOrders'],
    conversationStatus: convResult.data?.status ?? 'open',
  }
}

export function formatCrmContext(ctx: CrmContext): string {
  const lines: string[] = []

  lines.push('## Dados do contato')
  if (ctx.contact.name) lines.push(`- Nome: ${ctx.contact.name}`)
  if (ctx.contact.company) lines.push(`- Empresa: ${ctx.contact.company}`)
  if (ctx.contact.email) lines.push(`- Email: ${ctx.contact.email}`)
  lines.push(`- Telefone: ${ctx.contact.phone}`)
  lines.push(
    `- Cliente desde: ${new Date(ctx.contact.created_at).toLocaleDateString('pt-BR')}`,
  )

  if (ctx.tags.length > 0) {
    lines.push(`- Tags: ${ctx.tags.join(', ')}`)
  }

  if (ctx.activeOrders.length > 0) {
    lines.push('\n## Pedidos de site')
    for (const order of ctx.activeOrders) {
      lines.push(
        `- ${order.empresa_nome ?? 'Sem nome'}: ${order.status}${order.deploy_url ? ` (${order.deploy_url})` : ''}`,
      )
    }
  }

  if (ctx.recentMessages.length > 0) {
    lines.push('\n## Últimas mensagens da conversa')
    for (const msg of ctx.recentMessages) {
      const role = msg.sender_type === 'customer' ? 'Cliente' : 'Bot'
      lines.push(`- ${role}: ${msg.content_text ?? '(mídia)'}`)
    }
  }

  lines.push(`\n- Status da conversa: ${ctx.conversationStatus}`)

  return lines.join('\n')
}
