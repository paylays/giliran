import { useEffect, useState } from 'react';
import { Banner } from './Banner.tsx';
import { Button } from './Button.tsx';
import styles from './StateView.module.css';

const LOADING_DELAY_MS = 300;

type Props =
  | { kind: 'loading'; message: string; delayMs?: number }
  | { kind: 'empty'; message: string }
  | {
      kind: 'error';
      title: string;
      message: string;
      retryLabel: string;
      onRetry: () => void;
      /** The retry request is running. */
      retrying?: boolean;
      retryingLabel?: string;
    };

/**
 * Stands in for content that is loading, empty, or failed. Loading is text only and appears
 * after a short delay so fast loads do not flicker. Error offers the retry action.
 */
export function StateView(props: Props) {
  if (props.kind === 'loading') return <Loading message={props.message} delayMs={props.delayMs ?? LOADING_DELAY_MS} />;
  if (props.kind === 'empty') {
    return <p className={styles.empty}>{props.message}</p>;
  }
  return (
    <div className={styles.view}>
      <Banner variant="error" title={props.title}>
        <p>{props.message}</p>
      </Banner>
      <Button variant="secondary" busy={props.retrying} onClick={props.onRetry}>
        {props.retrying && props.retryingLabel ? props.retryingLabel : props.retryLabel}
      </Button>
    </div>
  );
}

function Loading({ message, delayMs }: { message: string; delayMs: number }) {
  const [visible, setVisible] = useState(delayMs <= 0);
  useEffect(() => {
    if (delayMs <= 0) return;
    const timer = window.setTimeout(() => setVisible(true), delayMs);
    return () => window.clearTimeout(timer);
  }, [delayMs]);
  return (
    <div role="status" aria-busy="true">
      {visible && <p className={styles.text}>{message}</p>}
    </div>
  );
}
