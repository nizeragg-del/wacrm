import { createClient } from '@supabase/supabase-js'
import type { MessageTemplate } from '@/types'
import {
  buildSendComponents,
  type SendTimeParams,
} from './template-send-builder'

const EVOLUTION_API_URL = process.env.EVOLUTION_API_URL || 'http://localhost:8080'

function getEvolutionApiKey(): string {
  const apiKey = process.env.EVOLUTION_API_KEY || ''
  if (!apiKey) throw new Error('EVOLUTION_API_KEY environment variable not set')
  return apiKey
}

export interface MetaSendResult {
  messageId: string
}

export interface MetaPhoneInfo {
  id: string
  display_phone_number: string
  verified_name?: string
  quality_rating?: string
}

interface MetaErrorResponse {
  error?: { message?: string; code?: number; type?: string }
}

let _adminClient: any = null
function getSupabaseAdmin() {
  if (!_adminClient) {
    _adminClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
  }
  return _adminClient
}

function getHeaders(accessToken?: string) {
  return {
    'Content-Type': 'application/json',
    'apikey': accessToken || getEvolutionApiKey(),
    'ngrok-skip-browser-warning': 'true',
  }
}

// ============================================================
// Phone number / account
// ============================================================

export interface VerifyPhoneNumberArgs {
  phoneNumberId: string
  accessToken: string
}

export async function verifyPhoneNumber(
  args: VerifyPhoneNumberArgs
): Promise<MetaPhoneInfo> {
  const { phoneNumberId, accessToken } = args
  const headers = getHeaders(accessToken)

  try {
    const fetchUrl = `${EVOLUTION_API_URL}/instance/fetchInstances?instanceName=${phoneNumberId}`
    const response = await fetch(fetchUrl, { headers })
    if (response.ok) {
      const data = await response.json()
      const instance = Array.isArray(data) ? data[0] : data
      if (instance && instance.name === phoneNumberId) {
        return {
          id: phoneNumberId,
          display_phone_number: instance.number || phoneNumberId,
          verified_name: phoneNumberId,
          quality_rating: 'GREEN'
        }
      }
    }
  } catch (err) {
    console.error('Error fetching instance:', err)
  }

  // Create instance if not exists
  const createUrl = `${EVOLUTION_API_URL}/instance/create`
  const createRes = await fetch(createUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': getEvolutionApiKey(), // creation needs global api key
    },
    body: JSON.stringify({
      instanceName: phoneNumberId,
      token: accessToken || undefined,
      qrcode: true,
      integration: 'WHATSAPP-BAILEYS'
    })
  })

  if (!createRes.ok) {
    const errText = await createRes.text()
    throw new Error(`Failed to create Evolution instance: ${errText || createRes.statusText}`)
  }

  return {
    id: phoneNumberId,
    display_phone_number: phoneNumberId,
    verified_name: phoneNumberId,
    quality_rating: 'GREEN'
  }
}

// ============================================================
// Webhook Registration
// ============================================================

export interface RegisterPhoneNumberArgs {
  phoneNumberId: string
  accessToken: string
  pin: string
}

export interface RegisterPhoneNumberResult {
  success: boolean
  alreadyRegistered: boolean
}

