import crypto from 'crypto'
import { NextResponse } from 'next/server'
import { getCurrentAccount } from '@/lib/auth/account'
import { hasMinRole } from '@/lib/auth/roles'

const PREVIEW_TOKEN_TTL_SECONDS = 60 * 60 * 24 * 7

function getSigningSecret(): string {
  return (
    process.env.WEBSITE_PREVIEW_SECRET ||
    process.env.ENCRYPTION_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    ''
  )
}

function timingSafeEqual(a: string, b: string): boolean {
  const aa = Buffer.from(a)
  const bb = Buffer.from(b)
  return aa.length === bb.length && crypto.timingSafeEqual(aa, bb)
}

function signPreviewPayload(orderId: string, expiresAt: number): string {
  const secret = getSigningSecret()
  if (!secret) throw new Error('WEBSITE_PREVIEW_SECRET is not configured')
  return crypto
    .createHmac('sha256', secret)
    .update(`${orderId}.${expiresAt}`)
    .digest('base64url')
}

export function createPreviewToken(
  orderId: string,
  ttlSeconds = PREVIEW_TOKEN_TTL_SECONDS,
): string {
  const expiresAt = Math.floor(Date.now() / 1000) + ttlSeconds
  const sig = signPreviewPayload(orderId, expiresAt)
  return `${expiresAt}.${sig}`
}

export function verifyPreviewToken(orderId: string, token: string | null): boolean {
  if (!token) return false
  const [expiresRaw, signature] = token.split('.')
  const expiresAt = Number(expiresRaw)
  if (!Number.isFinite(expiresAt) || !signature) return false
  if (expiresAt < Math.floor(Date.now() / 1000)) return false

  try {
    return timingSafeEqual(signature, signPreviewPayload(orderId, expiresAt))
  } catch {
    return false
  }
}

export function buildPreviewUrl(orderId: string): string {
  const baseUrl =
    process.env.NEXT_PUBLIC_PREVIEW_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    'http://localhost:3000'
  const token = createPreviewToken(orderId)
  return `${baseUrl.replace(/\/$/, '')}/api/website/preview/${orderId}?token=${token}`
}

export function sanitizeGeneratedHtml(html: string): string {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/\son[a-z]+\s*=\s*(['"]).*?\1/gi, '')
    .replace(/\son[a-z]+\s*=\s*[^\s>]+/gi, '')
    .replace(/javascript:/gi, '')
    .replace(/<iframe\b[^>]*>[\s\S]*?<\/iframe>/gi, '')
    .replace(/<object\b[^>]*>[\s\S]*?<\/object>/gi, '')
    .replace(/<embed\b[^>]*>/gi, '')
}

export function previewSecurityHeaders(): HeadersInit {
  return {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store, max-age=0',
    'Content-Security-Policy': [
      "default-src 'none'",
      "img-src https: data: blob:",
      "style-src 'unsafe-inline' https:",
      "font-src https: data:",
      "connect-src 'none'",
      "script-src 'none'",
      "form-action 'none'",
      "base-uri 'none'",
      "frame-ancestors 'none'",
    ].join('; '),
    'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff',
  }
}

export async function authorizePaymentTestRequest(
  request: Request,
  accountId?: string,
): Promise<{ ok: true } | { ok: false; response: NextResponse }> {
  const configuredSecret =
    process.env.PAYMENT_TEST_SECRET || process.env.DEBUG_API_SECRET || ''
  const suppliedSecret =
    request.headers.get('x-payment-test-secret') ||
    new URL(request.url).searchParams.get('secret') ||
    ''

  if (
    configuredSecret &&
    suppliedSecret &&
    timingSafeEqual(suppliedSecret, configuredSecret)
  ) {
    return { ok: true }
  }

  try {
    const ctx = await getCurrentAccount()
    if (accountId && ctx.accountId !== accountId) {
      return {
        ok: false,
        response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
      }
    }
    if (!hasMinRole(ctx.role, 'admin')) {
      return {
        ok: false,
        response: NextResponse.json({ error: 'Admin role required' }, { status: 403 }),
      }
    }
    return { ok: true }
  } catch {
    const requiresSecret = process.env.NODE_ENV === 'production' || configuredSecret
    if (!requiresSecret) return { ok: true }
    return {
      ok: false,
      response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    }
  }
}
