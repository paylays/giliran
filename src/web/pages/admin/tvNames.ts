import { useEffect, useState } from 'react';

// Plate text width in design px at the narrowest fit level, by number of active counters (DESIGN.md 10.3).
export function tvLineWidth(activeCount: number): number {
  if (activeCount <= 4) return 272;
  if (activeCount <= 8) return 280;
  return 197;
}

const TOLERANCE_PX = 0.5;
const MAX_LINES = 2;

/** Measures text in the TV counter-name type: 700 at 40px, with tabular figures like the TV page. */
async function createMeter(): Promise<{ width: (text: string) => number; dispose: () => void }> {
  const family = getComputedStyle(document.body).fontFamily;
  await document.fonts?.load(`700 40px ${family}`).catch(() => undefined);
  const probe = document.createElement('span');
  Object.assign(probe.style, {
    position: 'absolute',
    visibility: 'hidden',
    pointerEvents: 'none',
    whiteSpace: 'nowrap',
    fontFamily: family,
    fontSize: '40px',
    fontWeight: '700',
    fontVariantNumeric: 'tabular-nums',
    letterSpacing: 'normal',
  });
  probe.setAttribute('aria-hidden', 'true');
  document.body.appendChild(probe);
  return {
    width: (text) => {
      probe.textContent = text;
      return probe.getBoundingClientRect().width;
    },
    dispose: () => probe.remove(),
  };
}

/** True when the name wraps greedily into at most two lines of `lineWidth` with no word wider than a line. */
function fitsWhole(name: string, lineWidth: number, width: (text: string) => number): boolean {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const limit = lineWidth + TOLERANCE_PX;
  if (words.some((word) => width(word) > limit)) return false;
  let lines = 1;
  let line = '';
  for (const word of words) {
    const next = line === '' ? word : `${line} ${word}`;
    if (line !== '' && width(next) > limit) {
      lines += 1;
      line = word;
    } else {
      line = next;
    }
  }
  return lines <= MAX_LINES;
}

/** Names of the active counters that cannot show whole on a TV plate for this many active counters. */
export async function findCutNames(names: string[]): Promise<string[]> {
  const lineWidth = tvLineWidth(names.length);
  const meter = await createMeter();
  try {
    return names.filter((name) => !fitsWhole(name, lineWidth, meter.width));
  } finally {
    meter.dispose();
  }
}

/** The active counter names that the TV would cut, recomputed whenever the active names change. */
export function useTvCutNames(activeNames: string[]): string[] {
  const [cut, setCut] = useState<string[]>([]);
  const key = JSON.stringify(activeNames);
  useEffect(() => {
    let stale = false;
    void findCutNames(JSON.parse(key) as string[]).then((result) => {
      if (!stale) setCut(result);
    });
    return () => {
      stale = true;
    };
  }, [key]);
  return cut;
}
