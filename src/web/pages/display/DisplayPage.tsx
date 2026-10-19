import { PageStub } from '../../components/PageStub.tsx';
import { copy } from '../../content/copy.ts';

export function DisplayPage() {
  return <PageStub title={copy.display.docTitle} />;
}
