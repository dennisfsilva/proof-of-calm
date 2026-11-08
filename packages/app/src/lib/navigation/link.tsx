import type { ComponentProps } from 'react';
import { Link as WouterLink } from 'wouter';

export type LinkProps = { href: string; replace?: boolean } & Omit<ComponentProps<'a'>, 'href'>;

/** An in-app link: an anchor with the real href (hash-prefixed on the static-export host) that navigates without a reload. */
export function Link({ href, replace = false, ...anchor }: LinkProps) {
  return <WouterLink href={href} replace={replace} {...anchor} />;
}
