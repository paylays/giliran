import { useRef, useState, type CSSProperties } from 'react';
import { copy } from '../../content/copy.ts';
import type { CallEntry } from '../../../shared/contracts.ts';
import { CounterPlate } from '../../components/CounterPlate.tsx';
import { shortenName } from '../../lib/names.ts';
import { useFit } from './useFit.ts';
import styles from './DisplayPage.module.css';

// Design pixels of the recent-calls column (408), the number cell it must keep (161), and the tab's side padding.
const COLUMN_PX = 408;
const MIN_NUMBER_CELL_PX = 161;
const TAB_PAD_PX = 32;
const MIN_TAB_PX = 182;

interface NameLayout {
  tabPx: number | null;
  labels: string[];
}

/** The calls before the latest one, newest first, as horizontal mini plates. */
export function RecentCalls({ calls }: { calls: CallEntry[] }) {
  const section = useRef<HTMLElement>(null);
  const [layout, setLayout] = useState<NameLayout>({ tabPx: null, labels: [] });
  const names = calls.map((call) => call.counterName);

  // One shared tab width from the widest name; names that still do not fit keep their first and last word.
  useFit(() => {
    const sample = section.current?.querySelector<HTMLElement>('[data-tab-text]');
    const ctx = document.createElement('canvas').getContext('2d');
    if (!sample || !ctx) return;
    const style = getComputedStyle(sample);
    const unit = parseFloat(style.fontSize) / 40;
    ctx.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
    const maxText = (COLUMN_PX - MIN_NUMBER_CELL_PX - TAB_PAD_PX) * unit;
    const widest = Math.max(...names.map((name) => ctx.measureText(name).width));
    const text = Math.min(Math.max(widest, (MIN_TAB_PX - TAB_PAD_PX) * unit), maxText);
    const labels = names.map((name) => (ctx.measureText(name).width > text ? shortenName(name) : name));
    const tabPx = text + TAB_PAD_PX * unit;
    setLayout((prev) =>
      prev.tabPx === tabPx && prev.labels.length === labels.length && prev.labels.every((l, i) => l === labels[i])
        ? prev
        : { tabPx, labels },
    );
  }, [names.join('|')]);

  const shown = (index: number, name: string) => (layout.labels.length === names.length ? layout.labels[index] ?? name : name);
  return (
    <section ref={section} className={styles.recent}>
      <h2 className={styles.heading}>{copy.display.recentHeading}</h2>
      {calls.length === 0 ? (
        <p className={styles.quiet}>{copy.display.recentNone}</p>
      ) : (
        <ul
          className={styles.recentList}
          style={layout.tabPx ? ({ '--mini-tab': `${layout.tabPx}px` } as CSSProperties) : undefined}
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
