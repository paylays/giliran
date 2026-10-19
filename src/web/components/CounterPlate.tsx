import type { ReactNode } from 'react';
import { cx } from './cx.ts';
import styles from './CounterPlate.module.css';

export type PlateSize = 'ticket' | 'staffCurrent' | 'staffNext' | 'tvLg' | 'tvMd' | 'tvSm';

interface PlateProps {
  /** Text of the tab: the counter name, or what the number is. Never empty. */
  label: string;
  /** The queue number exactly as issued, or the empty-plate text when `muted` is set. */
  children: ReactNode;
  size?: PlateSize;
  /** Tab on top (default) or, for TV plates, a full-height cell on the left. */
  layout?: 'stacked' | 'side';
  /** Teal-900 field with cream type. Reserved for the call moment. */
  inverted?: boolean;
  /** Renders the content as quiet label text, for a counter with no current ticket. */
  muted?: boolean;
  /** Detail lines under the number, such as service name, time, and a status badge. */
  footer?: ReactNode;
  /** Stretch to the full width of the parent. */
  block?: boolean;
  className?: string;
}

/**
 * The counter plate: a bordered box for a queue number with a teal tab that always says what
 * the number is. The tab comes first in the DOM so it is read before the number.
 */
export function CounterPlate({
  label,
  children,
  size = 'ticket',
  layout = 'stacked',
  inverted,
  muted,
  footer,
  block,
  className,
}: PlateProps) {
  return (
    <div
      className={cx(
        styles.plate,
        styles[size],
        layout === 'side' && styles.side,
        inverted && styles.inverted,
        block && styles.block,
        className,
      )}
    >
      <span className={styles.tab}>{label}</span>
      <div className={styles.box}>
        <span className={cx(styles.number, muted && styles.muted)}>{children}</span>
        {footer && <div className={styles.footer}>{footer}</div>}
      </div>
    </div>
  );
}

/**
 * Square mark with a service prefix. It repeats text read elsewhere on the same row,
 * so it is hidden from assistive technology.
 */
export function PrefixMark({ prefix }: { prefix: string }) {
  return (
    <span className={styles.mark} aria-hidden="true">
      {prefix}
    </span>
  );
}
