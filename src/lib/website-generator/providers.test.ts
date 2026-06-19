import { afterEach, describe, expect, it, vi } from 'vitest';
import { getProviderOrder } from './providers';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('getProviderOrder', () => {
  it('prefers MiMo and keeps Gemini as fallback', () => {
    vi.stubEnv('MIMO_API_KEY', 'mimo-key');
    vi.stubEnv('GEMINI_API_KEY', 'gemini-key');
    vi.stubEnv('SITE_GENERATOR_PROVIDER', '');
    expect(getProviderOrder()).toEqual(['mimo', 'gemini']);
  });

  it('honors an explicit Gemini primary', () => {
    vi.stubEnv('MIMO_API_KEY', 'mimo-key');
    vi.stubEnv('GEMINI_API_KEY', 'gemini-key');
    vi.stubEnv('SITE_GENERATOR_PROVIDER', 'gemini');
    expect(getProviderOrder()).toEqual(['gemini', 'mimo']);
  });

  it('uses the only configured provider', () => {
    vi.stubEnv('MIMO_API_KEY', '');
    vi.stubEnv('GEMINI_API_KEY', 'gemini-key');
    vi.stubEnv('SITE_GENERATOR_PROVIDER', '');
    expect(getProviderOrder()).toEqual(['gemini']);
  });
});
