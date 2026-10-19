import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import type { Db } from './client.ts';

const defaultDir = fileURLToPath(new URL('./migrations', import.meta.url));

// Applies pending NNN_name.sql files in order and returns the versions it applied.
// NNN_name.down.sql files are manual rollback scripts and are never run here.
export function migrate(db: Db, dir: string = defaultDir, now: number = Date.now()): string[] {
  db.exec(
    'CREATE TABLE IF NOT EXISTS schema_migrations (version TEXT PRIMARY KEY, applied_at INTEGER NOT NULL)',
  );
  const done = new Set(db.all<{ version: string }>('SELECT version FROM schema_migrations').map((r) => r.version));
  const files = readdirSync(dir)
    .filter((f) => /^\d+_.+\.sql$/.test(f) && !f.endsWith('.down.sql'))
    .sort();

  const applied: string[] = [];
  for (const file of files) {
    const version = file.slice(0, -'.sql'.length);
    if (done.has(version)) continue;
    const sql = readFileSync(join(dir, file), 'utf8');
    db.transaction(() => {
      db.exec(sql);
      db.run('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)', version, now);
    });
    applied.push(version);
  }
  return applied;
}
