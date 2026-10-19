import { useId, useState } from 'react';
import type { StaffSnapshot } from '../../../shared/contracts.ts';
import { Button } from '../../components/Button.tsx';
import { ConfirmDialog } from '../../components/ConfirmDialog.tsx';
import { CounterPlate } from '../../components/CounterPlate.tsx';
import { copy } from '../../content/copy.ts';
import type { PanelAction } from './useStaffPanel.ts';
import styles from './StaffPage.module.css';

interface Props {
  snapshot: StaffSnapshot;
  busy: PanelAction | null;
  onCallNext: () => void;
  onRecall: () => void;
  onDone: () => void;
  /** Resolves when the skip request has finished, successfully or not. */
  onSkip: (ticketId: number) => Promise<void>;
}

function formatTime(epochMs: number): string {
  return new Intl.DateTimeFormat('id-ID', { hour: '2-digit', minute: '2-digit' }).format(epochMs);
}

export function WorkingView({ snapshot, busy, onCallNext, onRecall, onDone, onSkip }: Props) {
  const { current, nextWaiting, waiting } = snapshot;
  const [skipTarget, setSkipTarget] = useState<{ id: number; number: string } | null>(null);
  const callReasonId = useId();
  const currentReasonId = useId();

  const inFlight = busy !== null;
  const noWaiting = nextWaiting === null;
  const waitingTotal = waiting.reduce((sum, service) => sum + service.waiting, 0);

  const confirmSkip = async () => {
    if (!skipTarget) return;
    await onSkip(skipTarget.id);
    setSkipTarget(null);
  };

  return (
    <div className={styles.working}>
      <div className={styles.left}>
        {current ? (
          <CounterPlate
            label={copy.staff.currentLabel}
            size="staffCurrent"
            block
            footer={
              <>
                <p>{copy.staff.currentService(current.serviceName)}</p>
                <p>
                  {current.calledAt !== null && `${copy.staff.currentCalledAt(formatTime(current.calledAt))} · `}
                  {copy.staff.currentCallCount(current.callCount)}
                </p>
              </>
            }
          >
            {current.number}
          </CounterPlate>
        ) : (
          <p className={styles.none}>{copy.staff.currentNone}</p>
        )}

        <div className={styles.actions}>
          <Button
            size="xl"
            fullWidth
            disabled={inFlight || noWaiting}
            busy={busy === 'callNext'}
            aria-describedby={noWaiting || current ? callReasonId : undefined}
            onClick={onCallNext}
          >
            {busy === 'callNext' ? copy.staff.calling : copy.staff.callNext}
          </Button>
          {(noWaiting || current) && (
            <p id={callReasonId} className={styles.secondary}>
              {noWaiting ? copy.staff.disabledNoWaiting : copy.staff.callNextAutoDone(current?.number ?? '')}
            </p>
          )}

          <div className={styles.buttonRow}>
            <Button
              variant="secondary"
              size="lg"
              disabled={inFlight || !current}
              busy={busy === 'recall'}
              aria-describedby={current ? undefined : currentReasonId}
              onClick={onRecall}
            >
              {busy === 'recall' ? copy.staff.recalling : copy.staff.recall}
            </Button>
            <Button
              variant="secondary"
              size="lg"
              disabled={inFlight || !current}
              busy={busy === 'done'}
              aria-describedby={current ? undefined : currentReasonId}
              onClick={onDone}
            >
              {busy === 'done' ? copy.staff.finishing : copy.staff.done}
            </Button>
            <Button
              variant="danger"
              size="lg"
              className={styles.skipButton}
              disabled={inFlight || !current}
              busy={busy === 'skip'}
              aria-describedby={current ? undefined : currentReasonId}
              onClick={() => current && setSkipTarget({ id: current.id, number: current.number })}
            >
              {busy === 'skip' ? copy.staff.skipping : copy.staff.skip}
            </Button>
          </div>
          {!current && (
            <p id={currentReasonId} className={styles.secondary}>
              {copy.staff.disabledNoCurrent}
            </p>
          )}
        </div>
      </div>

      <div className={styles.right}>
        {nextWaiting ? (
          <CounterPlate
            label={copy.staff.nextLabel}
            size="staffNext"
            block
            footer={<p>{copy.staff.currentService(nextWaiting.serviceName)}</p>}
          >
            {nextWaiting.number}
          </CounterPlate>
        ) : (
          <p className={styles.none}>{copy.staff.nextNone}</p>
        )}
        <p>{copy.staff.waitingForCounter(waitingTotal)}</p>

        <section aria-labelledby="waiting-heading">
          <h2 id="waiting-heading">{copy.staff.waitingByServiceHeading}</h2>
          <ul className={styles.waitingList}>
            {waiting.map((service) => (
              <li key={service.serviceId} className={styles.waitingRow}>
                <span className={styles.serviceName}>{service.name}</span>
                <span className={styles.count}>{copy.staff.waitingByService(service.waiting)}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <ConfirmDialog
        open={skipTarget !== null}
        title={copy.staff.skipConfirmTitle(skipTarget?.number ?? '')}
        body={copy.staff.skipConfirmBody}
        cancelLabel={copy.common.cancel}
        confirmLabel={copy.staff.skipConfirmButton(skipTarget?.number ?? '')}
        destructive
        busy={busy === 'skip'}
        busyLabel={copy.staff.skipping}
        onConfirm={() => void confirmSkip()}
        onCancel={() => {
          if (busy !== 'skip') setSkipTarget(null);
        }}
      />
    </div>
  );
}
