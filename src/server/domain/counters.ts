import type { Db } from '../db/client.ts';
import { HttpError } from '../errors.ts';
import type { CounterDto, CreateCounterBody, UpdateCounterBody } from '../../shared/contracts.ts';

interface CounterRow {
  id: number;
  name: string;
  active: number;
  sort_order: number;
}

function toDto(r: CounterRow, serviceIds: number[]): CounterDto {
  return { id: r.id, name: r.name, active: r.active === 1, sortOrder: r.sort_order, serviceIds };
}

export function listCounters(db: Db): CounterDto[] {
  const rows = db.all<CounterRow>('SELECT id, name, active, sort_order FROM counters ORDER BY sort_order, id');
  const links = db.all<{ counter_id: number; service_id: number }>(
    'SELECT counter_id, service_id FROM counter_services ORDER BY service_id',
  );
  const byCounter = new Map<number, number[]>();
  for (const l of links) byCounter.set(l.counter_id, [...(byCounter.get(l.counter_id) ?? []), l.service_id]);
  return rows.map((r) => toDto(r, byCounter.get(r.id) ?? []));
}

export function getCounter(db: Db, id: number): CounterDto {
  const row = db.get<CounterRow>('SELECT id, name, active, sort_order FROM counters WHERE id = ?', id);
  if (!row) throw new HttpError(404, 'not_found');
  const serviceIds = db
    .all<{ service_id: number }>('SELECT service_id FROM counter_services WHERE counter_id = ? ORDER BY service_id', id)
    .map((r) => r.service_id);
  return toDto(row, serviceIds);
}

function replaceServices(db: Db, counterId: number, serviceIds: number[]): void {
  const unique = [...new Set(serviceIds)];
  if (unique.length > 0) {
    const marks = unique.map(() => '?').join(', ');
    const found = db.get<{ n: number }>(`SELECT COUNT(*) AS n FROM services WHERE id IN (${marks})`, ...unique);
    if (found?.n !== unique.length) throw new HttpError(400, 'unknown_service');
  }
  db.run('DELETE FROM counter_services WHERE counter_id = ?', counterId);
  for (const serviceId of unique) {
    db.run('INSERT INTO counter_services (counter_id, service_id) VALUES (?, ?)', counterId, serviceId);
  }
}

export function createCounter(db: Db, body: CreateCounterBody, now: number): CounterDto {
  return db.transaction(() => {
    const r = db.run(
      'INSERT INTO counters (name, active, sort_order, created_at) VALUES (?, 1, ?, ?)',
      body.name,
      body.sortOrder,
      now,
    );
    replaceServices(db, r.lastInsertRowid, body.serviceIds);
    return getCounter(db, r.lastInsertRowid);
  });
}

export function updateCounter(db: Db, id: number, patch: UpdateCounterBody): CounterDto {
  return db.transaction(() => {
    const cur = getCounter(db, id);
    db.run(
      'UPDATE counters SET name = ?, sort_order = ?, active = ? WHERE id = ?',
      patch.name ?? cur.name,
      patch.sortOrder ?? cur.sortOrder,
      (patch.active ?? cur.active) ? 1 : 0,
      id,
    );
    if (patch.serviceIds) replaceServices(db, id, patch.serviceIds);
    return getCounter(db, id);
  });
}
