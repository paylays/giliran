import { useEffect, useState, type ReactNode } from 'react';
import { copy } from '../content/copy.ts';
import type { LiveStatus } from '../lib/live.ts';
import { formatTime } from '../lib/time.ts';
import styles from './ConnectionStatus.module.css';

const RECOVERED_SHOWN_MS = 3000;

interface Props {
  status: LiveStatus;
  disconnectedSince: number | null;
  recoveredAt: number | null;
  /** Business time zone for the "since" time. Defaults to the device zone. */
  timeZone?: string;
  /** banner: reconnecting banner for phone, staff and admin. tv: the status line of the display page. */
  variant?: 'banner' | 'tv';
  /** TV only: left side of the status line. */
  wordmark?: ReactNode;
  /** TV only: sound state shown after the connection text while connected. */
  soundText?: string;
}

/**
 * Banner for the reconnecting and offline states, and a short "reconnected" notice after recovery.
 * The live region is always mounted so screen readers announce the text when it appears.
 */
export function ConnectionStatus({
  status,
  disconnectedSince,
  recoveredAt,
  timeZone,
  variant = 'banner',
  wordmark,
  soundText,
}: Props) {
  const [dismissedAt, setDismissedAt] = useState<number | null>(null);

  useEffect(() => {
    if (recoveredAt === null) return;
    const timer = window.setTimeout(() => setDismissedAt(recoveredAt), RECOVERED_SHOWN_MS);
    return () => window.clearTimeout(timer);
  }, [recoveredAt]);

  const down = status === 'reconnecting' || status === 'offline';
  const showRecovered = !down && status === 'live' && recoveredAt !== null && dismissedAt !== recoveredAt;

  if (variant === 'tv') {
    const sinceText =
      status === 'offline'
        ? copy.connection.offline
        : disconnectedSince !== null
          ? copy.connection.reconnectingSince(formatTime(disconnectedSince, timeZone))
          : copy.connection.reconnectingBody;
    const liveText = showRecovered
      ? copy.connection.reconnected
      : status === 'live'
        ? soundText
          ? `${copy.connection.connected} · ${soundText}`
          : copy.connection.connected
        : copy.connection.connecting;
    return (
      <div className={`${styles.strip} ${down ? styles.stripDown : ''}`}>
        <span className={styles.stripMark}>{wordmark}</span>
        <span role="status" className={styles.stripText}>
          {down ? sinceText : liveText}
        </span>
      </div>
    );
  }

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
