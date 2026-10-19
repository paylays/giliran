import { copy } from '../../content/copy.ts';
import styles from './DisplayPage.module.css';

interface Props {
  businessName: string | null;
  onStart: () => void;
}

/** Full-screen gate: one activation lets the page make sound. The button has focus on load. */
export function StartOverlay({ businessName, onStart }: Props) {
  return (
    // A click anywhere starts the screen; the button is the keyboard and remote path.
    <div
      className={styles.overlay}
      role="dialog"
      aria-modal="true"
      aria-labelledby="display-start-title"
      onClick={onStart}
    >
      <div className={styles.overlayColumn}>
        <p className={styles.overlayBrand}>
          <span className={styles.wordmark}>{copy.app.name}</span>
          {businessName ? <span className={styles.overlayBusiness}>{businessName}</span> : null}
        </p>
        <h1 id="display-start-title" className={styles.overlayTitle}>
          {copy.display.startTitle}
        </h1>
        <p className={styles.overlayBody}>{copy.display.startBody}</p>
        <button type="button" className={styles.overlayButton} autoFocus>
          {copy.display.startButton}
        </button>
        <p className={styles.overlayHint}>{copy.display.startKioskHint}</p>
      </div>
    </div>
  );
}
