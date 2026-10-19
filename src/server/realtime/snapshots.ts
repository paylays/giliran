import type { Db } from '../db/client.ts';
import { peekSession } from '../auth/sessions.ts';
import { getSettings } from '../domain/settings.ts';
import { businessDate } from '../../shared/business-date.ts';
import type {
  CallEntry,
  DisplayCounter,
  DisplaySnapshot,
  ServiceWaiting,
  StaffSnapshot,
  TicketSnapshot,
} from '../../shared/contracts.ts';

const RECENT_CALLS = 6;

function waitingByService(db: Db, date: string, onlyCounterId?: number): ServiceWaiting[] {
  const filter =
    onlyCounterId === undefined
      ? 's.active = 1'
      : 's.id IN (SELECT service_id FROM counter_services WHERE counter_id = ?)';
  const rows = db.all<{ id: number; name: string; prefix: string; waiting: number }>(
    `SELECT s.id, s.name, s.prefix,
            (SELECT COUNT(*) FROM tickets t
              WHERE t.service_id = s.id AND t.service_date = ? AND t.status = 'waiting') AS waiting
       FROM services s
      WHERE ${filter}
      ORDER BY s.sort_order, s.id`,
    date,
    ...(onlyCounterId === undefined ? [] : [onlyCounterId]),
  );
  return rows.map((r) => ({ serviceId: r.id, name: r.name, prefix: r.prefix, waiting: r.waiting }));
}

export function buildDisplay(db: Db, nowMs: number): DisplaySnapshot {
  const settings = getSettings(db);
  const date = businessDate(nowMs, settings.timezone);

  const counters = db
    .all<{ id: number; name: string }>('SELECT id, name FROM counters WHERE active = 1 ORDER BY sort_order, id')
    .map((c): DisplayCounter => {
      const t = db.get<{ id: number; number: string; call_count: number }>(
        "SELECT id, number, call_count FROM tickets WHERE counter_id = ? AND status = 'called' AND service_date = ?",
        c.id,
        date,
      );
      return {
        id: c.id,
        name: c.name,
        current: t ? { ticketId: t.id, number: t.number, callCount: t.call_count } : null,
      };
    });

  const recentCalls = db
    .all<{ id: number; call_count: number; number: string; counter_name: string; called_at: number }>(
      `SELECT t.id, t.call_count, t.number, c.name AS counter_name, t.called_at
         FROM tickets t JOIN counters c ON c.id = t.counter_id
        WHERE t.service_date = ? AND t.call_count > 0 AND t.called_at IS NOT NULL
        ORDER BY t.called_at DESC, t.id DESC
        LIMIT ?`,
      date,
      RECENT_CALLS,
    )
    .map(
      (r): CallEntry => ({
        callId: `${r.id}:${r.call_count}`,
        number: r.number,
        counterName: r.counter_name,
        calledAt: r.called_at,
      }),
    );

  return {
    serverTime: nowMs,
    businessName: settings.businessName,
    counters,
    recentCalls,
    services: waitingByService(db, date),
  };
}

interface TicketRow {
  id: number;
  service_id: number;
  service_date: string;
  seq: number;
  number: string;
  status: 'waiting' | 'called' | 'done' | 'skipped';
  call_count: number;
  called_at: number | null;
  service_name: string;
  counter_name: string | null;
}

export function findTicketServiceId(db: Db, token: string): number | null {
  return db.get<{ service_id: number }>('SELECT service_id FROM tickets WHERE public_token = ?', token)?.service_id ?? null;
}

export function buildTicket(db: Db, nowMs: number, token: string): TicketSnapshot {
  const settings = getSettings(db);
  const base = { serverTime: nowMs, businessName: settings.businessName };

  const t = db.get<TicketRow>(
    `SELECT t.id, t.service_id, t.service_date, t.seq, t.number, t.status, t.call_count, t.called_at,
            s.name AS service_name, c.name AS counter_name
       FROM tickets t
       JOIN services s ON s.id = t.service_id
       LEFT JOIN counters c ON c.id = t.counter_id
      WHERE t.public_token = ?`,
    token,
  );
  if (!t) return { ...base, state: 'not_found' };

  const common = { ...base, number: t.number, serviceName: t.service_name };
  // Any ticket from an earlier business day is dead, whatever its stored status.
  if (t.service_date < businessDate(nowMs, settings.timezone)) return { ...common, state: 'expired' };

  switch (t.status) {
    case 'waiting': {
      const ahead = db.get<{ n: number }>(
        "SELECT COUNT(*) AS n FROM tickets WHERE service_id = ? AND service_date = ? AND status = 'waiting' AND seq < ?",
        t.service_id,
        t.service_date,
        t.seq,
      );
      const position = ahead?.n ?? 0;
      return { ...common, state: 'waiting', position, near: position <= settings.nearThreshold };
    }
    case 'called':
      return {
        ...common,
        state: 'called',
        callId: `${t.id}:${t.call_count}`,
        counterName: t.counter_name ?? '',
        calledAt: t.called_at ?? nowMs,
      };
    case 'done':
      return { ...common, state: 'done' };
    case 'skipped':
      return { ...common, state: 'skipped' };
  }
}

// Returns null when the session is gone, which ends the staff stream.
export function buildStaff(db: Db, nowMs: number, tokenHash: string): StaffSnapshot | null {
  const session = peekSession(db, tokenHash, nowMs);
  if (!session) return null;
  const date = businessDate(nowMs, getSettings(db).timezone);

  const options = db
    .all<{ id: number; name: string }>('SELECT id, name FROM counters WHERE active = 1 ORDER BY sort_order, id')
    .map((c) => ({
      id: c.id,
      name: c.name,
      serviceNames: db
        .all<{ name: string }>(
          `SELECT s.name FROM counter_services cs JOIN services s ON s.id = cs.service_id
            WHERE cs.counter_id = ? ORDER BY s.sort_order, s.id`,
          c.id,
        )
        .map((s) => s.name),
    }));

  const counter = options.find((o) => o.id === session.counterId) ?? null;
  const snapshot: StaffSnapshot = {
    serverTime: nowMs,
    user: { id: session.user.id, displayName: session.user.displayName, role: session.user.role },
    counter: counter ? { id: counter.id, name: counter.name } : null,
    counterOptions: options,
    current: null,
    nextWaiting: null,
    waiting: [],
  };
  if (!counter) return snapshot;

  const cur = db.get<{ id: number; number: string; call_count: number; called_at: number | null; service_name: string }>(
    `SELECT t.id, t.number, t.call_count, t.called_at, s.name AS service_name
       FROM tickets t JOIN services s ON s.id = t.service_id
      WHERE t.counter_id = ? AND t.status = 'called' AND t.service_date = ?`,
    counter.id,
    date,
  );
  if (cur) {
    snapshot.current = {
      id: cur.id,
      number: cur.number,
      serviceName: cur.service_name,
      callCount: cur.call_count,
      calledAt: cur.called_at,
    };
  }

  const next = db.get<{ id: number; number: string; service_name: string }>(
    `SELECT t.id, t.number, s.name AS service_name
       FROM tickets t JOIN services s ON s.id = t.service_id
      WHERE t.status = 'waiting' AND t.service_date = ?
        AND t.service_id IN (SELECT service_id FROM counter_services WHERE counter_id = ?)
      ORDER BY t.created_at, t.id LIMIT 1`,
    date,
    counter.id,
  );
  if (next) snapshot.nextWaiting = { id: next.id, number: next.number, serviceName: next.service_name };

  snapshot.waiting = waitingByService(db, date, counter.id);
  return snapshot;
}
