import { createInterface } from 'node:readline';
import type { Interface } from 'node:readline';
import { Writable } from 'node:stream';
import { loadConfig } from '../src/server/config.ts';
import { openDb } from '../src/server/db/client.ts';
import { migrate } from '../src/server/db/migrate.ts';
import { HttpError } from '../src/server/errors.ts';
import { createUser } from '../src/server/domain/users.ts';
import { createUserBody } from '../src/shared/contracts.ts';

const interactive = Boolean(process.stdin.isTTY);
let pipedLines: AsyncIterator<string> | undefined;

// Interactive: one readline per question, output muted for passwords. Piped: read lines in order.
async function ask(question: string, hidden = false): Promise<string> {
  if (!interactive) {
    pipedLines ??= createInterface({ input: process.stdin })[Symbol.asyncIterator]();
    process.stdout.write(`${question}\n`);
    const next = await pipedLines.next();
    return next.done ? '' : next.value;
  }
  const muted = new Writable({ write: (_chunk, _enc, done) => done() });
  const rl: Interface = createInterface({
    input: process.stdin,
    output: hidden ? muted : process.stdout,
    terminal: true,
  });
  if (hidden) process.stdout.write(question);
  return new Promise((resolve) => {
    rl.question(hidden ? '' : question, (answer) => {
      rl.close();
      if (hidden) process.stdout.write('\n');
      resolve(answer);
    });
  });
}

async function main() {
  const config = loadConfig();
  const db = openDb(config.dbPath);
  migrate(db);

  try {
    const username = await ask('Username: ');
    const displayName = await ask('Display name: ');
    const password = await ask('Password (min 8 characters): ', true);
    if (interactive && password !== (await ask('Repeat password: ', true))) {
      throw new Error('Passwords do not match.');
    }

    const parsed = createUserBody.safeParse({ username, displayName, password, role: 'admin' });
    if (!parsed.success) {
      throw new Error(parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('\n'));
    }
    const user = await createUser(db, parsed.data, Date.now());
    console.log(`Admin "${user.username}" created.`);
  } finally {
    db.close();
  }
}

main().catch((err: unknown) => {
  if (err instanceof HttpError && err.code === 'username_taken') {
    console.error('That username already exists. Nothing was changed.');
  } else {
    console.error(err instanceof Error ? err.message : err);
  }
  process.exit(1);
});
