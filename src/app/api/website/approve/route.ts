import { NextResponse } from 'next/server'
import { getCurrentAccount, toErrorResponse } from '@/lib/auth/account'
import { supabaseAdmin } from '@/lib/flows/admin-client'
import { updateOrderStatus } from '@/lib/website-generator/generator'
import { createStaticPixQrCode } from '@/lib/website-generator/asaas'

export async function POST(request: Request) {
  try {
    const ctx = await getCurrentAccount()
    const accountId = ctx.accountId

    const body = await request.json().catch(() => null)
    const paymentValue = Number(body?.payment_value)
    if (!body?.order_id || !Number.isFinite(paymentValue) || paymentValue <= 0) {
      return NextResponse.json(
        { error: 'order_id and a positive payment_value are required' },
        { status: 400 },
      )
    }

    const { data: order, error: loadError } = await supabaseAdmin()
      .from('website_orders')
      .select('*')
      .eq('id', body.order_id)
      .eq('account_id', accountId)
      .single()

    if (loadError || !order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    }

    if (order.status !== 'awaiting_approval') {
      return NextResponse.json(
        { error: `Order cannot be approved from status ${order.status}` },
        { status: 409 },
      )
    }

    const pix = await createStaticPixQrCode({
      value: paymentValue,
      description: 'Criacao de Landing Page',
    })

    await updateOrderStatus(body.order_id, 'awaiting_payment', {
      asaas_payment_id: pix.id,
      asaas_payment_value: paymentValue,
      pix_qrcode: pix.encodedImage || null,
      pix_copiaecola: pix.payload || null,
    })

    return NextResponse.json({
      success: true,
      payment_id: pix.id,
      value: paymentValue,
      pix_qrcode: pix.encodedImage,
      pix_copiaecola: pix.payload,
    })
  } catch (err) {
    return toErrorResponse(err)
  }
}
