import { callGemini } from './gemini';
import { callMimo, getMimoModel } from './mimo';

export type WebsiteGeneratorProvider = 'mimo' | 'gemini';

export interface WebsiteGenerationResult {
  html: string;
  provider: WebsiteGeneratorProvider;
  model: string;
}

function isConfigured(provider: WebsiteGeneratorProvider): boolean {
  return provider === 'mimo'
    ? Boolean(process.env.MIMO_API_KEY)
    : Boolean(process.env.GEMINI_API_KEY);
}

export function getProviderOrder(): WebsiteGeneratorProvider[] {
  const configured = process.env.SITE_GENERATOR_PROVIDER?.trim().toLowerCase();
  if (configured && configured !== 'mimo' && configured !== 'gemini') {
    throw new Error(
      'SITE_GENERATOR_PROVIDER must be either "mimo" or "gemini"'
    );
  }

  const primary: WebsiteGeneratorProvider =
    configured === 'gemini'
      ? 'gemini'
      : configured === 'mimo' || process.env.MIMO_API_KEY
        ? 'mimo'
        : 'gemini';
  const fallback: WebsiteGeneratorProvider =
    primary === 'mimo' ? 'gemini' : 'mimo';
  const providers = [primary, fallback].filter(isConfigured);

  if (providers.length === 0) {
    throw new Error('No website generator API key is configured');
  }
  return providers;
}

export async function callWebsiteProvider(
  provider: WebsiteGeneratorProvider,
  prompt: string,
  systemInstruction?: string
): Promise<WebsiteGenerationResult> {
  if (provider === 'mimo') {
    return {
      html: await callMimo(prompt, systemInstruction),
      provider,
      model: getMimoModel(),
    };
  }

  return {
    html: await callGemini(prompt, systemInstruction),
    provider,
    model: 'gemini-2.5-flash',
  };
}
