import { describe, expect, it } from 'vitest';
import { createApp } from '../../src/server/app.ts';
import { openDb } from '../../src/server/db/client.ts';
import { migrate } from '../../src/server/db/migrate.ts';

describe('GET /api/health', () => {
  it('returns ok', async () => {
    const db = openDb(':memory:');
    migrate(db);
    const app = createApp({ db, now: () => 1000 });
    const res = await app.request('/api/health');
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true });
  });
});
