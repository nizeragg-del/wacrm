import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/flows/admin-client'
import { requireRole, toErrorResponse } from '@/lib/auth/account'

export async function GET() {
  try {
    await requireRole('admin')
    const supabase = supabaseAdmin()
    const results: string[] = []

  // Find active runs stuck for more than 2 minutes
  const { data: stuck, error } = await supabase
    .from('flow_runs')
    .select('id, current_node_key, status, last_advanced_at')
    .eq('status', 'active')
    .lt('last_advanced_at', new Date(Date.now() - 2 * 60 * 1000).toISOString())

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Also reset website_orders stuck on generating
  const { data: stuckOrders, error: ordersErr } = await supabase
    .from('website_orders')
    .select('id, status')
    .in('status', ['generating', 'collecting'])
    .lt('created_at', new Date(Date.now() - 2 * 60 * 1000).toISOString())

  if (!ordersErr && stuckOrders) {
    for (const order of stuckOrders) {
      await supabase
        .from('website_orders')
        .update({ status: 'failed', error_message: 'Stuck - reset manually', updated_at: new Date().toISOString() })
        .eq('id', order.id)
      results.push(`Order ${order.id} (${order.status}): reset ✅`)
    }
  }

  if (!stuck || stuck.length === 0) {
    if (results.length === 0) return NextResponse.json({ message: 'No stuck runs or orders found', resets: 0 })
    return NextResponse.json({ resets: results.length, details: results })
  }

  for (const run of stuck) {
    const { error: err } = await supabase
      .from('flow_runs')
      .update({
        status: 'failed',
        ended_at: new Date().toISOString(),
        end_reason: 'stuck_manually_reset',
      })
      .eq('id', run.id)

    if (err) {
      results.push(`Run ${run.id} (${run.current_node_key}): failed to reset - ${err.message}`)
    } else {
      results.push(`Run ${run.id} (${run.current_node_key}): reset ✅`)
    }
  }

    return NextResponse.json({ resets: results.length, details: results })
  } catch (err) {
    return toErrorResponse(err)
  }
}