export async function registerPhoneNumber(
  args: RegisterPhoneNumberArgs
): Promise<RegisterPhoneNumberResult> {
  const { phoneNumberId, accessToken } = args
  
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'
  const webhookUrl = `${siteUrl}/api/whatsapp/webhook?token=${encodeURIComponent(accessToken)}`
  
  const url = `${EVOLUTION_API_URL}/webhook/set/${phoneNumberId}`
  const response = await fetch(url, {
    method: 'POST',
    headers: getHeaders(accessToken),
    body: JSON.stringify({
      webhook: {
        enabled: true,
        url: webhookUrl,
        byEvents: false,
        base64: false,
        events: [
          'QRCODE_UPDATED',
          'MESSAGES_UPSERT',
          'MESSAGES_UPDATE',
          'MESSAGES_DELETE',
          'CONNECTION_UPDATE'
        ]
      }
    })
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Failed to configure webhook: ${errorText || response.statusText}`)
  }

  return { success: true, alreadyRegistered: false }
}

export interface SubscribeWabaToAppArgs {
  wabaId: string
  accessToken: string
}

export async function subscribeWabaToApp(
  args: SubscribeWabaToAppArgs
): Promise<void> {
  // No-op for Evolution API
}

export interface GetSubscribedAppsArgs {
  wabaId: string
  accessToken: string
}

export interface SubscribedApp {
  whatsapp_business_api_data?: {
    id?: string
    name?: string
    link?: string
  }
}

export async function getSubscribedApps(
  args: GetSubscribedAppsArgs
): Promise<SubscribedApp[]> {
  return [
    {
      whatsapp_business_api_data: {
        id: 'evolution-api',
        name: 'Evolution API',
      }
    }
  ]
}

// ============================================================
// Sending
// ============================================================

export interface SendTextMessageArgs {
  phoneNumberId: string
  accessToken: string
  to: string
  text: string
  contextMessageId?: string
}

export async function sendTextMessage(
  args: SendTextMessageArgs
): Promise<MetaSendResult> {
  const { phoneNumberId, accessToken, to, text, contextMessageId } = args
  const url = `${EVOLUTION_API_URL}/message/sendText/${phoneNumberId}`
  
  // Use full JID format to bypass Evolution API's WhatsApp number-existence
  // check — bare digits trigger an "exists: false" validation that can fail
  // even for contacts who just sent you a message.
  const digits = to.replace(/\D/g, '')
  const jid = `${digits}@s.whatsapp.net`

  const body: Record<string, any> = {
    number: jid,
    text,
  }

  if (contextMessageId) {
    body.options = {
      quoted: {
        key: {
          remoteJid: jid,
          fromMe: false,
          id: contextMessageId
        },
        message: {
          conversation: ''
        }
      }
    }
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: getHeaders(accessToken),
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    const errText = await response.text()
    throw new Error(`Evolution API sendText error: ${errText || response.statusText}`)
  }

  const data = await response.json()
  const messageId = data?.key?.id || data?.messageId || `evo-${Date.now()}`
  return { messageId }
}

export type MediaKind = 'image' | 'video' | 'document'

export interface SendMediaMessageArgs {
  phoneNumberId: string
  accessToken: string
  to: string
  kind: MediaKind
  link: string
  caption?: string
  filename?: string
  contextMessageId?: string
}

export async function sendMediaMessage(
  args: SendMediaMessageArgs,
): Promise<MetaSendResult> {
  const { phoneNumberId, accessToken, to, kind, link, caption, filename, contextMessageId } = args
  if (!link) throw new Error('sendMediaMessage requires a link.')
  const url = `${EVOLUTION_API_URL}/message/sendMedia/${phoneNumberId}`

  let mimetype = 'application/octet-stream'
  if (kind === 'image') mimetype = 'image/jpeg'
  else if (kind === 'video') mimetype = 'video/mp4'
  else if (kind === 'document') mimetype = 'application/pdf'

  // Use full JID format — same reason as sendTextMessage above.
  const digits = to.replace(/\D/g, '')
  const jid = `${digits}@s.whatsapp.net`

  const body: Record<string, any> = {
    number: jid,
    mediatype: kind,
    mimetype,
    media: link,
    caption: caption || '',
    fileName: filename || undefined
  }

  if (contextMessageId) {
    body.options = {
      quoted: {
        key: {
          remoteJid: jid,
          fromMe: false,
          id: contextMessageId
        },
        message: {
          conversation: ''
        }
      }
    }
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: getHeaders(accessToken),
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    const errText = await response.text()
    throw new Error(`Evolution API sendMedia error: ${errText || response.statusText}`)
  }

  const data = await response.json()
  const messageId = data?.key?.id || data?.messageId || `evo-${Date.now()}`
  return { messageId }
}

export interface SendTemplateMessageArgs {
  phoneNumberId: string
  accessToken: string
  to: string
  templateName: string
  language?: string
  params?: string[]
  template?: MessageTemplate
  messageParams?: SendTimeParams
  contextMessageId?: string
}

export async function sendTemplateMessage(
  args: SendTemplateMessageArgs
): Promise<MetaSendResult> {
  const { phoneNumberId, accessToken, to, templateName, params, template, messageParams, contextMessageId } = args

  // Render template locally to plain text/media
  const compiled = compileTemplateToText(template, templateName, params, messageParams)

  if (compiled.mediaUrl && compiled.mediaKind) {
    return sendMediaMessage({
      phoneNumberId,
      accessToken,
      to,
      kind: compiled.mediaKind,
      link: compiled.mediaUrl,
      caption: compiled.text,
      contextMessageId
    })
  } else {
    return sendTextMessage({
      phoneNumberId,
      accessToken,
      to,
      text: compiled.text,
      contextMessageId
    })
  }
}

function compileTemplateToText(
  template: MessageTemplate | undefined,
  templateName: string,
  params?: string[],
  messageParams?: SendTimeParams
): { text: string; mediaUrl?: string; mediaKind?: MediaKind } {
  let text = ''
  let mediaUrl: string | undefined
  let mediaKind: MediaKind | undefined

  if (template) {
    // 1. Header
    const headerType = template.header_type
    if (headerType === 'text' && template.header_content) {
      let headerText = template.header_content
      if (messageParams?.headerText) {
        headerText = headerText.replace(/\{\{1\}\}/g, messageParams.headerText)
      }
      text += `*${headerText}*\n\n`
    } else if (headerType && headerType !== 'text') {
      mediaUrl = messageParams?.headerMediaUrl ?? template.header_media_url ?? undefined
      mediaKind = headerType as MediaKind
    }

    // 2. Body
    let bodyText = template.body_text
    const bodyValues = messageParams?.body ?? params ?? []
    bodyValues.forEach((val, idx) => {
      bodyText = bodyText.replace(new RegExp(`\\{\\{${idx + 1}\\}\\}`, 'g'), val)
    })
    text += bodyText

    // 3. Footer
    if (template.footer_text) {
      text += `\n\n_${template.footer_text}_`
    }

    // 4. Buttons
    if (template.buttons && Array.isArray(template.buttons)) {
      template.buttons.forEach((btn, idx) => {
        if (btn.type === 'URL') {
          let url = btn.url
          const override = messageParams?.buttonParams?.[idx]
          if (override) {
            url = url.replace(/\{\{1\}\}/g, override)
          }
          text += `\n\n🔗 *${btn.text}*: ${url}`
        } else if (btn.type === 'COPY_CODE') {
          const code = messageParams?.buttonParams?.[idx]?.trim() || btn.example || ''
          text += `\n\n🎟️ *${btn.text}*: \`${code}\``
        } else if (btn.type === 'QUICK_REPLY') {
          text += `\n\n🔘 *${btn.text}* (responda com "${btn.text}")`
        }
      })
    }
  } else {
    text = templateName
    if (params && params.length > 0) {
      text += '\n' + params.join('\n')
    }
  }

  return { text, mediaUrl, mediaKind }
}

