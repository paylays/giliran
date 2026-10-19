import { useEffect, useId, useRef, type ReactNode } from 'react';
import { cx } from './cx.ts';
import styles from './Dialog.module.css';

interface Props {
  open: boolean;
  /** Called on Escape. The parent sets `open` to false. */
  onClose: () => void;
  title: string;
  children?: ReactNode;
  /** Buttons row, right-aligned. Cancel comes first, the main action second. */
  actions?: ReactNode;
  /** 440px (default) or 560px for forms. */
  size?: 'sm' | 'wide';
}

/**
 * Native modal dialog. The browser traps focus and makes the page inert; this wrapper moves
 * focus to the element marked `data-autofocus` (or the first control), and returns it to the
 * trigger on close. Content mounts only while open, so forms start fresh each time.
 */
export function Dialog({ open, onClose, title, children, actions, size = 'sm' }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const returnTo = useRef<HTMLElement | null>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      returnTo.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      dialog.showModal();
      dialog.querySelector<HTMLElement>('[data-autofocus]')?.focus();
    } else if (!open && dialog.open) {
      dialog.close();
      if (returnTo.current?.isConnected) returnTo.current.focus();
      returnTo.current = null;
    }
  }, [open]);

  useEffect(() => {
    const dialog = ref.current;
    return () => {
      if (dialog?.open) dialog.close();
    };
  }, []);

  return (
    <dialog
      ref={ref}
      className={cx(styles.dialog, size === 'wide' && styles.wide)}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      {open && (
        <>
          <h2 id={titleId} className={styles.title}>
            {title}
          </h2>
          {children && <div className={styles.content}>{children}</div>}
          {actions && <div className={styles.actions}>{actions}</div>}
        </>
      )}
    </dialog>
  );
}
