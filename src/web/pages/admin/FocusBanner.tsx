import { useEffect, useRef, type ReactNode } from 'react';
import { Banner, type BannerVariant } from '../../components/Banner.tsx';

interface Props {
  variant: BannerVariant;
  title?: string;
  children?: ReactNode;
}

/** A banner that takes focus when it mounts. Change its `key` to pull focus again. */
export function FocusBanner({ variant, title, children }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.focus();
  }, []);
  return (
    <div ref={ref} tabIndex={-1}>
      <Banner variant={variant} title={title}>
        {children}
      </Banner>
    </div>
  );
}
