import { useContext } from 'react';
import { useLocation, useSearch as useWouterSearch } from 'wouter';
import { NavigationContext, ReopenContext } from './provider';

export type NavigationRouter = {
  push(href: string): void;
  replace(href: string): void;
  back(): void;
};

/** The pathname under the provider's location, without the search (`/today`). */
export function usePathname(): string {
  const [pathname] = useLocation();
  return pathname;
}

/** The search string without its `?`; empty when there is none. */
export function useSearch(): string {
  return useWouterSearch();
}

/** How many times a Link to the shown path was pressed; it changes only on such a press. */
export function useReopens(): number {
  return useContext(ReopenContext).count;
}

/** Programmatic navigation; screens prefer Link, which keeps a real href. */
export function useRouter(): NavigationRouter {
  const [, navigate] = useLocation();
  const { back } = useContext(NavigationContext);
  return {
    push: (href) => navigate(href),
    replace: (href) => navigate(href, { replace: true }),
    back,
  };
}
