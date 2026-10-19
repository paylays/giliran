import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation } from 'wouter';
import type { StaffSnapshot } from '../../../shared/contracts.ts';
import { ApiError, api } from '../../lib/api.ts';
import { useLiveSnapshot } from '../../lib/live.ts';

export type PanelAction = 'pick' | 'callNext' | 'recall' | 'skip' | 'done' | 'logout';
export type PanelNotice = 'conflict' | 'counterGone' | 'failed' | null;

function newer(a: StaffSnapshot | null, b: StaffSnapshot | null): StaffSnapshot | null {
  if (a === null) return b;
  if (b === null) return a;
  return b.serverTime >= a.serverTime ? b : a;
}

/**
 * Owns the staff panel state: one fetch for the first paint, the stream for freshness, and
 * POST responses applied at once. Whichever snapshot has the later server time wins.
 */
export function useStaffPanel() {
  const [, navigate] = useLocation();
  const live = useLiveSnapshot<StaffSnapshot>('/api/stream/staff');
  const [fetched, setFetched] = useState<StaffSnapshot | null>(null);
  const [loadError, setLoadError] = useState<'network' | 'server' | null>(null);
  const [busy, setBusy] = useState<PanelAction | null>(null);
  const [notice, setNotice] = useState<PanelNotice>(null);
  const busyRef = useRef(false);

  const toLogin = useCallback(() => navigate('/login', { replace: true }), [navigate]);

  const refresh = useCallback(
    () =>
      api.get<StaffSnapshot>('/api/staff/snapshot').then(
        (next) => {
          setFetched((prev) => newer(prev, next));
          setLoadError(null);
        },
        (error: unknown) => {
          if (error instanceof ApiError && error.status === 401) {
            toLogin();
            return;
          }
          setLoadError(error instanceof ApiError && error.status === 0 ? 'network' : 'server');
        },
      ),
    [toLogin],
  );

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // The stream cannot report a 401, so a lost connection triggers a plain request that can.
  useEffect(() => {
    if (live.status === 'reconnecting' || live.status === 'offline') void refresh();
  }, [live.status, refresh]);

  const snapshot = newer(fetched, live.snapshot);

  /** Runs one request at a time. Resolves to the new snapshot, or null when it failed. */
  const run = useCallback(
    async (action: PanelAction, send: () => Promise<StaffSnapshot>): Promise<StaffSnapshot | null> => {
      if (busyRef.current) return null;
      busyRef.current = true;
      setBusy(action);
      setNotice(null);
      try {
        const next = await send();
        setFetched((prev) => newer(prev, next));
        return next;
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) {
          toLogin();
          return null;
        }
        if (error instanceof ApiError && error.status === 409) {
          const gone = error.code === 'counter_inactive' || error.code === 'no_counter';
          setNotice(gone ? 'counterGone' : 'conflict');
          await refresh();
          return null;
        }
        setNotice('failed');
        return null;
      } finally {
        busyRef.current = false;
        setBusy(null);
      }
    },
    [refresh, toLogin],
  );

  const pickCounter = (counterId: number) =>
    run('pick', () => api.post<StaffSnapshot>('/api/staff/counter', { counterId }));
  const callNext = (expectedCurrentTicketId: number | null) =>
    run('callNext', () => api.post<StaffSnapshot>('/api/staff/call-next', { expectedCurrentTicketId }));
  const ticketAction = (action: 'recall' | 'skip' | 'done', ticketId: number) =>
    run(action, () => api.post<StaffSnapshot>(`/api/staff/${action}`, { ticketId }));

  const logout = async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy('logout');
    try {
      await api.post('/api/auth/logout');
    } catch (error) {
      if (!(error instanceof ApiError && error.status === 401)) {
        setNotice('failed');
        busyRef.current = false;
        setBusy(null);
        return;
      }
    }
    toLogin();
  };

  return { snapshot, live, loadError, busy, notice, refresh, pickCounter, callNext, ticketAction, logout };
}
