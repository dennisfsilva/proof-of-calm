import { type ComponentProps, type MouseEvent, useContext } from 'react';
import { Link as WouterLink } from 'wouter';
import { usePathname } from './hooks';
import { ReopenContext } from './provider';

export type LinkProps = { href: string; replace?: boolean } & Omit<ComponentProps<'a'>, 'href'>;

/** A press that navigates in place, as wouter's Link takes it: the primary button, no modifier, not prevented. */
function isPlainClick(event: MouseEvent<HTMLAnchorElement>): boolean {
  if (event.defaultPrevented || event.button !== 0) return false;
  return !(event.ctrlKey || event.metaKey || event.shiftKey || event.altKey);
}

/**
 * An in-app link: an anchor with the real href (hash-prefixed on the static-export host) that navigates
 * without a reload. A plain press of a link to the shown path counts as a reopen (`useReopens`).
 */
export function Link({ href, replace = false, onClick, ...anchor }: LinkProps) {
  const pathname = usePathname();
  const { bump } = useContext(ReopenContext);
  return (
    <WouterLink
      href={href}
      replace={replace}
      {...anchor}
      onClick={(event: MouseEvent<HTMLAnchorElement>) => {
        onClick?.(event);
        if (href === pathname && isPlainClick(event)) bump();
      }}
    />
  );
}
