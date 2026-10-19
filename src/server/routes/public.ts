import { Hono } from 'hono';
import QRCode from 'qrcode';
import type { Db } from '../db/client.ts';
import type { AppEnv } from '../http.ts';
import type { PublicServicesResponse } from '../../shared/contracts.ts';
import { getSettings } from '../domain/settings.ts';
import { listServices } from '../domain/services.ts';

export function publicRoutes(deps: { db: Db; publicUrl: string }) {
  const { db, publicUrl } = deps;
  const app = new Hono<AppEnv>();

  app.get('/qr.svg', async (c) => {
    const svg = await QRCode.toString(`${publicUrl}/take`, { type: 'svg', margin: 2 });
    return c.body(svg, 200, { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'public, max-age=300' });
  });

  app.get('/services', (c) => {
    const body: PublicServicesResponse = {
      businessName: getSettings(db).businessName,
      services: listServices(db, { activeOnly: true }).map((s) => ({ id: s.id, name: s.name, prefix: s.prefix })),
    };
    return c.json(body);
  });

  return app;
}
