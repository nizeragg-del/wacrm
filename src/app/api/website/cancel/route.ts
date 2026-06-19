import { NextResponse } from 'next/server'
import { getCurrentAccount, toErrorResponse } from '@/lib/auth/account'
import { supabaseAdmin } from '@/lib/flows/admin-client'

export async function POST(request: Request) {
  try {
    const ctx = await getCurrentAccount()
    const accountId = ctx.accountId

    const body = await request.json().catch(() => null)
    if (!body?.order_id) {
      return NextResponse.json(
        { error: 'order_id is required' },
        { status: 400 },
      )
    }

    const db = supabaseAdmin()
    const { data, error } = await db
      .from('website_orders')
      .update({
        status: 'cancelled',
        updated_at: new Date().toISOString(),
      })
      .eq('id', body.order_id)
      .eq('account_id', accountId)
      .in('status', ['collecting', 'generating', 'awaiting_approval', 'regenerating', 'awaiting_payment'])
      .select('id')

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    if (!data?.length) {
      return NextResponse.json({ error: 'Order not found or cannot be cancelled' }, { status: 404 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    return toErrorResponse(err)
  }
}
