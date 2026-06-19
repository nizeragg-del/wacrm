import { afterEach, describe, expect, it, vi } from 'vitest';
import { callMimo } from './mimo';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('callMimo', () => {
  it('calls the compatible endpoint and returns clean HTML', async () => {
    vi.stubEnv('MIMO_API_KEY', 'test-key');
    vi.stubEnv('MIMO_BASE_URL', 'https://mimo.example/v1/');
    vi.stubEnv('MIMO_MODEL', 'mimo-v2.5-pro');
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [
            {
              message: { content: '```html\n<html>site</html>\n```' },
              finish_reason: 'stop',
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(callMimo('prompt', 'system')).resolves.toBe(
      '<html>site</html>'
    );
    expect(fetchMock).toHaveBeenCalledOnce();

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://mimo.example/v1/chat/completions');
    expect(init.headers).toMatchObject({ 'api-key': 'test-key' });
    const body = JSON.parse(String(init.body));
    expect(body.model).toBe('mimo-v2.5-pro');
    expect(body.messages).toEqual([
      { role: 'system', content: 'system' },
      { role: 'user', content: 'prompt' },
    ]);
  });

  it('does not expose the key in API errors', async () => {
    vi.stubEnv('MIMO_API_KEY', 'secret-test-key');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: { message: 'Unauthorized' } }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        })
      )
    );

    await expect(callMimo('prompt')).rejects.toThrow(
      'MiMo API error (401): Unauthorized'
    );

    try {
      await callMimo('prompt');
    } catch (error) {
      expect((error as Error).message).not.toContain('secret-test-key');
    }
  });
});
