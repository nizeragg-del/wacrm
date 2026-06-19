import { NextResponse } from 'next/server'
import { getCurrentAccount, toErrorResponse } from '@/lib/auth/account'
import { regenerateWebsite } from '@/lib/website-generator/generator'

export async function POST(request: Request) {
  try {
    const ctx = await getCurrentAccount()
    const accountId = ctx.accountId

    const body = await request.json().catch(() => null)
    if (!body?.order_id || !body?.feedback) {
      return NextResponse.json(
        { error: 'order_id and feedback are required' },
        { status: 400 },
      )
    }

    try {
      const result = await regenerateWebsite(body.order_id, body.feedback, accountId)
      return NextResponse.json({
        success: true,
        screenshots: result.screenshots,
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Regeneration failed'
      if (message.includes('Maximum regenerations')) {
        return NextResponse.json({ error: message }, { status: 400 })
      }
      throw err
    }
  } catch (err) {
    return toErrorResponse(err)
  }
}
