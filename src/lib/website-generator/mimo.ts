const DEFAULT_MIMO_BASE_URL = 'https://api.xiaomimimo.com/v1';
const DEFAULT_MIMO_MODEL = 'mimo-v2.5-pro';
const MIMO_TIMEOUT_MS = 180_000;
const MAX_RETRIES = 3;

interface MimoResponse {
  choices?: Array<{
    message?: { content?: string };
    finish_reason?: string | null;
  }>;
  error?: { message?: string; code?: string | number };
}

function stripCodeFence(text: string): string {
  return text
    .replace(/^```(?:html)?\s*\n?/i, '')
    .replace(/\n?```\s*$/i, '')
    .trim();
}

function retryDelay(attempt: number, retryAfter: string | null): number {
  const retryAfterSeconds = Number(retryAfter);
  if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0) {
    return Math.min(retryAfterSeconds * 1_000, 30_000);
  }
  return attempt * 2_000;
}

function isRetryableStatus(status: number): boolean {
  return status === 429 || status === 408 || status >= 500;
}

async function singleMimoCall(
  prompt: string,
  systemInstruction?: string
): Promise<string> {
  const apiKey = process.env.MIMO_API_KEY || '';
  if (!apiKey) throw new Error('MIMO_API_KEY environment variable not set');

  const baseUrl = (process.env.MIMO_BASE_URL || DEFAULT_MIMO_BASE_URL).replace(
    /\/$/,
    ''
  );
  const model = process.env.MIMO_MODEL || DEFAULT_MIMO_MODEL;
  const messages = [
    ...(systemInstruction
      ? [{ role: 'system' as const, content: systemInstruction }]
      : []),
    { role: 'user' as const, content: prompt },
  ];

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), MIMO_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'api-key': apiKey },
      body: JSON.stringify({
        model,
        messages,
        max_completion_tokens: 32_768,
        temperature: 0.7,
        top_p: 0.95,
        stream: false,
      }),
      signal: controller.signal,
    });
  } catch (error) {
    if ((error as Error)?.name === 'AbortError') {
      throw new Error('MiMo API timed out');
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }

  let data: MimoResponse;
  try {
    data = (await response.json()) as MimoResponse;
  } catch {
    throw new Error(
      `MiMo API error (${response.status}): Invalid JSON response`
    );
  }

  if (!response.ok || data.error) {
    const error = new Error(
      `MiMo API error (${response.status}): ${data.error?.message || response.statusText || 'Unknown error'}`
    ) as Error & { retryable?: boolean; retryAfter?: string | null };
    error.retryable = isRetryableStatus(response.status);
    error.retryAfter = response.headers.get('retry-after');
    throw error;
  }

  const choice = data.choices?.[0];
  if (choice?.finish_reason && choice.finish_reason !== 'stop') {
    console.warn(`[mimo] finish_reason=${choice.finish_reason}`);
  }

  const text = choice?.message?.content;
  if (!text) throw new Error('MiMo returned empty response');
  return stripCodeFence(text);
}

export async function callMimo(
  prompt: string,
  systemInstruction?: string
): Promise<string> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await singleMimoCall(prompt, systemInstruction);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      const details = lastError as Error & {
        retryable?: boolean;
        retryAfter?: string | null;
      };
      const retryable =
        details.retryable === true ||
        lastError.message === 'MiMo API timed out';

      if (!retryable || attempt === MAX_RETRIES) throw lastError;

      const delay = retryDelay(attempt, details.retryAfter || null);
      console.warn(
        `[mimo] ${lastError.message}, retrying in ${delay / 1_000}s (attempt ${attempt}/${MAX_RETRIES})`
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError || new Error('MiMo API call failed');
}

export function getMimoModel(): string {
  return process.env.MIMO_MODEL || DEFAULT_MIMO_MODEL;
}
