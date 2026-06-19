import { timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/flows/admin-client'
import { engineSendText } from '@/lib/flows/meta-send'

/**
 * Check and send due scheduled reminders (abandoned payment recovery).
 *
 * Queries `scheduled_reminders` where `remind_at <= now()` and
 * `status = 'pending'`, sends the message to the contact, then
 * marks the reminder as 'sent'.
 *
 * Auth: re-uses `AUTOMATION_CRON_SECRET`.
 * Hosting: hit on a schedule (Vercel Cron / external pinger).
 * A 5-minute interval is appropriate.
 */
export async function GET(request: Request) {
  const expected = process.env.AUTOMATION_CRON_SECRET
  if (!expected) {
    return NextResponse.json({ error: 'cron not configured' }, { status: 503 })
  }
  const supplied = request.headers.get('x-cron-secret') ?? ''
  const suppliedBuf = Buffer.from(supplied)
  const expectedBuf = Buffer.from(expected)
  if (
    suppliedBuf.length !== expectedBuf.length ||
    !timingSafeEqual(suppliedBuf, expectedBuf)
  ) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = supabaseAdmin()
  const now = new Date()

  const { data: due, error } = await admin
    .from('scheduled_reminders')
    .select('*')
    .eq('status', 'pending')
    .lte('remind_at', now.toISOString())
    .order('remind_at', { ascending: true })
    .limit(50)

  if (error) {
    console.error('[check-reminders] query failed:', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  if (!due || due.length === 0) return NextResponse.json({ processed: 0 })

  let processed = 0
  let failed = 0

  for (const reminder of due) {
    // Claim: mark as 'sending' so concurrent invocations don't double-send
    const { data: claim } = await admin
      .from('scheduled_reminders')
      .update({ status: 'sending' })
      .eq('id', reminder.id)
      .eq('status', 'pending')
      .select('id')
      .maybeSingle()

    if (!claim) continue

    try {
      // Reload the order to check if it's been paid already
      const { data: order } = await admin
        .from('website_orders')
        .select('status')
        .eq('id', reminder.order_id)
        .maybeSingle()

      // If the order has been paid/deployed, skip the reminder
      if (order && (order.status === 'deployed' || order.status === 'deploying')) {
        await admin
          .from('scheduled_reminders')
          .update({ status: 'skipped', sent_at: now.toISOString() })
          .eq('id', reminder.id)
        continue
      }

      // Send the reminder message
      await engineSendText({
        accountId: reminder.account_id,
        userId: reminder.user_id,
        conversationId: reminder.conversation_id,
        contactId: reminder.contact_id,
        text: reminder.message_template,
      })

      await admin
        .from('scheduled_reminders')
        .update({ status: 'sent', sent_at: now.toISOString() })
        .eq('id', reminder.id)

      processed++
    } catch (err) {
      console.error('[check-reminders] failed to send:', reminder.id, err)
      await admin
        .from('scheduled_reminders')
        .update({ status: 'failed', sent_at: now.toISOString() })
        .eq('id', reminder.id)
      failed++
    }
  }

  return NextResponse.json({ processed, failed })
}
