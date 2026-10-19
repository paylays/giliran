import { Hono } from 'hono';
import QRCode from 'qrcode';
import type { Db } from '../db/client.ts';
import { HttpError } from '../errors.ts';
import { clientIp, parseBody } from '../http.ts';
import type { AppEnv } from '../http.ts';
import { takeTicketBody } from '../../shared/contracts.ts';
import type { AlreadyActiveResponse, PublicServicesResponse, TakeTicketResponse } from '../../shared/contracts.ts';
import { createFailureLimiter } from '../auth/rate-limit.ts';
import { getSettings } from '../domain/settings.ts';
import { buildWifiPayload } from '../domain/wifi.ts';
import { listServices } from '../domain/services.ts';
import { takeTicket } from '../domain/tickets.ts';
import type { Hub } from '../realtime/hub.ts';

export function publicRoutes(deps: { db: Db; now: () => number; publicUrl: string; hub: Hub }) {
  const { db, now, publicUrl, hub } = deps;
  const app = new Hono<AppEnv>();
  // 10 tickets per 10 minutes per IP; only issued tickets count.
  const takeLimiter = createFailureLimiter({ max: 10, windowMs: 10 * 60_000, now });

  app.get('/qr.svg', async (c) => {
    const svg = await QRCode.toString(`${publicUrl}/take`, { type: 'svg', margin: 2 });
    return c.body(svg, 200, { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'public, max-age=300' });
  });

  app.get('/wifi-qr.svg', async (c) => {
    const { wifiSsid, wifiPassword, wifiSecurity } = getSettings(db);
    if (!wifiSsid) throw new HttpError(404, 'wifi_not_set');
    const svg = await QRCode.toString(buildWifiPayload(wifiSsid, wifiPassword, wifiSecurity), { type: 'svg', margin: 2 });
    // Carries the Wi-Fi password and must reflect a password change immediately.
    return c.body(svg, 200, { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'no-store' });
  });

  app.get('/services', (c) => {
    const body: PublicServicesResponse = {
      businessName: getSettings(db).businessName,
      services: listServices(db, { activeOnly: true }).map((s) => ({ id: s.id, name: s.name, prefix: s.prefix })),
    };
    return c.json(body);
  });

  app.post('/tickets', async (c) => {
    const body = await parseBody(c, takeTicketBody);
    const ip = clientIp(c);

    const wait = takeLimiter.blockedFor(ip);
    if (wait > 0) {
      c.header('Retry-After', String(wait));
      throw new HttpError(429, 'too_many_tickets');
    }

    const result = takeTicket(db, body, now());
    if (result.kind === 'already_active') {
      const conflict: AlreadyActiveResponse = { error: 'already_active', token: result.token, number: result.number };
      return c.json(conflict, 409);
    }
    takeLimiter.fail(ip);
    hub.notify({ serviceIds: [result.serviceId] });
    const created: TakeTicketResponse = { token: result.token, number: result.number };
    return c.json(created, 201);
  });

  return app;
}
