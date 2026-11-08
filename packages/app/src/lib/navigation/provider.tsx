import { createContext, type ReactNode, useState } from 'react';
import { Router } from 'wouter';
import { memoryLocation } from 'wouter/memory-location';
import { useHashLocation } from 'wouter/use-hash-location';

// The navigation adapter (ADR-0045 §9): wouter is imported only in this folder (dependency rule
// wouter-only-in-navigation). The web host reads the browser's history, the static-export host the
// hash, and tests an in-memory location.

/** What the hooks need beyond wouter's own: how to go back under the chosen location. */
export const NavigationContext = createContext<{ back: () => void }>({ back: () => window.history.back() });

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

export function NavigationProvider({ location, initialPath = '/', children }: NavigationProviderProps) {
  if (location === 'memory') return <MemoryRouter initialPath={initialPath}>{children}</MemoryRouter>;
  if (location === 'hash') return <Router hook={useHashLocation}>{children}</Router>;
  return <Router>{children}</Router>;
}