// ============================================================
// Template submission (Business Management API) - MOCKED for Local Use
// ============================================================

import type { MetaTemplateSubmitPayload } from './template-components'

export interface SubmitMessageTemplateArgs {
  wabaId: string
  accessToken: string
  payload: MetaTemplateSubmitPayload
}

export interface SubmitMessageTemplateResult {
  id: string
  status: string
  category?: string
}

export async function submitMessageTemplate(
  args: SubmitMessageTemplateArgs
): Promise<SubmitMessageTemplateResult> {
  return {
    id: `evo-tpl-${Date.now()}`,
    status: 'APPROVED',
    category: args.payload.category || 'UTILITY'
  }
}

export interface EditMessageTemplateArgs {
  metaTemplateId: string
  accessToken: string
  components: MetaTemplateSubmitPayload['components']
  category?: MetaTemplateSubmitPayload['category']
}

export interface EditMessageTemplateResult {
  success: boolean
}

export async function editMessageTemplate(
  args: EditMessageTemplateArgs
): Promise<EditMessageTemplateResult> {
  return { success: true }
}

export interface DeleteMessageTemplateArgs {
  wabaId: string
  accessToken: string
  name: string
  metaTemplateId?: string
}

export async function deleteMessageTemplate(
  args: DeleteMessageTemplateArgs
): Promise<void> {
  // No-op
}

// ============================================================
// Reactions
// ============================================================

export interface SendReactionMessageArgs {
  phoneNumberId: string
  accessToken: string
  to: string
  targetMessageId: string
  emoji: string
}

