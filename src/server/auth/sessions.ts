import { createHash, randomBytes } from 'node:crypto';
import type { Db } from '../db/client.ts';
import type { AuthUser } from '../../shared/contracts.ts';

export const SESSION_COOKIE = 'giliran_session';
export const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
// Idle expiry slides forward, but not on every request.
const TOUCH_AFTER_MS = 60 * 1000;

export interface LiveSession {
  user: AuthUser;
  tokenHash: string;
  counterId: number | null;
  // True when expires_at was pushed forward and the cookie should be re-issued.
  extended: boolean;
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function createSession(db: Db, userId: number, now: number): string {
  const token = randomBytes(32).toString('base64url');
  db.run(
    'INSERT INTO sessions (token_hash, user_id, counter_id, expires_at, created_at) VALUES (?, ?, NULL, ?, ?)',
    hashToken(token),
    userId,
    now + SESSION_TTL_MS,
    now,
  );
  db.run('DELETE FROM sessions WHERE expires_at <= ?', now);
  return token;
}

interface SessionRow {
  token_hash: string;
  counter_id: number | null;
  expires_at: number;
  id: number;
  username: string;
  display_name: string;
  role: 'admin' | 'staff';
}

export function findSession(db: Db, token: string, now: number): LiveSession | null {
  const tokenHash = hashToken(token);
  const row = db.get<SessionRow>(
    `SELECT s.token_hash, s.counter_id, s.expires_at, u.id, u.username, u.display_name, u.role
       FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = ? AND s.expires_at > ? AND u.active = 1`,
    tokenHash,
    now,
  );
  if (!row) return null;

  const extended = row.expires_at - now < SESSION_TTL_MS - TOUCH_AFTER_MS;
  if (extended) {
    db.run('UPDATE sessions SET expires_at = ? WHERE token_hash = ?', now + SESSION_TTL_MS, tokenHash);
  }
  return {
    user: { id: row.id, username: row.username, displayName: row.display_name, role: row.role },
    tokenHash,
    counterId: row.counter_id,
    extended,
  };
}

export function deleteSession(db: Db, tokenHash: string): void {
  db.run('DELETE FROM sessions WHERE token_hash = ?', tokenHash);
}

export function deleteUserSessions(db: Db, userId: number): void {
  db.run('DELETE FROM sessions WHERE user_id = ?', userId);
}
