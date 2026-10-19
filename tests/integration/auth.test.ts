import { describe, expect, it } from 'vitest';
import { openDb } from '../../src/server/db/client.ts';
import { migrate } from '../../src/server/db/migrate.ts';
import { hashToken } from '../../src/server/auth/sessions.ts';
import { PASSWORD, setup } from './helpers.ts';

describe('migrations', () => {
  it('creates every table once and applies nothing the second time', () => {
    const db = openDb(':memory:');
    expect(migrate(db)).toEqual(['001_init', '002_wifi']);
    expect(migrate(db)).toEqual([]);
    const tables = db
      .all<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table'")
      .map((t) => t.name);
    for (const t of [
      'settings', 'users', 'sessions', 'services', 'counters', 'counter_services',
      'daily_sequences', 'tickets', 'schema_migrations',
    ]) {
      expect(tables).toContain(t);
    }
    expect(db.get<{ n: number }>('SELECT COUNT(*) AS n FROM schema_migrations')?.n).toBe(2);
  });
});

describe('auth', () => {
  it('login sets an HttpOnly Lax cookie, /me returns the user, logout clears it', async () => {
    const { req, login, db } = await setup();
    const { res, cookie } = await login('Admin');
    expect(res.status).toBe(200);
    const setCookie = res.headers.get('set-cookie') ?? '';
    expect(setCookie).toMatch(/HttpOnly/i);
    expect(setCookie).toMatch(/SameSite=Lax/i);
    expect(setCookie).not.toMatch(/Secure/i);
    expect(cookie).toBeTruthy();

    // Only the SHA-256 of the token is stored.
    const token = cookie!.split('=')[1]!;
    expect(db.get('SELECT 1 FROM sessions WHERE token_hash = ?', hashToken(token))).toBeTruthy();
    expect(db.get('SELECT 1 FROM sessions WHERE token_hash = ?', token)).toBeUndefined();

    const me = await req('/api/auth/me', { cookie });
    expect(me.status).toBe(200);
    expect(await me.json()).toMatchObject({ user: { username: 'admin', role: 'admin' } });

    const out = await req('/api/auth/logout', { method: 'POST', cookie });
    expect(out.status).toBe(200);
    expect(out.headers.get('set-cookie')).toMatch(/giliran_session=;|Max-Age=0/i);
    expect((await req('/api/auth/me', { cookie })).status).toBe(401);
  });

  it('marks the cookie Secure when PUBLIC_URL is https', async () => {
    const { login } = await setup({ publicUrl: 'https://queue.example.com' });
    const { res } = await login('admin');
    expect(res.headers.get('set-cookie')).toMatch(/Secure/i);
  });

  it('rejects a wrong password and an unknown user with 401', async () => {
    const { login } = await setup();
    expect((await login('admin', 'nope-nope-nope')).res.status).toBe(401);
    expect((await login('ghost')).res.status).toBe(401);
  });

  it('answers 429 on the 6th failure within a minute, and recovers after it', async () => {
    const { login, clock } = await setup();
    for (let i = 0; i < 5; i++) expect((await login('admin', 'bad-password')).res.status).toBe(401);
    const blocked = await login('admin', PASSWORD);
    expect(blocked.res.status).toBe(429);
    expect(blocked.res.headers.get('retry-after')).toBeTruthy();

    clock.t += 61_000;
    expect((await login('admin', PASSWORD)).res.status).toBe(200);
  });

  it('limits a burst of parallel bad logins for one username and IP', async () => {
    const { login, clock } = await setup();
    const results = await Promise.all(Array.from({ length: 20 }, () => login('admin', 'bad-password')));
    const statuses = results.map((r) => r.res.status);
    expect(statuses.filter((s) => s === 401).length).toBeLessThanOrEqual(5);
    expect(statuses.filter((s) => s === 429).length).toBeGreaterThanOrEqual(15);

    clock.t += 61_000;
    expect((await login('admin', PASSWORD)).res.status).toBe(200);
  });

  it('rejects a mutating request with a foreign or missing Origin', async () => {
    const { req } = await setup();
    const body = { username: 'admin', password: PASSWORD };
    const foreign = await req('/api/auth/login', { method: 'POST', body, origin: 'http://evil.example' });
    expect(foreign.status).toBe(403);
    const missing = await req('/api/auth/login', { method: 'POST', body, origin: null });
    expect(missing.status).toBe(403);
  });

  it('expires a session after 12 hours idle and slides expiry while active', async () => {
    const { req, loginAs, clock } = await setup();
    const cookie = await loginAs('admin');
    clock.t += 11 * 3600_000;
    expect((await req('/api/auth/me', { cookie })).status).toBe(200);
    clock.t += 11 * 3600_000;
    expect((await req('/api/auth/me', { cookie })).status).toBe(200);
    clock.t += 13 * 3600_000;
    expect((await req('/api/auth/me', { cookie })).status).toBe(401);
  });

  it('refuses a duplicate username', async () => {
    const { db, clock } = await setup();
    const { createUser } = await import('../../src/server/domain/users.ts');
    await expect(
      createUser(db, { username: 'admin', displayName: 'Other', password: PASSWORD, role: 'admin' }, clock.t),
    ).rejects.toMatchObject({ status: 409, code: 'username_taken' });
  });
});
