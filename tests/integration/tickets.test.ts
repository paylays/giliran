import { describe, expect, it } from 'vitest';
import type { StaffSnapshot } from '../../src/shared/contracts.ts';
import { takeTicket } from '../../src/server/domain/tickets.ts';
import { seedQueue, setup, staffAt } from './helpers.ts';

// 2023-11-15 05:13 in Asia/Jakarta (start of the test clock); local midnight is this far away.
const TO_MIDNIGHT = 67_600_000;

async function world() {
  const ctx = await setup();
  const seed = await seedQueue(ctx);
  const take = (serviceId: number, knownTokens: string[] = []) =>
    ctx.req('/api/tickets', { method: 'POST', body: { serviceId, knownTokens } });
  // Direct domain call: skips the per-IP limiter and advances the clock so FIFO order is explicit.
  const issue = (serviceId: number) => {
    ctx.clock.t += 1000;
    return takeTicket(ctx.db, { serviceId, knownTokens: [] }, ctx.clock.t);
  };
  const post = async (cookie: string, path: string, body: unknown) => {
    const res = await ctx.req(`/api/staff/${path}`, { method: 'POST', body, cookie });
    return { status: res.status, body: (await res.json()) as StaffSnapshot & { error?: string } };
  };
  return { ...ctx, ...seed, take, issue, post };
}

describe('take ticket', () => {
  it('returns token and number, numbering per service', async () => {
    const w = await world();
    const res = await w.take(w.a.id);
    expect(res.status).toBe(201);
    const first = (await res.json()) as { token: string; number: string };
    expect(first.number).toBe('A001');
    expect(first.token).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(((await (await w.take(w.a.id)).json()) as { number: string }).number).toBe('A002');
    expect(((await (await w.take(w.b.id)).json()) as { number: string }).number).toBe('B001');
  });

  it('validates input and the Origin header', async () => {
    const w = await world();
    expect((await w.take(9999)).status).toBe(404);
    expect((await w.req('/api/tickets', { method: 'POST', body: { serviceId: 'x' } })).status).toBe(400);
    expect((await w.req('/api/tickets', { method: 'POST', body: { serviceId: w.a.id }, origin: null })).status).toBe(403);
    w.db.run('UPDATE services SET active = 0 WHERE id = ?', w.b.id);
    expect((await w.take(w.b.id)).status).toBe(409);
  });

  it('restarts at 001 on the next business day and keeps history', async () => {
    const w = await world();
    w.clock.t += TO_MIDNIGHT - 2000; // issue() adds 1 s, so the ticket is stamped 23:59:59 local
    w.issue(w.a.id);
    expect(w.db.get<{ number: string }>('SELECT number FROM tickets ORDER BY id DESC')?.number).toBe('A001');
    w.clock.t += 1000; // 00:00:00 local
    const next = await w.take(w.a.id);
    expect(((await next.json()) as { number: string }).number).toBe('A001');
    const rows = w.db.all<{ service_date: string; number: string }>('SELECT service_date, number FROM tickets ORDER BY id');
    expect(rows.map((r) => r.service_date)).toEqual(['2023-11-15', '2023-11-16']);
  });

  it('keeps counting past the padded width', async () => {
    const w = await world();
    w.db.run('INSERT INTO daily_sequences (service_id, service_date, last_number) VALUES (?, ?, 998)', w.a.id, '2023-11-15');
    const numbers: string[] = [];
    for (let i = 0; i < 3; i++) numbers.push(((await (await w.take(w.a.id)).json()) as { number: string }).number);
    expect(numbers).toEqual(['A999', 'A1000', 'A1001']);
  });

  it('allows one active ticket per service per browser', async () => {
    const w = await world();
    const first = (await (await w.take(w.a.id)).json()) as { token: string; number: string };

    const dup = await w.take(w.a.id, [first.token]);
    expect(dup.status).toBe(409);
    expect(await dup.json()).toEqual({ error: 'already_active', token: first.token, number: first.number });

    expect((await w.take(w.b.id, [first.token])).status).toBe(201);
    expect((await w.take(w.a.id, ['not-a-real-token'])).status).toBe(201);

    // Once the ticket is finished the browser may take another.
    const cookie = await staffAt(w, 'sari', w.loket1.id);
    const called = await w.post(cookie, 'call-next', { expectedCurrentTicketId: null });
    await w.post(cookie, 'done', { ticketId: called.body.current?.id });
    expect((await w.take(w.a.id, [first.token])).status).toBe(201);
  });

  it('limits ticket taking to 10 per 10 minutes per IP', async () => {
    const w = await world();
    for (let i = 0; i < 10; i++) expect((await w.take(w.a.id)).status).toBe(201);
    const blocked = await w.take(w.a.id);
    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers.get('retry-after'))).toBeGreaterThan(0);
    w.clock.t += 10 * 60_000 + 1000;
    expect((await w.take(w.a.id)).status).toBe(201);
  });
});

