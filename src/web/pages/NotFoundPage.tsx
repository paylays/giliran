import { useEffect } from 'react';
import { LinkButton } from '../components/LinkButton.tsx';
import { copy } from '../content/copy.ts';
import styles from './login/login.module.css';

export function NotFoundPage() {
  useEffect(() => {
    document.title = copy.app.pageTitle(copy.states.notFoundTitle);
  }, []);

  return (
    <main className={styles.page}>
      <p className={styles.wordmark}>{copy.app.name}</p>
      <div className={styles.head}>
        <h1>{copy.states.notFoundTitle}</h1>
        <p className={styles.lead}>{copy.states.notFoundBody}</p>
      </div>
      <div className={styles.form}>
        <LinkButton href="/take" fullWidth>
          {copy.states.notFoundAction}
        </LinkButton>
      </div>
    </main>
  );
}
