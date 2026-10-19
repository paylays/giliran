import type { SelectHTMLAttributes } from 'react';
import { cx } from './cx.ts';
import { FieldFrame } from './FieldFrame.tsx';
import styles from './Field.module.css';

interface Props extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'id' | 'aria-describedby' | 'aria-invalid'> {
  label: string;
  hint?: string;
  error?: string;
}

/** Native select. Pass option elements as children. */
export function Select({ label, hint, error, className, children, ...rest }: Props) {
  return (
    <FieldFrame label={label} hint={hint} error={error}>
      {({ inputId, describedBy, invalid }) => (
        <div className={styles.control}>
          <select
            {...rest}
            id={inputId}
            className={cx(styles.input, invalid && styles.invalid, className)}
            aria-describedby={describedBy}
            aria-invalid={invalid || undefined}
          >
            {children}
          </select>
        </div>
      )}
    </FieldFrame>
  );
}
