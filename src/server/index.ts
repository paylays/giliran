import { serve } from '@hono/node-server';
import { createApp } from './app.ts';
import { loadConfig } from './config.ts';
import { serveStatic } from './static.ts';

const config = loadConfig();
const app = createApp({ now: Date.now });
app.get('*', serveStatic('dist/web'));

const server = serve({ fetch: app.fetch, hostname: config.host, port: config.port }, (info) => {
  console.log(`Giliran listening on http://${config.host}:${info.port}`);
});

function shutdown() {
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 1000).unref();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
