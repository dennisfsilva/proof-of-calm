import { createContext, type ReactNode, useState } from 'react';
import { Router } from 'wouter';
import { memoryLocation } from 'wouter/memory-location';
import { navigate as navigateHash, useHashLocation } from 'wouter/use-hash-location';

// The navigation adapter (ADR-0045 §9): wouter is imported only in this folder (dependency rule
// wouter-only-in-navigation). The web host reads the browser's history, the static-export host the
// hash, and tests an in-memory location.

/** What the hooks need beyond wouter's own: how to go back under the chosen location. */
export const NavigationContext = createContext<{ back: () => void }>({ back: () => window.history.back() });

/**
 * How many times a Link to the shown path was pressed: a screen that shows a failed read re-reads on
 * it, since such a press navigates nowhere and so remounts nothing. A context of its own, so the
 * router's value never changes with it.
 */
export const ReopenContext = createContext<{ count: number; bump: () => void }>({ count: 0, bump: () => {} });

function Reopens({ children }: { children: ReactNode }) {
  const [count, setCount] = useState(0);
  const [bump] = useState(() => () => setCount((each) => each + 1));
  return <ReopenContext value={{ count, bump }}>{children}</ReopenContext>;
}

export type NavigationProviderProps = {
  location: 'browser' | 'hash' | 'memory';
  /** The memory location's first path, with its search (`/today?tab=plan`); ignored by the others. */
  initialPath?: string;
  children: ReactNode;
};

/** A memory location that records its history, so `back()` works without a window. */
function useMemory(initialPath: string) {
  const [memory] = useState(() => memoryLocation({ path: initialPath, record: true }));
  const [context] = useState(() => ({
    back: () => {
      const { history } = memory;
      if (history.length < 2) return;
      history.pop();
      memory.navigate(history[history.length - 1] ?? '/', { replace: true });
    },
  }));
  return { memory, context };
}

function MemoryRouter({ initialPath, children }: { initialPath: string; children: ReactNode }) {
  const { memory, context } = useMemory(initialPath);
  return (
    <NavigationContext value={context}>
      <Router hook={memory.hook} searchHook={memory.searchHook}>
        {children}
      </Router>
    </NavigationContext>
  );
}

/**
 * wouter's hash navigate writes the page's query (`/index.html?tab=data#/settings`) only when the
 * target holds a `?`, so a later plain target kept the old one; an empty `?` clears it.
 */
const navigateHashWithSearch: typeof navigateHash = (to, options) =>
  navigateHash(to.includes('?') ? to : `${to}?`, options);

function useHashWithSearch(): [string, typeof navigateHash] {
  const [path] = useHashLocation();
  return [path, navigateHashWithSearch];
}

const hashHrefs = (href: string) => `#${href}`;

function LocationRouter({ location, initialPath = '/', children }: NavigationProviderProps) {
  if (location === 'memory') return <MemoryRouter initialPath={initialPath}>{children}</MemoryRouter>;
  if (location === 'hash')
    return (
      <Router hook={useHashWithSearch} hrefs={hashHrefs}>
        {children}
      </Router>
    );
  return <Router>{children}</Router>;
}

export function NavigationProvider(props: NavigationProviderProps) {
  return (
    <Reopens>
      <LocationRouter {...props} />
    </Reopens>
  );
}
