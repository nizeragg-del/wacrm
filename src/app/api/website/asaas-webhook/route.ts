import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/flows/admin-client'
import { deployPaidWebsiteOrder } from '@/lib/website-generator/deploy'
import type { AsaasWebhookBody } from '@/lib/website-generator/types'

export async function POST(request: Request) {
  try {
    const webhookSecret = process.env.ASAAS_WEBHOOK_SECRET
    if (!webhookSecret && process.env.NODE_ENV === 'production') {
      console.error('[asaas-webhook] ASAAS_WEBHOOK_SECRET is required in production')
      return NextResponse.json({ error: 'webhook not configured' }, { status: 500 })
    }

    if (webhookSecret) {
      const authHeader = request.headers.get('authorization')
      if (!authHeader || authHeader !== `Bearer ${webhookSecret}`) {
        console.error('[asaas-webhook] invalid auth token')
        return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
      }
    }

    const body: AsaasWebhookBody = await request.json()

    if (body.event !== 'PAYMENT_RECEIVED') {
      return NextResponse.json({ received: true })
    }

    const searchId = body.payment?.pixQrCodeId || body.payment?.id
    if (!searchId) {
      return NextResponse.json({ error: 'payment id missing' }, { status: 400 })
    }

    const { data: orders, error: searchError } = await supabaseAdmin()
      .from('website_orders')
      .select('id')
      .eq('asaas_payment_id', searchId)
      .limit(1)

    if (searchError || !orders?.length) {
      console.error('[asaas-webhook] order not found for payment', searchId)
      return NextResponse.json({ error: 'order not found' }, { status: 404 })
    }

    const deployResult = await deployPaidWebsiteOrder(orders[0].id)

    return NextResponse.json({
      success: true,
      already_deployed: deployResult.alreadyDeployed,
      repo_url: deployResult.repo_url,
      deploy_url: deployResult.deploy_url,
    })
  } catch (err) {
    console.error('[asaas-webhook] error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal error' },
      { status: 500 },
    )
  }
}
