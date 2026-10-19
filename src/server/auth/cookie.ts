import type { CookieOptions } from 'hono/utils/cookie';
import { SESSION_TTL_MS } from './sessions.ts';

export function sessionCookieOptions(secure: boolean): CookieOptions {
  return {
    httpOnly: true,
    sameSite: 'Lax',
    path: '/',
    secure,
    maxAge: SESSION_TTL_MS / 1000,
  };
}
