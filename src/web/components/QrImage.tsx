import { useEffect, useState } from 'react';
import { cx } from './cx.ts';
import styles from './QrImage.module.css';

const SOURCES = { visit: '/api/qr.svg', wifi: '/api/wifi-qr.svg' } as const;
const RETRY_MS = 5000;

interface Props {
  /** visit: the take-a-number address. wifi: the join-the-network code. */
  kind: keyof typeof SOURCES;
  /** Describes what scanning does. */
  alt: string;
  /** Side length: a number in px, or any CSS length such as a design-pixel calc(). */
  size: number | string;
  /** Shown instead of the image when it fails to load. */
  errorText: string;
  /** Appended as `?v=`. A new value makes the browser fetch the code again. */
  version?: number | string;
  /** Called once the image has loaded or failed. */
  onSettled?: () => void;
  className?: string;
  errorClassName?: string;
}

/**
 * The server draws the SVG with its own quiet zone on a white field. A failed load shows the
 * error text and tries again, so a code requested while the server restarts recovers without
 * a page reload.
 */
export function QrImage({ kind, alt, size, errorText, version, onSettled, className, errorClassName }: Props) {
  const base = version === undefined ? SOURCES[kind] : `${SOURCES[kind]}?v=${version}`;
  const [failedBase, setFailedBase] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const failed = failedBase === base;

  useEffect(() => {
    if (!failed) return;
    const timer = window.setTimeout(() => {
      setFailedBase(null);
      setAttempt((n) => n + 1);
    }, RETRY_MS);
    return () => window.clearTimeout(timer);
  }, [failed]);

  if (failed) {
    return (
      <p role="alert" className={cx(styles.error, errorClassName)}>
        {errorText}
      </p>
    );
  }
  const side = typeof size === 'number' ? `${size}px` : size;
  const src = attempt === 0 ? base : `${base}${base.includes('?') ? '&' : '?'}r=${attempt}`;
  return (
    <img
      className={cx(styles.qr, className)}
      src={src}
      alt={alt}
      style={{ width: side, height: side }}
      onLoad={onSettled}
      onError={() => {
        setFailedBase(base);
        onSettled?.();
      }}
    />
  );
}
