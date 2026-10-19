import type { AnchorHTMLAttributes } from 'react';
import { Link } from 'wouter';
import { buttonClass, type ButtonStyleProps } from './Button.tsx';
import { cx } from './cx.ts';

type Props = Omit<ButtonStyleProps, 'busy' | 'disabled'> &
  Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> & { href: string };

/** An in-app route link that looks like a Button. */
export function LinkButton({ href, variant, size, fullWidth, className, ...rest }: Props) {
  return <Link {...rest} href={href} className={cx(buttonClass({ variant, size, fullWidth }), className)} />;
}
