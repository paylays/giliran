import type { ReactNode } from 'react';
import { cx } from './cx.ts';
import styles from './Banner.module.css';

export type BannerVariant = 'info' | 'warning' | 'error' | 'success';

interface Props {
  variant: BannerVariant;
  title?: string;
  children?: ReactNode;
  className?: string;
}

/**
 * Info and success announce politely, errors announce at once, and warnings are a static
 * note that is read in page order.
 */
const ROLE: Record<BannerVariant, 'status' | 'alert' | 'note'> = {
  info: 'status',
  success: 'status',
  error: 'alert',
  warning: 'note',
};

export function Banner({ variant, title, children, className }: Props) {
  return (
    <div role={ROLE[variant]} className={cx(styles.banner, styles[variant], className)}>
      {title && <p className={styles.title}>{title}</p>}
      {children && <div className={styles.body}>{children}</div>}
    </div>
  );
}
