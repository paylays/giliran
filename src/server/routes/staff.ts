import { Hono } from 'hono';
import type { Context } from 'hono';
import type { Db } from '../db/client.ts';
import { HttpError } from '../errors.ts';
import { parseBody } from '../http.ts';
import type { AppEnv } from '../http.ts';
import { requireUser } from '../auth/guard.ts';
import { callNextBody, selectCounterBody, ticketActionBody } from '../../shared/contracts.ts';
import { callNext, finish, recall, selectCounter } from '../domain/tickets.ts';
import type { TransitionResult } from '../domain/tickets.ts';
import type { Hub } from '../realtime/hub.ts';
import { buildStaff } from '../realtime/snapshots.ts';

export function staffRoutes(deps: { db: Db; now: () => number; hub: Hub }) {
  const { db, now, hub } = deps;
  const app = new Hono<AppEnv>();
  app.use('*', requireUser);

  function auth(c: Context<AppEnv>) {
    const a = c.get('auth');
    if (!a) throw new HttpError(401, 'unauthenticated');
    return a;
  }

  // Read from the session row, not the request context, so a pick made a moment ago is seen.
  function sessionCounterId(c: Context<AppEnv>): number | null {
    const row = db.get<{ counter_id: number | null }>(
      'SELECT counter_id FROM sessions WHERE token_hash = ?',
      auth(c).tokenHash,
    );
    return row?.counter_id ?? null;
  }

  // Pass notify: false for reads. A counter pick has no ticket change but still moves the views.
  function respond(c: Context<AppEnv>, result: TransitionResult | null, notify = true) {
    if (notify) hub.notify({ serviceIds: result?.serviceIds ?? [] });
    const snapshot = buildStaff(db, now(), auth(c).tokenHash);
    if (!snapshot) throw new HttpError(401, 'unauthenticated');
    return c.json(snapshot);
  }

  app.get('/snapshot', (c) => respond(c, null, false));

  app.post('/counter', async (c) => {
    const { counterId } = await parseBody(c, selectCounterBody);
    selectCounter(db, auth(c).tokenHash, counterId);
    return respond(c, null);
  });

  app.post('/call-next', async (c) => {
    const body = await parseBody(c, callNextBody);
    const result = callNext(
      db,
      { counterId: sessionCounterId(c), userId: auth(c).user.id, expectedCurrentTicketId: body.expectedCurrentTicketId },
      now(),
    );
    return respond(c, result);
  });

  app.post('/recall', async (c) => {
    const { ticketId } = await parseBody(c, ticketActionBody);
    return respond(c, recall(db, { counterId: sessionCounterId(c), ticketId }, now()));
  });

  app.post('/skip', async (c) => {
    const { ticketId } = await parseBody(c, ticketActionBody);
    return respond(c, finish(db, 'skipped', { counterId: sessionCounterId(c), ticketId }, now()));
  });

  app.post('/done', async (c) => {
    const { ticketId } = await parseBody(c, ticketActionBody);
    return respond(c, finish(db, 'done', { counterId: sessionCounterId(c), ticketId }, now()));
  });

  return app;
}
