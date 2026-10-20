import { Component, type ErrorInfo, type ReactNode } from 'react';
import { copy } from '../content/copy.ts';
import styles from '../pages/login/login.module.css';
import { Button } from './Button.tsx';

interface State {
  crashed: boolean;
}

/** Last resort for a render error: a plain column with a reload button instead of a blank page. */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { crashed: false };

  static getDerivedStateFromError(): State {
    return { crashed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error(error, info.componentStack);
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
