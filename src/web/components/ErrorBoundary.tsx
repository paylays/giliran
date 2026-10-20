import { Component, type ErrorInfo, type ReactNode } from 'react';
import { copy } from '../content/copy.ts';
import styles from '../pages/login/login.module.css';
import { Button } from './Button.tsx';

interface State {
  crashed: boolean;
}

const ATTEMPTS_KEY = 'giliran.display-crash-attempts';
const FIRST_RELOAD_MS = 30_000;
const MAX_RELOAD_MS = 5 * 60_000;
const HEALTHY_AFTER_MS = 10 * 60_000;

function isDisplayPage(): boolean {
  return window.location.pathname === '/display' || window.location.pathname.startsWith('/display/');
}

function readAttempts(): number {
  try {
    const value = Number(window.sessionStorage.getItem(ATTEMPTS_KEY));
    return Number.isInteger(value) && value > 0 ? value : 0;
  } catch {
    return 0;
  }
}

function writeAttempts(count: number): void {
  try {
    if (count > 0) window.sessionStorage.setItem(ATTEMPTS_KEY, String(count));
    else window.sessionStorage.removeItem(ATTEMPTS_KEY);
  } catch {
    // Storage is blocked: the reload delay then always restarts at the shortest step.
  }
}

/** Last resort for a render error: a plain column with a reload button instead of a blank page. */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { crashed: false };
  private reloadTimer: number | undefined;
  private reloadDelay: number | undefined;
  private healthyTimer: number | undefined;

  componentDidMount(): void {
    // A page that ran 10 minutes without a crash starts the back-off over.
    if (isDisplayPage()) this.healthyTimer = window.setTimeout(() => writeAttempts(0), HEALTHY_AFTER_MS);
  }

  componentWillUnmount(): void {
    window.clearTimeout(this.reloadTimer);
    window.clearTimeout(this.healthyTimer);
  }

  static getDerivedStateFromError(): State {
    return { crashed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error(error, info.componentStack);
    // An unattended TV has nobody to press the button, so /display reloads itself: 30 s, 60 s, 120 s, up to 5 min.
    if (!isDisplayPage()) return;
    window.clearTimeout(this.healthyTimer);
    // A repeat catch in the same page life is the same crash episode: re-arm the timer, count no new attempt.
    window.clearTimeout(this.reloadTimer);
    if (this.reloadDelay === undefined) {
      const attempts = readAttempts();
      writeAttempts(attempts + 1);
      this.reloadDelay = Math.min(FIRST_RELOAD_MS * 2 ** attempts, MAX_RELOAD_MS);
    }
    this.reloadTimer = window.setTimeout(() => window.location.reload(), this.reloadDelay);
  }

  render() {
    if (!this.state.crashed) return this.props.children;
    document.title = copy.app.pageTitle(copy.states.crashTitle);
    return (
      <main className={styles.page}>
        <p className={styles.wordmark}>{copy.app.name}</p>
        <div className={styles.head}>
          <h1>{copy.states.crashTitle}</h1>
          <p className={styles.lead}>{copy.states.crashBody}</p>
        </div>
        <div className={styles.form}>
          <Button fullWidth onClick={() => window.location.reload()}>
            {copy.common.reload}
          </Button>
        </div>
      </main>
    );
  }
}