export async function sendReactionMessage(
  args: SendReactionMessageArgs
): Promise<MetaSendResult> {
  const { phoneNumberId, accessToken, to, targetMessageId, emoji } = args
  const url = `${EVOLUTION_API_URL}/message/sendReaction/${phoneNumberId}`

  if (!emoji) {
    throw new Error('Reactions in Evolution API require an emoji')
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: getHeaders(accessToken),
    body: JSON.stringify({
      remoteJid: `${to.replace(/\D/g, '')}@s.whatsapp.net`,
      reaction: {
        text: emoji,
        key: {
          remoteJid: `${to.replace(/\D/g, '')}@s.whatsapp.net`,
          fromMe: false,
          id: targetMessageId
        }
      }
    }),
  })

  if (!response.ok) {
    const errText = await response.text()
    throw new Error(`Evolution API sendReaction error: ${errText || response.statusText}`)
  }

  const data = await response.json()
  const messageId = data?.key?.id || data?.messageId || `evo-${Date.now()}`
  return { messageId }
}

// ============================================================
// Interactive (button replies + list messages)
// ============================================================

export const INTERACTIVE_LIMITS = {
  maxButtons: 3,
  buttonTitleMaxLength: 20,
  maxListSections: 10,
  maxListRowsTotal: 10,
  listRowTitleMaxLength: 24,
  listRowDescriptionMaxLength: 72,
  bodyMaxLength: 1024,
  footerMaxLength: 60,
  headerTextMaxLength: 60,
} as const

export interface InteractiveButton {
  id: string
  title: string
}

export interface SendInteractiveButtonsArgs {
  phoneNumberId: string
  accessToken: string
  to: string
  bodyText: string
  headerText?: string
  footerText?: string
  buttons: InteractiveButton[]
  contextMessageId?: string
}

export async function sendInteractiveButtons(
  args: SendInteractiveButtonsArgs
): Promise<MetaSendResult> {
  const { phoneNumberId, accessToken, to, bodyText, headerText, footerText, buttons, contextMessageId } = args

  const digits = to.replace(/\D/g, '')
  const jid = `${digits}@s.whatsapp.net`
  const url = `${EVOLUTION_API_URL}/message/sendButtons/${phoneNumberId}`

  const payload: Record<string, any> = {
    number: jid,
    title: headerText || bodyText.slice(0, INTERACTIVE_LIMITS.headerTextMaxLength),
    description: bodyText,
    footer: footerText || ' ',
    buttons: buttons.map((b) => ({
      title: b.title,
      displayText: b.title,
      id: b.id,
    })),
  }

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: getHeaders(accessToken),
      body: JSON.stringify(payload),
    })
    if (response.ok) {
      const data = await response.json()
      const messageId = data?.key?.id || data?.messageId || `evo-${Date.now()}`
      return { messageId }
    }
  } catch {
    // fall through to text fallback
  }

  // Fallback: send as rich text (WhatsApp Web / older Evolution API)
  let text = bodyText
  if (headerText) text = `*${headerText}*\n\n${text}`
  if (footerText) text = `${text}\n\n_${footerText}_`
  text += '\n'
  buttons.forEach((btn, i) => {
    text += `\n${i + 1}. ${btn.title}`
  })
  return sendTextMessage({ phoneNumberId, accessToken, to, text, contextMessageId })
}

export interface InteractiveListRow {
  id: string
  title: string
  description?: string
}

export interface InteractiveListSection {
  title?: string
  rows: InteractiveListRow[]
}

export interface SendInteractiveListArgs {
  phoneNumberId: string
  accessToken: string
  to: string
  bodyText: string
  buttonLabel: string
  headerText?: string
  footerText?: string
  sections: InteractiveListSection[]
  contextMessageId?: string
}

