import { useEffect } from 'react';
import { copy } from '../../content/copy.ts';

export function useDocTitle(page: string): void {
  useEffect(() => {
    document.title = copy.app.pageTitle(page);
  }, [page]);
}
