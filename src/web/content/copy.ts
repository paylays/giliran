// Every UI string and spoken announcement in Giliran. Indonesian only.
// Times arrive already formatted by the caller with Intl (locale id-ID, the `timeZone` from the snapshot, never
// the device zone), e.g. "10.42". Dates use weekday, day, long month, year: "Senin, 19 Oktober 2026".
// Ticket numbers arrive exactly as issued by the server, e.g. "A001".

const DIGIT_WORDS = ['nol', 'satu', 'dua', 'tiga', 'empat', 'lima', 'enam', 'tujuh', 'delapan', 'sembilan'] as const;

// Indonesian letter names. The accented é steers the voice to /e/ instead of a schwa ("bé", not "bə").
const LETTER_NAMES: Readonly<Record<string, string>> = {
  A: 'a', B: 'bé', C: 'cé', D: 'dé', E: 'é', F: 'éf', G: 'gé', H: 'ha', I: 'i',
  J: 'jé', K: 'ka', L: 'él', M: 'ém', N: 'én', O: 'o', P: 'pé', Q: 'ki', R: 'ér',
  S: 'és', T: 'té', U: 'u', V: 'fé', W: 'wé', X: 'éks', Y: 'yé', Z: 'zét',
};

function joinWords(...words: string[]): string {
  return words.filter((word) => word !== '').join(' ');
}

/** Spells each letter and digit separately: "AB" -> "a bé", "12" -> "satu dua". */
export function spellCharacters(text: string): string {
  const words: string[] = [];
  for (const char of text.toUpperCase()) {
    if (char >= '0' && char <= '9') {
      words.push(DIGIT_WORDS[Number(char)] ?? char);
    } else {
      const name = LETTER_NAMES[char];
      if (name) words.push(name);
    }
  }
  return words.join(' ');
}

function wordsOrEmpty(rest: number): string {
  return rest === 0 ? '' : numberToWordsId(rest);
}

/** Whole number in Indonesian words: 1 -> "satu", 12 -> "dua belas", 123 -> "seratus dua puluh tiga". */
export function numberToWordsId(value: number): string {
  if (!Number.isSafeInteger(value) || value < 0) return String(value);
  if (value < 10) return DIGIT_WORDS[value] ?? String(value);
  if (value === 10) return 'sepuluh';
  if (value === 11) return 'sebelas';
  if (value < 20) return `${numberToWordsId(value - 10)} belas`;
  if (value < 100) return joinWords(`${numberToWordsId(Math.floor(value / 10))} puluh`, wordsOrEmpty(value % 10));
  if (value < 200) return joinWords('seratus', wordsOrEmpty(value - 100));
  if (value < 1000) return joinWords(`${numberToWordsId(Math.floor(value / 100))} ratus`, wordsOrEmpty(value % 100));
  if (value < 2000) return joinWords('seribu', wordsOrEmpty(value - 1000));
  if (value < 1_000_000) return joinWords(`${numberToWordsId(Math.floor(value / 1000))} ribu`, wordsOrEmpty(value % 1000));
  if (value < 1_000_000_000) {
    return joinWords(`${numberToWordsId(Math.floor(value / 1_000_000))} juta`, wordsOrEmpty(value % 1_000_000));
  }
  return spellCharacters(String(value));
}

/**
 * Ticket number as the voice should say it: prefix spelled letter by letter, then the
 * sequence as a whole number without leading zeros. "A001" -> "a satu", "B123" -> "bé seratus dua puluh tiga".
 * Pass the service prefix when known: a prefix that ends in a digit cannot be told apart
 * from the sequence by looking at the number alone ("A2" + "001" reads as "A2001").
 */
export function spokenTicketNumber(ticketNumber: string, prefix?: string): string {
  const text = ticketNumber.trim().toUpperCase();
  const knownPrefix = prefix?.trim().toUpperCase();
  if (knownPrefix && text.startsWith(knownPrefix)) {
    const sequence = text.slice(knownPrefix.length);
    if (/^\d+$/.test(sequence)) return joinWords(spellCharacters(knownPrefix), numberToWordsId(Number(sequence)));
  }
  const match = /^([A-Z0-9]*[A-Z])?(\d+)$/.exec(text);
  if (!match) return spellCharacters(text);
  return joinWords(spellCharacters(match[1] ?? ''), numberToWordsId(Number(match[2] ?? '0')));
}

/** Counter name with every digit run turned into words: "Loket 2" -> "Loket dua". Letters stay as the admin typed them. */
export function spokenCounterName(counterName: string): string {
  return counterName
    .replace(/\d+/g, (digits) => ` ${numberToWordsId(Number(digits))} `)
    .replace(/\s+/g, ' ')
    .trim();
}

/** Spoken line for a first call: "Nomor antrean a satu, silakan ke Loket dua." */
export function announceCall(ticketNumber: string, counterName: string, prefix?: string): string {
  return `Nomor antrean ${spokenTicketNumber(ticketNumber, prefix)}, silakan ke ${spokenCounterName(counterName)}.`;
}

/** Spoken line for a recall (call count 2 or more). */
export function announceRecall(ticketNumber: string, counterName: string, prefix?: string): string {
  return `Panggilan ulang. ${announceCall(ticketNumber, counterName, prefix)}`;
}

