import type { Db } from '../db/client.ts';
import { isUniqueViolation } from '../db/client.ts';
import { HttpError } from '../errors.ts';
import { hashPassword } from '../auth/password.ts';
import { deleteUserSessions } from '../auth/sessions.ts';
import type { CreateUserBody, UpdateUserBody, UserDto } from '../../shared/contracts.ts';

interface UserRow {
  id: number;
  username: string;
  display_name: string;
  password_hash: string;
  role: 'admin' | 'staff';
  active: number;
  created_at: number;
}

const COLUMNS = 'id, username, display_name, password_hash, role, active, created_at';

function toDto(r: UserRow): UserDto {
  return {
    id: r.id,
    username: r.username,
    displayName: r.display_name,
    role: r.role,
    active: r.active === 1,
    createdAt: r.created_at,
  };
}

export function listUsers(db: Db): UserDto[] {
  return db.all<UserRow>(`SELECT ${COLUMNS} FROM users ORDER BY role, username`).map(toDto);
}

export function getUser(db: Db, id: number): UserDto {
  const row = db.get<UserRow>(`SELECT ${COLUMNS} FROM users WHERE id = ?`, id);
  if (!row) throw new HttpError(404, 'not_found');
  return toDto(row);
}

export function findCredentials(db: Db, username: string): { user: UserDto; passwordHash: string } | null {
  const row = db.get<UserRow>(`SELECT ${COLUMNS} FROM users WHERE username = ? AND active = 1`, username);
  return row ? { user: toDto(row), passwordHash: row.password_hash } : null;
}

export async function createUser(db: Db, body: CreateUserBody, now: number): Promise<UserDto> {
  const hash = await hashPassword(body.password);
  try {
    const r = db.run(
      'INSERT INTO users (username, display_name, password_hash, role, active, created_at) VALUES (?, ?, ?, ?, 1, ?)',
      body.username,
      body.displayName,
      hash,
      body.role,
      now,
    );
    return getUser(db, r.lastInsertRowid);
  } catch (err) {
    if (isUniqueViolation(err)) throw new HttpError(409, 'username_taken');
    throw err;
  }
}

export function updateUser(db: Db, id: number, patch: UpdateUserBody, actorId: number): UserDto {
  return db.transaction(() => {
    const current = getUser(db, id);
    if (patch.active === false && id === actorId) throw new HttpError(409, 'cannot_deactivate_self');
    const active = patch.active ?? current.active;
    db.run(
      'UPDATE users SET display_name = ?, active = ? WHERE id = ?',
      patch.displayName ?? current.displayName,
      active ? 1 : 0,
      id,
    );
    if (!active) deleteUserSessions(db, id);
    return getUser(db, id);
  });
}

export async function resetPassword(db: Db, id: number, password: string): Promise<void> {
  getUser(db, id);
  const hash = await hashPassword(password);
  db.transaction(() => {
    db.run('UPDATE users SET password_hash = ? WHERE id = ?', hash, id);
    // Anyone holding the old password must log in again.
    deleteUserSessions(db, id);
  });
}
