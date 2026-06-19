export type WebsiteOrderStatus =
  | 'collecting'
  | 'generating'
  | 'awaiting_approval'
  | 'regenerating'
  | 'awaiting_payment'
  | 'deploying'
  | 'deployed'
  | 'cancelled'
  | 'failed'

export type WebsiteTemplateType =
  | 'sales_page'
  | 'institutional'
  | 'portfolio'
  | 'capture'
  | 'event'

export interface WebsiteSpecifications {
  empresa_nome: string
  nicho: string
  descricao: string
  cores?: string
  referencia_url?: string
  produto_servico_valor?: string
  template_type: WebsiteTemplateType
  oberservacoes?: string
}

export interface WebsiteSection {
  name: string
  screenshot_url: string
}

export interface WebsiteOrder {
  id: string
  account_id: string
  contact_id: string
  conversation_id: string
  status: WebsiteOrderStatus
  template_type: WebsiteTemplateType
  specifications: WebsiteSpecifications
  feedback: string | null
  generation_count: number
  max_regenerations: number
  generated_code: string | null
  screenshots: WebsiteSection[] | null
  asaas_payment_id: string | null
  asaas_payment_value: number | null
  pix_qrcode: string | null
  pix_copiaecola: string | null
  repo_url: string | null
  deploy_url: string | null
  vercel_deployment_id: string | null
  created_at: string
  updated_at: string
}

export interface GenerateRequest {
  account_id: string
  contact_id: string
  conversation_id: string
  specifications: WebsiteSpecifications
}

export interface GenerateResponse {
  order_id: string
  screenshots: WebsiteSection[]
}

export interface ApproveRequest {
  order_id: string
  account_id: string
  payment_value: number
}

export interface RegenerateRequest {
  order_id: string
  account_id: string
  feedback: string
}

export interface AsaasWebhookBody {
  event: string
  payment?: {
    id: string
    value: number
    netValue: number
    status: string
    billingType: string
    customer: string
    pixQrCode?: string
    pixCopiaECola?: string
    pixQrCodeId?: string
    [key: string]: unknown
  }
  [key: string]: unknown
}
