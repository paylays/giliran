import { useCallback, useEffect, useRef, useState } from 'react';
import type { TicketSnapshot } from '../../../shared/contracts.ts';
import { alertCalled, alertNear, stopTitleFlash } from '../../lib/alerts.ts';

// A call older than this on arrival is treated as already seen (reload, long outage).
const FRESH_CALL_MS = 30_000;

/**
 * Fires phone alerts from snapshot changes. A call id is handled once, so a recall (new id)
 * alerts again and a reload or reconnect does not replay old calls. The near alert fires
 * on the transition into near, once per ticket per page load.
 * Returns the call id whose full-screen message is open, and a function that closes it.
 */
export function useTicketAlerts(token: string, snapshot: TicketSnapshot | null) {
  const [handledCallId, setHandledCallId] = useState<string | null>(null);
  const [openCallId, setOpenCallId] = useState<string | null>(null);
  const alertedCallId = useRef<string | null>(null);
  const wasNear = useRef<boolean | null>(null);

  if (snapshot?.state === 'called' && snapshot.callId !== handledCallId) {
    setHandledCallId(snapshot.callId);
    setOpenCallId(snapshot.serverTime - snapshot.calledAt < FRESH_CALL_MS ? snapshot.callId : null);
  }

  useEffect(() => {
    if (snapshot?.state === 'called' && openCallId === snapshot.callId && alertedCallId.current !== snapshot.callId) {
      alertedCallId.current = snapshot.callId;
      alertCalled(snapshot.number, snapshot.counterName);
    }
  }, [snapshot, openCallId]);

  useEffect(() => {
    if (snapshot?.state !== 'waiting') return;
    if (wasNear.current === false && snapshot.near) alertNear(token);
    wasNear.current = snapshot.near;
  }, [snapshot, token]);

  useEffect(() => stopTitleFlash, []);

  const closeCalled = useCallback(() => setOpenCallId(null), []);
  return { openCallId, closeCalled };
}
