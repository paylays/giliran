import type { InputHTMLAttributes } from 'react';
import { cx } from './cx.ts';
import { FieldFrame } from './FieldFrame.tsx';
import styles from './Field.module.css';

export interface TextFieldProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'id' | 'aria-describedby' | 'aria-invalid'> {
  label: string;
  hint?: string;
  error?: string;
  /** Short unit shown inside the right edge, for example "orang". */
  suffix?: string;
}

export function TextField({ label, hint, error, suffix, className, type = 'text', ...rest }: TextFieldProps) {
  return (
    <FieldFrame label={label} hint={hint} error={error}>
      {({ inputId, describedBy, invalid }) => (
        <div className={styles.control}>
          <input
            {...rest}
            id={inputId}
            type={type}
            className={cx(styles.input, invalid && styles.invalid, suffix && styles.withSuffix, className)}
            aria-describedby={describedBy}
            aria-invalid={invalid || undefined}
          />
          {suffix && <span className={styles.suffix}>{suffix}</span>}
        </div>
      )}
    </FieldFrame>
  );
}
