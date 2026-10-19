import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { mkdirSync, rmSync } from 'node:fs';

export const PORT = 3100;
export const ORIGIN = `http://127.0.0.1:${PORT}`;
export const DB_PATH = './data/e2e.db';

export const ADMIN = { username: 'admin', displayName: 'Admin Uji', password: 'admin-password-1' };
export const STAFF = { username: 'petugas1', displayName: 'Petugas Satu', password: 'petugas-password-1' };

const SERVER_ENV = {
  ...process.env,
  PORT: String(PORT),
  HOST: '127.0.0.1',
  PUBLIC_URL: ORIGIN,
  DB_PATH,
};
const NODE_ARGS = ['--disable-warning=ExperimentalWarning'];

async function waitFor(check: () => Promise<boolean>, what: string, timeoutMs = 20_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for ${what}`);
}

const isUp = async (): Promise<boolean> => {
  try {
    return (await fetch(`${ORIGIN}/api/health`)).ok;
  } catch {
    return false;
  }
};

/** Owns the one Giliran server process the suite starts. Only kills the child it spawned. */
export class ServerHandle {
  private child: ChildProcess | null = null;

  resetDatabase(): void {
    mkdirSync('./data', { recursive: true });
    for (const suffix of ['', '-wal', '-shm']) rmSync(`${DB_PATH}${suffix}`, { force: true });
  }

  async createAdmin(): Promise<void> {
    const child = spawn(process.execPath, [...NODE_ARGS, 'scripts/create-admin.ts'], {
      env: SERVER_ENV,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let output = '';
    child.stdout.on('data', (chunk: Buffer) => (output += chunk.toString()));
    child.stderr.on('data', (chunk: Buffer) => (output += chunk.toString()));
    child.stdin.end(`${ADMIN.username}\n${ADMIN.displayName}\n${ADMIN.password}\n${ADMIN.password}\n`);
    const [code] = (await once(child, 'exit')) as [number | null];
    if (code !== 0) throw new Error(`create-admin failed (exit ${code}): ${output}`);
  }

  async start(): Promise<void> {
    if (this.child) throw new Error('server already started');
    if (await isUp()) throw new Error(`Port ${PORT} is already serving something that is not this suite`);
    const child = spawn(process.execPath, [...NODE_ARGS, 'src/server/index.ts'], {
      env: SERVER_ENV,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    // Drain output so the pipe never fills.
    child.stdout.resume();
    child.stderr.resume();
    this.child = child;
    child.once('exit', () => {
      if (this.child === child) this.child = null;
    });
    await waitFor(isUp, `server on port ${PORT}`);
  }

  async stop(): Promise<void> {
    const child = this.child;
    if (!child) return;
    const exited = once(child, 'exit');
    child.kill();
    await exited;
    this.child = null;
    await waitFor(async () => !(await isUp()), 'server to stop');
  }
}

/** Minimal JSON client for seeding. Every mutating call carries a matching Origin. */
export class Api {
  private cookie = '';

  async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const response = await fetch(`${ORIGIN}${path}`, {
      method,
      headers: {
        Origin: ORIGIN,
        'Content-Type': 'application/json',
        ...(this.cookie ? { Cookie: this.cookie } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const setCookie = response.headers.getSetCookie().find((c) => c.startsWith('giliran_session='));
    if (setCookie) this.cookie = setCookie.split(';')[0] ?? '';
    const text = await response.text();
    if (!response.ok) throw new Error(`${method} ${path} -> ${response.status} ${text}`);
    return (text ? JSON.parse(text) : undefined) as T;
  }

  login(username: string, password: string): Promise<unknown> {
    return this.request('POST', '/api/auth/login', { username, password });
  }
}
