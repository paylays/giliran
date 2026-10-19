import { useEffect, useState } from 'react';
import { useParams } from 'wouter';
import type { TicketSnapshot } from '../../../shared/contracts.ts';
import { Banner } from '../../components/Banner.tsx';
import { Button } from '../../components/Button.tsx';
import { ConnectionStatus } from '../../components/ConnectionStatus.tsx';
import { CounterPlate } from '../../components/CounterPlate.tsx';
import { LinkButton } from '../../components/LinkButton.tsx';
import { StateView } from '../../components/StateView.tsx';
import { StatusBadge, type TicketStatus } from '../../components/StatusBadge.tsx';
import { copy } from '../../content/copy.ts';
import { canVibrate, enableAlerts } from '../../lib/alerts.ts';
import { useLiveSnapshot } from '../../lib/live.ts';
import { formatDate, formatTime } from '../../lib/time.ts';
import { VisitorFrame } from '../take/VisitorFrame.tsx';
import { forgetTicket, rememberTicket } from '../take/tickets-store.ts';
import { CalledOverlay } from './CalledOverlay.tsx';
import styles from './TicketPage.module.css';
import { useTicketAlerts } from './useTicketAlerts.ts';

type AlertsState = 'idle' | 'enabling' | 'on' | 'soundOnly' | 'failed';

function callCountOf(callId: string): number {
  const count = Number(callId.split(':')[1]);
  return Number.isFinite(count) && count > 0 ? count : 1;
}

function tabTitle(snapshot: TicketSnapshot | null): string {
  if (!snapshot) return copy.ticket.docTitle;
  switch (snapshot.state) {
    case 'waiting':
      return copy.ticket.tabWaiting(snapshot.number, snapshot.position);
    case 'called':
      return copy.ticket.tabCalled(snapshot.number);
    case 'done':
      return copy.ticket.tabDone(snapshot.number);
    default:
      return copy.ticket.docTitle;
  }
}

export function TicketPage() {
  const { token } = useParams<{ token: string }>();
  return <TicketView key={token} token={token ?? ''} />;
}

function TicketView({ token }: { token: string }) {
  const live = useLiveSnapshot<TicketSnapshot>(token ? `/api/stream/ticket/${encodeURIComponent(token)}` : null);
  const { snapshot } = live;
  const { openCallId, closeCalled } = useTicketAlerts(token, snapshot);
  const [alerts, setAlerts] = useState<AlertsState>('idle');

  // Keep the stored list honest: active tickets are remembered, finished ones are dropped.
  const state = snapshot?.state;
  const number = snapshot && 'number' in snapshot ? snapshot.number : null;
  const serviceName = snapshot && 'serviceName' in snapshot ? snapshot.serviceName : null;
  const serviceId = snapshot && 'serviceId' in snapshot ? snapshot.serviceId : null;
  useEffect(() => {
    if (state === 'waiting' || state === 'called') {
      if (number && serviceName) rememberTicket({ token, number, serviceName, serviceId: serviceId ?? undefined });
    } else if (state) {
      forgetTicket(token);
    }
  }, [state, number, serviceName, serviceId, token]);

  const businessName = snapshot?.businessName;
  const title = tabTitle(snapshot);
  useEffect(() => {
    document.title = copy.app.pageTitle(title, businessName);
  }, [title, businessName]);

  const enable = async () => {
    setAlerts('enabling');
    try {
      const result = await enableAlerts();
      setAlerts(!result.sound ? 'failed' : result.vibration ? 'on' : 'soundOnly');
    } catch {
      setAlerts('failed');
    }
  };

  const overlayOpen = snapshot?.state === 'called' && openCallId === snapshot.callId;

  let body;
  if (!snapshot) {
    const failing = live.status === 'reconnecting' || live.status === 'offline';
    body = failing ? (
      <StateView
        kind="error"
        title={copy.ticket.loadError}
        message={copy.states.networkError}
        retryLabel={copy.common.reload}
        onRetry={() => window.location.reload()}
      />
    ) : (
      <StateView kind="loading" message={copy.ticket.loading} />
    );
  } else {
    body = <TicketBody snapshot={snapshot} alerts={alerts} onEnable={() => void enable()} />;
  }

  return (
    <>
      <div inert={overlayOpen}>
        <VisitorFrame businessName={snapshot ? snapshot.businessName : null} footerNote={copy.ticket.savedOnDevice}>
          <ConnectionStatus
            status={live.status}
            disconnectedSince={live.disconnectedSince}
            recoveredAt={live.recoveredAt}
            timeZone={snapshot?.timeZone}
          />
          {body}
        </VisitorFrame>
      </div>
      {snapshot?.state === 'called' && overlayOpen && (
        <CalledOverlay
          key={snapshot.callId}
          number={snapshot.number}
          counterName={snapshot.counterName}
          time={formatTime(snapshot.calledAt, snapshot.timeZone)}
          callCount={callCountOf(snapshot.callId)}
          onClose={closeCalled}
        />
      )}
    </>
  );
}

