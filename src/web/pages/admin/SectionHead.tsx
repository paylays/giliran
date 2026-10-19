import type { ReactNode } from 'react';
import styles from './admin.module.css';

interface Props {
  title: string;
  lead?: string;
  /** The primary action, placed right of the title on wide screens and under the lead on narrow ones. */
  action?: ReactNode;
}

export function SectionHead({ title, lead, action }: Props) {
  return (
    <div className={styles.titleRow}>
      <div className={styles.titleText}>
        <h1>{title}</h1>
        {lead && <p className={styles.lead}>{lead}</p>}
      </div>
      {action && <div className={styles.titleAction}>{action}</div>}
    </div>
  );
}