export const copy = {
  app: {
    name: 'Giliran',
    pageTitle: (page: string, businessName?: string): string => `${page} · ${businessName?.trim() || 'Giliran'}`,
  },

  common: {
    cancel: 'Batal',
    close: 'Tutup',
    save: 'Simpan',
    saving: 'Menyimpan...',
    saved: 'Perubahan tersimpan.',
    edit: 'Ubah',
    back: 'Kembali',
    retry: 'Coba lagi',
    reload: 'Muat ulang halaman',
    logout: 'Keluar',
    loggingOut: 'Sedang keluar...',
    active: 'Aktif',
    inactive: 'Nonaktif',
    deactivate: 'Nonaktifkan',
    activate: 'Aktifkan',
    moveUp: 'Naikkan',
    moveDown: 'Turunkan',
    moveUpLabel: (name: string): string => `Pindahkan ${name} ke atas`,
    moveDownLabel: (name: string): string => `Pindahkan ${name} ke bawah`,
    showPassword: 'Tampilkan',
    hidePassword: 'Sembunyikan',
    showPasswordLabel: 'Tampilkan kata sandi',
    hidePasswordLabel: 'Sembunyikan kata sandi',
    required: (label: string): string => `${label} wajib diisi.`,
    minLength: (min: number): string => `Minimal ${min} karakter.`,
    maxLength: (max: number): string => `Paling banyak ${max} karakter.`,
    at: (time: string): string => `pukul ${time}`,
    youSuffix: '(Anda)',
    fieldErrorsSummary: 'Ada isian yang perlu diperbaiki. Periksa kolom yang ditandai.',
  },

  // Status badge labels. Always shown as text, never as color alone.
  status: {
    waiting: 'Menunggu',
    called: 'Dipanggil',
    done: 'Selesai',
    skipped: 'Dilewati',
    expired: 'Kedaluwarsa',
  },

  connection: {
    connected: 'Tersambung',
    connecting: 'Menyambungkan...',
    reconnectingTitle: 'Sambungan terputus',
    reconnectingBody: 'Menyambung ulang otomatis. Data yang tampil mungkin belum terbaru.',
    reconnectingSince: (time: string): string => `Sambungan terputus sejak pukul ${time}. Menyambung ulang otomatis.`,
    reconnected: 'Tersambung kembali. Data sudah diperbarui.',
    offline: 'Perangkat ini tidak tersambung ke jaringan. Periksa Wi-Fi Anda.',
  },

  states: {
    loading: 'Memuat...',
    networkError: 'Server tidak bisa dihubungi. Pastikan perangkat tersambung ke Wi-Fi tempat ini, lalu coba lagi.',
    serverError: 'Server sedang bermasalah. Tunggu sebentar, lalu coba lagi. Jika tetap gagal, beri tahu petugas.',
    rateLimited: 'Terlalu banyak permintaan dari perangkat ini. Tunggu beberapa menit, lalu coba lagi.',
    sessionExpired: 'Sesi Anda berakhir. Silakan masuk lagi.',
    forbidden: 'Akun Anda tidak punya akses ke halaman ini.',
    notFoundTitle: 'Halaman tidak ditemukan',
    notFoundBody: 'Alamat ini tidak ada di Giliran. Periksa kembali alamatnya.',
    notFoundAction: 'Ke halaman ambil nomor',
    crashTitle: 'Halaman ini berhenti bekerja',
    crashBody: 'Terjadi kesalahan saat menampilkan halaman. Muat ulang untuk mencoba lagi.',
  },

  take: {
    docTitle: 'Ambil nomor antrean',
    title: 'Ambil nomor antrean',
    lead: 'Pilih layanan yang Anda tuju. Nomor Anda tampil di ponsel ini dan dipanggil lewat layar TV.',
    servicesHeading: 'Layanan',
    loading: 'Memuat daftar layanan...',
    loadError: 'Daftar layanan gagal dimuat.',
    empty: 'Belum ada layanan yang dibuka. Tanyakan kepada petugas di lokasi.',
    // Today's waiting tickets in that service, from GET /api/services.
    waitingCount: (count: number): string => (count === 0 ? 'Tidak ada yang menunggu' : `${count} orang menunggu`),
    prefixLabel: (prefix: string): string => `Nomor berawalan ${prefix}`,
    takeLabel: (service: string): string => `Ambil nomor untuk ${service}`,
    taking: 'Mengambil nomor...',
    takeFailed: 'Nomor gagal diambil. Coba lagi.',
    serviceClosed: 'Layanan ini baru saja ditutup. Pilih layanan lain.',
    rateLimited: 'Terlalu banyak nomor diambil dari perangkat ini. Tunggu beberapa menit, lalu coba lagi.',
    alreadyHave: (ticketNumber: string): string => `Anda sudah punya nomor ${ticketNumber} untuk layanan ini.`,
    openTicket: (ticketNumber: string): string => `Lihat nomor ${ticketNumber}`,
    myTicketsHeading: 'Nomor Anda hari ini',
    privacy: 'Giliran tidak meminta nama, nomor ponsel, atau data pribadi lain.',
  },

  ticket: {
    docTitle: 'Nomor antrean Anda',
    plateLabel: 'Nomor antrean Anda',
    service: (service: string): string => `Layanan ${service}`,
    takenAt: (time: string): string => `Diambil pukul ${time}`,
    // Expired tickets come from an earlier day, so a time alone would read as today.
    takenOnDate: (date: string, time: string): string => `Diambil pada ${date} pukul ${time}`,
    loading: 'Memuat nomor Anda...',
    loadError: 'Nomor Anda belum bisa dimuat. Pastikan ponsel tersambung ke Wi-Fi tempat ini.',

    // Waiting
    aheadLabel: 'orang di depan Anda',
    frontTitle: 'Anda di urutan terdepan',
    frontBody: 'Bersiaplah. Nomor Anda bisa dipanggil kapan saja.',
    positionSentence: (count: number): string =>
      count === 0 ? 'Anda di urutan terdepan.' : `${count} orang di depan Anda.`,

    // Near banner
    nearTitle: 'Giliran Anda sudah dekat',
    nearBody: (count: number): string =>
      count === 0
        ? 'Tidak ada lagi yang di depan Anda. Mendekatlah ke area loket dan pantau layar TV.'
        : `Tinggal ${count} orang di depan Anda. Mendekatlah ke area loket dan pantau layar TV.`,

    // Called: full-screen message
    calledTitle: 'Nomor Anda dipanggil',
    recalledTitle: 'Nomor Anda dipanggil lagi',
    goTo: 'Silakan ke',
    calledAt: (time: string): string => `Dipanggil pukul ${time}`,
    callCount: (count: number): string => `Panggilan ke-${count}`,
    dismissCalled: 'Saya menuju loket',

    // Called: inline state after the message is closed or after returning to the tab
    calledInlineTitle: (counterName: string): string => `Silakan ke ${counterName}`,
    calledInlineBody: (counterName: string, time: string): string =>
      `Nomor Anda dipanggil ke ${counterName} pukul ${time}. Segera menuju loket.`,

    // Final states
    doneTitle: 'Layanan selesai',
    doneBody: 'Nomor ini sudah selesai dilayani. Terima kasih sudah menunggu.',
    skippedTitle: 'Nomor Anda dilewati',
    skippedBody:
      'Petugas sudah memanggil nomor ini, tetapi tidak ada yang datang. Nomor yang dilewati tidak bisa dipakai lagi. Ambil nomor baru jika Anda masih perlu dilayani.',
    expiredTitle: 'Nomor ini sudah tidak berlaku',
    expiredBody: 'Nomor antrean hanya berlaku pada hari nomor itu diambil. Ambil nomor baru untuk hari ini.',
    notFoundTitle: 'Nomor tidak ditemukan',
    notFoundBody: 'Alamat nomor ini tidak dikenali. Periksa kembali tautannya, atau ambil nomor baru.',
    takeNew: 'Ambil nomor baru',

    // Alerts (sound and vibration)
    alertsEnable: 'Nyalakan suara dan getar',
    alertsEnableSoundOnly: 'Nyalakan suara',
    alertsHint:
      'Ponsel berbunyi saat giliran Anda sudah dekat dan saat nomor Anda dipanggil. Hanya bekerja selama halaman ini terbuka.',
    alertsEnabling: 'Menyalakan...',
    alertsOn: 'Suara dan getar aktif. Bunyi tadi adalah tanda yang akan Anda dengar.',
    alertsOnSoundOnly: 'Suara aktif. Bunyi tadi adalah tanda yang akan Anda dengar.',
    alertsSilentHint: 'Pastikan ponsel tidak dalam mode senyap.',
    alertsFailed: 'Suara tidak bisa dinyalakan di ponsel ini. Pantau layar ini dan layar TV.',

    // Keep the page open
    keepOpenTitle: 'Biarkan halaman ini terbuka',
    keepOpenBody:
      'Pemberitahuan hanya muncul selama halaman ini terbuka dan layar menyala. Jika layar terkunci atau Anda membuka aplikasi lain, buka lagi halaman ini dan pantau layar TV di ruang tunggu.',
    savedOnDevice:
      'Nomor ini tersimpan di ponsel ini. Jika halaman tertutup, buka lagi halaman ambil nomor untuk melihatnya.',

    // Browser tab title
    tabWaiting: (ticketNumber: string, count: number): string =>
      count === 0 ? `${ticketNumber}, urutan terdepan` : `${ticketNumber}, ${count} orang di depan`,
    tabCalled: (ticketNumber: string): string => `${ticketNumber} dipanggil`,
    tabGoTo: (counterName: string): string => `Ke ${counterName}`,
    tabDone: (ticketNumber: string): string => `${ticketNumber} selesai`,
  },

  display: {
    docTitle: 'Layar antrean',

    // Full-screen start overlay that unlocks sound
    startTitle: 'Nyalakan layar antrean',
    startBody: 'Tekan tombol di bawah satu kali agar layar ini boleh memutar bunyi dan suara panggilan.',
    startButton: 'Mulai dan nyalakan suara',
    startKioskHint:
      'Untuk TV tanpa operator, jalankan Chrome dalam mode kios agar langkah ini tidak perlu diulang. Caranya ada di panduan pemasangan layar.',

    loading: 'Memuat data antrean...',

    latestLabel: 'Nomor dipanggil',
    latestGoTo: 'Silakan ke',
    latestNone: 'Belum ada panggilan hari ini.',

    countersHeading: 'Loket',
    counterNoTicket: 'Tidak ada nomor',
    countersNone: 'Belum ada loket aktif.',

    recentHeading: 'Panggilan sebelumnya',
    recentNone: 'Belum ada panggilan sebelumnya.',
    recentItemLabel: (ticketNumber: string, counterName: string): string => `${ticketNumber} di ${counterName}`,

    waitingHeading: 'Menunggu',
    waitingUnit: 'orang',
    waitingLabel: (service: string, count: number): string => `${service}: ${count} orang menunggu`,
    servicesNone: 'Belum ada layanan aktif.',

    qrCaption: 'Pindai untuk ambil nomor',
    qrAlt: 'Kode QR menuju halaman ambil nomor',
    qrError: 'Kode QR gagal dimuat. Muat ulang layar ini.',
    // Second caption line under the single take-a-number QR, shown when no Wi-Fi is set.
    qrNeedsWifi: 'Pakai Wi-Fi tempat ini',

    // QR pair, shown when a Wi-Fi name is set. Wi-Fi comes first: the take page only loads on the venue network.
    // Caption line 1 is the step title; line 2 is the network name (wifiSsid as stored) or takeStepNote.
    wifiStepTitle: '1. Sambungkan ke Wi-Fi',
    wifiQrAlt: (ssid: string): string => `Kode QR untuk tersambung ke Wi-Fi ${ssid}`,
    wifiQrError: 'Kode QR Wi-Fi gagal dimuat. Muat ulang layar ini.',
    takeStepTitle: '2. Ambil nomor',
    takeStepNote: 'setelah tersambung',
    qrStepsLabel: 'Cara mengambil nomor dari ponsel',

    // Screen-reader and caption text for a call (the spoken version lives in announceCall)
    callLine: (ticketNumber: string, counterName: string): string =>
      `Nomor antrean ${ticketNumber}, silakan ke ${counterName}`,

    soundOn: 'Suara aktif',
    soundLocked: 'Suara belum aktif. Klik layar untuk menyalakan.',
    soundChimeOnly:
      'Suara bahasa Indonesia tidak tersedia di perangkat ini. Panggilan hanya ditandai bunyi dan kedipan layar.',
  },

  login: {
    docTitle: 'Masuk petugas',
    title: 'Masuk petugas',
    lead: 'Untuk petugas loket dan admin.',
    visitorPrompt: 'Bukan petugas?',
    visitorLink: 'Ambil nomor antrean',
    username: 'Nama pengguna',
    password: 'Kata sandi',
    submit: 'Masuk',
    submitting: 'Memeriksa...',
    usernameRequired: 'Isi nama pengguna.',
    passwordRequired: 'Isi kata sandi.',
    invalid: 'Nama pengguna atau kata sandi salah.',
    rateLimited: 'Terlalu banyak percobaan masuk yang gagal. Tunggu satu menit, lalu coba lagi.',
    // 429 too_many_attempts. `seconds` is the Retry-After value. The server counts failures per username and
    // client address, so other usernames can still sign in from this device.
    rateLimitedWait: (seconds: number): string => {
      const lead = 'Terlalu banyak percobaan masuk yang gagal untuk nama pengguna ini.';
      const whole = Math.ceil(seconds);
      if (whole <= 0) return `${lead} Anda bisa mencoba lagi sekarang.`;
      const wait = whole >= 60 ? `${Math.ceil(whole / 60)} menit` : `${whole} detik`;
      return `${lead} Tunggu ${wait}, lalu coba lagi.`;
    },
    forgot: 'Lupa kata sandi? Minta admin mengatur ulang dari halaman Petugas.',
    sessionExpired: 'Sesi Anda berakhir karena terlalu lama tidak aktif. Silakan masuk lagi.',
    loggedOut: 'Anda sudah keluar.',
  },

  staff: {
    docTitle: 'Panel loket',
    title: 'Panel loket',
    signedInAs: (name: string): string => `Masuk sebagai ${name}`,
    counterHeading: (counterName: string): string => `Anda bertugas di ${counterName}`,
    changeCounter: 'Ganti loket',
    adminLink: 'Pengaturan admin',
    loading: 'Memuat data loket...',
    loadError: 'Panel loket gagal dimuat.',

    // Pick a counter
    pickTitle: 'Pilih loket',
    pickLead: 'Pilih loket tempat Anda bertugas. Pilihan ini tersimpan sampai Anda keluar.',
    pickServes: (services: string): string => `Melayani: ${services}`,
    pickNoServices: 'Belum ada layanan untuk loket ini, jadi loket ini belum bisa memanggil nomor.',
    pickButton: (counterName: string): string => `Pakai ${counterName}`,
    picking: 'Menyimpan pilihan...',
    pickEmptyStaff: 'Belum ada loket aktif. Minta admin membuat loket dan memilih layanannya.',
    pickEmptyAdmin: 'Belum ada loket aktif. Buat loket di halaman Pengaturan admin.',
    counterGone: 'Loket Anda tidak lagi aktif. Pilih loket lain.',

    // Current ticket
    currentLabel: 'Nomor saat ini',
    currentNone: 'Belum ada nomor yang dipanggil di loket ini.',
    currentService: (service: string): string => `Layanan ${service}`,
    currentCalledAt: (time: string): string => `Dipanggil pukul ${time}`,
    currentCallCount: (count: number): string => `Panggilan ke-${count}`,

    // Next waiting
    nextLabel: 'Berikutnya',
    nextNone: 'Tidak ada nomor yang menunggu.',
    waitingForCounter: (count: number): string =>
      count === 0 ? 'Tidak ada yang menunggu untuk loket ini' : `${count} nomor menunggu untuk loket ini`,
    waitingByServiceHeading: 'Menunggu per layanan',
    waitingByService: (count: number): string => `${count} menunggu`,

    // Actions
    callNext: 'Panggil berikutnya',
    callNextAutoDone: (ticketNumber: string): string => `${ticketNumber} otomatis ditandai selesai.`,
    recall: 'Panggil ulang',
    skip: 'Lewati',
    done: 'Selesai',
    calling: 'Memanggil...',
    recalling: 'Memanggil ulang...',
    skipping: 'Melewati...',
    finishing: 'Menyimpan...',
    disabledNoWaiting: 'Tidak ada nomor yang menunggu.',
    disabledNoCurrent: 'Belum ada nomor yang dipanggil.',

    skipConfirmTitle: (ticketNumber: string): string => `Lewati nomor ${ticketNumber}?`,
    skipConfirmBody: 'Nomor yang dilewati tidak bisa dipanggil lagi. Pengunjung harus mengambil nomor baru.',
    skipConfirmButton: (ticketNumber: string): string => `Ya, lewati ${ticketNumber}`,

    // Results, announced in a live region
    resultCalled: (ticketNumber: string, counterName: string): string => `${ticketNumber} dipanggil ke ${counterName}.`,
    resultRecalled: (ticketNumber: string, count: number): string =>
      `${ticketNumber} dipanggil ulang, panggilan ke-${count}.`,
    resultSkipped: (ticketNumber: string): string => `${ticketNumber} dilewati.`,
    resultDone: (ticketNumber: string): string => `${ticketNumber} selesai.`,

    conflictTitle: 'Data loket sudah berubah',
    conflictBody:
      'Ada perubahan dari perangkat lain. Tampilan sudah diperbarui. Periksa nomor saat ini sebelum menekan tombol lagi.',
    actionFailed: 'Aksi gagal. Periksa sambungan, lalu coba lagi.',
  },

  admin: {
    docTitle: 'Pengaturan admin',
    title: 'Pengaturan admin',
    navLabel: 'Bagian pengaturan',
    nav: {
      settings: 'Umum',
      services: 'Layanan',
      counters: 'Loket',
      users: 'Petugas',
      poster: 'Poster QR',
    },
    staffPanelLink: 'Panel loket',
    displayLink: 'Buka layar TV',
    forbidden: 'Halaman ini khusus admin.',
    forbiddenAction: 'Ke panel loket',
    saveFailed: 'Perubahan gagal disimpan. Periksa isian yang ditandai, lalu coba lagi.',
    // Banner title for a failed row action (activate, deactivate, reorder). No form is open, so nothing is marked.
    actionFailedTitle: 'Perubahan tidak disimpan',

    settings: {
      title: 'Pengaturan umum',
      loading: 'Memuat pengaturan...',
      loadError: 'Pengaturan gagal dimuat.',
      businessName: 'Nama tempat',
      businessNameHint: 'Tampil di halaman ambil nomor, layar TV, dan poster QR.',
      timezone: 'Zona waktu',
      timezoneHint: 'Menentukan kapan hari layanan berganti dan nomor antrean kembali ke awal.',
      timezoneWib: 'WIB (Asia/Jakarta)',
      timezoneWita: 'WITA (Asia/Makassar)',
      timezoneWit: 'WIT (Asia/Jayapura)',
      timezoneOther: 'Zona waktu lain',
      timezoneOtherHint: 'Tulis nama zona IANA, misalnya Asia/Singapore.',
      timezoneInvalid: 'Zona waktu tidak dikenal. Contoh penulisan yang benar: Asia/Jakarta.',
      timezoneWarningTitle: 'Perhatian sebelum mengubah zona waktu',
      timezoneWarningBody:
        'Zona waktu hanya bisa diubah saat tidak ada nomor yang menunggu atau sedang dipanggil hari ini. Setelah diubah, tanggal layanan bisa bergeser dan nomor bisa mulai lagi dari awal. Ubah zona waktu di luar jam layanan.',
      timezoneConfirmTitle: (timezone: string): string => `Ubah zona waktu ke ${timezone}?`,
      timezoneConfirmButton: 'Ya, ubah zona waktu',
      // Server refused a timezone change (409 queue_active). The whole form was rejected, so nothing was saved.
      timezoneQueueActiveTitle: 'Zona waktu belum bisa diubah',
      timezoneQueueActiveBody:
        'Hari ini masih ada nomor yang menunggu atau sedang dipanggil, jadi tidak ada perubahan yang disimpan. Selesaikan atau lewati dulu nomor-nomor itu di panel loket, atau ubah zona waktu besok sebelum layanan dibuka. Untuk menyimpan perubahan lain sekarang, kembalikan zona waktu ke pilihan semula.',
      nearThreshold: 'Pemberitahuan giliran dekat',
      nearThresholdSuffix: 'orang',
      nearThresholdHint:
        'Pengunjung mendapat tanda saat jumlah orang di depannya sama dengan atau kurang dari angka ini. Isi 1 sampai 20.',
      nearThresholdInvalid: 'Isi angka bulat dari 1 sampai 20.',

      // Visitor Wi-Fi: printed and shown as a join QR. Turning it off saves wifiSsid null, which also clears the password.
      wifiHeading: 'Wi-Fi untuk pengunjung',
      wifiLead:
        'Isi Wi-Fi tamu tempat ini. Poster dan layar TV lalu memuat kode QR yang menyambungkan ponsel pengunjung ke Wi-Fi tanpa mengetik kata sandi.',
      wifiRiskTitle: 'Pakai Wi-Fi tamu, bukan Wi-Fi kantor atau kasir',
      wifiRiskBody:
        'Siapa pun yang memindai kode QR Wi-Fi bisa membaca kata sandinya, dan kode ini tertempel di poster serta tampil di layar TV. Pakai jaringan tamu yang terpisah dari komputer kantor dan mesin kasir.',
      wifiEnabled: 'Tampilkan kode QR Wi-Fi di poster dan layar TV',
      wifiEnabledHint: 'Jika dimatikan lalu disimpan, nama dan kata sandi Wi-Fi yang tersimpan ikut dihapus.',
      wifiOff:
        'Kode QR Wi-Fi tidak ditampilkan. Poster dan layar TV hanya memuat kode QR ambil nomor, jadi pengunjung harus menyambungkan ponsel ke Wi-Fi sendiri.',
      wifiSsid: 'Nama Wi-Fi',
      wifiSsidHint:
        'Tulis persis seperti yang muncul di daftar Wi-Fi ponsel, termasuk huruf besar dan kecil. Paling banyak 32 karakter.',
      wifiSsidRequired: 'Isi nama Wi-Fi, atau matikan kode QR Wi-Fi.',
      wifiSsidTooLong: 'Nama Wi-Fi paling banyak 32 karakter.',
      wifiSecurity: 'Jenis keamanan',
      wifiSecurityHint: 'Lihat di pengaturan router. Jika ragu, pilih WPA/WPA2.',
      // Option labels for wifiSecurity 'WPA' | 'WEP' | 'nopass'.
      wifiSecurityWpa: 'WPA/WPA2',
      wifiSecurityWep: 'WEP (jenis lama)',
      wifiSecurityNone: 'Tanpa kata sandi',
      wifiPassword: 'Kata sandi Wi-Fi',
      wifiPasswordHint: 'Huruf besar dan kecil dibedakan. Untuk WPA/WPA2: 8 sampai 63 karakter.',
      wifiPasswordRequired: 'Isi kata sandi Wi-Fi, atau pilih Tanpa kata sandi jika Wi-Fi ini terbuka.',
      wifiPasswordWpaLength: 'Kata sandi WPA/WPA2 harus 8 sampai 63 karakter.',
      wifiPasswordTooLong: 'Kata sandi paling banyak 63 karakter.',
      wifiNetworkTitle: 'Syarat jaringan',
      wifiNetworkItems: [
        'Komputer server tersambung ke Wi-Fi tamu ini. Jika tidak, ponsel pengunjung tersambung ke Wi-Fi tetapi halaman ambil nomor tidak terbuka.',
        'Fitur isolasi klien di Wi-Fi tamu dimatikan. Di router, fitur ini sering bernama AP Isolation atau Client Isolation. Jika masih menyala, halaman ambil nomor juga tidak terbuka.',
        'Layar TV dan perangkat petugas tersambung ke Wi-Fi tamu ini, atau ke jaringan lain yang bisa menjangkau komputer server.',
      ],

      addressesHeading: 'Alamat untuk perangkat',
      addressTake: 'Halaman ambil nomor',
      addressDisplay: 'Layar TV',
      addressStaff: 'Panel loket',
      submit: 'Simpan pengaturan',
      saved: 'Pengaturan tersimpan.',
    },

    services: {
      title: 'Layanan',
      lead: 'Setiap layanan punya antrean dan awalan nomor sendiri.',
      loading: 'Memuat layanan...',
      loadError: 'Daftar layanan gagal dimuat.',
      empty: 'Belum ada layanan. Tambahkan layanan pertama agar pengunjung bisa mengambil nomor.',
      add: 'Tambah layanan',
      addTitle: 'Tambah layanan',
      editTitle: (name: string): string => `Ubah layanan ${name}`,
      colName: 'Layanan',
      colPrefix: 'Awalan',
      colFirstNumber: 'Nomor pertama',
      colStatus: 'Status',
      colActions: 'Aksi',
      name: 'Nama layanan',
      nameHint: 'Tampil di halaman ambil nomor dan layar TV, misalnya Pendaftaran atau Kasir.',
      prefix: 'Awalan nomor',
      prefixHint: '1 sampai 3 huruf A-Z, misalnya A untuk nomor A001.',
      prefixInvalid: 'Awalan harus 1 sampai 3 huruf A-Z, tanpa angka atau spasi.',
      prefixTaken: (prefix: string): string => `Awalan ${prefix} sudah dipakai layanan lain.`,
      prefixChangeNote: 'Awalan baru berlaku untuk nomor berikutnya. Nomor yang sudah diambil tetap memakai awalan lama.',
      firstNumberPreview: (example: string): string => `Nomor pertama setiap hari: ${example}`,
      submit: 'Simpan layanan',
      deactivateTitle: (name: string): string => `Nonaktifkan layanan ${name}?`,
      deactivateBody: 'Pengunjung tidak bisa lagi mengambil nomor untuk layanan ini. Anda bisa mengaktifkannya lagi kapan saja.',
      deactivateButton: (name: string): string => `Ya, nonaktifkan ${name}`,
    },

    counters: {
      title: 'Loket',
      lead: 'Atur loket dan layanan yang dilayani setiap loket. Nama loket diucapkan saat pemanggilan.',
      loading: 'Memuat loket...',
      loadError: 'Daftar loket gagal dimuat.',
      empty: 'Belum ada loket. Tambahkan loket agar petugas bisa mulai memanggil nomor.',
      add: 'Tambah loket',
      addTitle: 'Tambah loket',
      editTitle: (name: string): string => `Ubah ${name}`,
      colName: 'Loket',
      colServices: 'Layanan',
      colStatus: 'Status',
      colActions: 'Aksi',
      name: 'Nama loket',
      nameHint:
        'Tampil di layar dan diucapkan saat memanggil. Tulis seperti cara membacanya, misalnya Loket 2 atau Ruang Periksa 1. Angka dibacakan sebagai kata: 2 menjadi dua.',
      services: 'Layanan yang dilayani loket ini',
      servicesHint: 'Loket memanggil nomor paling awal dari semua layanan yang dicentang.',
      servicesNoneWarning: 'Loket tanpa layanan tidak bisa memanggil nomor.',
      servicesNoneInRow: 'Belum ada layanan',
      servicesEmpty: 'Belum ada layanan aktif. Buat layanan dulu di bagian Layanan.',
      preview: 'Dengarkan contoh panggilan',
      previewUnavailable: 'Suara bahasa Indonesia tidak tersedia di peramban ini, jadi contoh tidak bisa diputar.',
      submit: 'Simpan loket',
      deactivateTitle: (name: string): string => `Nonaktifkan ${name}?`,
      deactivateBody: 'Petugas tidak bisa memilih loket ini lagi. Anda bisa mengaktifkannya kembali kapan saja.',
      deactivateButton: (name: string): string => `Ya, nonaktifkan ${name}`,
      // 409 counter_has_called_ticket: deactivating the counter, or unchecking the service of its called ticket.
      // Shown as the form summary and as the row-action banner body.
      calledTicketConflict:
        'Loket ini sedang melayani nomor yang sudah dipanggil. Selama nomor itu belum selesai, loket ini tidak bisa dinonaktifkan dan layanan nomor itu harus tetap dicentang. Tekan Selesai atau Lewati untuk nomor itu di panel loket, lalu coba lagi.',
      // 400 unknown_service: a checked service id the server does not have (stale list).
      unknownService:
        'Salah satu layanan yang dicentang tidak ditemukan. Muat ulang halaman agar daftar layanan terbaru tampil, lalu simpan lagi.',
    },

    users: {
      title: 'Petugas',
      lead: 'Akun untuk petugas loket dan admin.',
      loading: 'Memuat akun petugas...',
      loadError: 'Daftar petugas gagal dimuat.',
      empty: 'Belum ada akun petugas selain akun Anda.',
      add: 'Tambah petugas',
      addTitle: 'Tambah petugas',
      colName: 'Nama',
      colUsername: 'Nama pengguna',
      colRole: 'Peran',
      colStatus: 'Status',
      colActions: 'Aksi',
      roleAdmin: 'Admin',
      roleStaff: 'Petugas loket',
      displayName: 'Nama tampilan',
      displayNameHint: 'Tampil di panel loket.',
      username: 'Nama pengguna',
      usernameHint:
        'Dipakai untuk masuk. 3 sampai 32 karakter: huruf a-z, angka 0-9, titik, garis bawah, atau tanda hubung, tanpa spasi. Huruf besar otomatis diubah menjadi huruf kecil.',
      // Server rule in createUserBody, checked after trim and lowercase: /^[a-z0-9._-]{3,32}$/.
      usernameInvalid:
        'Nama pengguna harus 3 sampai 32 karakter dan hanya berisi huruf a-z, angka 0-9, titik (.), garis bawah (_), atau tanda hubung (-).',
      usernameTaken: 'Nama pengguna ini sudah dipakai.',
      initialPassword: 'Kata sandi awal',
      passwordHint: (min: number): string => `Minimal ${min} karakter. Sampaikan langsung kepada petugas yang bersangkutan.`,
      role: 'Peran',
      submit: 'Simpan petugas',
      resetPassword: 'Atur ulang kata sandi',
      resetTitle: (name: string): string => `Atur ulang kata sandi ${name}`,
      newPassword: 'Kata sandi baru',
      resetSubmit: 'Simpan kata sandi baru',
      resetDone: (name: string): string => `Kata sandi ${name} sudah diganti. Sampaikan kata sandi baru secara langsung.`,
      deactivateTitle: (name: string): string => `Nonaktifkan akun ${name}?`,
      deactivateBody: 'Petugas ini langsung keluar dari semua perangkat dan tidak bisa masuk lagi.',
      deactivateButton: (name: string): string => `Ya, nonaktifkan ${name}`,
      cannotDeactivateSelf: 'Anda tidak bisa menonaktifkan akun Anda sendiri.',
    },

    poster: {
      title: 'Poster kode QR',
      lead: 'Cetak poster ini dan tempel di pintu masuk atau ruang tunggu, di tempat yang mudah dijangkau kamera ponsel.',
      targetLabel: 'Alamat di dalam kode QR ambil nomor',
      ipWarning:
        'Alamat ini memakai alamat IP komputer server. Jika alamat IP berubah, poster lama tidak bisa dipakai. Minta pengelola jaringan memberi alamat IP tetap (reservasi DHCP) untuk komputer server.',
      // Shown when no Wi-Fi is set: the poster prints one QR and a blank line for the Wi-Fi name.
      wifiNote:
        'Wi-Fi belum diisi, jadi poster hanya memuat kode QR ambil nomor dan kolom kosong untuk nama Wi-Fi. Setelah dicetak, tulis nama Wi-Fi tempat ini di kolom itu. Agar pengunjung cukup memindai kode QR untuk tersambung, isi Wi-Fi di bagian Umum.',
      wifiOnNote: (ssid: string): string =>
        `Poster memuat dua kode QR: kode 1 menyambungkan ponsel ke Wi-Fi ${ssid}, kode 2 membuka halaman ambil nomor.`,
      wifiSettingsLink: 'Atur Wi-Fi di bagian Umum',
      testNote:
        'Sebelum mencetak, uji dengan ponsel yang belum pernah memakai Wi-Fi ini: pindai kode 1, lalu kode 2. Jika halaman ambil nomor tidak terbuka, periksa syarat jaringan di bagian Umum.',
      testNoteSingle:
        'Sebelum mencetak, uji dengan ponsel yang tersambung ke Wi-Fi tempat ini: pindai kode QR dan pastikan halaman ambil nomor terbuka.',
      print: 'Cetak poster',
      qrAlt: 'Kode QR menuju halaman ambil nomor',
      qrError: 'Kode QR gagal dimuat. Muat ulang halaman, lalu coba lagi.',
      wifiQrAlt: (ssid: string): string => `Kode QR untuk tersambung ke Wi-Fi ${ssid}`,
      wifiQrError: 'Kode QR Wi-Fi gagal dimuat. Muat ulang halaman, lalu coba lagi.',
    },
  },

  // Printed A4 poster (admin > Poster QR > Cetak poster)
  poster: {
    fallbackTitle: 'Antrean',
    headline: 'Ambil nomor antrean dari ponsel Anda',

    // One-QR poster, used when no Wi-Fi is set. wifiLabel is followed by a blank write-in line.
    steps: [
      'Sambungkan ponsel ke Wi-Fi tempat ini. Jika perlu kata sandi, tanyakan kepada petugas.',
      'Arahkan kamera ponsel ke kode QR ini, lalu buka tautannya.',
      'Pilih layanan. Nomor Anda tampil di ponsel dan dipanggil lewat layar TV.',
    ],
    wifiLabel: 'Nama Wi-Fi:',
    urlLabel: 'Tidak bisa memindai? Ketik alamat ini di ponsel:',

    // Two-QR poster, used when a Wi-Fi name is set. The numerals 1 and 2 are printed as separate large figures,
    // so the titles carry no number. wifiLabel is followed by the stored network name in bold.
    twoStepLead: 'Pindai kedua kode QR ini berurutan dengan kamera ponsel.',
    wifiStepTitle: 'Sambungkan ke Wi-Fi',
    wifiStepBody: 'Ponsel tersambung ke Wi-Fi tempat ini tanpa mengetik kata sandi. Jika ponsel bertanya, setujui sambungannya.',
    wifiManual: (needsPassword: boolean): string =>
      needsPassword
        ? 'Kode 1 tidak bisa dipindai? Pilih nama Wi-Fi di atas dari pengaturan Wi-Fi ponsel, lalu minta kata sandinya kepada petugas.'
        : 'Kode 1 tidak bisa dipindai? Pilih nama Wi-Fi di atas dari pengaturan Wi-Fi ponsel.',
    takeStepTitle: 'Ambil nomor',
    takeStepBody:
      'Setelah tersambung, pindai kode ini dan buka tautannya. Pilih layanan. Nomor Anda tampil di ponsel dan dipanggil lewat layar TV.',
    urlLabelTwoStep: 'Kode 2 tidak bisa dipindai? Ketik alamat ini di ponsel:',
  },

  speech: {
    lang: 'id-ID',
    announceCall,
    announceRecall,
    ticketNumber: spokenTicketNumber,
    counterName: spokenCounterName,
  },
} as const;

export type Copy = typeof copy;
