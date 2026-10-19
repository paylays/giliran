import { useRef, useState } from 'react';
import { Link } from 'wouter';
import { Banner } from '../../components/Banner.tsx';
import { Button } from '../../components/Button.tsx';
import { StateView } from '../../components/StateView.tsx';
import { copy } from '../../content/copy.ts';
import type { SettingsDto } from '../../../shared/contracts.ts';
import { SectionHead } from './SectionHead.tsx';
import { useResource } from './useApi.ts';
import { useDocTitle } from './useDocTitle.ts';
import adminStyles from './admin.module.css';
import styles from './poster.module.css';

const t = copy.admin.poster;
const IMAGE_WAIT_MS = 3000;

export function PosterSection() {
  useDocTitle(t.title);
  const { state, retry } = useResource<SettingsDto>('/api/admin/settings');

  if (state.status === 'loading') {
    return (
      <div className={adminStyles.stack}>
        <SectionHead title={t.title} lead={t.lead} />
        <StateView kind="loading" message={copy.states.loading} />
      </div>
    );
  }
  if (state.status === 'error') {
    return (
      <div className={adminStyles.stack}>
        <SectionHead title={t.title} lead={t.lead} />
        <StateView
          kind="error"
          title={copy.admin.settings.loadError}
          message={state.message}
          retryLabel={copy.common.retry}
          onRetry={retry}
        />
      </div>
    );
  }
  return <PosterView settings={state.data} />;
}

function PosterView({ settings }: { settings: SettingsDto }) {
  const ssid = settings.wifiSsid;
  const takeUrl = `${window.location.origin}/take`;
  // The Wi-Fi code is requested again with a new stamp before every print, so a password
  // changed a moment ago is never printed from a stale image.
  const [stamp, setStamp] = useState(() => Date.now());
  const settle = useRef<(() => void) | null>(null);
  const [printing, setPrinting] = useState(false);

  async function print() {
    setPrinting(true);
    if (ssid !== null) {
      const fresh = new Promise<void>((resolve) => {
        settle.current = resolve;
        window.setTimeout(resolve, IMAGE_WAIT_MS);
      });
      setStamp(Date.now());
      await fresh;
      settle.current = null;
    }
    setPrinting(false);
    window.print();
  }

  return (
    <div className={adminStyles.stack}>
      <div className={adminStyles.noPrint}>
        <div className={adminStyles.stack}>
          <SectionHead
            title={t.title}
            lead={t.lead}
            action={
              <Button busy={printing} onClick={() => void print()}>
                {t.print}
              </Button>
            }
          />
          <p>
            {ssid !== null ? t.wifiOnNote(ssid) : t.wifiNote}{' '}
            <Link href="/admin">{t.wifiSettingsLink}</Link>
          </p>
          <dl className={styles.target}>
            <dt>{t.targetLabel}</dt>
            <dd>{takeUrl}</dd>
          </dl>
          <Banner variant="warning">
            <p>{t.ipWarning}</p>
          </Banner>
          <p className={styles.testNote}>{ssid !== null ? t.testNote : t.testNoteSingle}</p>
        </div>
      </div>

      <div className={styles.preview}>
        <div className={styles.paper}>
          {ssid !== null ? (
            <TwoCodePoster settings={settings} ssid={ssid} takeUrl={takeUrl} stamp={stamp} onWifiSettled={() => settle.current?.()} />
          ) : (
            <OneCodePoster settings={settings} takeUrl={takeUrl} />
          )}
        </div>
      </div>
    </div>
  );
}

interface QrProps {
  src: string;
  alt: string;
  errorText: string;
  size: string;
  onSettled?: () => void;
}

/** A QR image with an error line when it cannot load. Remounted by `key` when the source changes. */
function PosterQr({ src, alt, errorText, size, onSettled }: QrProps) {
  const [failed, setFailed] = useState(false);
  return (
    <div className={styles.frame}>
      {failed ? (
        <p role="alert" className={styles.qrError} style={{ width: size }}>
          {errorText}
        </p>
      ) : (
        <img
          className={styles.qr}
          src={src}
          alt={alt}
          style={{ width: size, height: size }}
          onLoad={onSettled}
          onError={() => {
            setFailed(true);
            onSettled?.();
          }}
        />
      )}
    </div>
  );
}

function Heading({ settings }: { settings: SettingsDto }) {
  const name = settings.businessName.trim() || copy.poster.fallbackTitle;
  return (
    <>
      <p className={styles.business}>{name}</p>
      <h2 className={styles.headline}>{copy.poster.headline}</h2>
    </>
  );
}

function TwoCodePoster({
  settings,
  ssid,
  takeUrl,
  stamp,
  onWifiSettled,
}: {
  settings: SettingsDto;
  ssid: string;
  takeUrl: string;
  stamp: number;
  onWifiSettled: () => void;
}) {
  return (
    <div className={styles.sheet}>
      <Heading settings={settings} />
      <p className={styles.twoLead}>{copy.poster.twoStepLead}</p>

      <section className={styles.step}>
        <PosterQr
          key={stamp}
          src={`/api/wifi-qr.svg?v=${stamp}`}
          alt={t.wifiQrAlt(ssid)}
          errorText={t.wifiQrError}
          size="75mm"
          onSettled={onWifiSettled}
        />
        <div className={styles.stepText}>
          <p className={styles.numeral} aria-hidden="true">
            1
          </p>
          <h3 className={styles.stepTitle}>{copy.poster.wifiStepTitle}</h3>
          <p className={styles.stepBody}>{copy.poster.wifiStepBody}</p>
          <p className={styles.networkLabel}>
            {copy.poster.wifiLabel} <span className={styles.networkName}>{ssid}</span>
          </p>
          <p className={styles.small}>{copy.poster.wifiManual(settings.wifiSecurity !== 'nopass')}</p>
        </div>
      </section>

      <section className={styles.step}>
        <PosterQr src="/api/qr.svg" alt={t.qrAlt} errorText={t.qrError} size="75mm" />
        <div className={styles.stepText}>
          <p className={styles.numeral} aria-hidden="true">
            2
          </p>
          <h3 className={styles.stepTitle}>{copy.poster.takeStepTitle}</h3>
          <p className={styles.stepBody}>{copy.poster.takeStepBody}</p>
          <p className={styles.small}>{copy.poster.urlLabelTwoStep}</p>
          <p className={styles.url}>{takeUrl}</p>
        </div>
      </section>

      <p className={styles.wordmark}>{copy.app.name}</p>
    </div>
  );
}

function OneCodePoster({ settings, takeUrl }: { settings: SettingsDto; takeUrl: string }) {
  return (
    <div className={styles.sheet}>
      <Heading settings={settings} />
      <div className={styles.single}>
        <PosterQr src="/api/qr.svg" alt={t.qrAlt} errorText={t.qrError} size="110mm" />
      </div>
      <ol className={styles.steps}>
        {copy.poster.steps.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>
      <p className={styles.writeIn}>
        {copy.poster.wifiLabel} <span className={styles.line} />
      </p>
      <p className={`${styles.small} ${styles.gapTop}`}>{copy.poster.urlLabel}</p>
      <p className={styles.url}>{takeUrl}</p>
      <p className={styles.wordmark}>{copy.app.name}</p>
    </div>
  );
}
