import { describe, expect, it, vi } from 'vitest';
import {
  deleteMessageTemplate,
  editMessageTemplate,
  submitMessageTemplate,
} from './meta-api';

describe('template lifecycle - Evolution API compatibility', () => {
  it('creates a synthetic approved template row without calling Meta', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const result = await submitMessageTemplate({
      wabaId: 'WABA1',
      accessToken: 'tok',
      payload: {
        name: 't',
        category: 'UTILITY',
        language: 'en_US',
        components: [{ type: 'BODY', text: 'hi' }],
      },
    });

    expect(result.id).toMatch(/^evo-tpl-/);
    expect(result.status).toBe('APPROVED');
    expect(result.category).toBe('UTILITY');
    expect(fetchMock).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('edits templates as a local no-op for Evolution', async () => {
    await expect(
      editMessageTemplate({
        metaTemplateId: 'T',
        accessToken: 't',
        components: [],
      }),
    ).resolves.toEqual({ success: true });
  });

  it('deletes templates as a local no-op for Evolution', async () => {
    await expect(
      deleteMessageTemplate({
        wabaId: 'W',
        accessToken: 't',
        name: 'order_confirmation',
        metaTemplateId: '12345',
      }),
    ).resolves.toBeUndefined();
  });
});
