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
 * Marks every counter name that has a word wider than its tab, or needs more than two lines,
 * so CSS can step it down to 40 design px.
 * Names are reset first, so a rename measures from the full size again.
 */
export function fitNames(root: HTMLElement | null): void {
  if (!root) return;
  const names = Array.from(root.querySelectorAll<HTMLElement>('[data-tab-text]'));
  names.forEach((el) => el.removeAttribute('data-fit'));
  names.forEach((el) => {
    const tooWide = el.scrollWidth > el.clientWidth + 0.5;
    // A clamped third line overflows by a line; the glyph overhang of one or two lines stays under half an em.
    const tooTall = el.scrollHeight - el.clientHeight > parseFloat(getComputedStyle(el).fontSize) * 0.5;
    if (tooWide || tooTall) el.setAttribute('data-fit', 'small');
  });
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
