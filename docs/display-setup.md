# TV display setup

The TV shows the queue and announces each call. This guide covers the device behind it, sound, and unattended start-up.

## What you need

- A device that runs a current **Chrome or Edge**: a mini PC, a laptop, or an Android TV box with Chrome. Connect it to the TV by HDMI or cast target.
- **Smart-TV built-in browsers are not supported.**
- A network connection that reaches the Giliran server (see [setup-lan.md](setup-lan.md)).

The page is `http://<server-ip>:3000/display`. Admins also get a **Buka layar TV** link in the admin page.

## What the screen shows

- The latest call (**Nomor dipanggil**) with the counter to go to.
- Each counter (**Loket**) and its current number.
- **Panggilan sebelumnya**, the recent calls.
- **Menunggu**, how many people wait per service.
- The QR code. With the venue Wi-Fi QR configured it shows two codes: **1. Sambungkan ke Wi-Fi** and **2. Ambil nomor**. Otherwise one code, **Pindai untuk ambil nomor**.
- A status line with the connection and sound state.

The TV needs no sign-in.

## Sound

Browsers block audio until a person interacts with the page. When the display opens, a start overlay appears (**Nyalakan layar antrean**). Click **Mulai dan nyalakan suara** once. The status line then shows **Suara aktif**. You need this click again after every page load or browser restart.

To skip the click on a TV with no operator, start Chrome in kiosk mode with autoplay allowed:

```
chrome --kiosk --autoplay-policy=no-user-gesture-required http://<ip>:3000/display
```

Replace `<ip>` with the server address. Close all other Chrome windows before running it, or the flags may be ignored. Add this command to the device's startup so the display returns after a reboot.

## Voice

Calls are spoken with the browser's Indonesian (`id-ID`) text-to-speech voice, for example "Nomor antrean a satu, silakan ke Loket dua." A recall is announced with "Panggilan ulang." first.

- On Windows, install the Indonesian language and speech pack (Settings, Time & language, Speech). Restart the browser afterwards.
- Without an Indonesian voice, the display only plays a chime and flashes the call. The status line says **Suara bahasa Indonesia tidak tersedia di perangkat ini**.
- To hear how a counter name will sound, use **Dengarkan contoh panggilan** in the admin page, on the same device if you can.

## Keep the device awake

Turn off sleep, the screensaver and the screen blanking on the TV device, or the display stops mid-day. Check the TV's own power-saving and "no signal" auto-off settings too.

## Check it works

1. Open `/display` and click the start overlay.
2. On a staff device, call a number from `/staff`.
3. The TV should flash the call, play the chime and speak it. If not, see [troubleshooting](operations.md#no-sound-on-the-tv).
