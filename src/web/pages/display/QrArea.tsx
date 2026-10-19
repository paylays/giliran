import { QrImage } from '../../components/QrImage.tsx';
import { copy } from '../../content/copy.ts';
import styles from './DisplayPage.module.css';

const QR_SIZE = 'calc(168 * var(--u))';

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
          <QrImage
            kind="visit"
            size={QR_SIZE}
            alt={copy.display.qrAlt}
            errorText={copy.display.qrError}
            errorClassName={styles.qrError}
          />
          <p className={styles.qrLine1}>{copy.display.qrCaption}</p>
          <p className={styles.qrLine2}>{copy.display.qrNeedsWifi}</p>
        </div>
      </div>
    );
  }
  return (
    <ol className={styles.qrArea} data-count="2" aria-label={copy.display.qrStepsLabel}>
      <li className={styles.qrItem}>
        <QrImage
          kind="wifi"
          version={wifiQrVersion ?? 0}
          size={QR_SIZE}
          alt={copy.display.wifiQrAlt(wifiSsid)}
          errorText={copy.display.wifiQrError}
          errorClassName={styles.qrError}
        />
        <p className={styles.qrLine1}>{copy.display.wifiStepTitle}</p>
        <p className={styles.qrLine2Ssid}>{wifiSsid}</p>
      </li>
      <li className={styles.qrItem}>
        <QrImage
            kind="visit"
            size={QR_SIZE}
            alt={copy.display.qrAlt}
            errorText={copy.display.qrError}
            errorClassName={styles.qrError}
          />
        <p className={styles.qrLine1}>{copy.display.takeStepTitle}</p>
        <p className={styles.qrLine2}>{copy.display.takeStepNote}</p>
      </li>
    </ol>
  );
}
