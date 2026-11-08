import { useEffect, useSyncExternalStore } from 'react';

// The modal layer (docs/DESIGN.md §7, ADR-0045 §14): how many modal popups (a Sheet's or a Dialog's) are
// mounted. A modal puts the page, the toast included, under its scrim, out of reach, so the toast's undo
// window waits while one is open and runs in full once the last has closed (WCAG 2.2.1). One count per
// document, like the modals themselves: a popup counts while it is mounted, through its exit as well.

let open = 0;
const listeners = new Set<() => void>();

function change(by: number) {
  open += by;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const covered = () => open > 0;
const nothingCoversTheServer = () => false;

/** Counts the calling modal popup as open while it is mounted. */
function useModalLayer(): void {
  useEffect(() => {
    change(1);
    return () => change(-1);
  }, []);
}

/** Placed inside a popup, which Base UI mounts only while it is open or closing: counts it as a modal layer. */
function ModalLayer(): null {
  useModalLayer();
  return null;
}

/** Whether a modal popup covers the page. */
function useModalCovered(): boolean {
  return useSyncExternalStore(subscribe, covered, nothingCoversTheServer);
}

export { ModalLayer, useModalCovered, useModalLayer };
