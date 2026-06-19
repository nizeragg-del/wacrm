import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/flows/admin-client'
import { deployPaidWebsiteOrder } from '@/lib/website-generator/deploy'
import { authorizePaymentTestRequest } from '@/lib/website-generator/security'
import type { WebsiteOrder } from '@/lib/website-generator/types'

const ASAAS_API_URL = process.env.ASAAS_API_URL || 'https://api-sandbox.asaas.com/v3'
const ASAAS_API_KEY = process.env.ASAAS_API_KEY || ''
const UA = 'User-Agent'
const UA_VALUE = 'wacrm/1.0'

async function asaasFetch(path: string, options?: RequestInit) {
  if (!ASAAS_API_KEY) {
    throw new Error('ASAAS_API_KEY environment variable not set')
  }

  const res = await fetch(`${ASAAS_API_URL}${path}`, {
    ...options,
    headers: {
      access_token: ASAAS_API_KEY,
      'Content-Type': 'application/json',
      [UA]: UA_VALUE,
      ...options?.headers,
    },
  })
  if (!res.ok) {
    const err = await res.json().catch(() => null)
    throw new Error(err?.errors?.[0]?.description || `Asaas error ${res.status}`)
  }
  return res.json()
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const orderId = searchParams.get('orderId')
    const force = searchParams.get('force') === '1'
    const skipAsaas = searchParams.get('skipAsaas') === '1'

    if (!orderId) {
      return NextResponse.json({ error: 'orderId query param required' }, { status: 400 })
    }

    const db = supabaseAdmin()
    const { data: order, error } = await db
      .from('website_orders')
      .select('*')
      .eq('id', orderId)
      .single()

    if (error || !order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    }

    const orderData = order as WebsiteOrder
    const auth = await authorizePaymentTestRequest(request, orderData.account_id)
    if (!auth.ok) return auth.response

    const steps: string[] = []
    let paymentId: string | null = null

    if (!skipAsaas && orderData.asaas_payment_id && ASAAS_API_KEY) {
      const qrCodeId = orderData.asaas_payment_id
      const payments = await asaasFetch(
        `/payments?pixQrCodeId=${encodeURIComponent(qrCodeId)}&limit=10`,
      )
      const paymentValue = Number(orderData.asaas_payment_value) || 0

      if (payments.data?.length > 0) {
        const payable = payments.data.find((p: any) =>
          p.status === 'PENDING' || p.status === 'CONFIRMED'
        )
        if (payable) {
          paymentId = payable.id
          steps.push(`Found payment ${paymentId} (status: ${payable.status})`)
          await asaasFetch(`/payments/${paymentId}/receiveInCash`, {
            method: 'POST',
            body: JSON.stringify({
              date: new Date().toISOString().split('T')[0],
              value: paymentValue || payable.value,
              notifyCustomer: false,
            }),
          })
          steps.push(`Simulated receipt for payment ${paymentId}`)
        } else {
          const received = payments.data.find((p: any) => p.status === 'RECEIVED')
          if (received) paymentId = received.id
          steps.push('No pending Asaas payment found; proceeding to deploy test')
        }
      } else {
        steps.push('No Asaas payments found for this static QR code; proceeding to deploy test')
      }
    } else {
      steps.push('Asaas simulation skipped; proceeding to deploy test')
    }

    const deployResult = await deployPaidWebsiteOrder(orderId, { force })
    steps.push(
      deployResult.alreadyDeployed
        ? 'Order was already deployed'
        : `Deployed to: ${deployResult.deploy_url}`,
    )

    return NextResponse.json({
      success: true,
      orderId,
      paymentId,
      steps,
      already_deployed: deployResult.alreadyDeployed,
      repo_url: deployResult.repo_url,
      deploy_url: deployResult.deploy_url,
    })
  } catch (err) {
    console.error('[simulate-payment] error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal error' },
      { status: 500 },
    )
  }
}