export async function sendInteractiveList(
  args: SendInteractiveListArgs
): Promise<MetaSendResult> {
  const { phoneNumberId, accessToken, to, bodyText, buttonLabel, headerText, footerText, sections, contextMessageId } = args

  const digits = to.replace(/\D/g, '')
  const jid = `${digits}@s.whatsapp.net`
  const url = `${EVOLUTION_API_URL}/message/sendList/${phoneNumberId}`

  const payload: Record<string, any> = {
    number: jid,
    title: headerText ?? '',
    description: bodyText,
    buttonText: buttonLabel,
    values: sections.map((s) => ({
      title: s.title ?? '',
      rows: s.rows.map((r) => ({
        title: r.title,
        description: r.description,
        rowId: r.id,
      })),
    })),
  }
  if (footerText) payload.footerText = footerText
  // Evolution API v2.3.7 requires footerText — always send it
  if (!payload.footerText) payload.footerText = ' '

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: getHeaders(accessToken),
      body: JSON.stringify(payload),
    })
    if (response.ok) {
      const data = await response.json()
      const messageId = data?.key?.id || data?.messageId || `evo-${Date.now()}`
      return { messageId }
    }
  } catch {
    // fall through to text fallback
  }

  // Fallback: send as rich text (WhatsApp Web / older Evolution API).
  // Include numbered options so the customer can reply with the number.
  let text = bodyText
  if (headerText) text = `*${headerText}*\n\n${text}`

  let rowNumber = 1
  for (const section of sections) {
    if (section.title) text += `\n\n*${section.title}*`
    for (const row of section.rows) {
      text += `\n${rowNumber}. ${row.title}`
      if (row.description) text += ` — ${row.description}`
      rowNumber++
    }
  }

  if (footerText) text += `\n\n_${footerText}_`
  return sendTextMessage({ phoneNumberId, accessToken, to, text, contextMessageId })
}

// ============================================================
// Media Proxy (Resolves via DB lookup and download)
// ============================================================

export interface GetMediaUrlArgs {
  mediaId: string
  accessToken: string
}

export async function getMediaUrl(
  args: GetMediaUrlArgs
): Promise<{ url: string; mimeType: string }> {
  return {
    url: `${EVOLUTION_API_URL}/download/${args.mediaId}`,
    mimeType: 'application/octet-stream'
  }
}

export interface DownloadMediaArgs {
  downloadUrl: string
  accessToken: string
}

export async function downloadMedia(
  args: DownloadMediaArgs
): Promise<{ buffer: Buffer; contentType: string }> {
  const { downloadUrl, accessToken } = args
  
  const urlParts = downloadUrl.split('/')
  const messageId = urlParts[urlParts.length - 1]
  
  if (!messageId) {
    throw new Error(`Invalid download URL: ${downloadUrl}`)
  }
  
  const supabase = getSupabaseAdmin()
  
  // Get message to find conversation
  const { data: message } = await supabase
    .from('messages')
    .select('conversation_id')
    .eq('message_id', messageId)
    .maybeSingle()
    
  if (!message) {
    throw new Error(`Message with ID ${messageId} not found.`)
  }
  
  // Get conversation to find contact and account
  const { data: conversation } = await supabase
    .from('conversations')
    .select('contact_id, account_id')
    .eq('id', message.conversation_id)
    .maybeSingle()
    
  if (!conversation) {
    throw new Error(`Conversation not found for message ${messageId}.`)
  }
  
  // Get contact phone and config instanceName
  const [contactRes, configRes] = await Promise.all([
    supabase.from('contacts').select('phone').eq('id', conversation.contact_id).maybeSingle(),
    supabase.from('whatsapp_config').select('phone_number_id').eq('account_id', conversation.account_id).maybeSingle()
  ])
  
  const phone = contactRes.data?.phone
  const instanceName = configRes.data?.phone_number_id
  
  if (!phone || !instanceName) {
    throw new Error(`Could not resolve phone or instanceName for message ${messageId}.`)
  }
  
  const headers = getHeaders(accessToken)
  const downloadApiUrl = `${EVOLUTION_API_URL}/message/downloadMedia/${instanceName}`
  
  const response = await fetch(downloadApiUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      messageKeys: {
        id: messageId,
        fromMe: false,
        remoteJid: `${phone.replace(/\D/g, '')}@s.whatsapp.net`
      }
    })
  })
  
  if (!response.ok) {
    throw new Error(`Evolution API downloadMedia failed: ${response.statusText}`)
  }
  
  const data = await response.json()
  const base64Data = data?.base64 || (typeof data === 'string' ? data : null)
  if (!base64Data) {
    throw new Error(`No media data returned from Evolution API.`)
  }
  
  const buffer = Buffer.from(base64Data, 'base64')
  const contentType = data?.mimetype || 'application/octet-stream'
  return { buffer, contentType }
}
