import { NextResponse } from 'next/server'
import { getCurrentAccount, toErrorResponse } from '@/lib/auth/account'
import { createWebsiteOrder, generateWebsite, updateOrderStatus } from '@/lib/website-generator/generator'

export async function POST(request: Request) {
  try {
    const ctx = await getCurrentAccount()
    const accountId = ctx.accountId

    const body = await request.json().catch(() => null)
    if (!body?.contact_id || !body?.conversation_id || !body?.specifications) {
      return NextResponse.json(
        { error: 'contact_id, conversation_id, and specifications are required' },
        { status: 400 },
      )
    }

    const { data: conversation, error: conversationError } = await ctx.supabase
      .from('conversations')
      .select('id, contact_id')
      .eq('id', body.conversation_id)
      .eq('account_id', accountId)
      .maybeSingle()

    if (
      conversationError ||
      !conversation ||
      conversation.contact_id !== body.contact_id
    ) {
      return NextResponse.json(
        { error: 'Conversation/contact not found for this account' },
        { status: 404 },
      )
    }

    const order = await createWebsiteOrder({
      account_id: accountId,
      contact_id: body.contact_id,
      conversation_id: body.conversation_id,
      specifications: body.specifications,
    })

    try {
      const result = await generateWebsite(order.id, body.specifications)
      return NextResponse.json({
        order_id: order.id,
        screenshots: result.screenshots,
      })
    } catch (err) {
      await updateOrderStatus(order.id, 'failed', {
        error_message: err instanceof Error ? err.message : 'Generation failed',
      })
      throw err
    }
  } catch (err) {
    return toErrorResponse(err)
  }
}
