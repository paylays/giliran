import { DatabaseSync } from 'node:sqlite';
import type { SQLInputValue } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export type SqlParam = SQLInputValue;

export interface RunResult {
  changes: number;
  lastInsertRowid: number;
}

// The only door to SQLite. Swapping the driver means rewriting this file.
export interface Db {
  exec(sql: string): void;
  run(sql: string, ...params: SqlParam[]): RunResult;
  get<T>(sql: string, ...params: SqlParam[]): T | undefined;
  all<T>(sql: string, ...params: SqlParam[]): T[];
  // BEGIN IMMEDIATE so writers queue up instead of failing on lock upgrade. fn must be synchronous.
  transaction<T>(fn: () => T): T;
  close(): void;
}

export function openDb(path: string): Db {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const raw = new DatabaseSync(path);
  raw.exec('PRAGMA journal_mode = WAL');
  raw.exec('PRAGMA synchronous = NORMAL');
  raw.exec('PRAGMA busy_timeout = 5000');
  raw.exec('PRAGMA foreign_keys = ON');

  let depth = 0;

  return {
    exec: (sql) => raw.exec(sql),
    run(sql, ...params) {
      const r = raw.prepare(sql).run(...params);
      return { changes: Number(r.changes), lastInsertRowid: Number(r.lastInsertRowid) };
    },
    get<T>(sql: string, ...params: SqlParam[]) {
      return raw.prepare(sql).get(...params) as T | undefined;
    },
    all<T>(sql: string, ...params: SqlParam[]) {
      return raw.prepare(sql).all(...params) as T[];
    },
    transaction<T>(fn: () => T): T {
      // Nested calls join the outer transaction.
      if (depth > 0) return fn();
      raw.exec('BEGIN IMMEDIATE');
      depth = 1;
      try {
        const result = fn();
        raw.exec('COMMIT');
        return result;
      } catch (err) {
        raw.exec('ROLLBACK');
        throw err;
      } finally {
        depth = 0;
      }
    },
    close: () => raw.close(),
  };
}

export function isUniqueViolation(err: unknown): boolean {
  return err instanceof Error && err.message.includes('UNIQUE constraint failed');
}