describe('staff counter and call flow', () => {
  it('requires a session and a valid active counter', async () => {
    const w = await world();
    expect((await w.req('/api/staff/counter', { method: 'POST', body: { counterId: w.loket1.id } })).status).toBe(401);
    const cookie = await w.loginAs('sari');
    expect((await w.post(cookie, 'call-next', { expectedCurrentTicketId: null })).status).toBe(409);
    expect((await w.post(cookie, 'counter', { counterId: 999 })).status).toBe(404);
    w.db.run('UPDATE counters SET active = 0 WHERE id = ?', w.loket2.id);
    expect((await w.post(cookie, 'counter', { counterId: w.loket2.id })).status).toBe(409);

    const picked = await w.post(cookie, 'counter', { counterId: w.loket1.id });
    expect(picked.status).toBe(200);
    expect(picked.body.counter).toEqual({ id: w.loket1.id, name: 'Loket 1' });
    expect(picked.body.counterOptions.map((o) => o.name)).toEqual(['Loket 1']);
  });

  it('calls FIFO across the counter services and returns the staff snapshot', async () => {
    const w = await world();
    w.issue(w.b.id); // B001
    w.issue(w.a.id); // A001
    w.issue(w.b.id); // B002
    const cookie = await staffAt(w, 'sari', w.loket1.id);

    const seen: string[] = [];
    let expected: number | null = null;
    for (let i = 0; i < 3; i++) {
      const r = await w.post(cookie, 'call-next', { expectedCurrentTicketId: expected });
      expect(r.status).toBe(200);
      seen.push(r.body.current?.number ?? '');
      expected = r.body.current?.id ?? null;
    }
    expect(seen).toEqual(['B001', 'A001', 'B002']);

    const empty = await w.post(cookie, 'call-next', { expectedCurrentTicketId: expected });
    expect(empty.status).toBe(200);
    expect(empty.body.current).toBeNull();
    const statuses = w.db.all<{ status: string }>('SELECT status FROM tickets ORDER BY id').map((r) => r.status);
    expect(statuses).toEqual(['done', 'done', 'done']);
  });

  it('never assigns one ticket to two counters', async () => {
    const w = await world();
    for (let i = 0; i < 12; i++) w.issue(i % 3 === 0 ? w.b.id : w.a.id);
    const c1 = await staffAt(w, 'sari', w.loket1.id);
    const c2 = await staffAt(w, 'dewi', w.loket2.id);

    const state = new Map<string, number | null>([[c1, null], [c2, null]]);
    const called: string[] = [];
    for (let i = 0; i < 14; i++) {
      const cookie = i % 2 === 0 ? c1 : c2;
      const r = await w.post(cookie, 'call-next', { expectedCurrentTicketId: state.get(cookie) ?? null });
      expect(r.status).toBe(200);
      state.set(cookie, r.body.current?.id ?? null);
      if (r.body.current && r.body.current.callCount === 1) called.push(r.body.current.number);
    }
    expect(new Set(called).size).toBe(called.length);
    expect(called).toHaveLength(12);
    // Loket 2 does not serve B.
    const byCounter = w.db.all<{ number: string; counter_id: number }>('SELECT number, counter_id FROM tickets');
    expect(byCounter.filter((t) => t.number.startsWith('B') && t.counter_id === w.loket2.id)).toHaveLength(0);
  });

  it('returns 409 on a stale expected ticket id', async () => {
    const w = await world();
    w.issue(w.a.id);
    w.issue(w.a.id);
    const cookie = await staffAt(w, 'sari', w.loket1.id);
    expect((await w.post(cookie, 'call-next', { expectedCurrentTicketId: 123 })).status).toBe(409);
    const first = await w.post(cookie, 'call-next', { expectedCurrentTicketId: null });
    // The client still thinks nothing is current.
    expect((await w.post(cookie, 'call-next', { expectedCurrentTicketId: null })).status).toBe(409);
    expect((await w.post(cookie, 'call-next', { expectedCurrentTicketId: (first.body.current?.id ?? 0) + 50 })).status).toBe(409);
    // A rejected call leaves the state untouched.
    const snap = await w.post(cookie, 'counter', { counterId: w.loket1.id });
    expect(snap.body.current?.number).toBe('A001');
  });

  it('recalls with call_count + 1 and rejects invalid transitions with 409', async () => {
    const w = await world();
    w.issue(w.a.id);
    w.issue(w.a.id);
    const c1 = await staffAt(w, 'sari', w.loket1.id);
    const c2 = await staffAt(w, 'dewi', w.loket2.id);
    const first = await w.post(c1, 'call-next', { expectedCurrentTicketId: null });
    const id = first.body.current?.id ?? 0;

    const again = await w.post(c1, 'recall', { ticketId: id });
    expect(again.status).toBe(200);
    expect(again.body.current).toMatchObject({ id, callCount: 2 });

    // Another counter cannot touch it; a waiting ticket cannot be done or skipped.
    expect((await w.post(c2, 'done', { ticketId: id })).status).toBe(409);
    expect((await w.post(c2, 'recall', { ticketId: id })).status).toBe(409);
    expect((await w.post(c1, 'skip', { ticketId: id + 1 })).status).toBe(409);
    expect((await w.post(c1, 'done', { ticketId: 9999 })).status).toBe(409);

    const skipped = await w.post(c1, 'skip', { ticketId: id });
    expect(skipped.status).toBe(200);
    expect(skipped.body.current).toBeNull();
    // Skipped is final.
    expect((await w.post(c1, 'recall', { ticketId: id })).status).toBe(409);
    expect((await w.post(c1, 'done', { ticketId: id })).status).toBe(409);
    expect((await w.post(c1, 'skip', { ticketId: id })).status).toBe(409);
    expect(w.db.get<{ status: string }>('SELECT status FROM tickets WHERE id = ?', id)?.status).toBe('skipped');
  });

  it('does not call yesterday tickets and closes a stale called ticket', async () => {
    const w = await world();
    w.issue(w.a.id);
    w.issue(w.a.id);
    const cookie = await staffAt(w, 'sari', w.loket1.id);
    await w.post(cookie, 'call-next', { expectedCurrentTicketId: null }); // A001 stays called overnight
    w.clock.t += TO_MIDNIGHT;

    // The 12 h session expired overnight, so sign in again.
    const next = await staffAt(w, 'sari', w.loket1.id);
    const snap = await w.post(next, 'counter', { counterId: w.loket1.id });
    expect(snap.body.current).toBeNull();
    expect(snap.body.nextWaiting).toBeNull();
    const r = await w.post(next, 'call-next', { expectedCurrentTicketId: null });
    expect(r.status).toBe(200);
    expect(r.body.current).toBeNull();
    expect(w.db.all<{ status: string }>('SELECT status FROM tickets ORDER BY id').map((t) => t.status)).toEqual([
      'skipped',
      'waiting',
    ]);

    w.issue(w.a.id);
    const today = await w.post(next, 'call-next', { expectedCurrentTicketId: null });
    expect(today.body.current?.number).toBe('A001');
  });
});

