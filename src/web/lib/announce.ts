import { useSyncExternalStore } from 'react';
import { announceCall, announceRecall, copy } from '../content/copy.ts';

// ---- Audio unlock and chime ----

type ChimeKind = 'call' | 'near';

// Two sine tones (880 Hz, 660 Hz) of 350 ms for a call; one 880 Hz tone of 300 ms for "near".
const CHIME_TONES: Record<ChimeKind, { freq: number; ms: number }[]> = {
  call: [
    { freq: 880, ms: 350 },
    { freq: 660, ms: 350 },
  ],
  near: [{ freq: 880, ms: 300 }],
};
const CHIME_PEAK_GAIN = 0.3;
const ATTACK_S = 0.01;
const PAUSE_AFTER_CHIME_MS = 300;
// Limit for an utterance that never starts, then a limit that grows with the text once it has.
const SPEECH_START_STALL_MS = 5000;
const SPEECH_BASE_MS = 3000;
const SPEECH_PER_CHAR_MS = 120;
const MAX_CALL_AGE_MS = 30_000;

let context: AudioContext | null = null;

function getContext(): AudioContext | null {
  if (context) return context;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  context = new Ctor();
  context.addEventListener('statechange', emitAudioChange);
  return context;
}

/** Call from a click or key handler. Resolves true when the page is allowed to make sound. */
export async function unlockAudio(): Promise<boolean> {
  const ctx = getContext();
  if (!ctx) return false;
  // Voices do not depend on the context, so a resume() that never settles cannot leave speech unloaded.
  loadVoices();
  if (ctx.state !== 'running') {
    try {
      await ctx.resume();
    } catch {
      return false;
    }
  }
  loadVoices();
  emitAudioChange();
  return ctx.state === 'running';
}

/**
 * Unlocks audio without a gesture when the browser allows it (kiosk Chrome started with
 * --autoplay-policy=no-user-gesture-required). Resolves false in a normal browser, which needs a click.
 */
export async function unlockAudioIfAllowed(): Promise<boolean> {
  const policy = (navigator as unknown as { getAutoplayPolicy?: (type: string) => string }).getAutoplayPolicy?.(
    'audiocontext',
  );
  if (policy !== undefined && policy !== 'allowed') return false;
  const ctx = getContext();
  if (!ctx) return false;
  if (ctx.state !== 'running') {
    // A blocked resume() never settles, so do not wait for it past a short grace period.
    await Promise.race([ctx.resume().catch(() => undefined), sleep(500)]);
  }
  if ((ctx.state as AudioContextState) !== 'running') return false;
  loadVoices();
  emitAudioChange();
  return true;
}

