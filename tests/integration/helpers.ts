import { createApp } from '../../src/server/app.ts';
import { openDb } from '../../src/server/db/client.ts';
import { migrate } from '../../src/server/db/migrate.ts';
import { createHub } from '../../src/server/realtime/hub.ts';
import { createUser } from '../../src/server/domain/users.ts';
import { createService } from '../../src/server/domain/services.ts';
import { createCounter } from '../../src/server/domain/counters.ts';

export const ORIGIN = 'http://localhost';
export const PASSWORD = 'correct-horse-1';

export async function setup(opts: { publicUrl?: string } = {}) {
  const db = openDb(':memory:');
  migrate(db);
  const clock = { t: 1_700_000_000_000 };
  const hub = createHub();
  const app = createApp({ db, now: () => clock.t, hub, ...opts });

  await createUser(db, { username: 'admin', displayName: 'Admin', password: PASSWORD, role: 'admin' }, clock.t);
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

  return { db, app, hub, clock, req, login, loginAs };
}

// Services A (Teller) and B (CS); Loket 1 serves both, Loket 2 serves A only.
export async function seedQueue(ctx: Awaited<ReturnType<typeof setup>>) {
  const { db, clock } = ctx;
  const a = createService(db, { name: 'Teller', prefix: 'A', numberWidth: 3, sortOrder: 1 }, clock.t);
  const b = createService(db, { name: 'CS', prefix: 'B', numberWidth: 3, sortOrder: 2 }, clock.t);
  const loket1 = createCounter(db, { name: 'Loket 1', sortOrder: 1, serviceIds: [a.id, b.id] }, clock.t);
  const loket2 = createCounter(db, { name: 'Loket 2', sortOrder: 2, serviceIds: [a.id] }, clock.t);
  await createUser(db, { username: 'dewi', displayName: 'Dewi', password: PASSWORD, role: 'staff' }, clock.t);
  return { a, b, loket1, loket2 };
}

// Logs in and picks a counter; returns the cookie.
export async function staffAt(ctx: Awaited<ReturnType<typeof setup>>, username: string, counterId: number) {
  const cookie = await ctx.loginAs(username);
  const res = await ctx.req('/api/staff/counter', { method: 'POST', body: { counterId }, cookie });
  if (res.status !== 200) throw new Error(`pick counter failed: ${res.status}`);
  return cookie;
}
