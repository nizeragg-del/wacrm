const GEMINI_API_KEY = process.env.GEMINI_API_KEY || ''
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent'

export interface GeminiMessage {
  role: 'user' | 'model'
  parts: { text: string }[]
}

export interface GeminiRequest {
  contents: GeminiMessage[]
  systemInstruction?: { parts: { text: string }[] }
  generationConfig?: {
    temperature?: number
    maxOutputTokens?: number
    topP?: number
  }
}

export interface GeminiResponse {
  candidates?: {
    content?: {
      parts?: { text?: string }[]
    }
    finishReason?: string
  }[]
  error?: {
    message: string
    code?: number
  }
}

const GEMINI_TIMEOUT_MS = 180_000

const MAX_RETRIES = 3

async function singleGeminiCall(
  prompt: string,
  systemInstruction?: string,
): Promise<string> {
  const body: GeminiRequest = {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 32768,
      topP: 0.95,
    },
  }

  if (systemInstruction) {
    body.systemInstruction = { parts: [{ text: systemInstruction }] }
  }

  const url = `${GEMINI_API_URL}?key=${GEMINI_API_KEY}`

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS)

  let res: Response
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
  } catch (err) {
    clearTimeout(timer)
    if ((err as Error)?.name === 'AbortError') {
      throw new Error('Gemini API timed out')
    }
    throw err
  }
  clearTimeout(timer)

  const data: GeminiResponse = await res.json()

  const finishReason = data.candidates?.[0]?.finishReason
  if (finishReason && finishReason !== 'STOP') {
    console.warn(`[gemini] finishReason=${finishReason}`, data.candidates?.[0])
  }

  if (res.status === 503) {
    throw new Error(`Gemini API error (503): ${data.error?.message || 'Service temporarily unavailable'}`)
  }

  if (!res.ok || data.error) {
    throw new Error(
      `Gemini API error (${res.status}): ${data.error?.message || 'Unknown error'}`,
    )
  }

  let text = data.candidates?.[0]?.content?.parts?.[0]?.text
  if (!text) {
    throw new Error('Gemini returned empty response')
  }

  text = text.replace(/^```(?:html)?\s*\n?/i, '').replace(/\n?```\s*$/i, '')

  return text
}

export async function callGemini(
  prompt: string,
  systemInstruction?: string,
): Promise<string> {
  if (!GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY environment variable not set')
  }

  let lastError: Error | null = null

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await singleGeminiCall(prompt, systemInstruction)
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err))

      if (!lastError.message.startsWith('Gemini API error (503)') && !lastError.message.startsWith('Gemini API timed out')) {
        throw lastError
      }

      if (attempt < MAX_RETRIES) {
        const delay = attempt * 20_000
        console.warn(`[gemini] ${lastError.message}, retrying in ${delay / 1000}s (attempt ${attempt}/${MAX_RETRIES})...`)
        await new Promise(resolve => setTimeout(resolve, delay))
      }
    }
  }

  throw lastError!
}
