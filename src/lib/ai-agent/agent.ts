import { callGemini } from '@/lib/website-generator/gemini'
import { fetchCrmContext, formatCrmContext } from './crm-context'
import { AGENT_SYSTEM_PROMPT } from './system-prompt'

interface HandleAiAgentArgs {
  accountId: string
  userId: string
  contactId: string
  conversationId: string
  messageText: string
}

export async function handleAiAgent(args: HandleAiAgentArgs): Promise<boolean> {
  try {
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
