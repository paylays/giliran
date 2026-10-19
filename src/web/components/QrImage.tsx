import { useState } from 'react';
import styles from './QrImage.module.css';

const SOURCES = { visit: '/api/qr.svg', wifi: '/api/wifi-qr.svg' } as const;

interface Props {
  /** visit: the take-a-number address. wifi: the join-the-network code. */
  kind: keyof typeof SOURCES;
  /** Describes what scanning does. */
  alt: string;
  /** Side length: a number in px, or any CSS length such as a design-pixel calc(). */
  size: number | string;
  /** Shown instead of the image when it fails to load. */
  errorText: string;
}

/** The server draws the SVG with its own quiet zone on a white field. */
export function QrImage({ kind, alt, size, errorText }: Props) {
  const [failed, setFailed] = useState(false);
  const side = typeof size === 'number' ? `${size}px` : size;
  if (failed) {
    return (
      <p role="alert" className={styles.error}>
        {errorText}
      </p>
    );
  }
  return (
    <img
      className={styles.qr}
      src={SOURCES[kind]}
      alt={alt}
      style={{ width: side, height: side }}
      onError={() => setFailed(true)}
    />
  );
}
