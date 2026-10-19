import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DisplaySnapshot, StaffSnapshot, TicketSnapshot } from '../../src/shared/contracts.ts';
import { takeTicket } from '../../src/server/domain/tickets.ts';
import { createRollover } from '../../src/server/realtime/rollover.ts';
import { msUntilNextBusinessDay } from '../../src/shared/business-date.ts';
import { seedQueue, setup, staffAt } from './helpers.ts';

const TO_MIDNIGHT = 67_600_000;

interface Frame {
  event?: string;
  retry?: number;
  data?: unknown;
}

type Ctx = Awaited<ReturnType<typeof setup>>;

async function open(ctx: Ctx, path: string, cookie?: string) {
  const res = await ctx.req(path, { cookie });
  const reader = res.body?.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  // Resolves with the next frame, or null when the server ended the stream.
  async function next(timeoutMs = 1000): Promise<Frame | null> {
    for (;;) {
      const cut = buffer.indexOf('\n\n');
      if (cut >= 0) {
        const raw = buffer.slice(0, cut);
        buffer = buffer.slice(cut + 2);
        const frame: Frame = {};
        for (const line of raw.split('\n')) {
          if (line.startsWith('retry: ')) frame.retry = Number(line.slice(7));
          else if (line.startsWith('event: ')) frame.event = line.slice(7);
          else if (line.startsWith('data: ')) frame.data = JSON.parse(line.slice(6));
        }
        return frame;
      }
      if (!reader) throw new Error(`no stream body (status ${res.status})`);
      let timer: NodeJS.Timeout | undefined;
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('timed out waiting for a frame')), timeoutMs);
      });
      const chunk = await Promise.race([reader.read(), timeout]).finally(() => clearTimeout(timer));
      if (chunk.done) return null;
      buffer += decoder.decode(chunk.value, { stream: true });
    }
  }

  // Skips ping frames and returns the next snapshot payload.
  async function snapshot<T>(timeoutMs = 1000): Promise<T> {
    for (;;) {
      const f = await next(timeoutMs);
      if (!f) throw new Error('stream ended');
      if (f.event === 'snapshot') return f.data as T;
    }
  }

  return { res, next, snapshot, close: () => reader?.cancel() };
}

async function world() {
  const ctx = await setup();
  const seed = await seedQueue(ctx);
  const issue = (serviceId: number) => {
    ctx.clock.t += 1000;
    const r = takeTicket(ctx.db, { serviceId, knownTokens: [] }, ctx.clock.t);
    if (r.kind !== 'created') throw new Error('expected a new ticket');
    return r;
  };
  return { ...ctx, ...seed, issue };
}

// Lets a pending hub batch (50 ms) flush so it does not leak into a stream opened afterwards.
const settle = () => new Promise((resolve) => setTimeout(resolve, 80));

afterEach(() => {
  vi.useRealTimers();
});

describe('stream protocol', () => {
  it('opens with retry 3000 and an immediate snapshot on every stream', async () => {
    const w = await world();
    const t = w.issue(w.a.id);
    const cookie = await staffAt(w, 'sari', w.loket1.id);

    for (const [path, ck] of [
      ['/api/stream/display', undefined],
      [`/api/stream/ticket/${t.token}`, undefined],
      ['/api/stream/staff', cookie],
    ] as const) {
      const s = await open(w, path, ck);
      expect(s.res.status).toBe(200);
      expect(s.res.headers.get('content-type')).toContain('text/event-stream');
      expect(await s.next()).toEqual({ retry: 3000 });
      const first = await s.next();
      expect(first?.event).toBe('snapshot');
      expect((first?.data as { serverTime: number }).serverTime).toBe(w.clock.t);
      await s.close();
    }
  });

  it('sends a named ping event every 15 s', async () => {
    const w = await world();
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    const s = await open(w, '/api/stream/display');
    await s.next(); // retry
    await s.next(); // snapshot
    await vi.advanceTimersByTimeAsync(14_999);
    await vi.advanceTimersByTimeAsync(1);
    const ping = await s.next();
    expect(ping).toMatchObject({ event: 'ping', data: { serverTime: w.clock.t } });
    await s.close();
  });

  it('requires a session for the staff stream', async () => {
    const w = await world();
    expect((await w.req('/api/stream/staff')).status).toBe(401);
    expect(w.hub.size()).toBe(0);
  });

  it('ends the staff stream when the session is revoked', async () => {
    const w = await world();
    const cookie = await staffAt(w, 'sari', w.loket1.id);
    await settle();
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    const s = await open(w, '/api/stream/staff', cookie);
    await s.next();
    await s.next();
    await w.req('/api/auth/logout', { method: 'POST', cookie });
    await vi.advanceTimersByTimeAsync(15_000);
    expect(await s.next()).toBeNull();
    expect(w.hub.size()).toBe(0);
  });
});

