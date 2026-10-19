import { PageStub } from '../../components/PageStub.tsx';
import { copy } from '../../content/copy.ts';

export function TakePage() {
  return <PageStub title={copy.take.title} />;
}
