# Operations

Daily use, backup, upgrades, rollback and troubleshooting. For first-time setup see [setup-lan.md](setup-lan.md).

## Daily use

### Start of day

1. Make sure the server PC is on and `npm start` is running. Check `http://<server-ip>:3000/api/health`.
2. Open `/display` on the TV and click the start overlay (see [display-setup.md](display-setup.md)).
3. Staff sign in at `/login`. Each person picks a counter on `/staff`.

Numbers restart on their own at midnight in the business timezone. Tickets from an earlier day expire, and anything still called is closed. Nobody needs to reset the queue.

### Staff

On `/staff`, after you pick a counter (**Pilih loket**):

- **Panggil berikutnya** calls the oldest waiting number from the services this counter handles. If the counter still has a called number, that number is marked done automatically.
- **Panggil ulang** announces the current number again.
- **Lewati** skips the current number after a confirmation. A skipped number cannot be called again. The visitor takes a new number.
- **Selesai** finishes the current number.
- **Ganti loket** switches counter.

If another device changes the same counter, the panel shows **Data loket sudah berubah**. Check the current number before pressing again.

### Admin

In `/admin`:

- **Umum**: business name, timezone, near-turn threshold, venue Wi-Fi.
- **Layanan**: add, edit and deactivate services. A new prefix applies to later numbers only. Numbers already issued keep the old prefix.
- **Loket**: add and edit counters and their services. A counter with a called number cannot be deactivated until that number is finished.
- **Petugas**: add accounts, reset a password (**Atur ulang kata sandi**), deactivate an account. Deactivating signs that person out of every device. You cannot deactivate your own account.
- **Poster QR**: print the poster.

### Timezone

The timezone decides when the day changes. You can change it only when no number is waiting or called today. Otherwise the server refuses the change and nothing is saved. Finish or skip the open numbers first, or wait until the day ends.

### Limits

Taking numbers is limited to 10 per 10 minutes per device address. After 5 failed sign-ins in one minute for a username from one address, further tries are blocked for a short time.

## Backup and restore

All data lives in the SQLite file (default `data/giliran.db`). The database runs in WAL mode, so two companion files can sit next to it: `giliran.db-wal` and `giliran.db-shm`.

**Backup**

1. Stop the server (`Ctrl+C` in its terminal).
2. Copy `data/giliran.db` and, if present, `data/giliran.db-wal` and `data/giliran.db-shm` to a safe place. Copy all of them together.
3. Start the server again.

**Restore**

1. Stop the server.
2. Put the copied files back in the data folder. Delete any newer `-wal` and `-shm` files that are not part of the backup.
3. Start the server.

If you changed `DB_PATH`, use that folder instead of `data/`.

## Upgrades

1. Back up the database (above).
2. Stop the server.
3. Update the code, then run:
   ```bash
   npm install
   npm run build
   ```
4. Start the server with `npm start`. It applies pending migrations at start and logs `Applied migrations: ...` when it does.

Migrations run once, in order, each in a transaction. They never run automatically in reverse.

## Roll back a migration

Each migration `NNN_name.sql` in `src/server/db/migrations/` has a manual rollback, `NNN_name.down.sql`. The server never runs these files. Use them only when you must return to an older version of the code, and always back up first.

| Migration | Rollback script | Effect |
|---|---|---|
| `002_wifi` | `002_wifi.down.sql` | Drops the saved Wi-Fi columns (`wifi_ssid`, `wifi_password`, `wifi_security`) from `settings`. |
| `001_init` | `001_init.down.sql` | Drops every table. **Destroys all data.** |

Roll back in reverse order: `002_wifi` before `001_init`.

1. Stop the server and back up the database.
2. Run the `.down.sql` file against the database with any SQLite client, for example:
   ```bash
   sqlite3 data/giliran.db < src/server/db/migrations/002_wifi.down.sql
   ```
3. Remove the migration's record, using the version named in the script's header:
   ```sql
   DELETE FROM schema_migrations WHERE version = '002_wifi';
   ```
4. Switch the code to the older version before you start the server. If you start the current code, it applies the migration again.

If you have no SQLite client, save this as `rollback.mjs` in the project folder and run `node --disable-warning=ExperimentalWarning rollback.mjs`. Change the two names to the migration you are rolling back, then delete the file afterwards.

```js
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';

const version = '002_wifi';
const db = new DatabaseSync('data/giliran.db');
db.exec(readFileSync(`src/server/db/migrations/${version}.down.sql`, 'utf8'));
db.prepare('DELETE FROM schema_migrations WHERE version = ?').run(version);
db.close();
```

## Troubleshooting

### A phone cannot open the page

1. Is the phone on the venue Wi-Fi? With a Wi-Fi QR, scan code 1 first.
2. Open `http://<server-ip>:3000/api/health` in the phone's browser. If it fails, the phone cannot reach the server.
3. Is the server running, and is the server PC awake?
4. Windows firewall: check the rule from [setup-lan.md](setup-lan.md#5-open-the-firewall-windows), and that the network profile is Private.
5. Guest networks: client isolation must be off, and the server PC must be on the same network as the phones.
6. Did the server's IP change? Compare it to `PUBLIC_URL` and the address on the poster. If it changed, fix the router reservation, update `PUBLIC_URL`, restart, and reprint.
7. A phone on mobile data instead of Wi-Fi cannot reach a LAN address. Turn mobile data off.

### No sound on the TV

1. The status line should read **Suara aktif**. If it says **Suara belum aktif**, click the screen and press **Mulai dan nyalakan suara**. Browsers need this click after each page load, unless Chrome starts with `--autoplay-policy=no-user-gesture-required`.
2. Check the TV and HDMI volume, and that the browser tab is not muted.
3. If the chime plays but nothing is spoken, the Indonesian voice is missing. Install the Indonesian speech pack and restart the browser. See [display-setup.md](display-setup.md#voice).

### The "reconnecting" banner

The banner **Sambungan terputus** means the live connection to the server dropped. The page reconnects by itself and shows **Tersambung kembali** when it does. Data shown meanwhile may be out of date.

- If it clears in a few seconds, it was a network blip.
- If it stays, check the server is running (`/api/health`), the device is on the right network, and the server PC did not sleep.
- A different message, **Perangkat ini tidak tersambung ke jaringan**, means the device itself lost its network.
- Restarting the server also triggers the banner on every open page until it is back.

### Wrong timezone, or numbers restart at the wrong hour

Check **Zona waktu** under **Umum** in the admin page. Change it when no number is waiting or called (see [Timezone](#timezone)). Also check that the server PC's clock is right. The server uses its own clock with the business timezone.

### Forgotten admin password

Any admin can reset another account's password in **Petugas** with **Atur ulang kata sandi**. If no admin can sign in, create a new admin on the server PC:

```bash
npm run admin:create
```

Pick a new username. If the name already exists, the script says so and changes nothing. Sign in with the new admin and reset the old account's password from **Petugas**. Stop the new account's access afterwards if you no longer need it.

### Port already in use

If `npm start` fails because the port is taken, another program uses it. Set a different `PORT` in `.env`, update `PUBLIC_URL` and the firewall rule to match, and reprint the poster.