describe('display stream', () => {
  it('pushes within 300 ms of a ticket being taken or called', async () => {
    const w = await world();
    const cookie = await staffAt(w, 'sari', w.loket1.id);
    await settle();
    const display = await open(w, '/api/stream/display');
    await display.next();
    const first = await display.snapshot<DisplaySnapshot>();
    expect(first.counters.map((c) => c.name)).toEqual(['Loket 1', 'Loket 2']);
    expect(first.services.map((s) => [s.prefix, s.waiting])).toEqual([['A', 0], ['B', 0]]);

    let started = Date.now();
    expect((await w.req('/api/tickets', { method: 'POST', body: { serviceId: w.a.id } })).status).toBe(201);
    const afterTake = await display.snapshot<DisplaySnapshot>(300);
    expect(Date.now() - started).toBeLessThan(300);
    expect(afterTake.services[0]?.waiting).toBe(1);

    started = Date.now();
    await w.req('/api/staff/call-next', { method: 'POST', body: { expectedCurrentTicketId: null }, cookie });
    const afterCall = await display.snapshot<DisplaySnapshot>(300);
    expect(Date.now() - started).toBeLessThan(300);
    expect(afterCall.counters[0]?.current).toMatchObject({ number: 'A001', callCount: 1 });
    expect(afterCall.recentCalls[0]).toMatchObject({ number: 'A001', counterName: 'Loket 1' });
    expect(afterCall.recentCalls[0]?.callId).toBe(`${afterCall.counters[0]?.current?.ticketId}:1`);
    expect(afterCall.services[0]?.waiting).toBe(0);
    await display.close();
  });

  it('batches a burst of changes into one rebuild', async () => {
    const w = await world();
    const display = await open(w, '/api/stream/display');
    await display.next();
    await display.snapshot();
    for (let i = 0; i < 5; i++) w.hub.notify({ serviceIds: [w.a.id] });
    const merged = await display.snapshot<DisplaySnapshot>(300);
    expect(merged.serverTime).toBe(w.clock.t);
    await expect(display.snapshot(150)).rejects.toThrow('timed out');
    await display.close();
  });

  it('keeps the last six calls and bumps the call id on recall', async () => {
    const w = await world();
    for (let i = 0; i < 8; i++) w.issue(w.a.id);
    const cookie = await staffAt(w, 'sari', w.loket1.id);
    let expected: number | null = null;
    for (let i = 0; i < 8; i++) {
      w.clock.t += 1000;
      const r = await w.req('/api/staff/call-next', { method: 'POST', body: { expectedCurrentTicketId: expected }, cookie });
      expected = ((await r.json()) as StaffSnapshot).current?.id ?? null;
    }
    w.clock.t += 1000;
    await w.req('/api/staff/recall', { method: 'POST', body: { ticketId: expected }, cookie });
    const display = await open(w, '/api/stream/display');
    await display.next();
    const snap = await display.snapshot<DisplaySnapshot>();
    expect(snap.recentCalls).toHaveLength(6);
    expect(snap.recentCalls[0]).toMatchObject({ number: 'A008', callId: `${expected}:2` });
    await display.close();
  });
});

