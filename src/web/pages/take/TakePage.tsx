import { useCallback, useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import type { AlreadyActiveResponse, PublicServicesResponse, TakeTicketResponse } from '../../../shared/contracts.ts';
import { Banner } from '../../components/Banner.tsx';
import { Button } from '../../components/Button.tsx';
import { PrefixMark } from '../../components/CounterPlate.tsx';
import { LinkButton } from '../../components/LinkButton.tsx';
import { StateView } from '../../components/StateView.tsx';
import { StatusBadge } from '../../components/StatusBadge.tsx';
import { copy } from '../../content/copy.ts';
import { ApiError, api } from '../../lib/api.ts';
import styles from './TakePage.module.css';
import { VisitorFrame } from './VisitorFrame.tsx';
import { forgetTicket, peekTicket, readTickets, rememberTicket, type StoredTicket } from './tickets-store.ts';

type Service = PublicServicesResponse['services'][number];
type Load = { kind: 'loading' } | { kind: 'error'; message: string } | { kind: 'ready'; data: PublicServicesResponse };
type TakeError = 'failed' | 'closed' | 'rateLimited';

/** A stored ticket the server confirmed is still waiting or called. */
interface ActiveTicket extends StoredTicket {
  serviceId: number;
  status: 'waiting' | 'called';
}

function loadErrorMessage(error: unknown): string {
  return error instanceof ApiError && error.code !== 'network' ? copy.states.serverError : copy.states.networkError;
}

const TAKE_ERROR_TEXT: Record<TakeError, string> = {
  failed: copy.take.takeFailed,
  closed: copy.take.serviceClosed,
  rateLimited: copy.take.rateLimited,
};

export function TakePage() {
  const [, navigate] = useLocation();
  const [load, setLoad] = useState<Load>({ kind: 'loading' });
  const [taking, setTaking] = useState<number | null>(null);
  const [takeError, setTakeError] = useState<TakeError | null>(null);
  const [active, setActive] = useState<ActiveTicket[]>([]);

  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    api
      .get<PublicServicesResponse>('/api/services', controller.signal)
      .then((data) => setLoad({ kind: 'ready', data }))
      .catch((error: unknown) => {
        if (!controller.signal.aborted) setLoad({ kind: 'error', message: loadErrorMessage(error) });
      });
    return () => controller.abort();
  }, [reloadKey]);

  // Check every stored ticket once; tickets that finished or expired are dropped from storage.
  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      const confirmed: ActiveTicket[] = [];
      for (const stored of readTickets()) {
        const snapshot = await peekTicket(stored.token, controller.signal);
        if (controller.signal.aborted) return;
        if (snapshot === null) continue;
        if (snapshot.state === 'waiting' || snapshot.state === 'called') {
          confirmed.push({
            ...stored,
            number: snapshot.number,
            serviceName: snapshot.serviceName,
            serviceId: snapshot.serviceId,
            status: snapshot.state,
          });
          rememberTicket({
            token: stored.token,
            number: snapshot.number,
            serviceName: snapshot.serviceName,
            serviceId: snapshot.serviceId,
          });
        } else {
          forgetTicket(stored.token);
        }
      }
      setActive(confirmed);
    })();
    return () => controller.abort();
  }, []);

  const retry = () => {
    setLoad({ kind: 'loading' });
    setReloadKey((key) => key + 1);
  };

  const openTicket = useCallback(
    (ticket: StoredTicket) => {
      rememberTicket(ticket);
      navigate(`/ticket/${encodeURIComponent(ticket.token)}`);
    },
    [navigate],
  );

  const take = async (service: Service) => {
    if (taking !== null) return;
    setTaking(service.id);
    setTakeError(null);
    try {
      const knownTokens = readTickets().map((ticket) => ticket.token);
      const issued = await api.post<TakeTicketResponse>('/api/tickets', { serviceId: service.id, knownTokens });
      openTicket({ token: issued.token, number: issued.number, serviceName: service.name, serviceId: service.id });
      return;
    } catch (error) {
      if (error instanceof ApiError) {
        const body = error.body as Partial<AlreadyActiveResponse> | null;
        if (error.status === 409 && error.code === 'already_active' && body?.token && body.number) {
          openTicket({ token: body.token, number: body.number, serviceName: service.name, serviceId: service.id });
          return;
        }
        if (error.status === 404 || (error.status === 409 && error.code === 'service_inactive')) {
          setTakeError('closed');
          setReloadKey((key) => key + 1);
        } else if (error.status === 429) {
          setTakeError('rateLimited');
        } else {
          setTakeError('failed');
        }
      } else {
        setTakeError('failed');
      }
    }
    setTaking(null);
  };

  const businessName = load.kind === 'ready' ? load.data.businessName : null;

  useEffect(() => {
    document.title = copy.app.pageTitle(copy.take.docTitle, businessName ?? undefined);
  }, [businessName]);

  return (
    <VisitorFrame businessName={businessName} footerNote={copy.take.privacy}>
      <div className={styles.intro}>
        <h1>{copy.take.title}</h1>
        <p>{copy.take.lead}</p>
      </div>

      {active.length > 0 && (
        <section className={styles.section} aria-labelledby="my-tickets">
          <h2 id="my-tickets">{copy.take.myTicketsHeading}</h2>
          <ul className={styles.list}>
            {active.map((ticket) => (
              <li key={ticket.token}>
                <LinkButton
                  variant="secondary"
                  fullWidth
                  className={styles.ticketRow}
                  href={`/ticket/${encodeURIComponent(ticket.token)}`}
                >
                  <span className={styles.ticketNumber}>{ticket.number}</span>
                  <span className={styles.rowText}>
                    <span className={styles.rowSub}>{ticket.serviceName}</span>
                    <span>
                      <StatusBadge status={ticket.status}>{copy.status[ticket.status]}</StatusBadge>
                    </span>
                  </span>
                </LinkButton>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className={styles.section} aria-labelledby="services">
        <h2 id="services">{copy.take.servicesHeading}</h2>
        {takeError && <Banner variant="error" title={TAKE_ERROR_TEXT[takeError]} />}
        {load.kind === 'loading' && <StateView kind="loading" message={copy.take.loading} />}
        {load.kind === 'error' && (
          <StateView
            kind="error"
            title={copy.take.loadError}
            message={load.message}
            retryLabel={copy.common.retry}
            onRetry={retry}
          />
        )}
        {load.kind === 'ready' && load.data.services.length === 0 && (
          <StateView kind="empty" message={copy.take.empty} />
        )}
        {load.kind === 'ready' && load.data.services.length > 0 && (
          <ul className={styles.list}>
            {load.data.services.map((service) => {
              const held = active.find((ticket) => ticket.serviceId === service.id);
              return (
                <li key={service.id}>
                  {held ? (
                    <LinkButton
                      variant="secondary"
                      fullWidth
                      className={styles.row}
                      href={`/ticket/${encodeURIComponent(held.token)}`}
                    >
                      <PrefixMark prefix={service.prefix} />
                      <span className={styles.rowText}>
                        <span className={styles.rowName}>{service.name}</span>
                        <span className={styles.rowSub}>{copy.take.alreadyHave(held.number)}</span>
                        <span className={styles.rowAction}>{copy.take.openTicket(held.number)}</span>
                      </span>
                    </LinkButton>
                  ) : (
                    <Button
                      variant="secondary"
                      fullWidth
                      className={styles.row}
                      disabled={taking !== null && taking !== service.id}
                      busy={taking === service.id}
                      aria-label={taking === service.id ? undefined : copy.take.takeLabel(service.name)}
                      aria-describedby={`waiting-${service.id}`}
                      onClick={() => void take(service)}
                    >
                      <PrefixMark prefix={service.prefix} />
                      <span className={styles.rowText}>
                        <span className={styles.rowName}>{service.name}</span>
                        <span id={`waiting-${service.id}`} className={styles.rowSub}>
                          {taking === service.id ? copy.take.taking : copy.take.waitingCount(service.waiting)}
                        </span>
                      </span>
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </VisitorFrame>
  );
}
