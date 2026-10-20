import { useRef, useState, type CSSProperties } from 'react';
import { copy } from '../../content/copy.ts';
import type { CallEntry } from '../../../shared/contracts.ts';
import { CounterPlate } from '../../components/CounterPlate.tsx';
import { shortenName } from '../../lib/names.ts';
import { useFit } from './useFit.ts';
import styles from './DisplayPage.module.css';

// Design pixels: the number cell the column must keep for the plate number, and the tab's side padding.
const MIN_NUMBER_CELL_PX = 161;
const TAB_PAD_PX = 32;
const MIN_TAB_PX = 182;
const TOLERANCE_PX = 0.5;

interface NameLayout {
  /** Shared tab width in design px, or null before the first measurement. */
  tab: number | null;
  labels: string[];
}

/**
 * Width of each text in the tab's own type. A DOM element is used because canvas measureText ignores
 * font-variant-numeric: tabular-nums, which makes "Loket 11" render wider than it measures.
 */
function measureWidths(host: HTMLElement, texts: string[]): number[] {
  const probe = document.createElement('span');
  probe.setAttribute('aria-hidden', 'true');
  probe.style.cssText = 'position:absolute;visibility:hidden;pointer-events:none;white-space:nowrap;';
  host.appendChild(probe);
  const widths = texts.map((text) => {
    probe.textContent = text;
    return probe.getBoundingClientRect().width;
  });
  probe.remove();
  return widths;
}

/**
 * The calls before the latest one, newest first, as horizontal mini plates.
 * `layoutKey` changes when the column width changes, so the names are measured again.
 */
export function RecentCalls({ calls, layoutKey }: { calls: CallEntry[]; layoutKey: string }) {
  const section = useRef<HTMLElement>(null);
  const [layout, setLayout] = useState<NameLayout>({ tab: null, labels: [] });
  const names = calls.map((call) => call.counterName);

  // One shared tab width from the widest name, capped by the real column width. A name that is still too
  // wide keeps its first and last word; if that does not fit either, the whole name ends in an ellipsis.
  useFit(() => {
    const root = section.current;
    const sample = root?.querySelector<HTMLElement>('[data-tab-text]');
    const host = sample?.parentElement;
    if (!root || !sample || !host) return;
    const unit = parseFloat(getComputedStyle(sample).fontSize) / 40;
    if (!(unit > 0)) return;
    const shortForms = names.map(shortenName);
    const widths = measureWidths(host, [...names, ...shortForms]);
    const whole = widths.slice(0, names.length);
    const short = widths.slice(names.length);
    const column = root.getBoundingClientRect().width / unit;
    const maxText = column - MIN_NUMBER_CELL_PX - TAB_PAD_PX;
    const widest = Math.max(...whole) / unit;
    const text = Math.min(Math.max(widest, MIN_TAB_PX - TAB_PAD_PX), maxText);
    const labels = names.map((name, i) => {
      if (whole[i]! / unit <= text + TOLERANCE_PX / unit) return name;
      const shortened = shortForms[i]!;
      return shortened !== name && short[i]! / unit <= text + TOLERANCE_PX / unit ? shortened : name;
    });
    // One extra pixel keeps a name that exactly fills the tab from tripping the ellipsis.
    const tab = text + TAB_PAD_PX + 1 / unit;
    setLayout((prev) =>
      prev.tab === tab && prev.labels.length === labels.length && prev.labels.every((l, i) => l === labels[i])
        ? prev
        : { tab, labels },
    );
  }, [names.join('|'), layoutKey]);

  const shown = (index: number, name: string) => (layout.labels.length === names.length ? layout.labels[index] ?? name : name);
  return (
    <section ref={section} className={styles.recent}>
      <h2 className={styles.heading}>{copy.display.recentHeading}</h2>
      {calls.length === 0 ? (
        <p className={styles.quiet}>{copy.display.recentNone}</p>
      ) : (
        <ul
          className={styles.recentList}
          style={layout.tab ? ({ '--mini-tab': `calc(${layout.tab} * var(--u))` } as CSSProperties) : undefined}
        >
          {calls.map((call, index) => (
            <li key={call.callId} className={styles.mini}>
              <span className={styles.srOnly}>{copy.display.recentItemLabel(call.number, call.counterName)}</span>
              <div aria-hidden="true">
                <CounterPlate label={shown(index, call.counterName)} size="tvSm" layout="side">
                  {call.number}
                </CounterPlate>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
