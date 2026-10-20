import { copy } from '../content/copy.ts';
import { playChime, unlockAudio } from './announce.ts';

// Phone alerts. Best effort: they only work while the page is open.

const NEAR_VIBRATION = [200, 100, 200];
const CALLED_VIBRATION = [400, 150, 400, 150, 400];
const TITLE_FLASH_MS = 1000;

export function canVibrate(): boolean {
  return typeof navigator.vibrate === 'function';
}

// Chrome blocks vibrate() and refuses to start audio until the visitor has interacted with the page.
let audioUnlocked = false;

function vibrate(pattern: number[]): boolean {
  return canVibrate() && navigator.userActivation?.hasBeenActive === true && navigator.vibrate(pattern);
}

function chime(kind: 'call' | 'near'): void {
  if (audioUnlocked) void playChime(kind);
}

export interface EnableResult {
  sound: boolean;
  vibration: boolean;
}

/** Call from the "enable alerts" button. Unlocks audio, plays the call chime once and vibrates once. */
export async function enableAlerts(): Promise<EnableResult> {
  const sound = await unlockAudio();
  if (sound) {
    audioUnlocked = true;
    await playChime('call');
  }
  const vibration = vibrate([200]);
  return { sound, vibration };
}

const nearAlerted = new Set<string>();

/** One-tone chime and short vibration. Fires once per key (use the ticket token); returns false on repeats. */
export function alertNear(key: string): boolean {
  if (nearAlerted.has(key)) return false;
  nearAlerted.add(key);
  vibrate(NEAR_VIBRATION);
  chime('near');
  return true;
}

/** Two-tone chime and long vibration, then a flashing tab title while the tab is hidden. */
export function alertCalled(ticketNumber: string, counterName: string): void {
  vibrate(CALLED_VIBRATION);
  chime('call');
  startTitleFlash(copy.ticket.tabCalled(ticketNumber), copy.ticket.tabGoTo(counterName));
}

let flashTimer: number | undefined;
let originalTitle: string | null = null;

function startTitleFlash(first: string, second: string): void {
  if (document.visibilityState === 'visible') return;
  stopTitleFlash();
  originalTitle = document.title;
  let showFirst = true;
  document.title = first;
  flashTimer = window.setInterval(() => {
    showFirst = !showFirst;
    document.title = showFirst ? first : second;
  }, TITLE_FLASH_MS);
  document.addEventListener('visibilitychange', onVisible);
}

function onVisible(): void {
  if (document.visibilityState === 'visible') stopTitleFlash();
}

/** Stops the flashing title and restores the title it replaced. Safe to call at any time. */
export function stopTitleFlash(): void {
  document.removeEventListener('visibilitychange', onVisible);
  if (flashTimer !== undefined) {
    window.clearInterval(flashTimer);
    flashTimer = undefined;
  }
  if (originalTitle !== null) {
    document.title = originalTitle;
    originalTitle = null;
  }
}