describe('counter edits while a ticket is called', () => {
  it('refuses to deactivate or drop the called ticket service until it is finished', async () => {
    const w = await world();
    w.issue(w.b.id);
    const staff = await staffAt(w, 'sari', w.loket1.id);
    const admin = await w.loginAs('admin');
    const patch = (body: unknown) => w.req(`/api/admin/counters/${w.loket1.id}`, { method: 'PATCH', body, cookie: admin });
    const called = await w.post(staff, 'call-next', { expectedCurrentTicketId: null });

    expect((await patch({ active: false })).status).toBe(409);
    expect((await patch({ serviceIds: [w.a.id] })).status).toBe(409);
    expect((await patch({ serviceIds: [w.a.id, w.b.id] })).status).toBe(200);
    expect((await patch({ name: 'Loket Satu' })).status).toBe(200);

    await w.post(staff, 'done', { ticketId: called.body.current?.id });
    expect((await patch({ serviceIds: [w.a.id] })).status).toBe(200);
    expect((await patch({ active: false })).status).toBe(200);

    // The staff session loses the deactivated counter.
    const snap = await w.req('/api/staff/snapshot', { cookie: staff });
    const body = (await snap.json()) as StaffSnapshot;
    expect(body.counter).toBeNull();
    expect(body.counterOptions.map((o) => o.name)).toEqual(['Loket 2']);
  });
});
