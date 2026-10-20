import { useRef } from 'react';
import { copy } from '../../content/copy.ts';
import type { DisplayCounter } from '../../../shared/contracts.ts';
import { CounterPlate, type PlateSize } from '../../components/CounterPlate.tsx';
import { shortenName } from '../../lib/names.ts';
import { fitNames, useFit } from './useFit.ts';
import styles from './DisplayPage.module.css';

interface Props {
  counters: DisplayCounter[];
  /** Counter whose plate is flashing right now. */
  flashing: string | null;
  flashInverted: boolean;
}

/** 1 to 4 counters: one column of horizontal plates. 5 to 8: two columns. 9 to 12: three columns. */
export function Counters({ counters, flashing, flashInverted }: Props) {
  const count = counters.length;
  const tier = count <= 4 ? 1 : count <= 8 ? 2 : 3;
  const size: PlateSize = tier === 1 ? 'tvLg' : tier === 2 ? 'tvMd' : 'tvSm';
  const section = useRef<HTMLElement>(null);
  useFit(() => fitNames(section.current), [counters]);
  return (
    <section ref={section} className={styles.counters} data-tier={tier}>
      <h2 className={styles.heading}>{copy.display.countersHeading}</h2>
      {count === 0 ? (
        <p className={styles.quiet}>{copy.display.countersNone}</p>
      ) : (
        <ul className={styles.plates}>
          {counters.map((counter) => (
            <li key={counter.id} className={styles.cell}>
              <CounterPlate
                label={counter.name}
                shortLabel={shortenName(counter.name)}
                size={size}
                layout={tier === 1 ? 'side' : 'stacked'}
                inverted={flashing === counter.name && flashInverted}
                muted={!counter.current}
              >
                {counter.current ? counter.current.number : copy.display.counterNoTicket}
              </CounterPlate>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
