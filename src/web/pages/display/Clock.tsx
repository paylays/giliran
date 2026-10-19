import { useEffect, useState } from 'react';
import { formatDate, formatTime } from '../../lib/time.ts';
import styles from './DisplayPage.module.css';

/** Date and HH.MM clock on server-corrected time. Updates once a minute, on the minute. */
export function Clock({ serverOffset, timeZone }: { serverOffset: number; timeZone?: string }) {
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    let timer: number | undefined;
    const tick = () => {
      const current = Date.now() + serverOffset;
      setNow(current);
      timer = window.setTimeout(tick, 60_000 - (current % 60_000) + 20);
    };
    timer = window.setTimeout(tick, 0);
    return () => window.clearTimeout(timer);
  }, [serverOffset]);

  if (now === null) return <div className={styles.clockBlock} />;
  return (
    <div className={styles.clockBlock}>
      <span className={styles.date}>{formatDate(now, timeZone)}</span>
      <span className={styles.clock}>{formatTime(now, timeZone)}</span>
    </div>
  );
}
