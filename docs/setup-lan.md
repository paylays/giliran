# Server setup on a LAN

This guide takes Giliran from a fresh machine to a printed poster. The server is one Node process on a PC in the venue. Phones, the TV and staff devices reach it over the local network.

The steps use a Windows server PC. On other systems, skip the firewall command and open port 3000 with your own firewall tool.

## 1. Install and build

Install Node.js 24 or newer, then in the project folder:

```bash
npm install
npm run build
```

`npm run build` type-checks and writes the web app to `dist/web`. The server serves that folder, so start it from the project root.

## 2. Give the server a fixed address

The QR code on the poster contains the server's address. If the address changes, every printed poster stops working.

1. Find the server's LAN IPv4 address (for example with `ipconfig` on Windows). It looks like `192.168.1.10`.
2. In the router, create a DHCP reservation for the server PC's network adapter, so it always gets that address.
3. Optionally use a wired connection for the server. It is more stable than Wi-Fi.

## 3. Configure

Copy `.env.example` to `.env` and set the address:

```
PORT=3000
HOST=0.0.0.0
PUBLIC_URL=http://192.168.1.10:3000
DB_PATH=./data/giliran.db
```

Use your own IP in `PUBLIC_URL`. Keep the port in step with `PORT`. See the [configuration table](../README.md#configuration) for every variable.

## 4. Create the first admin

```bash
npm run admin:create
```

The script asks for a username, a display name and a password (at least 8 characters, asked twice). Usernames are 3 to 32 characters: lowercase letters, digits, `.`, `_` and `-`. The script creates the database and applies migrations if needed. There is no web sign-up, so this is the only way to create the first admin.

## 5. Open the firewall (Windows)

Windows blocks incoming connections by default. In PowerShell opened as administrator, allow port 3000 on the Private network profile:

```powershell
New-NetFirewallRule -DisplayName "Giliran 3000" -Direction Inbound -Protocol TCP -LocalPort 3000 -Action Allow -Profile Private
```

If you changed `PORT`, use that port. Make sure Windows classes your venue network as Private, or the rule does not apply.

## 6. Keep the server awake

The server PC must not sleep, or the queue goes down. In Windows power settings, set sleep to Never while plugged in. Turn off hibernation for the same reason.

## 7. Start the server

```bash
npm start
```

It prints `Giliran listening on http://0.0.0.0:3000`. From another device on the network, open `http://<server-ip>:3000/api/health`. A response with `"ok":true` means the server is reachable.

The process stops when you close the terminal. Press `Ctrl+C` to stop it cleanly. To start it automatically at boot, use your system's service or task scheduler to run `npm start` from the project folder. Giliran does not ship a service installer.

## 8. Set up the venue in the admin page

Sign in at `http://<server-ip>:3000/login` and open **Pengaturan admin**. The sections are **Umum**, **Layanan**, **Loket**, **Petugas** and **Poster QR**.

1. **Umum.** Set **Nama tempat** (shown on the take page, the TV and the poster) and **Zona waktu**. The timezone decides when the day changes and numbers restart. The default is WIB (Asia/Jakarta). **Pemberitahuan giliran dekat** sets how many people ahead trigger the "your turn is near" alert (1 to 20).
2. **Layanan.** Add at least one service. Each has its own queue and a number prefix of 1 to 3 letters. Prefix `A` produces `A001`, `A002` and so on.
3. **Loket.** Add counters and tick the services each counter handles. A counter calls the oldest waiting number across all its ticked services. The counter name is spoken on the TV, so write it the way you want it read: `Loket 2` is spoken as "Loket dua". **Dengarkan contoh panggilan** plays a sample.
4. **Petugas.** Add staff accounts (role **Petugas loket**) and more admins. Give the initial password to the person directly.

## 9. Optional: venue Wi-Fi QR

Visitors need the venue Wi-Fi before they can open the take page. If you enter the Wi-Fi details, the poster and the TV show two QR codes: the first joins the Wi-Fi, the second opens the take page.

In **Umum**, under **Wi-Fi untuk pengunjung**, turn on **Tampilkan kode QR Wi-Fi di poster dan layar TV** and fill in:

- **Nama Wi-Fi**: exactly as phones list it, including capital letters. Up to 32 characters.
- **Jenis keamanan**: **WPA/WPA2** (use this if unsure), **WEP (jenis lama)** or **Tanpa kata sandi**.
- **Kata sandi Wi-Fi**: for WPA/WPA2, 8 to 63 characters.

Rules for this to work:

- **Use a guest network.** Anyone who scans the code can read the password, and the code is on the poster and the TV. Do not use the office or cashier network.
- **The server PC must be on the same network** the visitors join. Otherwise phones join the Wi-Fi but cannot open the take page.
- **Turn off client isolation** on that guest network. Routers call it AP Isolation or Client Isolation. While it is on, phones cannot reach the server.
- The TV and staff devices must reach the server too, on the same network or another one that can reach it.
- **Moving the server to the guest network changes its IP address.** Update `PUBLIC_URL` in `.env`, restart the server, and reprint the poster. Create a new DHCP reservation on the guest network if the router offers one.

Turning the switch off and saving deletes the stored Wi-Fi name and password.

## 10. Print the poster

1. In the admin page, open **Poster QR**. It shows the address inside the QR code. That address is `PUBLIC_URL` + `/take`.
2. Test before printing. With Wi-Fi QR on, use a phone that has never joined this Wi-Fi: scan code 1, then code 2, and check that the take page opens. Without Wi-Fi QR, test with a phone already on the venue network.
3. Press **Cetak poster**. The poster is sized for A4.
4. Without Wi-Fi QR, the poster has a blank line for the Wi-Fi name. Write the name in by hand after printing.
5. Put it at the entrance or in the waiting room, where a phone camera can reach it.

If the server's IP ever changes, update `PUBLIC_URL`, restart, and print again.

## 11. Set up the TV and staff devices

- TV: follow [display-setup.md](display-setup.md).
- Staff: open `http://<server-ip>:3000/login` on the counter's device, sign in, and pick a counter in `/staff`. The choice is remembered until sign-out. Sessions last 12 hours and extend while the panel is in use.

Next: [operations](operations.md).
