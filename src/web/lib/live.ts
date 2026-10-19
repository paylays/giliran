import { useEffect, useState } from 'react';

export type LiveStatus = 'connecting' | 'live' | 'reconnecting' | 'offline';

export interface LiveState<T> {
  snapshot: T | null;
  status: LiveStatus;
  /** serverTime minus the client clock at receipt, in ms. Add it to Date.now() to get server time. */
  serverOffset: number;
  /** Client epoch ms when the connection was lost; null while connected. */
  disconnectedSince: number | null;
  /** Client epoch ms of the last recovery from reconnecting or offline; null if none happened. */
  recoveredAt: number | null;
}

const BACKOFF_MS = [1000, 2000, 5000, 10000];
const JITTER_MS = 500;
const RECONNECTING_AFTER_MS = 3000;
const WATCHDOG_MS = 40_000;
const STALE_AFTER_MS = 20_000;

interface Tagged<T> extends LiveState<T> {
  url: string | null;
}

function initial<T>(url: string | null): Tagged<T> {
  return {
    url,
    snapshot: null,
    status: 'connecting',
    serverOffset: 0,
    disconnectedSince: null,
    recoveredAt: null,
  };
}

/**
 * Subscribes to an SSE stream that sends whole-state `snapshot` events and `ping` keepalives.
 * Reconnects with backoff, restarts a silent stream after 40 s, and resyncs on `online`
 * and when the tab becomes visible. Pass null to stay idle.
 */
export function useLiveSnapshot<T>(url: string | null): LiveState<T> {
  const [state, setState] = useState<Tagged<T>>(() => initial<T>(url));

  useEffect(() => {
    if (url === null) return;

    let source: EventSource | null = null;
    let disposed = false;
    let attempt = 0;
    let lastMessageAt = 0;
    let reconnectTimer: number | undefined;
    let watchdogTimer: number | undefined;
    let reconnectingTimer: number | undefined;
    let disconnectedAt: number | null = null;

    const patch = (next: Partial<LiveState<T>>) => {
      setState((prev) => ({ ...(prev.url === url ? prev : initial<T>(url)), ...next }));
    };

    const markDisconnected = () => {
      if (disconnectedAt === null) {
        disconnectedAt = Date.now();
        patch({ disconnectedSince: disconnectedAt });
      }
      if (!navigator.onLine) {
        patch({ status: 'offline' });
        return;
      }
      if (reconnectingTimer === undefined) {
        reconnectingTimer = window.setTimeout(() => {
          reconnectingTimer = undefined;
          if (disconnectedAt !== null) patch({ status: navigator.onLine ? 'reconnecting' : 'offline' });
        }, RECONNECTING_AFTER_MS);
      }
    };

    const armWatchdog = () => {
      window.clearTimeout(watchdogTimer);
      watchdogTimer = window.setTimeout(() => {
        markDisconnected();
        connect();
      }, WATCHDOG_MS);
    };

    const markAlive = () => {
      lastMessageAt = Date.now();
      armWatchdog();
    };

    const scheduleReconnect = () => {
      window.clearTimeout(reconnectTimer);
      const base = BACKOFF_MS[Math.min(attempt, BACKOFF_MS.length - 1)] ?? 10000;
      attempt += 1;
      reconnectTimer = window.setTimeout(connect, base + Math.random() * JITTER_MS);
    };

    function connect() {
      if (disposed) return;
      window.clearTimeout(reconnectTimer);
      source?.close();
      const es = new EventSource(url!);
      source = es;
      armWatchdog();

      es.addEventListener('snapshot', (event) => {
        if (source !== es) return;
        let data: T & { serverTime?: number };
        try {
          data = JSON.parse((event as MessageEvent<string>).data) as T & { serverTime?: number };
        } catch {
          return;
        }
        markAlive();
        attempt = 0;
        window.clearTimeout(reconnectingTimer);
        reconnectingTimer = undefined;
        const recovered = disconnectedAt !== null;
        disconnectedAt = null;
        const next: Partial<LiveState<T>> = { snapshot: data, status: 'live', disconnectedSince: null };
        if (typeof data.serverTime === 'number') next.serverOffset = data.serverTime - Date.now();
        if (recovered) next.recoveredAt = Date.now();
        patch(next);
      });

      es.addEventListener('ping', () => {
        if (source === es) markAlive();
      });

      es.addEventListener('error', () => {
        if (source !== es) return;
        markDisconnected();
        // CLOSED means the browser gave up; CONNECTING means it is retrying by itself.
        if (es.readyState === EventSource.CLOSED) scheduleReconnect();
      });
    }

    const reconnectIfStale = () => {
      if (disposed) return;
      if (disconnectedAt !== null || Date.now() - lastMessageAt > STALE_AFTER_MS) {
        attempt = 0;
        connect();
      }
    };

    const onOnline = () => reconnectIfStale();
    const onOffline = () => markDisconnected();
    const onVisibility = () => {
      if (document.visibilityState === 'visible') reconnectIfStale();
    };

    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    document.addEventListener('visibilitychange', onVisibility);
    connect();

    return () => {
      disposed = true;
      source?.close();
      window.clearTimeout(reconnectTimer);
      window.clearTimeout(watchdogTimer);
      window.clearTimeout(reconnectingTimer);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [url]);

  return state.url === url ? state : initial<T>(url);
}
