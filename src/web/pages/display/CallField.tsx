import { useRef } from 'react';
import { copy } from '../../content/copy.ts';
import type { CallEntry } from '../../../shared/contracts.ts';
import { cx } from '../../components/cx.ts';
import { useFit } from './useFit.ts';
import styles from './DisplayPage.module.css';

// Preference order: keep the counter name on one line at 128, then let it wrap at 96. The number
// steps down (never below 184) only when the width or the height of the field demands it.
const FIT_STEPS: { number: number; counter: number; wrap: boolean }[] = [
  { number: 264, counter: 128, wrap: false },
  { number: 224, counter: 128, wrap: false },
  { number: 184, counter: 128, wrap: false },
  { number: 264, counter: 96, wrap: true },
  { number: 224, counter: 96, wrap: true },
  { number: 184, counter: 96, wrap: true },
];
const px = (n: number) => `calc(${n} * var(--tv-px))`;

interface Props {
  call: CallEntry | undefined;
  inverted: boolean;
}

/** The focal point: the latest called number and its counter, inverted to teal-900 at rest. */
export function CallField({ call, inverted }: Props) {
  const field = useRef<HTMLElement>(null);
  const numberEl = useRef<HTMLParagraphElement>(null);
  const nameEl = useRef<HTMLSpanElement>(null);

  useFit(() => {
    const num = numberEl.current;
    const name = nameEl.current;
    const box = field.current;
    if (!num || !name || !box) return;
    for (const step of FIT_STEPS) {
      num.style.fontSize = px(step.number);
      name.style.fontSize = px(step.counter);
      name.dataset.wrap = step.wrap ? 'yes' : 'no';
      const fits =
        num.scrollWidth <= num.clientWidth + 1 &&
        name.scrollWidth <= name.clientWidth + 1 &&
        box.scrollHeight <= box.clientHeight + 1;
      if (fits) break;
    }
  }, [call?.number, call?.counterName]);

  return (
    <section ref={field} className={cx(styles.field, inverted ? styles.fieldInverted : styles.fieldNormal)}>
      {call ? (
        <>
          <p className={styles.fieldLabel}>{copy.display.latestLabel}</p>
          <p ref={numberEl} className={styles.fieldNumber}>
            {call.number}
          </p>
          <div className={styles.fieldGoTo}>
            <span className={styles.fieldLabel}>{copy.display.latestGoTo}</span>
            <span ref={nameEl} className={styles.fieldCounter}>
              {call.counterName}
            </span>
          </div>
        </>
      ) : (
        <p className={styles.fieldNone}>{copy.display.latestNone}</p>
      )}
    </section>
  );
}
