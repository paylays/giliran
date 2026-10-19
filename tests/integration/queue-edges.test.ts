import { describe, expect, it } from 'vitest';
import type { StaffSnapshot, TicketSnapshot } from '../../src/shared/contracts.ts';
import { takeTicket } from '../../src/server/domain/tickets.ts';
import { seedQueue, setup, staffAt } from './helpers.ts';

async function world() {
  const ctx = await setup();
  const seed = await seedQueue(ctx);
  const admin = await ctx.loginAs('boss');
  const issue = (serviceId: number) => {
    ctx.clock.t += 1000;
    const r = takeTicket(ctx.db, { serviceId, knownTokens: [] }, ctx.clock.t);
    if (r.kind !== 'created') throw new Error('expected a new ticket');
    return r;
  };
  const post = async (cookie: string, path: string, body: unknown) => {
    const res = await ctx.req(`/api/staff/${path}`, { method: 'POST', body, cookie });
    return { status: res.status, body: (await res.json()) as StaffSnapshot };
  };
  const adminCall = (path: string, method: string, body?: unknown) => ctx.req(path, { method, body, cookie: admin });
  return { ...ctx, ...seed, admin, issue, post, adminCall };
}

describe('prefix and daily reset', () => {
  it('numbers each service on its own and restarts each one the next day', async () => {
    const w = await world();
    expect([w.issue(w.a.id).number, w.issue(w.b.id).number, w.issue(w.a.id).number]).toEqual(['A001', 'B001', 'A002']);
    w.clock.t += 86_400_000;
    expect([w.issue(w.b.id).number, w.issue(w.a.id).number]).toEqual(['B001', 'A001']);
  });

  it('rejects a duplicate prefix case-insensitively, also on patch', async () => {
    const w = await world();
    const dup = await w.adminCall('/api/admin/services', 'POST', { name: 'Dup', prefix: 'a', numberWidth: 3 });
    expect(dup.status).toBe(409);
    const third = await w.adminCall('/api/admin/services', 'POST', { name: 'Third', prefix: 'C', numberWidth: 3 });
    const id = ((await third.json()) as { id: number }).id;
    expect((await w.adminCall(`/api/admin/services/${id}`, 'PATCH', { prefix: 'b' })).status).toBe(409);
  });

  it('applies a prefix change to new tickets only', async () => {
    const w = await world();
    const old = w.issue(w.a.id);
    const res = await w.adminCall(`/api/admin/services/${w.a.id}`, 'PATCH', { prefix: 'Z' });
    expect(res.status).toBe(200);
    expect(w.issue(w.a.id).number).toBe('Z002');
    expect(w.db.get<{ number: string }>('SELECT number FROM tickets WHERE public_token = ?', old.token)?.number).toBe('A001');
  });
});

describe('timezone change mid-day', () => {
  const put = (w: Awaited<ReturnType<typeof world>>, timezone: string) =>
    w.adminCall('/api/admin/settings', 'PUT', { businessName: 'Giliran', timezone, nearThreshold: 3 });

  it('uses the new timezone for the next ticket and keeps old tickets untouched', async () => {
    const w = await world();
    // Test clock: 2023-11-15 05:13 in Jakarta, which is 2023-11-14 21:13 in Los Angeles.
    expect(w.issue(w.a.id).number).toBe('A001');
    expect((await put(w, 'America/Los_Angeles')).status).toBe(200);
    const after = w.issue(w.a.id);
    const rows = w.db.all<{ service_date: string }>('SELECT service_date FROM tickets ORDER BY id');
    expect(rows.map((r) => r.service_date)).toEqual(['2023-11-15', '2023-11-14']);
    // Each (service, date) pair owns its own sequence, so there is no unique-index clash.
    expect(after.number).toBe('A001');
  });

  it('keeps issuing without error after the timezone moves back', async () => {
    const w = await world();
    w.issue(w.a.id);
    await put(w, 'America/Los_Angeles');
    w.issue(w.a.id);
    await put(w, 'Asia/Jakarta');
    expect(w.issue(w.a.id).number).toBe('A002');
    const rows = w.db.all<{ service_date: string; seq: number }>('SELECT service_date, seq FROM tickets ORDER BY id');
    expect(new Set(rows.map((d) => `${d.service_date}/${d.seq}`)).size).toBe(3);
  });
});

describe('inactive service', () => {
  it('cannot issue tickets and is hidden from visitors', async () => {
    const w = await world();
    w.issue(w.b.id);
    await w.adminCall(`/api/admin/services/${w.b.id}`, 'PATCH', { active: false });
    const res = await w.req('/api/tickets', { method: 'POST', body: { serviceId: w.b.id, knownTokens: [] } });
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ error: 'service_inactive' });
    expect(w.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM tickets WHERE service_id = ?', w.b.id)?.n).toBe(1);
    const list = (await (await w.req('/api/services')).json()) as { services: { id: number }[] };
    expect(list.services.map((s) => s.id)).toEqual([w.a.id]);
  });

  it('reactivating restores ticket taking with the same daily sequence', async () => {
    const w = await world();
    w.issue(w.b.id);
    await w.adminCall(`/api/admin/services/${w.b.id}`, 'PATCH', { active: false });
    await w.adminCall(`/api/admin/services/${w.b.id}`, 'PATCH', { active: true });
    expect(w.issue(w.b.id).number).toBe('B002');
  });
});

