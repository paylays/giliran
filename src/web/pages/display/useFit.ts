import { useLayoutEffect, type RefObject } from 'react';

/** Runs `fit` after layout and again once web fonts have loaded, because glyph widths change. */
export function useFit(fit: () => void, deps: readonly unknown[]): void {
  useLayoutEffect(() => {
    fit();
    let cancelled = false;
    void document.fonts?.ready.then(() => {
      if (!cancelled) fit();
    });
    return () => {
      cancelled = true;
    };
    // `fit` only touches refs; the caller lists what should trigger a new measurement.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

/**
 * Steps data-level up from 0 until the last child ends inside the element. Child boxes are measured
 * instead of scrollHeight, which also counts out-of-flow screen-reader text.
 */
export function fitLevels(ref: RefObject<HTMLElement | null>, levels: number): void {
  const el = ref.current;
  if (!el) return;
  for (let level = 0; level < levels; level += 1) {
    el.dataset.level = String(level);
    const bottom = el.getBoundingClientRect().bottom;
    if (Array.from(el.children).every((child) => child.getBoundingClientRect().bottom <= bottom + 0.5)) return;
  }
}
