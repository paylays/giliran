import { useEffect, useState } from 'react';
import { copy } from '../content/copy.ts';
import type { LiveStatus } from '../lib/live.ts';
import styles from './ConnectionStatus.module.css';

const RECOVERED_SHOWN_MS = 3000;

interface Props {
  status: LiveStatus;
  disconnectedSince: number | null;
  recoveredAt: number | null;
  /** Business time zone for the "since" time. Defaults to the device zone. */
  timeZone?: string;
}

function formatTime(epochMs: number, timeZone?: string): string {
  const options: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit' };
  if (timeZone) options.timeZone = timeZone;
  return new Intl.DateTimeFormat('id-ID', options).format(epochMs);
}

/**
 * Banner for the reconnecting and offline states, and a short "reconnected" notice after recovery.
 * The live region is always mounted so screen readers announce the text when it appears.
 */
export function ConnectionStatus({ status, disconnectedSince, recoveredAt, timeZone }: Props) {
  const [dismissedAt, setDismissedAt] = useState<number | null>(null);

  useEffect(() => {
    if (recoveredAt === null) return;
    const timer = window.setTimeout(() => setDismissedAt(recoveredAt), RECOVERED_SHOWN_MS);
    return () => window.clearTimeout(timer);
  }, [recoveredAt]);

  const down = status === 'reconnecting' || status === 'offline';
  const showRecovered = !down && status === 'live' && recoveredAt !== null && dismissedAt !== recoveredAt;

  return (
    <div role="status" className={styles.region}>
      {down && (
        <div className={`${styles.banner} ${styles.down}`}>
          <p className={styles.title}>{copy.connection.reconnectingTitle}</p>
          <p className={styles.body}>
            {status === 'offline'
              ? copy.connection.offline
              : disconnectedSince !== null
                ? copy.connection.reconnectingSince(formatTime(disconnectedSince, timeZone))
                : copy.connection.reconnectingBody}
          </p>
        </div>
      )}
      {showRecovered && (
        <div className={`${styles.banner} ${styles.recovered}`}>
          <p className={styles.body}>{copy.connection.reconnected}</p>
        </div>
      )}
    </div>
  );
}