describe('deactivated staff', () => {
  it('is refused on every staff POST, the snapshot, and the staff stream', async () => {
    const w = await world();
    w.issue(w.a.id);
    const cookie = await staffAt(w, 'sari', w.loket1.id);
    const user = w.db.get<{ id: number }>("SELECT id FROM users WHERE username = 'sari'");
    const off = await w.adminCall(`/api/admin/users/${user?.id}`, 'PATCH', { active: false });
    expect(off.status).toBe(200);

    const bodies: [string, unknown][] = [
      ['counter', { counterId: w.loket1.id }],
      ['call-next', { expectedCurrentTicketId: null }],
      ['recall', { ticketId: 1 }],
      ['skip', { ticketId: 1 }],
      ['done', { ticketId: 1 }],
    ];
    for (const [path, body] of bodies) {
      expect((await w.req(`/api/staff/${path}`, { method: 'POST', body, cookie })).status, path).toBe(401);
    }
    expect((await w.req('/api/staff/snapshot', { cookie })).status).toBe(401);
    expect((await w.req('/api/stream/staff', { cookie })).status).toBe(401);
    expect(w.hub.size()).toBe(0);
    expect(w.db.get<{ status: string }>('SELECT status FROM tickets WHERE id = 1')?.status).toBe('waiting');
  });

  it('cannot log in again until reactivated', async () => {
    const w = await world();
    const user = w.db.get<{ id: number }>("SELECT id FROM users WHERE username = 'sari'");
    await w.adminCall(`/api/admin/users/${user?.id}`, 'PATCH', { active: false });
    expect((await w.login('sari')).res.status).toBe(401);
    await w.adminCall(`/api/admin/users/${user?.id}`, 'PATCH', { active: true });
    expect((await w.login('sari')).res.status).toBe(200);
  });
});

describe('position', () => {
  it('counts only waiting tickets of the same service and the same day', async () => {
    const w = await world();
    // Leftovers from yesterday must not count.
    w.issue(w.a.id);
    w.issue(w.a.id);
    w.clock.t += 86_400_000;
    const a1 = w.issue(w.a.id);
    w.issue(w.b.id);
    w.issue(w.b.id);
    const a2 = w.issue(w.a.id);
    const a3 = w.issue(w.a.id);
    const first = async (token: string) => {
      const res = await w.req(`/api/stream/ticket/${token}`);
      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let text = '';
      while (!text.includes('data: ') || !text.endsWith('\n\n')) {
        const chunk = await reader?.read();
        if (!chunk || chunk.done) break;
        text += decoder.decode(chunk.value, { stream: true });
      }
      await reader?.cancel();
      const line = text.split('\n').find((l) => l.startsWith('data: '));
      return JSON.parse(line?.slice(6) ?? '{}') as TicketSnapshot;
    };
    expect(await first(a1.token)).toMatchObject({ state: 'waiting', number: 'A001', position: 0 });
    expect(await first(a2.token)).toMatchObject({ number: 'A002', position: 1 });
    expect(await first(a3.token)).toMatchObject({ number: 'A003', position: 2 });
  });
});

describe('invalid transitions', () => {
  it('returns 409 for recall, skip and done on a waiting ticket and on a finished one', async () => {
    const w = await world();
    w.issue(w.a.id);
    w.issue(w.a.id);
    const cookie = await staffAt(w, 'sari', w.loket1.id);
    for (const path of ['recall', 'skip', 'done']) {
      expect((await w.post(cookie, path, { ticketId: 2 })).status, `waiting ${path}`).toBe(409);
    }
    const called = await w.post(cookie, 'call-next', { expectedCurrentTicketId: null });
    expect(called.body.current?.id).toBe(1);
    expect((await w.post(cookie, 'done', { ticketId: 1 })).status).toBe(200);
    for (const path of ['recall', 'skip', 'done']) {
      expect((await w.post(cookie, path, { ticketId: 1 })).status, `done ${path}`).toBe(409);
    }
    expect(w.db.get<{ status: string }>('SELECT status FROM tickets WHERE id = 1')?.status).toBe('done');
    expect(w.db.get<{ status: string }>('SELECT status FROM tickets WHERE id = 2')?.status).toBe('waiting');
  });

  it('returns 409 for a call-next that claims the wrong current ticket', async () => {
    const w = await world();
    w.issue(w.a.id);
    w.issue(w.a.id);
    const cookie = await staffAt(w, 'sari', w.loket1.id);
    await w.post(cookie, 'call-next', { expectedCurrentTicketId: null });
    expect((await w.post(cookie, 'call-next', { expectedCurrentTicketId: null })).status).toBe(409);
    expect((await w.post(cookie, 'call-next', { expectedCurrentTicketId: 2 })).status).toBe(409);
    expect(w.db.get<{ status: string }>('SELECT status FROM tickets WHERE id = 2')?.status).toBe('waiting');
  });

  it('returns 400 for malformed staff bodies', async () => {
    const w = await world();
    const cookie = await staffAt(w, 'sari', w.loket1.id);
    expect((await w.post(cookie, 'done', {})).status).toBe(400);
    expect((await w.post(cookie, 'recall', { ticketId: 'x' })).status).toBe(400);
    expect((await w.post(cookie, 'call-next', {})).status).toBe(400);
  });
});

