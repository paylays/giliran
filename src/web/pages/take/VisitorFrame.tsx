import type { ReactNode } from 'react';
import { copy } from '../../content/copy.ts';
import styles from './VisitorFrame.module.css';

interface Props {
  /** Business name once known, or null while it is still loading. An empty string falls back to the wordmark. */
  businessName: string | null;
  children: ReactNode;
  /** Short line above the wordmark in the footer. */
  footerNote?: string;
}

/** Shared page frame of the visitor screens: header with the business name, content column, footer wordmark. */
export function VisitorFrame({ businessName, children, footerNote }: Props) {
  const heading = businessName === null ? '' : businessName.trim() || copy.app.name;
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.column}>
          <p className={styles.business}>{heading}</p>
        </div>
      </header>
      <main className={`${styles.column} ${styles.main}`}>{children}</main>
      <footer className={`${styles.column} ${styles.footer}`}>
        {footerNote && <p className={styles.note}>{footerNote}</p>}
        <p className={styles.wordmark}>{copy.app.name}</p>
      </footer>
    </div>
  );
}
