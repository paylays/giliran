import { useId, type InputHTMLAttributes } from 'react';
import { cx } from './cx.ts';
import styles from './Checkbox.module.css';

interface Props
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'id' | 'aria-describedby' | 'aria-invalid'> {
  label: string;
  help?: string;
  error?: string;
}

/** The whole row (box plus label) is the hit area. */
export function Checkbox({ label, help, error, className, ...rest }: Props) {
  const base = useId();
  const helpId = `${base}-help`;
  const errorId = `${base}-error`;
  const describedBy = [help ? helpId : null, error ? errorId : null].filter(Boolean).join(' ') || undefined;
  return (
    <div className={styles.root}>
      <label className={styles.row}>
        <input
          {...rest}
          type="checkbox"
          className={cx(styles.box, error && styles.invalid, className)}
          aria-describedby={describedBy}
          aria-invalid={error ? true : undefined}
        />
        <span className={styles.text}>{label}</span>
      </label>
      {help && (
        <p id={helpId} className={styles.help}>
          {help}
        </p>
      )}
      {error && (
        <p id={errorId} className={styles.error}>
          {error}
        </p>
      )}
    </div>
  );
}
