import { Hono } from 'hono';
import type { Db } from '../db/client.ts';
import { parseBody, parseId } from '../http.ts';
import type { AppEnv } from '../http.ts';
import { requireAdmin } from '../auth/guard.ts';
import type { Hub } from '../realtime/hub.ts';
import {
  createCounterBody,
  createServiceBody,
  createUserBody,
  resetPasswordBody,
  updateCounterBody,
  updateServiceBody,
  updateSettingsBody,
  updateUserBody,
} from '../../shared/contracts.ts';
import { getSettings, updateSettings } from '../domain/settings.ts';
import { createService, listServices, updateService } from '../domain/services.ts';
import { createCounter, listCounters, updateCounter } from '../domain/counters.ts';
import { createUser, listUsers, resetPassword, updateUser } from '../domain/users.ts';

export function adminRoutes(deps: { db: Db; now: () => number; hub: Hub }) {
  const { db, now, hub } = deps;
  const app = new Hono<AppEnv>();
  app.use('*', requireAdmin);
  // Names, assignments, and thresholds feed every view, so any successful admin write refreshes all.
  app.use('*', async (c, next) => {
    await next();
    if (c.req.method !== 'GET' && c.res.status < 400) hub.notifyAll();
  });

  app.get('/settings', (c) => c.json(getSettings(db)));
  app.put('/settings', async (c) => c.json(updateSettings(db, await parseBody(c, updateSettingsBody), now())));

  app.get('/services', (c) => c.json({ services: listServices(db) }));
  app.post('/services', async (c) =>
    c.json(createService(db, await parseBody(c, createServiceBody), now()), 201),
  );
  app.patch('/services/:id', async (c) =>
    c.json(updateService(db, parseId(c.req.param('id')), await parseBody(c, updateServiceBody))),
  );

  app.get('/counters', (c) => c.json({ counters: listCounters(db) }));
  app.post('/counters', async (c) =>
    c.json(createCounter(db, await parseBody(c, createCounterBody), now()), 201),
  );
  app.patch('/counters/:id', async (c) =>
    c.json(updateCounter(db, parseId(c.req.param('id')), await parseBody(c, updateCounterBody), now())),
  );

  app.get('/users', (c) => c.json({ users: listUsers(db) }));
  app.post('/users', async (c) => c.json(await createUser(db, await parseBody(c, createUserBody), now()), 201));
  app.patch('/users/:id', async (c) => {
    const actor = c.get('auth');
    const patch = await parseBody(c, updateUserBody);
    return c.json(updateUser(db, parseId(c.req.param('id')), patch, actor?.user.id ?? 0));
  });
  app.post('/users/:id/password', async (c) => {
    const id = parseId(c.req.param('id'));
    const body = await parseBody(c, resetPasswordBody);
    await resetPassword(db, id, body.password);
    return c.json({ ok: true });
  });

  return app;
}
