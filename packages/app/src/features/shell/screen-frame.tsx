import {
  createContext,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
  useContext,
  useLayoutEffect,
  useState,
} from 'react';

// The screen area's one landmark (docs/DESIGN.md §6, ADR-0045 §9): the shell renders `ScreenFrame` once,
// around the loading state, the failure screen and the routes, so a screen renders no `main` of its own
// and the skip link always has its target. The area is busy while the services start (`busy`) and
// while a lazy screen's chunk loads: the route table's Suspense fallback, `ScreenPending`, counts
// itself in while mounted. A layout effect, so the busy state is set before the empty area paints.
// While a toast shows, the area's bottom padding is the toast's inset (packages/ui's toast sets it) less
// the tab bar's spacer below the area, which the inset already covers, so the end of a screen can scroll
// clear of the toast (docs/DESIGN.md §7).

const PendingContext = createContext<Dispatch<SetStateAction<number>> | null>(null);

export type ScreenFrameProps = {
  readonly busy: boolean;
  readonly children?: ReactNode;
};

export function ScreenFrame({ busy, children }: ScreenFrameProps) {
  const [pending, setPending] = useState(0);
  return (
    <PendingContext.Provider value={setPending}>
      <main
        id="main"
        tabIndex={-1}
        aria-busy={busy || pending > 0 || undefined}
        className="flex flex-1 flex-col pb-[max(0px,var(--toast-inset,0px)_-_var(--bottom-bar))]"
      >
        {children}
      </main>
    </PendingContext.Provider>
  );
}

/** The Suspense fallback of the screen area: no text (§9), only the busy state while it is mounted. */
export function ScreenPending() {
  const setPending = useContext(PendingContext);
  useLayoutEffect(() => {
    if (setPending === null) return;
    setPending((count) => count + 1);
    return () => setPending((count) => count - 1);
  }, [setPending]);
  return null;
}
