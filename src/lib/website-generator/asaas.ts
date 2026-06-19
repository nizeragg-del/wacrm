const ASAAS_API_URL = process.env.ASAAS_API_URL || 'https://api-sandbox.asaas.com/v3'

const UA = 'User-Agent'
const UA_VALUE = 'wacrm/1.0'
const ASAAS_API_KEY = process.env.ASAAS_API_KEY || ''

interface AsaasCustomer {
  id: string
  name: string
  cpfCnpj?: string
  email?: string
  phone?: string
}

interface AsaasPayment {
  id: string
  value: number
  netValue: number
  status: string
  billingType: string
  pixQrCode?: string
  pixCopiaECola?: string
  invoiceUrl?: string
  bankSlipUrl?: string
}

export async function findOrCreateCustomer(params: {
  name: string
  phone?: string
  email?: string
  cpfCnpj?: string
}): Promise<AsaasCustomer> {
  if (!ASAAS_API_KEY) {
    throw new Error('ASAAS_API_KEY environment variable not set')
  }

  if (params.phone) {
    const searchRes = await fetch(
      `${ASAAS_API_URL}/customers?phone=${encodeURIComponent(params.phone)}`,
      {
        headers: { access_token: ASAAS_API_KEY, [UA]: UA_VALUE },
      },
    )
    if (searchRes.ok) {
      const searchData = await searchRes.json()
      if (searchData.data?.length > 0) {
        const existing = searchData.data[0] as AsaasCustomer
        if (!existing.cpfCnpj && params.cpfCnpj) {
          const updateRes = await fetch(`${ASAAS_API_URL}/customers/${existing.id}`, {
            method: 'POST',
            headers: {
              access_token: ASAAS_API_KEY,
              'Content-Type': 'application/json',
              [UA]: UA_VALUE,
            },
            body: JSON.stringify({ cpfCnpj: params.cpfCnpj }),
          })
          if (updateRes.ok) return updateRes.json()
        }
        return existing
      }
    }
  }

  const createRes = await fetch(`${ASAAS_API_URL}/customers`, {
    method: 'POST',
    headers: {
      access_token: ASAAS_API_KEY,
      'Content-Type': 'application/json',
      [UA]: UA_VALUE,
    },
    body: JSON.stringify({
      name: params.name,
      phone: params.phone,
      email: params.email,
      cpfCnpj: params.cpfCnpj || '11111111111',
      notificationDisabled: false,
    }),
  })

  if (!createRes.ok) {
    const err = await createRes.json()
    throw new Error(`Asaas create customer failed: ${err.errors?.[0]?.description || createRes.statusText}`)
  }

  return createRes.json()
}

export async function createPixPayment(params: {
  customerId: string
  value: number
  description: string
  dueDate: string
}): Promise<AsaasPayment> {
  if (!ASAAS_API_KEY) {
    throw new Error('ASAAS_API_KEY environment variable not set')
  }

  const res = await fetch(`${ASAAS_API_URL}/payments`, {
    method: 'POST',
    headers: {
      access_token: ASAAS_API_KEY,
      'Content-Type': 'application/json',
      [UA]: UA_VALUE,
    },
    body: JSON.stringify({
      customer: params.customerId,
      billingType: 'PIX',
      value: params.value,
      dueDate: params.dueDate,
      description: params.description,
    }),
  })

  if (!res.ok) {
    const err = await res.json()
    throw new Error(`Asaas create payment failed: ${err.errors?.[0]?.description || res.statusText}`)
  }

  const payment = await res.json()

  let pixQrCode: string | undefined
  let pixCopiaECola: string | undefined

  if (payment.billingType === 'PIX') {
    const pixRes = await fetch(
      `${ASAAS_API_URL}/payments/${payment.id}/pixQrCode`,
      {
        headers: { access_token: ASAAS_API_KEY, [UA]: UA_VALUE },
      },
    )
    if (pixRes.ok) {
      const pixData = await pixRes.json()
      pixQrCode = pixData.encodedImage || pixData.payload
      pixCopiaECola = pixData.payload
    }
  }

  return {
    ...payment,
    pixQrCode,
    pixCopiaECola,
  }
}

interface StaticPixQrCode {
  id: string
  payload: string
  encodedImage?: string
  expirationDate?: string
}

export async function createStaticPixQrCode(params: {
  value: number
  description: string
}): Promise<StaticPixQrCode> {
  if (!ASAAS_API_KEY) {
    throw new Error('ASAAS_API_KEY environment variable not set')
  }

  const pixKey = process.env.ASAAS_PIX_KEY
  if (!pixKey) {
    throw new Error('ASAAS_PIX_KEY environment variable not set')
  }

  const res = await fetch(`${ASAAS_API_URL}/pix/qrCodes/static`, {
    method: 'POST',
    headers: {
      access_token: ASAAS_API_KEY,
      'Content-Type': 'application/json',
      [UA]: UA_VALUE,
    },
    body: JSON.stringify({
      addressKey: pixKey,
      description: params.description,
      value: params.value,
      format: 'ALL',
    }),
  })

  if (!res.ok) {
    const err = await res.json()
    throw new Error(`Asaas static PIX failed: ${err.errors?.[0]?.description || res.statusText}`)
  }

  return res.json()
}

export async function getPayment(paymentId: string): Promise<AsaasPayment> {
  if (!ASAAS_API_KEY) {
    throw new Error('ASAAS_API_KEY environment variable not set')
  }

  const res = await fetch(`${ASAAS_API_URL}/payments/${paymentId}`, {
    headers: { access_token: ASAAS_API_KEY, [UA]: UA_VALUE },
  })

  if (!res.ok) {
    throw new Error(`Asaas get payment failed: ${res.statusText}`)
  }

  return res.json()
}
