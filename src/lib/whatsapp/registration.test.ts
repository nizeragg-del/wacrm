import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getSubscribedApps,
  registerPhoneNumber,
  subscribeWabaToApp,
} from './meta-api';

function okResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

function errorResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('registerPhoneNumber - Evolution API', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    fetchMock = vi.fn().mockResolvedValue(okResponse({ success: true }));
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('configures the Evolution webhook for the instance', async () => {
    const result = await registerPhoneNumber({
      phoneNumberId: 'PNID_123',
      accessToken: 'tok',
      pin: '123456',
    });
    expect(result).toEqual({ success: true, alreadyRegistered: false });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain('/webhook/set/PNID_123');
    expect(init.method).toBe('POST');
    expect(init.headers.apikey).toBe('tok');
    expect(JSON.parse(init.body)).toMatchObject({
      webhook: {
        enabled: true,
        byEvents: false,
        base64: false,
        events: expect.arrayContaining(['MESSAGES_UPSERT', 'MESSAGES_UPDATE']),
      },
    });
  });

  it('throws when Evolution rejects webhook configuration', async () => {
    fetchMock.mockResolvedValueOnce(
      errorResponse(500, { error: { message: 'Evolution error' } }),
    );
    await expect(
      registerPhoneNumber({
        phoneNumberId: 'P',
        accessToken: 't',
        pin: '123456',
      }),
    ).rejects.toThrow(/Failed to configure webhook/);
  });
});

describe('subscribeWabaToApp - Evolution API', () => {
  it('is a no-op because Evolution does not use WABA subscriptions here', async () => {
    await expect(
      subscribeWabaToApp({ wabaId: 'WABA_1', accessToken: 'tok' }),
    ).resolves.toBeUndefined();
  });
});

describe('getSubscribedApps - Evolution API', () => {
  it('returns a synthetic Evolution API app marker', async () => {
    const apps = await getSubscribedApps({
      wabaId: 'WABA_1',
      accessToken: 'tok',
    });
    expect(apps).toEqual([
      {
        whatsapp_business_api_data: {
          id: 'evolution-api',
          name: 'Evolution API',
        },
      },
    ]);
  });
});
