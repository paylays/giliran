/** Time and date text in the business time zone, never the device zone. */

const timeFormats = new Map<string, Intl.DateTimeFormat>();
const dateFormats = new Map<string, Intl.DateTimeFormat>();

/** "10.42" */
export function formatTime(epochMs: number, timeZone?: string): string {
  const key = timeZone ?? '';
  let format = timeFormats.get(key);
  if (!format) {
    format = new Intl.DateTimeFormat('id-ID', { hour: '2-digit', minute: '2-digit', ...(timeZone ? { timeZone } : {}) });
    timeFormats.set(key, format);
  }
  return format.format(epochMs);
}

/** "Senin, 19 Oktober 2026" */
export function formatDate(epochMs: number, timeZone?: string): string {
  const key = timeZone ?? '';
  let format = dateFormats.get(key);
  if (!format) {
    format = new Intl.DateTimeFormat('id-ID', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      ...(timeZone ? { timeZone } : {}),
    });
    dateFormats.set(key, format);
  }
  return format.format(epochMs);
}
