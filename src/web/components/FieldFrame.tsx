import { useId, type ReactNode } from 'react';
import styles from './Field.module.css';

interface FrameProps {
  label: string;
  hint?: string;
  error?: string;
  /** Receives the ids to put on the control. */
  children: (ids: { inputId: string; describedBy: string | undefined; invalid: boolean }) => ReactNode;
}

/** Label above, control, then hint and error below, linked with aria-describedby. */
export function FieldFrame({ label, hint, error, children }: FrameProps) {
  const base = useId();
  const inputId = `${base}-input`;
  const hintId = `${base}-hint`;
  const errorId = `${base}-error`;
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ');
  return (
    <div className={styles.field}>
      <label htmlFor={inputId} className={styles.label}>
        {label}
      </label>
      {children({ inputId, describedBy: describedBy || undefined, invalid: Boolean(error) })}
      {hint && (
        <p id={hintId} className={styles.hint}>
          {hint}
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
