import { useEffect } from 'react';
import { copy } from '../content/copy.ts';
import styles from './PageStub.module.css';

/** Placeholder body for a page whose real screen is not built yet. Renders only its title. */
export function PageStub({ title }: { title: string }) {
  useEffect(() => {
    document.title = copy.app.pageTitle(title);
  }, [title]);

  return (
    <main className={styles.page}>
      <h1>{title}</h1>
    </main>
  );
}
