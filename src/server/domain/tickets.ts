import { randomBytes } from 'node:crypto';
import type { Db } from '../db/client.ts';
import { HttpError } from '../errors.ts';
import { businessDate } from '../../shared/business-date.ts';
import { formatTicketNumber } from '../../shared/ticket-number.ts';
import { getSettings } from './settings.ts';

export type TakeResult =
  | { kind: 'created'; token: string; number: string; serviceId: number }
  | { kind: 'already_active'; token: string; number: string };

interface ServiceRow {
  prefix: string;
  number_width: number;
  active: number;
}

// A called ticket from an earlier day can never be served again and would block its counter
// through the one-called-per-counter index, so it is closed as skipped.
export function closeStaleCalls(db: Db, nowMs: number): number {
  const today = businessDate(nowMs, getSettings(db).timezone);
  return db.run(
    "UPDATE tickets SET status = 'skipped', finished_at = ? WHERE status = 'called' AND service_date < ?",
    nowMs,
    today,
  ).changes;
}

export function takeTicket(db: Db, input: { serviceId: number; knownTokens: string[] }, nowMs: number): TakeResult {
  return db.transaction(() => {
    const service = db.get<ServiceRow>('SELECT prefix, number_width, active FROM services WHERE id = ?', input.serviceId);
    if (!service) throw new HttpError(404, 'not_found');
    if (service.active !== 1) throw new HttpError(409, 'service_inactive');

    const date = businessDate(nowMs, getSettings(db).timezone);

    const tokens = [...new Set(input.knownTokens)];
    if (tokens.length > 0) {
      const marks = tokens.map(() => '?').join(', ');
      const held = db.get<{ public_token: string; number: string }>(
        `SELECT public_token, number FROM tickets
          WHERE public_token IN (${marks}) AND service_id = ? AND service_date = ? AND status IN ('waiting', 'called')
          LIMIT 1`,
        ...tokens,
        input.serviceId,
        date,
      );
      if (held) return { kind: 'already_active', token: held.public_token, number: held.number };
    }

    const seq = db.get<{ last_number: number }>(
      `INSERT INTO daily_sequences (service_id, service_date, last_number) VALUES (?, ?, 1)
       ON CONFLICT (service_id, service_date) DO UPDATE SET last_number = last_number + 1
       RETURNING last_number`,
      input.serviceId,
      date,
    );
    if (!seq) throw new Error('daily_sequences upsert returned no row');

    const number = formatTicketNumber(service.prefix, seq.last_number, service.number_width);
    const token = randomBytes(16).toString('base64url');
    db.run(
      `INSERT INTO tickets (public_token, service_id, service_date, seq, number, status, call_count, created_at)
       VALUES (?, ?, ?, ?, ?, 'waiting', 0, ?)`,
      token,
      input.serviceId,
      date,
      seq.last_number,
      number,
      nowMs,
    );
    return { kind: 'created', token, number, serviceId: input.serviceId };
  });
}

// ---- Counter-side transitions ----

export function selectCounter(db: Db, tokenHash: string, counterId: number): void {
  const counter = db.get<{ active: number }>('SELECT active FROM counters WHERE id = ?', counterId);
  if (!counter) throw new HttpError(404, 'not_found');
  if (counter.active !== 1) throw new HttpError(409, 'counter_inactive');
  db.run('UPDATE sessions SET counter_id = ? WHERE token_hash = ?', counterId, tokenHash);
}

function assertUsableCounter(db: Db, counterId: number | null): number {
  if (counterId === null) throw new HttpError(409, 'no_counter');
  const counter = db.get<{ active: number }>('SELECT active FROM counters WHERE id = ?', counterId);
  if (!counter || counter.active !== 1) throw new HttpError(409, 'counter_inactive');
  return counterId;
}

export interface TransitionResult {
  serviceIds: number[];
}

export function callNext(
  db: Db,
  input: { counterId: number | null; userId: number; expectedCurrentTicketId: number | null },
  nowMs: number,
): TransitionResult {
  return db.transaction(() => {
    const counterId = assertUsableCounter(db, input.counterId);
    closeStaleCalls(db, nowMs);
    const date = businessDate(nowMs, getSettings(db).timezone);
    const serviceIds: number[] = [];

    const current = db.get<{ id: number; service_id: number }>(
      "SELECT id, service_id FROM tickets WHERE counter_id = ? AND status = 'called'",
      counterId,
    );
    if ((current?.id ?? null) !== input.expectedCurrentTicketId) throw new HttpError(409, 'stale_state');

    // Calling the next ticket finishes the current one.
    if (current) {
      db.run("UPDATE tickets SET status = 'done', finished_at = ? WHERE id = ?", nowMs, current.id);
      serviceIds.push(current.service_id);
    }

    // FIFO across every service of the counter; the subselect and the update run as one statement.
    const next = db.get<{ service_id: number }>(
      `UPDATE tickets
          SET status = 'called', counter_id = ?, called_by = ?, call_count = 1, called_at = ?
        WHERE id = (
          SELECT t.id FROM tickets t
           WHERE t.status = 'waiting' AND t.service_date = ?
             AND t.service_id IN (SELECT service_id FROM counter_services WHERE counter_id = ?)
           ORDER BY t.created_at, t.id
           LIMIT 1)
        RETURNING service_id`,
      counterId,
      input.userId,
      nowMs,
      date,
      counterId,
    );
    if (next) serviceIds.push(next.service_id);
    return { serviceIds };
  });
}

// Moves the counter's own called ticket; anything else (wrong id, already moved) is a 409.
function transition(db: Db, sql: string, params: (string | number)[], ticketId: number): TransitionResult {
  const row = db.get<{ service_id: number }>('SELECT service_id FROM tickets WHERE id = ?', ticketId);
  const r = db.run(sql, ...params);
  if (r.changes === 0 || !row) throw new HttpError(409, 'invalid_transition');
  return { serviceIds: [row.service_id] };
}

export function recall(db: Db, input: { counterId: number | null; ticketId: number }, nowMs: number): TransitionResult {
  const counterId = assertUsableCounter(db, input.counterId);
  return transition(
    db,
    "UPDATE tickets SET call_count = call_count + 1, called_at = ? WHERE id = ? AND counter_id = ? AND status = 'called'",
    [nowMs, input.ticketId, counterId],
    input.ticketId,
  );
}

export function finish(
  db: Db,
  status: 'done' | 'skipped',
  input: { counterId: number | null; ticketId: number },
  nowMs: number,
): TransitionResult {
  const counterId = assertUsableCounter(db, input.counterId);
  return transition(
    db,
    "UPDATE tickets SET status = ?, finished_at = ? WHERE id = ? AND counter_id = ? AND status = 'called'",
    [status, nowMs, input.ticketId, counterId],
    input.ticketId,
  );
}
