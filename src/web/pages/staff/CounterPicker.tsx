import type { StaffSnapshot } from '../../../shared/contracts.ts';
import { Button } from '../../components/Button.tsx';
import { StateView } from '../../components/StateView.tsx';
import { copy } from '../../content/copy.ts';
import styles from './StaffPage.module.css';

interface Props {
  snapshot: StaffSnapshot;
  pickingId: number | null;
  /** A pick request is running. */
  busy: boolean;
  onPick: (counterId: number) => void;
  /** Present when a counter is already chosen, so the picker can be dismissed. */
  onCancel?: (() => void) | undefined;
}

export function CounterPicker({ snapshot, pickingId, busy, onPick, onCancel }: Props) {
  const options = snapshot.counterOptions;
  const emptyText = snapshot.user.role === 'admin' ? copy.staff.pickEmptyAdmin : copy.staff.pickEmptyStaff;

  return (
    <section aria-labelledby="pick-title" className={styles.pick}>
      <h1 id="pick-title">{copy.staff.pickTitle}</h1>
      <p className={styles.lead}>{copy.staff.pickLead}</p>
      {options.length === 0 ? (
        <StateView kind="empty" message={emptyText} />
      ) : (
        <ul className={styles.pickList}>
          {options.map((option) => {
            const noServices = option.serviceNames.length === 0;
            const current = snapshot.counter?.id === option.id;
            const noteId = `pick-note-${option.id}`;
            const picking = busy && pickingId === option.id;
            return (
              <li key={option.id} className={styles.pickRow}>
                <div className={styles.pickText}>
                  <h2>{option.name}</h2>
                  <p id={noteId} className={styles.secondary}>
                    {noServices ? copy.staff.pickNoServices : copy.staff.pickServes(option.serviceNames.join(', '))}
                  </p>
                </div>
                <Button
                  variant="secondary"
                  disabled={noServices || current || busy}
                  busy={picking}
                  aria-describedby={noteId}
                  onClick={() => onPick(option.id)}
                >
                  {picking ? copy.staff.picking : copy.staff.pickButton(option.name)}
                </Button>
              </li>
            );
          })}
        </ul>
      )}
      {onCancel && (
        <Button variant="quiet" onClick={onCancel}>
          {copy.common.cancel}
        </Button>
      )}
    </section>
  );
}