interface BodyProps {
  snapshot: TicketSnapshot;
  alerts: AlertsState;
  onEnable: () => void;
}

function TicketBody({ snapshot, alerts, onEnable }: BodyProps) {
  if (snapshot.state === 'not_found') {
    return (
      <div className={styles.final}>
        <h1>{copy.ticket.notFoundTitle}</h1>
        <p>{copy.ticket.notFoundBody}</p>
        <LinkButton href="/take" size="lg" fullWidth>
          {copy.ticket.takeNew}
        </LinkButton>
      </div>
    );
  }

  const status: TicketStatus = snapshot.state;
  const plate = (
    <CounterPlate
      label={copy.ticket.plateLabel}
      block
      footer={
        <div className={styles.plateInfo}>
          <span>{copy.ticket.service(snapshot.serviceName)}</span>
          <span>
            {snapshot.state === 'expired'
              ? copy.ticket.takenOnDate(
                  formatDate(snapshot.takenAt, snapshot.timeZone),
                  formatTime(snapshot.takenAt, snapshot.timeZone),
                )
              : copy.ticket.takenAt(formatTime(snapshot.takenAt, snapshot.timeZone))}
          </span>
          <span>
            <StatusBadge status={status}>{copy.status[status]}</StatusBadge>
          </span>
        </div>
      }
    >
      {snapshot.number}
    </CounterPlate>
  );

  if (snapshot.state === 'done' || snapshot.state === 'skipped' || snapshot.state === 'expired') {
    const text = {
      done: [copy.ticket.doneTitle, copy.ticket.doneBody],
      skipped: [copy.ticket.skippedTitle, copy.ticket.skippedBody],
      expired: [copy.ticket.expiredTitle, copy.ticket.expiredBody],
    }[snapshot.state];
    return (
      <>
        {plate}
        <div className={styles.final} role="status">
          <h1>{text[0]}</h1>
          <p>{text[1]}</p>
          <LinkButton href="/take" size="lg" fullWidth>
            {copy.ticket.takeNew}
          </LinkButton>
        </div>
      </>
    );
  }

  const alertsBlock = (
    <section className={styles.alerts}>
      {alerts === 'on' || alerts === 'soundOnly' ? (
        <Banner variant="success">
          <p>{alerts === 'on' ? copy.ticket.alertsOn : copy.ticket.alertsOnSoundOnly}</p>
          <p>{copy.ticket.alertsSilentHint}</p>
        </Banner>
      ) : (
        <>
          {alerts === 'failed' && <Banner variant="error" title={copy.ticket.alertsFailed} />}
          <Button variant="secondary" size="lg" fullWidth busy={alerts === 'enabling'} onClick={onEnable}>
            {alerts === 'enabling'
              ? copy.ticket.alertsEnabling
              : canVibrate()
                ? copy.ticket.alertsEnable
                : copy.ticket.alertsEnableSoundOnly}
          </Button>
          <p className={styles.hint}>{copy.ticket.alertsHint}</p>
        </>
      )}
    </section>
  );

  const keepOpen = (
    <section className={styles.keepOpen}>
      <h2 className={styles.keepOpenTitle}>{copy.ticket.keepOpenTitle}</h2>
      <p>{copy.ticket.keepOpenBody}</p>
    </section>
  );

  if (snapshot.state === 'called') {
    const count = callCountOf(snapshot.callId);
    return (
      <>
        {plate}
        <section className={`${styles.called} on-teal`} aria-live="polite">
          <h1 className={styles.calledTitle}>{copy.ticket.calledInlineTitle(snapshot.counterName)}</h1>
          <p>{copy.ticket.calledInlineBody(snapshot.counterName, formatTime(snapshot.calledAt, snapshot.timeZone))}</p>
          {count > 1 && <p className={styles.calledCount}>{copy.ticket.callCount(count)}</p>}
        </section>
        {alertsBlock}
        {keepOpen}
      </>
    );
  }

  return (
    <>
      {plate}
      <div className={styles.state} aria-live="polite" aria-atomic="true">
        {snapshot.near && (
          <Banner variant="info" title={copy.ticket.nearTitle}>
            <p>{copy.ticket.nearBody(snapshot.position)}</p>
          </Banner>
        )}
        {snapshot.position === 0 ? (
          <div className={styles.front}>
            <h1 className={styles.frontTitle}>{copy.ticket.frontTitle}</h1>
            <p>{copy.ticket.frontBody}</p>
          </div>
        ) : (
          <h1 className={styles.position}>
            <span className={styles.count}>{snapshot.position}</span>
            <span className={styles.ahead}>{copy.ticket.aheadLabel}</span>
          </h1>
        )}
      </div>
      {alertsBlock}
      {keepOpen}
    </>
  );
}
