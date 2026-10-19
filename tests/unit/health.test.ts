import { describe, expect, it } from 'vitest';
import { createApp } from '../../src/server/app.ts';

describe('GET /api/health', () => {
  it('returns ok', async () => {
    const app = createApp({ now: () => 1000 });
    const res = await app.request('/api/health');
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true });
  });
});
