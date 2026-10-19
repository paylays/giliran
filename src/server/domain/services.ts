import type { Db } from '../db/client.ts';
import { isUniqueViolation } from '../db/client.ts';
import { HttpError } from '../errors.ts';
import type { CreateServiceBody, ServiceDto, UpdateServiceBody } from '../../shared/contracts.ts';

interface ServiceRow {
  id: number;
  name: string;
  prefix: string;
  number_width: number;
  active: number;
  sort_order: number;
}

const COLUMNS = 'id, name, prefix, number_width, active, sort_order';

function toDto(r: ServiceRow): ServiceDto {
  return {
    id: r.id,
    name: r.name,
    prefix: r.prefix,
    numberWidth: r.number_width,
    active: r.active === 1,
    sortOrder: r.sort_order,
  };
}

export function listServices(db: Db, opts: { activeOnly?: boolean } = {}): ServiceDto[] {
  const where = opts.activeOnly ? 'WHERE active = 1' : '';
  return db.all<ServiceRow>(`SELECT ${COLUMNS} FROM services ${where} ORDER BY sort_order, id`).map(toDto);
}

export function getService(db: Db, id: number): ServiceDto {
  const row = db.get<ServiceRow>(`SELECT ${COLUMNS} FROM services WHERE id = ?`, id);
  if (!row) throw new HttpError(404, 'not_found');
  return toDto(row);
}

export function createService(db: Db, body: CreateServiceBody, now: number): ServiceDto {
  try {
    const r = db.run(
      'INSERT INTO services (name, prefix, number_width, active, sort_order, created_at) VALUES (?, ?, ?, 1, ?, ?)',
      body.name,
      body.prefix,
      body.numberWidth,
      body.sortOrder,
      now,
    );
    return getService(db, r.lastInsertRowid);
  } catch (err) {
    if (isUniqueViolation(err)) throw new HttpError(409, 'prefix_taken');
    throw err;
  }
}

export function updateService(db: Db, id: number, patch: UpdateServiceBody): ServiceDto {
  const cur = getService(db, id);
  try {
    db.run(
      'UPDATE services SET name = ?, prefix = ?, number_width = ?, sort_order = ?, active = ? WHERE id = ?',
      patch.name ?? cur.name,
      patch.prefix ?? cur.prefix,
      patch.numberWidth ?? cur.numberWidth,
      patch.sortOrder ?? cur.sortOrder,
      (patch.active ?? cur.active) ? 1 : 0,
      id,
    );
  } catch (err) {
    if (isUniqueViolation(err)) throw new HttpError(409, 'prefix_taken');
    throw err;
  }
  return getService(db, id);
}
