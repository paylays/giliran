import { serve } from '@hono/node-server';
import { createApp } from './app.ts';
import { loadConfig } from './config.ts';
import { openDb } from './db/client.ts';
import { migrate } from './db/migrate.ts';
import { serveStatic } from './static.ts';

const config = loadConfig();
const db = openDb(config.dbPath);
const applied = migrate(db);
if (applied.length > 0) console.log(`Applied migrations: ${applied.join(', ')}`);

const app = createApp({ db, now: Date.now, publicUrl: config.publicUrl });
app.get('*', serveStatic('dist/web'));

const server = serve({ fetch: app.fetch, hostname: config.host, port: config.port }, (info) => {
  console.log(`Giliran listening on http://${config.host}:${info.port}`);
});

function shutdown() {
  server.close(() => {
    db.close();
    process.exit(0);
  });
  setTimeout(() => process.exit(0), 1000).unref();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
