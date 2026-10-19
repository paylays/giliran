import { Hono } from 'hono';
import type { Db } from '../db/client.ts';
import { HttpError } from '../errors.ts';
import type { AppEnv } from '../http.ts';
import { requireUser } from '../auth/guard.ts';
import { peekSession } from '../auth/sessions.ts';
import type { Hub } from '../realtime/hub.ts';
import { sseResponse } from '../realtime/sse.ts';
import { buildDisplay, buildStaff, buildTicket, findTicketServiceId } from '../realtime/snapshots.ts';

export function streamRoutes(deps: { db: Db; now: () => number; hub: Hub }) {
  const { db, now, hub } = deps;
  const app = new Hono<AppEnv>();

  app.get('/display', (c) =>
    sseResponse(c.req.raw, hub, now, {
      topic: { kind: 'display' },
      snapshot: () => buildDisplay(db, now()),
    }),
  );

  app.get('/ticket/:token', (c) => {
    const token = c.req.param('token');
    return sseResponse(c.req.raw, hub, now, {
      topic: { kind: 'ticket', serviceId: findTicketServiceId(db, token) },
      snapshot: () => buildTicket(db, now(), token),
    });
  });

  app.get('/staff', requireUser, (c) => {
    const auth = c.get('auth');
    if (!auth) throw new HttpError(401, 'unauthenticated');
    const { tokenHash } = auth;
    return sseResponse(c.req.raw, hub, now, {
      topic: { kind: 'staff' },
      snapshot: () => buildStaff(db, now(), tokenHash),
      alive: () => peekSession(db, tokenHash, now()) !== null,
    });
  });

  return app;
}
