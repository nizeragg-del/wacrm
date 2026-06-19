import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/flows/admin-client'
import {
  previewSecurityHeaders,
  sanitizeGeneratedHtml,
  verifyPreviewToken,
} from '@/lib/website-generator/security'

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ orderId: string }> },
) {
  const { orderId } = await context.params
  const token = _request.nextUrl.searchParams.get('token')

  if (!verifyPreviewToken(orderId, token)) {
    return new NextResponse('Preview token invalido ou expirado', { status: 403 })
  }

  const { data: order, error } = await supabaseAdmin()
    .from('website_orders')
    .select('generated_code, specifications')
    .eq('id', orderId)
    .maybeSingle()

  if (error || !order?.generated_code) {
    return new NextResponse('Preview não encontrado', { status: 404 })
  }

  const html = sanitizeGeneratedHtml(order.generated_code as string)

  const patched = html.replace(
    '</head>',
    `<style>
  .reveal-on-scroll, [class*="opacity-0"], [style*="opacity: 0"] {
    opacity: 1 !important;
    transform: none !important;
  }
</style></head>`,
  )

  return new NextResponse(patched, {
    headers: previewSecurityHeaders(),
  })
}
