import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';
import type { Context } from 'hono';

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.map': 'application/json; charset=utf-8',
};

async function readIfFile(path: string): Promise<Buffer | null> {
  try {
    if (!(await stat(path)).isFile()) return null;
    return await readFile(path);
  } catch {
    return null;
  }
}

export function serveStatic(rootDir: string) {
  const root = resolve(rootDir);

  return async (c: Context) => {
    const path = c.req.path;
    if (path === '/api' || path.startsWith('/api/')) return c.json({ error: 'not_found' }, 404);

    let rel: string;
    try {
      rel = normalize(decodeURIComponent(path));
    } catch {
      return c.text('Bad request', 400);
    }
    const file = join(root, rel);
    if (file !== root && !file.startsWith(root + sep)) return c.text('Bad request', 400);

    const asset = await readIfFile(file);
    if (asset) {
      // Vite fingerprints everything under /assets, so it can be cached for good.
      const immutable = rel.startsWith(`${sep}assets${sep}`);
      return c.body(new Uint8Array(asset), 200, {
        'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream',
        'Cache-Control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache',
      });
    }

    const index = await readIfFile(join(root, 'index.html'));
    if (!index) return c.text('Web build not found. Run "npm run build".', 404);
    return c.body(new Uint8Array(index), 200, {
      'Content-Type': TYPES['.html']!,
      'Cache-Control': 'no-cache',
    });
  };
}