describe('ticket stream', () => {
  it('reports unknown tokens as not_found and earlier-day tickets as expired', async () => {
    const w = await world();
    const t = w.issue(w.a.id);
    const unknown = await open(w, '/api/stream/ticket/nope');
    await unknown.next();
    expect(await unknown.snapshot<TicketSnapshot>()).toMatchObject({ state: 'not_found' });
    await unknown.close();

    w.clock.t += TO_MIDNIGHT;
    const old = await open(w, `/api/stream/ticket/${t.token}`);
    await old.next();
    expect(await old.snapshot<TicketSnapshot>()).toMatchObject({ state: 'expired', number: 'A001' });
    await old.close();
  });

  it('carries position and near, and follows the ticket through called, recall and done', async () => {
    const w = await world();
    const tickets = Array.from({ length: 6 }, () => w.issue(w.a.id));
    const cookie = await staffAt(w, 'sari', w.loket1.id);
    const call = (path: string, body: unknown) => w.req(`/api/staff/${path}`, { method: 'POST', body, cookie });

    const last = tickets[5]!;
    const s = await open(w, `/api/stream/ticket/${last.token}`);
    await s.next();
    // Five people ahead, default threshold is 3.
    expect(await s.snapshot<TicketSnapshot>()).toMatchObject({ state: 'waiting', number: 'A006', position: 5, near: false });

    await call('call-next', { expectedCurrentTicketId: null }); // A001 called
    expect(await s.snapshot<TicketSnapshot>(300)).toMatchObject({ position: 4, near: false });
    const second = (await (await call('call-next', { expectedCurrentTicketId: 1 })).json()) as StaffSnapshot;
    expect(await s.snapshot<TicketSnapshot>(300)).toMatchObject({ position: 3, near: true });
    expect(second.current?.number).toBe('A002');

    // The visitor of A002 sees called, then a recall with a new call id.
    const mine = await open(w, `/api/stream/ticket/${tickets[1]!.token}`);
    await mine.next();
    const called = await mine.snapshot<TicketSnapshot>();
    expect(called).toMatchObject({ state: 'called', counterName: 'Loket 1', callId: '2:1' });
    await call('recall', { ticketId: 2 });
    expect(await mine.snapshot<TicketSnapshot>(300)).toMatchObject({ state: 'called', callId: '2:2' });
    await call('done', { ticketId: 2 });
    expect(await mine.snapshot<TicketSnapshot>(300)).toMatchObject({ state: 'done' });
    await s.close();
    await mine.close();
  });

  it('shows skipped for a skipped ticket', async () => {
    const w = await world();
    const t = w.issue(w.a.id);
    const cookie = await staffAt(w, 'sari', w.loket1.id);
    const s = await open(w, `/api/stream/ticket/${t.token}`);
    await s.next();
    await s.snapshot();
    const r = await w.req('/api/staff/call-next', { method: 'POST', body: { expectedCurrentTicketId: null }, cookie });
    const id = ((await r.json()) as StaffSnapshot).current?.id;
    await s.snapshot();
    await w.req('/api/staff/skip', { method: 'POST', body: { ticketId: id }, cookie });
    expect(await s.snapshot<TicketSnapshot>(300)).toMatchObject({ state: 'skipped' });
    await s.close();
  });

  it('honours the admin near threshold', async () => {
    const w = await world();
    for (let i = 0; i < 3; i++) w.issue(w.a.id);
    const t = w.issue(w.a.id); // position 3
    const admin = await w.loginAs('boss');
    const s = await open(w, `/api/stream/ticket/${t.token}`);
    await s.next();
    expect(await s.snapshot<TicketSnapshot>()).toMatchObject({ position: 3, near: true });
    await w.req('/api/admin/settings', {
      method: 'PUT',
      body: { businessName: 'Giliran', timezone: 'Asia/Jakarta', nearThreshold: 2 },
      cookie: admin,
    });
    expect(await s.snapshot<TicketSnapshot>(300)).toMatchObject({ position: 3, near: false });
    await s.close();
  });
});

