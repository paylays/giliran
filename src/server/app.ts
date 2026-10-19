import { Hono } from 'hono';

export interface AppDeps {
  now: () => number;
  // The database handle is added here once the DB layer exists.
}

export function createApp(deps: Partial<AppDeps> = {}) {
  const { now = Date.now } = deps;
  const app = new Hono();

  app.get('/api/health', (c) => c.json({ ok: true, time: now() }));

  app.all('/api/*', (c) => c.json({ error: 'not_found' }, 404));

  return app;
}

export type App = ReturnType<typeof createApp>;
