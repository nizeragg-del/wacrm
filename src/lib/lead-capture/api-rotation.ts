import { callGemini } from '@/lib/website-generator/gemini';

interface APIKey {
  provider: 'gemini' | 'mimo';
  key: string;
  name: string;
}

// Load API keys from environment variables
function getAPIKeys(): APIKey[] {
  const keys: APIKey[] = [];

  // Gemini keys (primary + backups)
  const geminiKeys = [
    process.env.GEMINI_API_KEY,
    process.env.GEMINI_API_KEY_2,
    process.env.GEMINI_API_KEY_3,
    process.env.GEMINI_API_KEY_4,
  ].filter(Boolean);

  geminiKeys.forEach((key, index) => {
    keys.push({
      provider: 'gemini',
      key: key!,
      name: `Gemini ${index === 0 ? 'Primary' : `Backup ${index}`}`,
    });
  });

  // Mimo keys
  const mimoKeys = [
    process.env.MIMO_API_KEY,
    process.env.MIMO_API_KEY_2,
    process.env.MIMO_API_KEY_3,
  ].filter(Boolean);

  mimoKeys.forEach((key, index) => {
    keys.push({
      provider: 'mimo',
      key: key!,
      name: `Mimo ${index === 0 ? 'Primary' : `Backup ${index}`}`,
    });
  });

  return keys;
}

// Track which keys are rate limited
const rateLimitedKeys = new Map<string, number>(); // key -> retryAfter timestamp

function isKeyAvailable(apiKey: APIKey): boolean {
  const retryAfter = rateLimitedKeys.get(apiKey.key);
  if (!retryAfter) return true;
  
  if (Date.now() > retryAfter) {
    rateLimitedKeys.delete(apiKey.key);
    return true;
  }
  
  return false;
}

function markKeyRateLimited(apiKey: APIKey, retryAfterMs: number = 60000): void {
  rateLimitedKeys.set(apiKey.key, Date.now() + retryAfterMs);
  console.warn(`[api-rotation] ${apiKey.name} rate limited, retry after ${retryAfterMs}ms`);
}

export async function callWithRotation(
  prompt: string,
  systemInstruction?: string
): Promise<string> {
  const API_KEYS = getAPIKeys();
  const availableKeys = API_KEYS.filter(isKeyAvailable);
  
  if (availableKeys.length === 0) {
    // All keys are rate limited, wait for the earliest one
    const earliestRetry = Math.min(...Array.from(rateLimitedKeys.values()));
    const waitTime = earliestRetry - Date.now() + 1000;
    console.warn(`[api-rotation] All keys rate limited, waiting ${waitTime}ms`);
    await new Promise((resolve) => setTimeout(resolve, waitTime));
    
    // Try again with all keys
    rateLimitedKeys.clear();
    return callWithRotation(prompt, systemInstruction);
  }

  let lastError: Error | null = null;

  for (const apiKey of availableKeys) {
    try {
      console.log(`[api-rotation] Trying ${apiKey.name}`);
      
      let result: string;
      
      if (apiKey.provider === 'gemini') {
        // Temporarily set the Gemini key
        const originalKey = process.env.GEMINI_API_KEY;
        process.env.GEMINI_API_KEY = apiKey.key;
        
        try {
          result = await callGemini(prompt, systemInstruction);
        } finally {
          // Restore original key
          if (originalKey) {
            process.env.GEMINI_API_KEY = originalKey;
          }
        }
      } else {
        // Mimo
        result = await callMimoWithKey(apiKey.key, prompt, systemInstruction);
      }
      
      console.log(`[api-rotation] Success with ${apiKey.name}`);
      return result;
      
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      // Check if it's a rate limit error
      if (lastError.message.includes('429') || 
          lastError.message.includes('quota') ||
          lastError.message.includes('rate')) {
        
        // Parse retry time from error if available
        const retryMatch = lastError.message.match(/retry in (\d+(?:\.\d+)?)/i);
        const retryMs = retryMatch ? parseFloat(retryMatch[1]) * 1000 : 60000;
        
        markKeyRateLimited(apiKey, retryMs);
        continue;
      }
      
      // Non-rate-limit error, throw immediately
      throw error;
    }
  }

  throw lastError || new Error('All API keys failed');
}

async function callMimoWithKey(
  apiKey: string,
  prompt: string,
  systemInstruction?: string
): Promise<string> {
  const baseUrl = (process.env.MIMO_BASE_URL || 'https://api.xiaomimimo.com/v1').replace(/\/$/, '');
  const model = process.env.MIMO_MODEL || 'mimo-v2.5-pro';

  const messages = [
    ...(systemInstruction
      ? [{ role: 'system' as const, content: systemInstruction }]
      : []),
    { role: 'user' as const, content: prompt },
  ];

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 180000);

  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'api-key': apiKey },
      body: JSON.stringify({
        model,
        messages,
        max_completion_tokens: 32768,
        temperature: 0.7,
        top_p: 0.95,
        stream: false,
      }),
      signal: controller.signal,
    });

    clearTimeout(timer);

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(`Mimo API error (${response.status}): ${data.error?.message || response.statusText}`);
    }

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content;
    if (!text) throw new Error('Mimo returned empty response');
    
    return text.replace(/^```(?:html)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();
    
  } finally {
    clearTimeout(timer);
  }
}

export function getAvailableKeysCount(): number {
  return getAPIKeys().filter(isKeyAvailable).length;
}

export function resetAllKeys(): void {
  rateLimitedKeys.clear();
}
