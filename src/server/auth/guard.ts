import type { MiddlewareHandler } from 'hono';
import { getCookie, setCookie } from 'hono/cookie';
import type { Db } from '../db/client.ts';
import { HttpError } from '../errors.ts';
import type { AppEnv } from '../http.ts';
import { SESSION_COOKIE, findSession } from './sessions.ts';
import { sessionCookieOptions } from './cookie.ts';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

// CSRF defense: every mutating request must carry an Origin that matches this server.
export function originCheck(publicUrl: string): MiddlewareHandler {
  const publicHost = new URL(publicUrl).host;
  return async (c, next) => {
    if (SAFE_METHODS.has(c.req.method)) return next();
    let originHost: string;
    try {
      originHost = new URL(c.req.header('origin') ?? '').host;
    } catch {
      throw new HttpError(403, 'bad_origin');
    }
    const requestHost = c.req.header('host') ?? new URL(c.req.url).host;
    if (originHost !== requestHost && originHost !== publicHost) throw new HttpError(403, 'bad_origin');
    return next();
  };
}

// Loads the session behind the cookie, if any. Never rejects: the guards below decide.
export function loadSession(deps: { db: Db; now: () => number; secure: boolean }): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    c.set('auth', null);
    const token = getCookie(c, SESSION_COOKIE);
    if (token) {
      const session = findSession(deps.db, token, deps.now());
      if (session) {
        c.set('auth', { user: session.user, tokenHash: session.tokenHash, counterId: session.counterId });
        if (session.extended) setCookie(c, SESSION_COOKIE, token, sessionCookieOptions(deps.secure));
      }
    }
    return next();
  };
}

export const requireUser: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (!c.get('auth')) throw new HttpError(401, 'unauthenticated');
  return next();
};

export const requireAdmin: MiddlewareHandler<AppEnv> = async (c, next) => {
  const auth = c.get('auth');
  if (!auth) throw new HttpError(401, 'unauthenticated');
  if (auth.user.role !== 'admin') throw new HttpError(403, 'forbidden');
  return next();
};
