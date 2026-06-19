import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const section = searchParams.get('section') || 'Seção do Site'
  const rawColor = searchParams.get('color') || '#6366f1'
  const color = /^#[0-9a-fA-F]{3,8}$/.test(rawColor) ? rawColor : '#6366f1'

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="400" viewBox="0 0 800 400">
  <rect width="800" height="400" fill="#f8fafc"/>
  <rect x="50" y="50" width="700" height="300" rx="16" fill="${color}" opacity="0.1"/>
  <text x="400" y="180" text-anchor="middle" font-family="Inter, system-ui, sans-serif" font-size="28" font-weight="600" fill="#1e293b">${escapeXml(section)}</text>
  <text x="400" y="220" text-anchor="middle" font-family="Inter, system-ui, sans-serif" font-size="16" fill="#64748b">Visualize o site completo apos a aprovacao</text>
  <rect x="300" y="260" width="200" height="44" rx="22" fill="${color}"/>
  <text x="400" y="287" text-anchor="middle" font-family="Inter, system-ui, sans-serif" font-size="14" font-weight="600" fill="#ffffff">Preview</text>
</svg>`

  return new NextResponse(svg, {
    headers: {
      'Content-Type': 'image/svg+xml',
      'Cache-Control': 'public, max-age=3600',
    },
  })
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}
