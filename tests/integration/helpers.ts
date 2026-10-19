import { createApp } from '../../src/server/app.ts';
import { openDb } from '../../src/server/db/client.ts';
import { migrate } from '../../src/server/db/migrate.ts';
import { createUser } from '../../src/server/domain/users.ts';

export const ORIGIN = 'http://localhost';
export const PASSWORD = 'correct-horse-1';

export async function setup(opts: { publicUrl?: string } = {}) {
  const db = openDb(':memory:');
  migrate(db);
  const clock = { t: 1_700_000_000_000 };
  const app = createApp({ db, now: () => clock.t, ...opts });

  await createUser(db, { username: 'boss', displayName: 'Boss', password: PASSWORD, role: 'admin' }, clock.t);
  await createUser(db, { username: 'sari', displayName: 'Sari', password: PASSWORD, role: 'staff' }, clock.t);

  function req(path: string, init: { method?: string; body?: unknown; cookie?: string; origin?: string | null } = {}) {
    const headers: Record<string, string> = {};
    if (init.origin !== null) headers.Origin = init.origin ?? ORIGIN;
    if (init.cookie) headers.Cookie = init.cookie;
    if (init.body !== undefined) headers['Content-Type'] = 'application/json';
    return app.request(path, {
      method: init.method ?? 'GET',
      headers,
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
  }

  async function login(username: string, password = PASSWORD) {
    const res = await req('/api/auth/login', { method: 'POST', body: { username, password } });
    const cookie = res.headers.get('set-cookie')?.split(';')[0];
    return { res, cookie };
  }

  async function loginAs(username: string): Promise<string> {
    const { cookie } = await login(username);
    if (!cookie) throw new Error(`login failed for ${username}`);
    return cookie;
  }

  return { db, app, clock, req, login, loginAs };
}