describe('staff stream', () => {
  it('is scoped to the session counter and updates when the counter changes', async () => {
    const w = await world();
    w.issue(w.b.id);
    w.issue(w.a.id);
    const cookie = await w.loginAs('sari');
    const s = await open(w, '/api/stream/staff', cookie);
    await s.next();
    const before = await s.snapshot<StaffSnapshot>();
    expect(before.counter).toBeNull();
    expect(before.counterOptions.map((o) => o.name)).toEqual(['Loket 1', 'Loket 2']);
    expect(before.waiting).toEqual([]);

    await w.req('/api/staff/counter', { method: 'POST', body: { counterId: w.loket2.id }, cookie });
    const picked = await s.snapshot<StaffSnapshot>(300);
    expect(picked.counter).toEqual({ id: w.loket2.id, name: 'Loket 2' });
    expect(picked.waiting.map((x) => x.prefix)).toEqual(['A']);
    expect(picked.nextWaiting).toMatchObject({ number: 'A001' });

    // A call made by another staff member at Loket 1 does not change Loket 2's current ticket.
    const other = await staffAt(w, 'dewi', w.loket1.id);
    await w.req('/api/staff/call-next', { method: 'POST', body: { expectedCurrentTicketId: null }, cookie: other });
    const after = await s.snapshot<StaffSnapshot>(300);
    expect(after.current).toBeNull();
    expect(after.nextWaiting).toMatchObject({ number: 'A001' });
    await s.close();
  });
});

describe('midnight rollover', () => {
  it('pushes a fresh snapshot to every view once the business day changes', async () => {
    const w = await world();
    const t = w.issue(w.a.id);
    const cookie = await staffAt(w, 'sari', w.loket1.id);
    await w.req('/api/staff/call-next', { method: 'POST', body: { expectedCurrentTicketId: null }, cookie });

    await settle();
    const rollover = createRollover({ db: w.db, now: () => w.clock.t, hub: w.hub });
    const display = await open(w, '/api/stream/display');
    const ticket = await open(w, `/api/stream/ticket/${t.token}`);
    for (const s of [display, ticket]) await s.next();
    expect((await display.snapshot<DisplaySnapshot>()).counters[0]?.current?.number).toBe('A001');
    await ticket.snapshot();

    expect(rollover.tick()).toBe(false);
    w.clock.t += TO_MIDNIGHT;
    expect(rollover.tick()).toBe(true);
    expect(rollover.tick()).toBe(false);

    const d = await display.snapshot<DisplaySnapshot>(300);
    expect(d.counters[0]?.current).toBeNull();
    expect(d.recentCalls).toEqual([]);
    expect(await ticket.snapshot<TicketSnapshot>(300)).toMatchObject({ state: 'expired' });
    // The stale called ticket no longer blocks the counter.
    expect(w.db.get<{ status: string }>('SELECT status FROM tickets WHERE id = 1')?.status).toBe('skipped');
    await display.close();
    await ticket.close();
  });

  it('computes the wait until local midnight', () => {
    // 2023-11-14T22:13:20Z is 05:13:20 in Jakarta (UTC+7).
    const t0 = 1_700_000_000_000;
    expect(msUntilNextBusinessDay(t0, 'Asia/Jakarta')).toBe(TO_MIDNIGHT);
    expect(msUntilNextBusinessDay(t0, 'UTC')).toBe(6_400_000);
  });
});

describe('subscriber lifecycle', () => {
  it('leaves no subscribers after 100 open/close cycles per stream', async () => {
    const w = await world();
    const t = w.issue(w.a.id);
    const cookie = await staffAt(w, 'sari', w.loket1.id);
    for (let i = 0; i < 100; i++) {
      for (const [path, ck] of [
        ['/api/stream/display', undefined],
        [`/api/stream/ticket/${t.token}`, undefined],
        ['/api/stream/ticket/unknown', undefined],
        ['/api/stream/staff', cookie],
      ] as const) {
        const s = await open(w, path, ck);
        await s.next();
        await s.close();
      }
    }
    expect(w.hub.size()).toBe(0);
  });

  it('survives a closed stream during a push', async () => {
    const w = await world();
    const a = await open(w, '/api/stream/display');
    const b = await open(w, '/api/stream/display');
    await a.next();
    await b.next();
    expect(w.hub.size()).toBe(2);
    await a.close();
    w.hub.notifyAll();
    await b.snapshot();
    await b.snapshot(300);
    expect(w.hub.size()).toBe(1);
    await b.close();
    expect(w.hub.size()).toBe(0);
  });
});
