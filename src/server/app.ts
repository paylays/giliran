import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import type { Db } from './db/client.ts';
import { HttpError } from './errors.ts';
import type { AppEnv } from './http.ts';
import { loadSession, originCheck } from './auth/guard.ts';
import { authRoutes } from './routes/auth.ts';
import { adminRoutes } from './routes/admin.ts';
import { publicRoutes } from './routes/public.ts';

export interface AppDeps {
  db: Db;
  now: () => number;
  publicUrl: string;
}

export function createApp(deps: Pick<AppDeps, 'db'> & Partial<AppDeps>) {
  const { db, now = Date.now, publicUrl = 'http://localhost:3000' } = deps;
  const secure = publicUrl.startsWith('https://');
  const app = new Hono<AppEnv>();

  app.onError((err, c) => {
    if (err instanceof HttpError) {
      return c.json({ error: err.code, ...(err.details ? { issues: err.details } : {}) }, err.status as 400);
    }
    console.error(err);
    return c.json({ error: 'internal' }, 500);
  });

  app.use('/api/*', bodyLimit({ maxSize: 64 * 1024, onError: (c) => c.json({ error: 'too_large' }, 413) }));
  app.use('/api/*', originCheck(publicUrl));
  app.use('/api/*', loadSession({ db, now, secure }));

  app.get('/api/health', (c) => c.json({ ok: true, time: now() }));
  app.route('/api/auth', authRoutes({ db, now, secure }));
  app.route('/api/admin', adminRoutes({ db, now }));
  app.route('/api', publicRoutes({ db, publicUrl }));

  app.all('/api/*', (c) => c.json({ error: 'not_found' }, 404));

  return app;
}

export type App = ReturnType<typeof createApp>;
