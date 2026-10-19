import { useEffect } from 'react';
import { Link } from 'wouter';
import { copy } from '../content/copy.ts';
import styles from '../components/PageStub.module.css';

export function NotFoundPage() {
  useEffect(() => {
    document.title = copy.app.pageTitle(copy.states.notFoundTitle);
  }, []);

  return (
    <main className={styles.page}>
      <h1>{copy.states.notFoundTitle}</h1>
      <p>{copy.states.notFoundBody}</p>
      <p>
        <Link href="/take">{copy.states.notFoundAction}</Link>
      </p>
    </main>
  );
}
