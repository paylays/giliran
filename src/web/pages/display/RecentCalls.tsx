import { copy } from '../../content/copy.ts';
import type { CallEntry } from '../../../shared/contracts.ts';
import { CounterPlate } from '../../components/CounterPlate.tsx';
import styles from './DisplayPage.module.css';

/** The calls before the latest one, newest first, as horizontal mini plates. */
export function RecentCalls({ calls }: { calls: CallEntry[] }) {
  return (
    <section className={styles.recent}>
      <h2 className={styles.heading}>{copy.display.recentHeading}</h2>
      {calls.length === 0 ? (
        <p className={styles.quiet}>{copy.display.recentNone}</p>
      ) : (
        <ul className={styles.recentList}>
          {calls.map((call) => (
            <li key={call.callId} className={styles.mini}>
              <span className={styles.srOnly}>{copy.display.recentItemLabel(call.number, call.counterName)}</span>
              <div aria-hidden="true">
                <CounterPlate label={call.counterName} size="tvSm" layout="side">
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
