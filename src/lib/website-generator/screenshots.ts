import type { WebsiteSection } from './types'

const SCREENSHOT_API_URL = process.env.SCREENSHOT_API_URL || ''
const SCREENSHOT_API_KEY = process.env.SCREENSHOT_API_KEY || ''
const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'

function absUrl(path: string): string {
  if (path.startsWith('http://') || path.startsWith('https://')) return path
  return `${BASE_URL}${path.startsWith('/') ? '' : '/'}${path}`
}

export async function captureScreenshots(
  html: string,
  sectionNames: string[],
): Promise<WebsiteSection[]> {
  if (SCREENSHOT_API_URL && SCREENSHOT_API_KEY) {
    return captureViaApi(html, sectionNames)
  }

  return generateMockScreenshots(sectionNames)
}

async function captureViaApi(
  html: string,
  sectionNames: string[],
): Promise<WebsiteSection[]> {
  const results: WebsiteSection[] = []

  for (const name of sectionNames) {
    try {
      const res = await fetch(SCREENSHOT_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${SCREENSHOT_API_KEY}`,
        },
        body: JSON.stringify({
          html,
          selector: `#section-${name.toLowerCase().replace(/\s+/g, '-')}`,
          full_page: true,
          viewport: { width: 1280, height: 800 },
        }),
      })

      if (!res.ok) {
        console.warn(`[screenshots] API error for section "${name}": ${res.status}`)
        results.push({
          name,
          screenshot_url: absUrl(`/api/website/placeholder?section=${encodeURIComponent(name)}`),
        })
        continue
      }

      const data = await res.json()
      const raw = data.url || data.screenshot_url
      results.push({ name, screenshot_url: absUrl(raw) })
    } catch (err) {
      console.error(`[screenshots] failed to capture "${name}":`, err)
      results.push({
        name,
        screenshot_url: absUrl(`/api/website/placeholder?section=${encodeURIComponent(name)}`),
      })
    }
  }

  return results
}

function generateMockScreenshots(sectionNames: string[]): WebsiteSection[] {
  return sectionNames.map((name) => ({
    name,
    screenshot_url: absUrl(`/api/website/placeholder?section=${encodeURIComponent(name)}`),
  }))
}
