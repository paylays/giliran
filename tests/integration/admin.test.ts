import { describe, expect, it } from 'vitest';
import { PASSWORD, setup } from './helpers.ts';

async function admin() {
  const ctx = await setup();
  const cookie = await ctx.loginAs('boss');
  const call = (path: string, method = 'GET', body?: unknown) => ctx.req(path, { method, body, cookie });
  return { ...ctx, cookie, call };
}

describe('admin guards', () => {
  it('returns 401 to anonymous and 403 to staff', async () => {
    const { req, loginAs } = await setup();
    expect((await req('/api/admin/services')).status).toBe(401);
    expect((await req('/api/admin/settings', { method: 'PUT', body: {} })).status).toBe(401);
    const staff = await loginAs('sari');
    expect((await req('/api/admin/services', { cookie: staff })).status).toBe(403);
    expect((await req('/api/admin/users', { cookie: staff })).status).toBe(403);
    expect((await req('/api/admin/counters', { method: 'POST', body: {}, cookie: staff })).status).toBe(403);
  });
});

describe('services', () => {
  it('uppercases the prefix, validates it, and rejects a duplicate with 409', async () => {
    const { call } = await admin();
    const created = await call('/api/admin/services', 'POST', { name: 'Teller', prefix: 'a' });
    expect(created.status).toBe(201);
    expect(await created.json()).toMatchObject({ prefix: 'A', numberWidth: 3, active: true });

    expect((await call('/api/admin/services', 'POST', { name: 'Other', prefix: 'A' })).status).toBe(409);
    expect((await call('/api/admin/services', 'POST', { name: 'Other', prefix: 'abcd' })).status).toBe(400);
    expect((await call('/api/admin/services', 'POST', { name: 'Other', prefix: 'a-' })).status).toBe(400);
    expect((await call('/api/admin/services', 'POST', { name: 'Other', prefix: 'A2' })).status).toBe(400);
    expect((await call('/api/admin/services', 'POST', { name: 'Other', prefix: '7' })).status).toBe(400);
    expect((await call('/api/admin/services', 'POST', { name: '', prefix: 'B' })).status).toBe(400);
  });

  it('patches without resetting omitted fields, and deactivates instead of deleting', async () => {
    const { call } = await admin();
    const s = (await (await call('/api/admin/services', 'POST', { name: 'CS', prefix: 'c', numberWidth: 4 })).json()) as {
      id: number;
    };
    const patched = await call(`/api/admin/services/${s.id}`, 'PATCH', { active: false });
    expect(await patched.json()).toMatchObject({ numberWidth: 4, prefix: 'C', active: false });
    expect((await call(`/api/admin/services/${s.id}`, 'DELETE')).status).toBe(404);
    expect((await call('/api/admin/services/999', 'PATCH', { name: 'x' })).status).toBe(404);
    const list = (await (await call('/api/admin/services')).json()) as { services: unknown[] };
    expect(list.services).toHaveLength(1);
  });
});

describe('counters', () => {
  it('creates, assigns services, replaces assignment, deactivates', async () => {
    const { call } = await admin();
    const mk = async (name: string, prefix: string) =>
      ((await (await call('/api/admin/services', 'POST', { name, prefix })).json()) as { id: number }).id;
    const a = await mk('Teller', 'A');
    const b = await mk('CS', 'B');

    const created = await call('/api/admin/counters', 'POST', { name: 'Loket 1', serviceIds: [a, b] });
    expect(created.status).toBe(201);
    const counter = (await created.json()) as { id: number; serviceIds: number[] };
    expect(counter.serviceIds).toEqual([a, b]);

    const updated = await call(`/api/admin/counters/${counter.id}`, 'PATCH', { serviceIds: [b], active: false });
    expect(await updated.json()).toMatchObject({ serviceIds: [b], active: false, name: 'Loket 1' });

    expect((await call(`/api/admin/counters/${counter.id}`, 'PATCH', { serviceIds: [9999] })).status).toBe(400);
    const list = (await (await call('/api/admin/counters')).json()) as { counters: { serviceIds: number[] }[] };
    expect(list.counters[0]?.serviceIds).toEqual([b]);
  });
});

