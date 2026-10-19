import { useState } from 'react';
import { cx } from './cx.ts';
import { FieldFrame } from './FieldFrame.tsx';
import type { TextFieldProps } from './TextField.tsx';
import styles from './Field.module.css';

interface Props extends Omit<TextFieldProps, 'suffix' | 'type'> {
  /** Visible toggle text while the password is hidden. */
  showText: string;
  /** Visible toggle text while the password is shown. */
  hideText: string;
  /** Accessible name of the toggle. It should contain the visible text. */
  toggleLabel: string;
}

export function PasswordField({ label, hint, error, showText, hideText, toggleLabel, className, ...rest }: Props) {
  const [shown, setShown] = useState(false);
  return (
    <FieldFrame label={label} hint={hint} error={error}>
      {({ inputId, describedBy, invalid }) => (
        <div className={styles.control}>
          <input
            autoComplete="current-password"
            autoCapitalize="none"
            spellCheck={false}
            {...rest}
            id={inputId}
            type={shown ? 'text' : 'password'}
            className={cx(styles.input, invalid && styles.invalid, styles.withToggle, className)}
            aria-describedby={describedBy}
            aria-invalid={invalid || undefined}
          />
          <button
            type="button"
            className={styles.toggle}
            aria-label={toggleLabel}
            aria-pressed={shown}
            onClick={() => setShown((value) => !value)}
          >
            {shown ? hideText : showText}
          </button>
        </div>
      )}
    </FieldFrame>
  );
}
