import { useEffect, useId, useRef } from 'react';
import { Button } from '../../components/Button.tsx';
import { copy } from '../../content/copy.ts';
import styles from './CalledOverlay.module.css';

interface Props {
  number: string;
  counterName: string;
  time: string;
  callCount: number;
  onClose: () => void;
}

/** Full-screen "your number was called" message. The rest of the page is inert while it is open. */
export function CalledOverlay({ number, counterName, time, callCount, onClose }: Props) {
  const titleId = useId();
  const buttonRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    buttonRef.current?.querySelector('button')?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      if (previous?.isConnected) previous.focus();
    };
  }, [onClose]);

  return (
    <div className={`${styles.overlay} on-teal`} role="alertdialog" aria-modal="true" aria-labelledby={titleId}>
      <h2 id={titleId} className={styles.title}>
        {callCount > 1 ? copy.ticket.recalledTitle : copy.ticket.calledTitle}
      </h2>
      <p className={styles.number}>{number}</p>
      <p className={styles.goTo}>{copy.ticket.goTo}</p>
      <p className={styles.counter}>{counterName}</p>
      <p className={styles.meta}>
        {copy.ticket.calledAt(time)}
        {callCount > 1 && `. ${copy.ticket.callCount(callCount)}`}
      </p>
      <div className={styles.action} ref={buttonRef}>
        <Button variant="onTeal" size="lg" fullWidth onClick={onClose}>
          {copy.ticket.dismissCalled}
        </Button>
      </div>
    </div>
  );
}