describe('staff accounts', () => {
  it('creates, resets password, and deactivation kills sessions', async () => {
    const { call, req, login, loginAs } = await admin();
    const made = await call('/api/admin/users', 'POST', {
      username: 'Budi', displayName: 'Budi', password: 'budi-password-1',
    });
    expect(made.status).toBe(201);
    const user = (await made.json()) as { id: number; username: string; role: string };
    expect(user).toMatchObject({ username: 'budi', role: 'staff' });
    expect(JSON.stringify(user)).not.toMatch(/scrypt|password/i);
    expect((await call('/api/admin/users', 'POST', { username: 'budi', displayName: 'X', password: PASSWORD })).status).toBe(409);
    expect((await call('/api/admin/users', 'POST', { username: 'x', displayName: 'X', password: 'short' })).status).toBe(400);

    const budi = (await login('budi', 'budi-password-1')).res;
    expect(budi.status).toBe(200);

    expect((await call(`/api/admin/users/${user.id}/password`, 'POST', { password: 'new-password-2' })).status).toBe(200);
    expect((await login('budi', 'budi-password-1')).res.status).toBe(401);
    const fresh = await login('budi', 'new-password-2');
    expect(fresh.res.status).toBe(200);

    expect((await req('/api/auth/me', { cookie: fresh.cookie })).status).toBe(200);
    const off = await call(`/api/admin/users/${user.id}`, 'PATCH', { active: false });
    expect(await off.json()).toMatchObject({ active: false });
    expect((await req('/api/auth/me', { cookie: fresh.cookie })).status).toBe(401);
    expect((await login('budi', 'new-password-2')).res.status).toBe(401);

    // An admin cannot lock themselves out.
    const me = (await (await req('/api/auth/me', { cookie: await loginAs('boss') })).json()) as { user: { id: number } };
    expect((await call(`/api/admin/users/${me.user.id}`, 'PATCH', { active: false })).status).toBe(409);
  });
});

describe('settings', () => {
  it('validates timezone and near threshold', async () => {
    const { call } = await admin();
    expect(await (await call('/api/admin/settings')).json()).toEqual({
      businessName: 'Giliran', timezone: 'Asia/Jakarta', nearThreshold: 3,
    });
    const ok = await call('/api/admin/settings', 'PUT', { businessName: 'Klinik Sehat', timezone: 'Asia/Makassar', nearThreshold: 5 });
    expect(await ok.json()).toEqual({ businessName: 'Klinik Sehat', timezone: 'Asia/Makassar', nearThreshold: 5 });
    const bad = { businessName: 'X', timezone: 'Asia/Jakarta', nearThreshold: 3 };
    expect((await call('/api/admin/settings', 'PUT', { ...bad, timezone: 'Mars/Olympus' })).status).toBe(400);
    expect((await call('/api/admin/settings', 'PUT', { ...bad, nearThreshold: 0 })).status).toBe(400);
    expect((await call('/api/admin/settings', 'PUT', { ...bad, nearThreshold: 21 })).status).toBe(400);
  });
});

describe('public endpoints', () => {
  it('lists only active services and serves a QR svg for PUBLIC_URL/take', async () => {
    const { call, req } = await admin();
    await call('/api/admin/services', 'POST', { name: 'Teller', prefix: 'A', sortOrder: 2 });
    const off = (await (await call('/api/admin/services', 'POST', { name: 'Old', prefix: 'Z' })).json()) as { id: number };
    await call(`/api/admin/services/${off.id}`, 'PATCH', { active: false });
    await call('/api/admin/services', 'POST', { name: 'CS', prefix: 'B', sortOrder: 1 });

    const res = await req('/api/services');
    expect(await res.json()).toEqual({
      businessName: 'Giliran',
      services: [
        { id: 3, name: 'CS', prefix: 'B' },
        { id: 1, name: 'Teller', prefix: 'A' },
      ],
    });

    const qr = await req('/api/qr.svg');
    expect(qr.status).toBe(200);
    expect(qr.headers.get('content-type')).toContain('image/svg+xml');
    expect(await qr.text()).toContain('<svg');
  });

  it('encodes PUBLIC_URL/take in the QR', async () => {
    const a = await setup({ publicUrl: 'http://192.168.1.10:3000' });
    const b = await setup({ publicUrl: 'http://192.168.1.11:3000' });
    const [qa, qb] = await Promise.all([a.req('/api/qr.svg'), b.req('/api/qr.svg')]);
    expect(await qa.text()).not.toBe(await qb.text());

    const QRCode = (await import('qrcode')).default;
    const expected = await QRCode.toString('http://192.168.1.10:3000/take', { type: 'svg', margin: 2 });
    expect(await (await a.req('/api/qr.svg')).text()).toBe(expected);
  });
});