describe('no double assignment under concurrency', () => {
  it('hands each waiting ticket to exactly one counter when both call at once', async () => {
    const w = await world();
    for (let i = 0; i < 6; i++) w.issue(w.a.id);
    const c1 = await staffAt(w, 'sari', w.loket1.id);
    const c2 = await staffAt(w, 'dewi', w.loket2.id);
    const exp = new Map<string, number | null>([[c1, null], [c2, null]]);
    for (let round = 0; round < 3; round++) {
      const [r1, r2] = await Promise.all([
        w.post(c1, 'call-next', { expectedCurrentTicketId: exp.get(c1) ?? null }),
        w.post(c2, 'call-next', { expectedCurrentTicketId: exp.get(c2) ?? null }),
      ]);
      expect([r1.status, r2.status]).toEqual([200, 200]);
      exp.set(c1, r1.body.current?.id ?? null);
      exp.set(c2, r2.body.current?.id ?? null);
      expect(r1.body.current?.id).not.toBe(r2.body.current?.id);
    }
    const used = w.db.all<{ id: number }>("SELECT id FROM tickets WHERE status IN ('called', 'done')");
    expect(used).toHaveLength(6);
    const called = w.db.all<{ counter_id: number }>("SELECT counter_id FROM tickets WHERE status = 'called'");
    expect(new Set(called.map((r) => r.counter_id)).size).toBe(called.length);
  });
});

describe('role guards and Origin', () => {
  it('answers 401 to anonymous callers on every staff route', async () => {
    const w = await world();
    const routes: [string, string][] = [
      ['GET', '/api/staff/snapshot'],
      ['POST', '/api/staff/counter'],
      ['POST', '/api/staff/call-next'],
      ['POST', '/api/staff/recall'],
      ['POST', '/api/staff/skip'],
      ['POST', '/api/staff/done'],
    ];
    for (const [method, path] of routes) {
      expect((await w.req(path, { method, body: method === 'POST' ? {} : undefined })).status, path).toBe(401);
    }
  });

  it('answers 401 to anonymous and 403 to staff on every admin route', async () => {
    const w = await world();
    const staff = await w.loginAs('sari');
    const routes: [string, string][] = [
      ['GET', '/api/admin/settings'], ['PUT', '/api/admin/settings'],
      ['GET', '/api/admin/services'], ['POST', '/api/admin/services'], ['PATCH', '/api/admin/services/1'],
      ['GET', '/api/admin/counters'], ['POST', '/api/admin/counters'], ['PATCH', '/api/admin/counters/1'],
      ['GET', '/api/admin/users'], ['POST', '/api/admin/users'], ['PATCH', '/api/admin/users/1'],
      ['POST', '/api/admin/users/1/password'],
    ];
    for (const [method, path] of routes) {
      const body = method === 'GET' ? undefined : {};
      expect((await w.req(path, { method, body })).status, `anon ${method} ${path}`).toBe(401);
      expect((await w.req(path, { method, body, cookie: staff })).status, `staff ${method} ${path}`).toBe(403);
    }
  });

  it('lets an admin use the staff panel', async () => {
    const w = await world();
    w.issue(w.a.id);
    const cookie = await staffAt(w, 'boss', w.loket1.id);
    const r = await w.post(cookie, 'call-next', { expectedCurrentTicketId: null });
    expect(r.status).toBe(200);
    expect(r.body.current?.number).toBe('A001');
  });

  it('rejects a foreign or missing Origin on staff and admin mutations, and changes nothing', async () => {
    const w = await world();
    w.issue(w.a.id);
    const staff = await staffAt(w, 'sari', w.loket1.id);
    for (const origin of ['http://evil.example', null]) {
      const res = await w.req('/api/staff/call-next', { method: 'POST', body: { expectedCurrentTicketId: null }, cookie: staff, origin });
      expect(res.status).toBe(403);
      const adm = await w.req('/api/admin/services', { method: 'POST', body: { name: 'X', prefix: 'X', numberWidth: 3 }, cookie: w.admin, origin });
      expect(adm.status).toBe(403);
    }
    expect(w.db.get<{ status: string }>('SELECT status FROM tickets WHERE id = 1')?.status).toBe('waiting');
    expect(w.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM services')?.n).toBe(2);
  });

  it('serves public services and the display stream without login', async () => {
    const w = await world();
    expect((await w.req('/api/services')).status).toBe(200);
    const res = await w.req('/api/stream/display');
    expect(res.status).toBe(200);
    await res.body?.cancel();
  });
});
