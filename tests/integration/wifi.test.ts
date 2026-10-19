import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { openDb } from '../../src/server/db/client.ts';
import { migrate } from '../../src/server/db/migrate.ts';
import { buildDisplay } from '../../src/server/realtime/snapshots.ts';
import { setup } from './helpers.ts';

const base = { businessName: 'Giliran', timezone: 'Asia/Jakarta', nearThreshold: 3 };
const migrationsDir = fileURLToPath(new URL('../../src/server/db/migrations', import.meta.url));

async function admin() {
  const ctx = await setup();
  const cookie = await ctx.loginAs('boss');
  const put = (body: unknown) => ctx.req('/api/admin/settings', { method: 'PUT', body, cookie });
  return { ...ctx, cookie, put };
}

describe('migration 002_wifi', () => {
  const columns = (db: ReturnType<typeof openDb>) =>
    db.all<{ name: string }>('PRAGMA table_info(settings)').map((c) => c.name);

  it('applies on a database already at 001 and the down script reverts it', () => {
    const db = openDb(':memory:');
    db.exec(readFileSync(`${migrationsDir}/001_init.sql`, 'utf8'));
    db.exec('CREATE TABLE schema_migrations (version TEXT PRIMARY KEY, applied_at INTEGER NOT NULL)');
    db.run("INSERT INTO schema_migrations VALUES ('001_init', 0)");
    db.run("UPDATE settings SET business_name = 'Kept'");

    expect(migrate(db)).toEqual(['002_wifi']);
    expect(columns(db)).toEqual(expect.arrayContaining(['wifi_ssid', 'wifi_password', 'wifi_security']));
    expect(db.get<{ business_name: string; wifi_ssid: string | null; wifi_security: string }>(
      'SELECT business_name, wifi_ssid, wifi_security FROM settings',
    )).toEqual({ business_name: 'Kept', wifi_ssid: null, wifi_security: 'WPA' });
    expect(() => db.run("UPDATE settings SET wifi_security = 'bogus'")).toThrow();

    db.exec(readFileSync(`${migrationsDir}/002_wifi.down.sql`, 'utf8'));
    expect(columns(db)).not.toContain('wifi_ssid');
    expect(columns(db)).not.toContain('wifi_security');
  });
});

describe('wifi settings', () => {
  it('rejects WPA without a password, short WPA passwords, and long SSIDs', async () => {
    const { put } = await admin();
    expect((await put({ ...base, wifiSsid: 'Cafe', wifiSecurity: 'WPA' })).status).toBe(400);
    expect((await put({ ...base, wifiSsid: 'Cafe', wifiSecurity: 'WPA', wifiPassword: 'short' })).status).toBe(400);
    expect((await put({ ...base, wifiSsid: 'x'.repeat(33), wifiSecurity: 'WPA', wifiPassword: 'longenough' })).status).toBe(400);
    expect((await put({ ...base, wifiSsid: 'Cafe', wifiSecurity: 'WPA', wifiPassword: 'p'.repeat(64) })).status).toBe(400);
  });

  it('stores wifi, returns the password to admins, and clears it for nopass', async () => {
    const { put, req, cookie } = await admin();
    const ok = await put({ ...base, wifiSsid: 'Cafe', wifiSecurity: 'WPA', wifiPassword: 'secret123' });
    expect(await ok.json()).toMatchObject({ wifiSsid: 'Cafe', wifiPassword: 'secret123', wifiSecurity: 'WPA' });
    const got = await req('/api/admin/settings', { cookie });
    expect(await got.json()).toMatchObject({ wifiPassword: 'secret123' });

    const open = await put({ ...base, wifiSsid: 'Cafe', wifiSecurity: 'nopass', wifiPassword: 'ignored-value' });
    expect(await open.json()).toMatchObject({ wifiSecurity: 'nopass', wifiPassword: null });
  });

  it('keeps wifi when the fields are omitted and clears with a null ssid', async () => {
    const { put } = await admin();
    await put({ ...base, wifiSsid: 'Cafe', wifiSecurity: 'WPA', wifiPassword: 'secret123' });
    expect(await (await put(base)).json()).toMatchObject({ wifiSsid: 'Cafe', wifiPassword: 'secret123' });
    expect(await (await put({ ...base, wifiSsid: null })).json()).toMatchObject({ wifiSsid: null, wifiPassword: null });
  });

  it('answers 403 to staff and 401 to anonymous', async () => {
    const { req, loginAs } = await setup();
    const staff = await loginAs('sari');
    expect((await req('/api/admin/settings', { cookie: staff })).status).toBe(403);
    expect((await req('/api/admin/settings', { method: 'PUT', body: base, cookie: staff })).status).toBe(403);
    expect((await req('/api/admin/settings')).status).toBe(401);
  });
});

describe('GET /api/wifi-qr.svg', () => {
  it('returns 404 wifi_not_set when no ssid', async () => {
    const { req } = await setup();
    const res = await req('/api/wifi-qr.svg');
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ error: 'wifi_not_set' });
  });

  it('returns a cached SVG once wifi is set', async () => {
    const { put, req } = await admin();
    await put({ ...base, wifiSsid: 'Cafe', wifiSecurity: 'WPA', wifiPassword: 'secret123' });
    const res = await req('/api/wifi-qr.svg');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/svg+xml');
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(await res.text()).toContain('<svg');
  });
});

describe('display snapshot', () => {
  it('carries the ssid and never the password', async () => {
    const { put, db, clock } = await admin();
    expect(buildDisplay(db, clock.t).wifiSsid).toBeNull();
    expect(buildDisplay(db, clock.t).wifiQrVersion).toBeNull();
    await put({ ...base, wifiSsid: 'Cafe', wifiSecurity: 'WPA', wifiPassword: 'secret123' });
    const snap = buildDisplay(db, clock.t);
    expect(snap.wifiSsid).toBe('Cafe');
    expect(snap.wifiQrVersion).toBe(clock.t);
    expect(JSON.stringify(snap)).not.toContain('secret123');
    expect(snap).not.toHaveProperty('wifiPassword');
  });
});

describe('admin settings public addresses', () => {
  it('returns publicUrl and takeUrl from config on GET and PUT, and ignores them as input', async () => {
    const ctx = await setup({ publicUrl: 'http://192.168.1.10:3000/' });
    const cookie = await ctx.loginAs('boss');
    const expected = { publicUrl: 'http://192.168.1.10:3000', takeUrl: 'http://192.168.1.10:3000/take' };
    const got = await ctx.req('/api/admin/settings', { cookie });
    expect(await got.json()).toMatchObject(expected);

    const put = await ctx.req('/api/admin/settings', {
      method: 'PUT',
      body: { ...base, publicUrl: 'http://evil.example', takeUrl: 'http://evil.example/take' },
      cookie,
    });
    expect(put.status).toBe(200);
    expect(await put.json()).toMatchObject(expected);
  });
});
