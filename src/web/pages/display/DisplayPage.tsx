import { useCallback, useEffect, useRef, useState } from 'react';
import { ConnectionStatus } from '../../components/ConnectionStatus.tsx';
import { copy } from '../../content/copy.ts';
import { createCallTracker, enqueueCallAnnouncement, playChime, unlockAudio, unlockAudioIfAllowed, useAudioStatus } from '../../lib/announce.ts';
import { useLiveSnapshot } from '../../lib/live.ts';
import type { DisplaySnapshot } from '../../../shared/contracts.ts';
import { CallField } from './CallField.tsx';
import { Clock } from './Clock.tsx';
import { Counters } from './Counters.tsx';
import { QrArea } from './QrArea.tsx';
import { RecentCalls } from './RecentCalls.tsx';
import { StartOverlay } from './StartOverlay.tsx';
import { Waiting } from './Waiting.tsx';
import { useCallFlash } from './useCallFlash.ts';
import { fitLevels, fitNames, useFit } from './useFit.ts';
import styles from './DisplayPage.module.css';

const FIT_LEVELS = 5;

export function DisplayPage() {
  const { snapshot, status, serverOffset, disconnectedSince, recoveredAt } = useLiveSnapshot<DisplaySnapshot>(
    '/api/stream/display',
  );
  const audio = useAudioStatus();
  const flash = useCallFlash();
  const [started, setStarted] = useState(false);
  const [liveLine, setLiveLine] = useState('');
  const startedRef = useRef(false);
  const tracker = useRef(createCallTracker());
  const rightColumn = useRef<HTMLDivElement>(null);

  useEffect(() => {
    document.title = copy.app.pageTitle(copy.display.docTitle, snapshot?.businessName);
  }, [snapshot?.businessName]);

  // Announce each unseen call once. The tracker's first batch only seeds, so a reload never replays.
  const { start: startFlash } = flash;
  useEffect(() => {
    if (!snapshot) return;
    const fresh = tracker.current.update(snapshot.recentCalls, snapshot.serverTime);
    const newest = fresh[fresh.length - 1];
    if (!newest) return;
    setLiveLine(copy.display.callLine(newest.number, newest.counterName));
    startFlash(newest.counterName);
    // Until the Start overlay is used the browser keeps the audio context locked.
    if (startedRef.current) fresh.forEach((call) => void enqueueCallAnnouncement(call));
  }, [snapshot, startFlash]);

  const handleStart = useCallback(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    const unlocked = unlockAudio();
    setStarted(true);
    void unlocked.then((ok) => (ok ? playChime('call') : undefined));
  }, []);

  // Kiosk browsers that allow autoplay skip the Start overlay, so an unattended TV recovers after a reboot.
  useEffect(() => {
    void unlockAudioIfAllowed().then((ok) => {
      if (!ok || startedRef.current) return;
      startedRef.current = true;
      setStarted(true);
    });
  }, []);

  const counterCount = snapshot?.counters.length ?? 0;
  // One top-down pass: back to level 0, measure the names there, then step the level up until it fits.
  // Fitting the names from the child would measure them at the previous level and flip the layout.
  useFit(() => {
    if (rightColumn.current) rightColumn.current.dataset.level = '0';
    fitNames(rightColumn.current);
    fitLevels(rightColumn, FIT_LEVELS);
  }, [snapshot?.counters, snapshot?.services]);

  const soundText =
    audio === 'on' ? copy.display.soundOn : audio === 'locked' ? copy.display.soundLocked : copy.display.soundChimeOnly;
  const businessName = snapshot?.businessName.trim() ?? '';
  const latest = snapshot?.recentCalls[0];
  const tier = counterCount <= 4 ? 1 : counterCount <= 8 ? 2 : 3;

  return (
    <div className={styles.screen}>
      <div className={styles.canvas} inert={!started}>
        <header className={styles.header}>
          <p className={businessName ? styles.business : styles.businessWordmark}>{businessName || copy.app.name}</p>
          <Clock serverOffset={serverOffset} timeZone={snapshot?.timeZone} />
        </header>

        {snapshot ? (
          <main className={styles.main}>
            <div className={styles.left}>
              <CallField call={latest} inverted={flash.inverted} />
              <div className={styles.bottom}>
                <RecentCalls calls={snapshot.recentCalls.slice(1, 4)} layoutKey={snapshot.wifiSsid === null ? 'wide' : 'narrow'} />
                <QrArea wifiSsid={snapshot.wifiSsid} wifiQrVersion={snapshot.wifiQrVersion} />
              </div>
            </div>
            <div ref={rightColumn} className={styles.right} data-tier={tier} data-level="0">
              <Counters counters={snapshot.counters} flashing={flash.counterName} flashInverted={flash.inverted} />
              <Waiting services={snapshot.services} />
            </div>
          </main>
        ) : (
          <main className={styles.loading} aria-busy="true">
            <p>{copy.display.loading}</p>
          </main>
        )}

        <div className={styles.status}>
          <ConnectionStatus
            variant="tv"
            status={status}
            disconnectedSince={disconnectedSince}
            recoveredAt={recoveredAt}
            timeZone={snapshot?.timeZone}
            wordmark={copy.app.name}
            soundText={soundText}
          />
        </div>
        <p className={styles.srOnly} role="status" aria-live="polite">
          {liveLine}
        </p>
      </div>
      {!started && <StartOverlay businessName={businessName || null} onStart={handleStart} />}
    </div>
  );
}
