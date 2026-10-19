import { Hono } from 'hono';
import { deleteCookie, setCookie } from 'hono/cookie';
import type { Db } from '../db/client.ts';
import { HttpError } from '../errors.ts';
import { clientIp, parseBody } from '../http.ts';
import type { AppEnv } from '../http.ts';
import { loginBody } from '../../shared/contracts.ts';
import { verifyAgainstDecoy, verifyPassword } from '../auth/password.ts';
import { SESSION_COOKIE, createSession, deleteSession } from '../auth/sessions.ts';
import { sessionCookieOptions } from '../auth/cookie.ts';
import { createFailureLimiter } from '../auth/rate-limit.ts';
import { findCredentials } from '../domain/users.ts';

export function authRoutes(deps: { db: Db; now: () => number; secure: boolean }) {
  const { db, now, secure } = deps;
  const app = new Hono<AppEnv>();
  const limiter = createFailureLimiter({ max: 5, windowMs: 60_000, now });

  app.post('/login', async (c) => {
    const body = await parseBody(c, loginBody);
    const username = body.username.toLowerCase();
    const key = `${username}|${clientIp(c)}`;

    const wait = limiter.blockedFor(key);
    if (wait > 0) {
      c.header('Retry-After', String(wait));
      throw new HttpError(429, 'too_many_attempts');
    }

    // Counted before the await so a burst of parallel attempts cannot all pass the check above.
    limiter.fail(key);
    const found = findCredentials(db, username);
    const ok = found ? await verifyPassword(body.password, found.passwordHash) : await verifyAgainstDecoy(body.password);
    if (!found || !ok) {
      throw new HttpError(401, 'invalid_credentials');
    }

    limiter.reset(key);
    const token = createSession(db, found.user.id, now());
    setCookie(c, SESSION_COOKIE, token, sessionCookieOptions(secure));
    const { id, username: name, displayName, role } = found.user;
    return c.json({ user: { id, username: name, displayName, role } });
  });

  app.post('/logout', (c) => {
    const auth = c.get('auth');
    if (auth) deleteSession(db, auth.tokenHash);
    deleteCookie(c, SESSION_COOKIE, { path: '/', secure });
    return c.json({ ok: true });
  });

  app.get('/me', (c) => {
    const auth = c.get('auth');
    if (!auth) throw new HttpError(401, 'unauthenticated');
    return c.json({ user: auth.user, counterId: auth.counterId });
  });

  return app;
}