/** Plays the chime. Resolves when it ends; resolves at once, silent, when audio is still locked. */
export async function playChime(kind: ChimeKind = 'call'): Promise<void> {
  const ctx = getContext();
  if (!ctx) return;
  if (ctx.state !== 'running') {
    // A blocked resume() never settles; waiting on it would hold the whole announcement queue.
    await Promise.race([ctx.resume().catch(() => undefined), sleep(500)]);
    if ((ctx.state as AudioContextState) !== 'running') return;
  }

  let start = ctx.currentTime;
  for (const tone of CHIME_TONES[kind]) {
    const end = start + tone.ms / 1000;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = tone.freq;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(CHIME_PEAK_GAIN, start + ATTACK_S);
    gain.gain.exponentialRampToValueAtTime(0.0001, end);
    osc.connect(gain).connect(ctx.destination);
    osc.start(start);
    osc.stop(end + 0.02);
    start = end;
  }
  const total = CHIME_TONES[kind].reduce((sum, tone) => sum + tone.ms, 0);
  await sleep(total);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

// ---- Voice ----

let voice: SpeechSynthesisVoice | null = null;
let voicesLoaded = false;

function pickVoice(): SpeechSynthesisVoice | null {
  const voices = window.speechSynthesis.getVoices();
  const matches = voices.filter((v) => /^id([-_]|$)/i.test(v.lang));
  return matches.find((v) => v.localService) ?? matches[0] ?? null;
}

function loadVoices(): void {
  if (!('speechSynthesis' in window)) {
    voicesLoaded = true;
    return;
  }
  const refresh = () => {
    const found = pickVoice();
    if (found !== voice || (!voicesLoaded && window.speechSynthesis.getVoices().length > 0)) {
      voice = found;
      voicesLoaded = voicesLoaded || window.speechSynthesis.getVoices().length > 0;
      emitAudioChange();
    }
  };
  if (!voiceListenerAdded) {
    voiceListenerAdded = true;
    window.speechSynthesis.addEventListener('voiceschanged', refresh);
  }
  refresh();
  // Some browsers never fire voiceschanged when no voice exists; stop waiting after a moment.
  window.setTimeout(() => {
    if (!voicesLoaded) {
      voicesLoaded = true;
      emitAudioChange();
    }
  }, 2000);
}
let voiceListenerAdded = false;

// Held at module level: Chrome can drop an utterance (and its end event) once it is garbage collected.
let activeUtterance: SpeechSynthesisUtterance | null = null;

function speak(text: string): Promise<void> {
  return new Promise((resolve) => {
    if (!voice || !('speechSynthesis' in window)) {
      resolve();
      return;
    }
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = copy.speech.lang;
    utterance.rate = 0.9;
    utterance.pitch = 1;
    utterance.volume = 1;
    try {
      utterance.voice = voice;
    } catch {
      // Stale voice object: fall back to the language tag alone.
    }
    activeUtterance = utterance;

    let finished = false;
    const done = () => {
      if (finished) return;
      finished = true;
      window.clearTimeout(timeout);
      if (activeUtterance === utterance) activeUtterance = null;
      resolve();
    };
    // A stalled utterance would block later ones in Chrome's queue, so drop it before moving on.
    // Cancelling is only for speech that never starts or runs far past its expected length.
    const giveUp = () => {
      window.speechSynthesis.cancel();
      // A paused synth would stall every later utterance; resume() is a no-op when not paused.
      window.speechSynthesis.resume();
      done();
    };
    let timeout = window.setTimeout(giveUp, SPEECH_START_STALL_MS);
    utterance.addEventListener('start', () => {
      if (finished) return;
      window.clearTimeout(timeout);
      timeout = window.setTimeout(giveUp, SPEECH_BASE_MS + SPEECH_PER_CHAR_MS * text.length);
    });
    utterance.addEventListener('end', done);
    utterance.addEventListener('error', done);
    window.speechSynthesis.speak(utterance);
  });
}

// ---- Audio status for the UI ----

export type AudioStatus = 'locked' | 'on' | 'chime-only';

let lastStatus: AudioStatus = 'locked';
const listeners = new Set<() => void>();

function computeStatus(): AudioStatus {
  if (!context || context.state !== 'running') return 'locked';
  const speechSupported = 'speechSynthesis' in window;
  if (!speechSupported) return 'chime-only';
  if (voice) return 'on';
  // Until the voice list has loaded, assume speech works so the status line does not flicker.
  return voicesLoaded ? 'chime-only' : 'on';
}

function emitAudioChange(): void {
  const next = computeStatus();
  if (next === lastStatus) return;
  lastStatus = next;
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getAudioStatus(): AudioStatus {
  return lastStatus;
}

/** 'locked' until a user gesture unlocks audio; 'chime-only' when no Indonesian voice exists. */
export function useAudioStatus(): AudioStatus {
  return useSyncExternalStore(subscribe, getAudioStatus, getAudioStatus);
}

// ---- Announcement queue ----

export interface CallToAnnounce {
  /** `${ticketId}:${callCount}`; a count above 1 is a recall. */
  callId: string;
  number: string;
  counterName: string;
  calledAt: number;
}

let queue: Promise<void> = Promise.resolve();

/** Queues one call: chime, short pause, spoken line. Calls play one at a time, in the order queued. */
export function enqueueCallAnnouncement(call: CallToAnnounce): Promise<void> {
  const task = async () => {
    await playChime('call');
    if (!voice) return;
    await sleep(PAUSE_AFTER_CHIME_MS);
    const callCount = Number(call.callId.split(':')[1] ?? '1');
    // Prefixes are letters only, so the leading letters of the number are the prefix.
    const prefix = /^[A-Za-z]+/.exec(call.number)?.[0];
    const line = callCount > 1 ? announceRecall(call.number, call.counterName, prefix) : announceCall(call.number, call.counterName, prefix);
    await speak(line);
  };
  queue = queue.then(task, task);
  return queue;
}

// ---- Announced set ----

export interface CallTracker {
  /**
   * Feed it the calls in the latest snapshot. The first batch only seeds the set and returns nothing,
   * so a page load never replays old calls. Later batches return unseen calls younger than 30 s
   * by server time, oldest first. Every unseen id is remembered, announced or not.
   */
  update(calls: readonly CallToAnnounce[], serverTime: number): CallToAnnounce[];
}

export function createCallTracker(): CallTracker {
  const seen = new Set<string>();
  let seeded = false;
  return {
    update(calls, serverTime) {
      const fresh: CallToAnnounce[] = [];
      for (const call of calls) {
        if (seen.has(call.callId)) continue;
        seen.add(call.callId);
        if (seeded && serverTime - call.calledAt < MAX_CALL_AGE_MS) fresh.push(call);
      }
      seeded = true;
      return fresh.sort((a, b) => a.calledAt - b.calledAt);
    },
  };
}
