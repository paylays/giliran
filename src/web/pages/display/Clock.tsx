import { useEffect, useState } from 'react';
import styles from './DisplayPage.module.css';

const dateFormat = new Intl.DateTimeFormat('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const timeFormat = new Intl.DateTimeFormat('id-ID', { hour: '2-digit', minute: '2-digit' });

/** Date and HH.MM clock on server-corrected time. Updates once a minute, on the minute. */
export function Clock({ serverOffset }: { serverOffset: number }) {
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
      <span className={styles.date}>{dateFormat.format(now)}</span>
      <span className={styles.clock}>{timeFormat.format(now)}</span>
    </div>
  );
}
