import type { TicketSnapshot } from '../../../shared/contracts.ts';

/** A ticket this browser holds. `serviceId` matches it to a service row; entries saved before it existed lack it until the next check. */
export interface StoredTicket {
  token: string;
  number: string;
  serviceName: string;
  serviceId?: number;
}

const KEY = 'giliran.tickets';
// The API accepts at most 20 known tokens per request.
export const MAX_STORED = 20;

function isStored(value: unknown): value is StoredTicket {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.token === 'string' &&
    typeof v.number === 'string' &&
    typeof v.serviceName === 'string' &&
    (v.serviceId === undefined || typeof v.serviceId === 'number')
  );
}

export function readTickets(): StoredTicket[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(parsed) ? parsed.filter(isStored).slice(0, MAX_STORED) : [];
  } catch {
    return [];
  }
}

function writeTickets(list: StoredTicket[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX_STORED)));
  } catch {
    // Storage can be blocked (private mode). The ticket URL still works.
  }
}

/** Adds or updates a ticket, newest first. */
export function rememberTicket(ticket: StoredTicket): void {
  writeTickets([ticket, ...readTickets().filter((t) => t.token !== ticket.token)]);
}

export function forgetTicket(token: string): void {
  writeTickets(readTickets().filter((t) => t.token !== token));
}

/** True when a ticket can still be called today. */
export function isActiveState(state: TicketSnapshot['state']): boolean {
  return state === 'waiting' || state === 'called';
}

/**
 * Reads the first snapshot of a ticket stream and closes it. There is no plain GET for a
 * ticket, and opening an EventSource per stored token would use up the browser's
 * connection limit. Returns null when the server cannot be reached.
 */
export async function peekTicket(token: string, signal: AbortSignal): Promise<TicketSnapshot | null> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal.addEventListener('abort', abort);
  try {
    const response = await fetch(`/api/stream/ticket/${encodeURIComponent(token)}`, {
      headers: { Accept: 'text/event-stream' },
      signal: controller.signal,
    });
    if (!response.ok || !response.body) return null;
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    for (;;) {
      const { value, done } = await reader.read();
      if (done) return null;
      buffer += decoder.decode(value, { stream: true });
      for (const block of buffer.split(/\r?\n\r?\n/)) {
        const lines = block.split(/\r?\n/);
        if (!lines.includes('event: snapshot')) continue;
        const data = lines.find((line) => line.startsWith('data:'));
        if (!data) continue;
        try {
          return JSON.parse(data.slice(5).trim()) as TicketSnapshot;
        } catch {
          // Incomplete block; wait for more bytes.
        }
      }
    }
  } catch {
    return null;
  } finally {
    controller.abort();
    signal.removeEventListener('abort', abort);
  }
}
