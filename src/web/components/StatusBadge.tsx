import styles from './StatusBadge.module.css';

export type TicketStatus = 'waiting' | 'called' | 'done' | 'skipped' | 'expired';

/** Ticket status label. The text is always present; color only supports it. */
export function StatusBadge({ status, children }: { status: TicketStatus; children: string }) {
  return <span className={`${styles.badge} ${styles[status]}`}>{children}</span>;
}
