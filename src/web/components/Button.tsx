import type { ButtonHTMLAttributes, MouseEvent } from 'react';
import { cx } from './cx.ts';
import styles from './Button.module.css';

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'dangerConfirm' | 'quiet' | 'onTeal';
export type ButtonSize = 'md' | 'lg' | 'xl';

export interface ButtonStyleProps {
  variant?: ButtonVariant;
  /** md is 48px high, lg 56px, xl 72px. */
  size?: ButtonSize;
  fullWidth?: boolean;
  /** A request is running and repeat clicks are blocked. The caller passes the busy label as children. */
  busy?: boolean;
  disabled?: boolean;
}

export function buttonClass({ variant = 'primary', size = 'md', fullWidth }: ButtonStyleProps): string {
  return cx(styles.button, styles[variant], size !== 'md' && styles[size], fullWidth && styles.full);
}

type Props = ButtonStyleProps & Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'disabled'>;

/**
 * Unavailable buttons use aria-disabled instead of the disabled attribute, so they stay
 * focusable and a screen reader can reach the reason shown next to them.
 */
export function Button({ variant, size, fullWidth, busy, disabled, onClick, type = 'button', className, ...rest }: Props) {
  const blocked = Boolean(disabled || busy);
  const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
    if (blocked) {
      event.preventDefault();
      return;
    }
    onClick?.(event);
  };
  return (
    <button
      {...rest}
      type={type}
      className={cx(buttonClass({ variant, size, fullWidth }), className)}
      aria-disabled={blocked || undefined}
      aria-busy={busy || undefined}
      onClick={handleClick}
    />
  );
}
