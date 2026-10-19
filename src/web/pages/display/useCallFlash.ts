import { useCallback, useEffect, useRef, useState } from 'react';

const STEP_MS = 500;
const STEPS = 6;
const TOTAL_MS = STEP_MS * STEPS;

export interface CallFlash {
  /** Counter whose plate flashes together with the call field; null when idle. */
  counterName: string | null;
  /** True while the call field and the counter plate show the inverted state. */
  inverted: boolean;
  start: (counterName: string) => void;
}

/**
 * Hard-cut flash for the call moment: 500 ms steps, 3 cycles, ending inverted.
 * With reduced motion the inverted state is held for the same 3 s with no cuts.
 */
export function useCallFlash(): CallFlash {
  const [state, setState] = useState<{ counterName: string; step: number; reduced: boolean } | null>(null);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearInterval(timer.current), []);

  const start = useCallback((counterName: string) => {
    window.clearInterval(timer.current);
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    setState({ counterName, step: 0, reduced });
    const startedAt = Date.now();
    timer.current = window.setInterval(
      () => {
        const elapsed = Date.now() - startedAt;
        if (elapsed >= TOTAL_MS - STEP_MS / 2) {
          window.clearInterval(timer.current);
          setState(null);
          return;
        }
        setState((prev) => (prev ? { ...prev, step: Math.floor(elapsed / STEP_MS) } : prev));
      },
      reduced ? TOTAL_MS : STEP_MS,
    );
  }, []);

  if (!state) return { counterName: null, inverted: true, start };
  // Step 0 is a cut to the normal state and odd steps are inverted, so step 5 ends inverted.
  return { counterName: state.counterName, inverted: state.reduced || state.step % 2 === 1, start };
}
