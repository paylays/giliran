import { useEffect, useState } from 'react';
import { copy } from '../../content/copy.ts';
import styles from './DisplayPage.module.css';

const RETRY_MS = 5000;

/**
 * A server-drawn QR on its own white field. A failed load shows the error text and retries,
 * so a code requested while the server restarts recovers without a page reload.
 */
function QrTile({ src, alt, errorText }: { src: string; alt: string; errorText: string }) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const failed = failedSrc === src;

  useEffect(() => {
    if (!failed) return;
    const timer = window.setTimeout(() => {
      setFailedSrc(null);
      setAttempt((n) => n + 1);
    }, RETRY_MS);
    return () => window.clearTimeout(timer);
  }, [failed]);

  if (failed) {
    return (
      <p role="alert" className={styles.qrError}>
        {errorText}
      </p>
    );
  }
  const url = attempt === 0 ? src : `${src}${src.includes('?') ? '&' : '?'}r=${attempt}`;
  return <img className={styles.qr} src={url} alt={alt} onError={() => setFailedSrc(src)} />;
}

interface Props {
  wifiSsid: string | null;
  wifiQrVersion: number | null;
}

/** Two steps when a Wi-Fi name is set (Wi-Fi first), otherwise the single take-a-number code. */
export function QrArea({ wifiSsid, wifiQrVersion }: Props) {
  if (wifiSsid === null) {
    return (
      <div className={styles.qrArea} data-count="1">
        <div className={styles.qrItem} style={{ width: 'calc(336 * var(--tv-px))' }}>
          <QrTile src="/api/qr.svg" alt={copy.display.qrAlt} errorText={copy.display.qrError} />
          <p className={styles.qrLine1}>{copy.display.qrCaption}</p>
          <p className={styles.qrLine2}>{copy.display.qrNeedsWifi}</p>
        </div>
      </div>
    );
  }
  return (
    <ol className={styles.qrArea} data-count="2" aria-label={copy.display.qrStepsLabel}>
      <li className={styles.qrItem}>
        <QrTile
          src={`/api/wifi-qr.svg?v=${wifiQrVersion ?? 0}`}
          alt={copy.display.wifiQrAlt(wifiSsid)}
          errorText={copy.display.wifiQrError}
        />
        <p className={styles.qrLine1}>{copy.display.wifiStepTitle}</p>
        <p className={styles.qrLine2Ssid}>{wifiSsid}</p>
      </li>
      <li className={styles.qrItem}>
        <QrTile src="/api/qr.svg" alt={copy.display.qrAlt} errorText={copy.display.qrError} />
        <p className={styles.qrLine1}>{copy.display.takeStepTitle}</p>
        <p className={styles.qrLine2}>{copy.display.takeStepNote}</p>
      </li>
    </ol>
  );
}
