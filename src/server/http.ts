import type { Context } from 'hono';
import { getConnInfo } from '@hono/node-server/conninfo';
import type { z } from 'zod';
import { HttpError } from './errors.ts';
import type { AuthUser } from '../shared/contracts.ts';

export interface AuthContext {
  user: AuthUser;
  tokenHash: string;
  counterId: number | null;
}

export type AppEnv = { Variables: { auth: AuthContext | null } };

export async function parseBody<S extends z.ZodType>(c: Context, schema: S): Promise<z.output<S>> {
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    throw new HttpError(400, 'invalid_json');
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    throw new HttpError(
      400,
      'invalid_request',
      parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    );
  }
  return parsed.data;
}

export function parseId(raw: string | undefined): number {
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) throw new HttpError(404, 'not_found');
  return n;
}

export function clientIp(c: Context): string {
  try {
    return getConnInfo(c).remote.address ?? 'unknown';
  } catch {
    // No socket behind the request (in-process calls).
    return 'unknown';
  }
}
