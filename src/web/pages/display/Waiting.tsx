import { copy } from '../../content/copy.ts';
import type { ServiceWaiting } from '../../../shared/contracts.ts';
import styles from './DisplayPage.module.css';

/**
 * One row per active service; five or more services switch to two columns. On a crowded screen (fit level 4)
 * CSS swaps the list for one total row, so counter names never have to be cut to make room.
 */
export function Waiting({ services }: { services: ServiceWaiting[] }) {
  const twoColumns = services.length >= 5;
  const rows = twoColumns ? Math.ceil(services.length / 2) : services.length;
  const total = services.reduce((sum, service) => sum + service.waiting, 0);
  return (
    <section className={styles.waiting}>
      <h2 className={styles.heading}>{copy.display.waitingHeading}</h2>
      {services.length === 0 ? (
        <p className={styles.quiet}>{copy.display.servicesNone}</p>
      ) : (
        <ul
          className={styles.waitingList}
          data-columns={twoColumns ? 2 : 1}
          style={{ gridTemplateRows: `repeat(${rows}, var(--row-h))` }}
        >
          {services.map((service) => (
            <li key={service.serviceId} className={styles.waitingRow}>
              <span className={styles.srOnly}>{copy.display.waitingLabel(service.name, service.waiting)}</span>
              <span className={styles.serviceName} aria-hidden="true">
                {service.name}
              </span>
              <span className={styles.serviceCount} aria-hidden="true">
                {service.waiting}
              </span>
              <span className={styles.serviceUnit} aria-hidden="true">
                {copy.display.waitingUnit}
              </span>
            </li>
          ))}
        </ul>
      )}
      {services.length > 0 && (
        <div className={`${styles.waitingRow} ${styles.waitingTotal}`}>
          <span className={styles.srOnly}>{copy.display.waitingLabel(copy.display.waitingAll, total)}</span>
          <span className={styles.serviceName} aria-hidden="true">
            {copy.display.waitingAll}
          </span>
          <span className={styles.serviceCount} aria-hidden="true">
            {total}
          </span>
          <span className={styles.serviceUnit} aria-hidden="true">
            {copy.display.waitingUnit}
          </span>
        </div>
      )}
    </section>
  );
}
