import { callGemini } from '@/lib/website-generator/gemini'
import { fetchCrmContext, formatCrmContext } from './crm-context'
import { AGENT_SYSTEM_PROMPT } from './system-prompt'
import { handleSalesConversation } from '@/lib/lead-capture/sales-agent'

interface HandleAiAgentArgs {
  accountId: string
  userId: string
  contactId: string
  conversationId: string
  messageText: string
}

export async function handleAiAgent(args: HandleAiAgentArgs): Promise<boolean> {
  try {
    // Check if this contact is a lead from lead capture
    const { createClient } = await import('@supabase/supabase-js')
    const db = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // Get contact phone to find the specific lead
    const { data: contact } = await db
      .from('contacts')
      .select('phone')
      .eq('id', args.contactId)
      .maybeSingle()

    const { data: lead } = await db
      .from('captured_leads')
      .select('id')
      .eq('account_id', args.accountId)
      .eq('contact_id', args.contactId)
      .maybeSingle()
      // Fallback: match by phone if contact_id link is missing
      ?? (contact?.phone ? await db
        .from('captured_leads')
        .select('id')
        .eq('account_id', args.accountId)
        .eq('phone', contact.phone)
        .maybeSingle() : { data: null })

    // If it's a lead, use sales agent flow
    if (lead) {
      const reply = await handleSalesConversation(
        args.accountId,
        args.contactId,
        args.messageText,
        lead.id
      )

      if (reply) {
        const { engineSendText } = await import('@/lib/flows/meta-send')
        await engineSendText({
          accountId: args.accountId,
          userId: args.userId,
          conversationId: args.conversationId,
          contactId: args.contactId,
          text: reply,
        })
        return true
      }
      return false
    }

    // Otherwise, use generic AI agent
    const ctx = await fetchCrmContext(
      args.accountId,
      args.contactId,
      args.conversationId,
    )

    const crmBlock = formatCrmContext(ctx)

    const prompt = `${crmBlock}\n\n---\n\nMensagem do cliente: "${args.messageText}"\n\nResponda de forma humanizada e breve.`

    const reply = await callGemini(prompt, AGENT_SYSTEM_PROMPT)

    if (!reply || reply.trim().length === 0) {
      return false
    }

    const { engineSendText } = await import('@/lib/flows/meta-send')
    await engineSendText({
      accountId: args.accountId,
      userId: args.userId,
      conversationId: args.conversationId,
      contactId: args.contactId,
      text: reply.trim(),
    })

    return true
  } catch (err) {
    console.error('[ai-agent] failed:', err)
    return false
  }
}
