import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/flows/admin-client'
import { requireRole, toErrorResponse } from '@/lib/auth/account'

export async function GET() {
  try {
    await requireRole('admin')
    const supabase = supabaseAdmin()
    const { data: events, error } = await supabase
      .from('flow_run_events')
      .select('event_type, node_key, payload, created_at')
      .eq('event_type', 'error')
      .order('created_at', { ascending: false })
      .limit(10)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const { data: orders } = await supabase
    .from('website_orders')
    .select('id, status, error_message, created_at')
    .order('created_at', { ascending: false })
    .limit(5)

  const { data: runs } = await supabase
    .from('flow_runs')
    .select('id, current_node_key, status, end_reason, last_advanced_at')
    .order('last_advanced_at', { ascending: false })
    .limit(5)

    return NextResponse.json({
      errors: events || [],
      recent_orders: orders || [],
      recent_runs: runs || [],
      env: {
        asaas_key_set: !!process.env.ASAAS_API_KEY,
        asaas_url_set: !!process.env.ASAAS_API_URL,
        gemini_key_set: !!process.env.GEMINI_API_KEY,
        preview_url: process.env.NEXT_PUBLIC_PREVIEW_URL || '(not set)',
      },
    })
  } catch (err) {
    return toErrorResponse(err)
  }
}
