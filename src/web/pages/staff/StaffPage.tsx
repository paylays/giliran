import { useEffect, useState } from 'react';
import { Banner } from '../../components/Banner.tsx';
import { Button } from '../../components/Button.tsx';
import { ConnectionStatus } from '../../components/ConnectionStatus.tsx';
import { LinkButton } from '../../components/LinkButton.tsx';
import { StateView } from '../../components/StateView.tsx';
import { copy } from '../../content/copy.ts';
import { CounterPicker } from './CounterPicker.tsx';
import { useStaffPanel } from './useStaffPanel.ts';
import { WorkingView } from './WorkingView.tsx';
import styles from './StaffPage.module.css';

export function StaffPage() {
  const panel = useStaffPanel();
  const { snapshot, live, busy, notice } = panel;
  const [choosing, setChoosing] = useState(false);
  const [pickingId, setPickingId] = useState<number | null>(null);
  const [result, setResult] = useState('');

  useEffect(() => {
    document.title = copy.app.pageTitle(copy.staff.docTitle);
  }, []);

  if (snapshot === null) {
    return (
      <main className={styles.page}>
        {panel.loadError ? (
          <StateView
            kind="error"
            title={copy.staff.title}
            message={panel.loadError === 'network' ? copy.states.networkError : copy.states.serverError}
            retryLabel={copy.common.retry}
            onRetry={() => void panel.refresh()}
          />
        ) : (
          <StateView kind="loading" message={copy.staff.loading} />
        )}
      </main>
    );
  }

  const counter = snapshot.counter;
  const showPicker = counter === null || choosing;

  const pick = async (counterId: number) => {
    setPickingId(counterId);
    const next = await panel.pickCounter(counterId);
    setPickingId(null);
    if (next) {
      setChoosing(false);
      setResult('');
    }
  };

  const callNext = async () => {
    const next = await panel.callNext(snapshot.current?.id ?? null);
    if (!next) return;
    setResult(next.current && next.counter ? copy.staff.resultCalled(next.current.number, next.counter.name) : '');
  };

  const recall = async () => {
    if (!snapshot.current) return;
    const next = await panel.ticketAction('recall', snapshot.current.id);
    if (next?.current) setResult(copy.staff.resultRecalled(next.current.number, next.current.callCount));
  };

  const done = async () => {
    if (!snapshot.current) return;
    const number = snapshot.current.number;
    const next = await panel.ticketAction('done', snapshot.current.id);
    if (next) setResult(copy.staff.resultDone(number));
  };

  const skip = async (ticketId: number) => {
    const number = snapshot.current?.id === ticketId ? snapshot.current.number : '';
    const next = await panel.ticketAction('skip', ticketId);
    if (next && number) setResult(copy.staff.resultSkipped(number));
  };

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headerText}>
          {counter && !showPicker ? (
            <h1 className={styles.counterHeading}>{copy.staff.counterHeading(counter.name)}</h1>
          ) : (
            <p className={styles.counterHeading}>{copy.staff.title}</p>
          )}
          <p className={styles.secondary}>{copy.staff.signedInAs(snapshot.user.displayName)}</p>
        </div>
        <div className={styles.headerActions}>
          {counter && !choosing && (
            <Button variant="secondary" disabled={busy !== null} onClick={() => setChoosing(true)}>
              {copy.staff.changeCounter}
            </Button>
          )}
          {snapshot.user.role === 'admin' && (
            <LinkButton href="/admin" variant="quiet">
              {copy.staff.adminLink}
            </LinkButton>
          )}
          <Button variant="quiet" busy={busy === 'logout'} onClick={() => void panel.logout()}>
            {busy === 'logout' ? copy.common.loggingOut : copy.common.logout}
          </Button>
        </div>
      </header>

      <main className={styles.main}>
        <ConnectionStatus
          status={live.status}
          disconnectedSince={live.disconnectedSince}
          recoveredAt={live.recoveredAt}
        />
        {notice === 'conflict' && (
          <Banner variant="warning" title={copy.staff.conflictTitle}>
            <p>{copy.staff.conflictBody}</p>
          </Banner>
        )}
        {notice === 'counterGone' && (
          <Banner variant="warning">
            <p>{copy.staff.counterGone}</p>
          </Banner>
        )}
        {notice === 'failed' && (
          <Banner variant="error">
            <p>{copy.staff.actionFailed}</p>
          </Banner>
        )}

        {showPicker ? (
          <CounterPicker
            snapshot={snapshot}
            pickingId={pickingId}
            busy={busy === 'pick'}
            onPick={(id) => void pick(id)}
            onCancel={counter ? () => setChoosing(false) : undefined}
          />
        ) : (
          <WorkingView
            snapshot={snapshot}
            busy={busy}
            onCallNext={() => void callNext()}
            onRecall={() => void recall()}
            onDone={() => void done()}
            onSkip={skip}
          />
        )}
        <p role="status" className={styles.result}>
          {result}
        </p>
      </main>
    </div>
  );
}
