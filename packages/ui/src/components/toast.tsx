'use client';

import { XIcon } from 'lucide-react';
import {
  type FocusEvent,
  type ReactNode,
  type RefObject,
  useEffect,
  useLayoutEffect,
  useRef,
  useSyncExternalStore,
} from 'react';
import { useModalCovered } from '#lib/modal-layer';
import { Button } from './button';

// The toast (docs/DESIGN.md §8, ADR-0045 §14), our own: Base UI exports its toast as one namespace,
// which carried the positioning code of anchored toasts into any page that showed one. One toast at a
// time with at most one action (undo, edit, reload) beside the close button, an overlay at the bottom
// above the home indicator. The viewport is a polite live region that stays in the document, so a toast
// is announced when it appears; it never takes focus, but F6 moves focus into it and closing it returns
// focus to where it was, unless its action places the focus itself (an Undo, docs/DESIGN.md §6). While it shows, it sets --toast-inset so focus stops clear of it (useToastInset).
// The app owns the manager, which holds the toast and its timer: no global.

type ToastOptions = {
  readonly title: ReactNode;
  readonly description?: ReactNode;
  /** Milliseconds until it closes by itself (UNDO_WINDOW_MS for a deletion); 0 keeps it until answered or closed. */
  readonly timeout: number;
  /** The one action. Pressing it closes the toast, then runs `onClick`. */
  readonly actionProps?: ToastAction;
};

type ToastAction = {
  readonly children: ReactNode;
  /** `returnFocus` puts the focus back where it was before the toast, unless the person has moved it since. */
  readonly onClick: (returnFocus: () => void) => void;
  /**
   * Where the focus goes as the action closes the toast: `'return'` (the default) back where it came from;
   * `'caller'` nowhere, since the action places it (an Undo on the control it restores) or calls `returnFocus`.
   */
  readonly focus?: 'return' | 'caller';
};

/** The last toast shown; a closed one stays while it fades out, until the next replaces it. */
type ToastObject = Omit<ToastOptions, 'timeout'> & { readonly id: string; readonly open: boolean };

type ToastManager = {
  /** Shows a toast in place of the one on screen and returns its id. */
  add(options: ToastOptions): string;
  /** Closes the toast on screen, or only the toast `id` if it is still on screen. */
  close(id?: string): void;
  /** Stops the toast's timer while someone attends to it; `resume` starts its full window again. */
  pause(id: string): void;
  resume(id: string): void;
  subscribe(listener: () => void): () => void;
  getSnapshot(): ToastObject | null;
};

function createToastManager(): ToastManager {
  let toast: ToastObject | null = null;
  let timeout = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let shown = 0;
  const listeners = new Set<() => void>();
  const isOpen = (id?: string) => toast?.open === true && (id === undefined || id === toast.id);
  const set = (next: ToastObject) => {
    toast = next;
    for (const listener of listeners) listener();
  };
  const stop = () => {
    clearTimeout(timer);
    timer = undefined;
  };
  const start = (id: string) => {
    if (timeout > 0) timer = setTimeout(() => manager.close(id), timeout);
  };
  const manager: ToastManager = {
    add({ timeout: ms, ...content }) {
      stop();
      shown += 1;
      const id = `toast-${shown}`;
      timeout = ms;
      start(id);
      set({ ...content, id, open: true });
      return id;
    },
    close(id) {
      if (toast === null || !isOpen(id)) return;
      stop();
      set({ ...toast, open: false });
    },
    pause(id) {
      if (isOpen(id)) stop();
    },
    resume(id) {
      if (isOpen(id) && timer === undefined) start(id);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getSnapshot: () => toast,
  };
  return manager;
}

const noToastOnTheServer = () => null;

type ToasterProps = {
  /** The accessible name of each toast's close button. */
  closeLabel: string;
  toastManager: ToastManager;
  children?: ReactNode;
};

function Toaster({ closeLabel, toastManager, children }: ToasterProps) {
  const toast = useSyncExternalStore(toastManager.subscribe, toastManager.getSnapshot, noToastOnTheServer);
  const viewport = useRef<HTMLDivElement>(null);
  const open = toast?.open === true;

  // F6, the key that moves between panes, moves focus into the open toast, as Base UI's did in M0, so a
  // keyboard reaches the undo in time; pressed inside the toast, it is left to the browser.
  useEffect(() => {
    if (!open) return undefined;
    function focusToast(event: KeyboardEvent) {
      const target = viewport.current?.querySelector('button');
      if (event.key !== 'F6' || !target || viewport.current?.contains(document.activeElement)) return;
      event.preventDefault();
      target.focus();
    }
    window.addEventListener('keydown', focusToast);
    return () => window.removeEventListener('keydown', focusToast);
  }, [open]);

  useToastInset(viewport, open ? toast.id : null);

  return (
    <>
      {children}
      <div
        ref={viewport}
        data-slot="toast-viewport"
        role="status"
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex justify-center px-gutter pb-[calc(var(--gutter)+max(var(--bottom-bar),env(safe-area-inset-bottom)))]"
      >
        {toast && <ToastCard key={toast.id} toast={toast} toastManager={toastManager} closeLabel={closeLabel} />}
      </div>
    </>
  );
}

const INSET = '--toast-inset';

/** Scrolls the focused element clear of the toast's box when the box covers it; focus in the toast stays put. */
function revealFocus(viewport: HTMLElement, card: HTMLElement) {
  const focused = document.activeElement;
  if (!(focused instanceof HTMLElement) || focused === document.body || viewport.contains(focused)) return;
  const over = card.getBoundingClientRect();
  const under = focused.getBoundingClientRect();
  const covered =
    under.bottom > over.top && under.top < over.bottom && under.right > over.left && under.left < over.right;
  if (covered) focused.scrollIntoView({ block: 'nearest' });
}

/**
 * While a toast shows, `--toast-inset` on `<html>` holds the band it covers, measured from the card's top to the
 * bottom of the window, plus the gutter (0px otherwise), so it already includes the tab bar or the home
 * indicator's inset under the card. The page's scroll padding and the screen area's bottom padding take it
 * (docs/DESIGN.md §7), so a focused element can stop clear of the toast; one the toast covers is scrolled clear
 * when it shows and whenever focus lands under it. Chromium's own focus scroll ignores the padding, so focus that
 * lands later is checked a frame after. The card enters from 1rem lower (`starting:translate-y-4`; 1 ms under
 * reduced motion, not none), and a translate never fires the ResizeObserver, so the band is measured again once
 * that transition has finished: its animations' `finished`, or its `transitionend` where there are none to ask.
 */
function useToastInset(viewport: RefObject<HTMLDivElement | null>, shownId: string | null) {
  useLayoutEffect(() => {
    const root = document.documentElement;
    const region = viewport.current;
    const card = shownId === null ? null : region?.querySelector<HTMLElement>('[data-slot="toast"]');
    if (!region || !card) {
      root.style.setProperty(INSET, '0px');
      return undefined;
    }
    const measure = () => {
      const band = Math.max(0, window.innerHeight - card.getBoundingClientRect().top);
      root.style.setProperty(INSET, `calc(${band}px + var(--gutter))`);
      revealFocus(region, card);
    };
    let frame = 0;
    const onFocusIn = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => revealFocus(region, card));
    };
    let active = true;
    const settled = () => {
      if (active) measure();
    };
    const onTransitionEnd = (event: TransitionEvent) => {
      if (event.target === card) settled();
    };
    measure();
    // getAnimations flushes the style, so the entry transition the first measure started is among them.
    if (typeof card.getAnimations === 'function') {
      void Promise.all(card.getAnimations().map((animation) => animation.finished)).then(settled, settled);
    } else {
      card.addEventListener('transitionend', onTransitionEnd);
    }
    // jsdom has no ResizeObserver; there the first measure stands.
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(measure) : null;
    observer?.observe(card);
    // The card's top moves with the window's height (rotation, a browser bar), which its own size does not show.
    window.addEventListener('resize', measure);
    document.addEventListener('focusin', onFocusIn);
    return () => {
      active = false;
      card.removeEventListener('transitionend', onTransitionEnd);
      observer?.disconnect();
      window.removeEventListener('resize', measure);
      cancelAnimationFrame(frame);
      document.removeEventListener('focusin', onFocusIn);
      root.style.setProperty(INSET, '0px');
    };
  }, [viewport, shownId]);
}

type ToastCardProps = { toast: ToastObject; toastManager: ToastManager; closeLabel: string };

/**
 * What the window waits for: the pointer on the toast, focus in it, the page out of focus or out of sight,
 * or a modal sheet or dialog over the page, whose scrim puts the toast out of reach.
 */
type Attention = { pointer: boolean; focus: boolean; away: boolean; covered: boolean };

function hold(toastManager: ToastManager, id: string, { pointer, focus, away, covered }: Attention) {
  if (pointer || focus || away || covered) toastManager.pause(id);
  else toastManager.resume(id);
}

function ToastCard({ toast, toastManager, closeLabel }: ToastCardProps) {
  const card = useRef<HTMLDivElement>(null);
  const attention = useRef<Attention>({ pointer: false, focus: false, away: false, covered: false });
  const covered = useModalCovered();
  const returnFocusTo = useRef<HTMLElement | null>(null);
  /** Set as an action with `focus: 'caller'` closes the toast: the closing leaves the focus to the action. */
  const callerFocus = useRef(false);
  const { id, open, actionProps } = toast;

  // The window waits while the pointer is on the toast or focus is in it, so an undo never closes
  // under the hand that reaches for it (WCAG 2.2.1), and while the page is out of focus or out of sight
  // (another tab or app), so it does not run out unseen; then it runs in full again.
  function attend(kind: keyof Attention, on: boolean) {
    attention.current[kind] = on;
    hold(toastManager, id, attention.current);
  }

  // When the page loses focus (another window, or F6 to the browser's own controls), the browser blurs
  // the focused element with no related target but keeps it as the page's focused element, and on the
  // way back focuses it the same way: focus has not left the toast, and it keeps where it came from.
  function handleFocus(event: FocusEvent<HTMLDivElement>) {
    const from = event.relatedTarget;
    if (from instanceof HTMLElement && !event.currentTarget.contains(from)) returnFocusTo.current = from;
    attend('focus', true);
  }

  function handleBlur(event: FocusEvent<HTMLDivElement>) {
    if (!event.currentTarget.contains(event.relatedTarget ?? document.activeElement)) attend('focus', false);
  }

  // The page's focus and sight from the moment the toast opens, so one shown while the page is away
  // waits too. A hidden page (another tab, or another app on a phone) is away whether or not its window
  // reported a blur.
  useEffect(() => {
    if (!open) return undefined;
    function followPage() {
      attention.current.away = document.visibilityState === 'hidden' || !document.hasFocus();
      hold(toastManager, id, attention.current);
    }
    followPage();
    window.addEventListener('blur', followPage);
    window.addEventListener('focus', followPage);
    document.addEventListener('visibilitychange', followPage);
    return () => {
      window.removeEventListener('blur', followPage);
      window.removeEventListener('focus', followPage);
      document.removeEventListener('visibilitychange', followPage);
    };
  }, [open, id, toastManager]);

  // A modal over the page (lib/modal-layer.ts) holds the window until the last one has closed; the toast
  // stays under the scrim, out of reach, and does not run out there.
  useEffect(() => {
    if (!open) return;
    attention.current.covered = covered;
    hold(toastManager, id, attention.current);
  }, [open, covered, id, toastManager]);

  // Focus in a toast that closes (it turns inert) or is replaced (it leaves the document) would drop to
  // the page; it goes back where it came from, unless the action has already moved it or places it itself
  // (`focus: 'caller'`). The open toast's effect does this in its cleanup, which runs in both cases while the
  // toast is still in the document.
  useLayoutEffect(() => {
    const node = card.current;
    if (!open || node === null) return undefined;
    return () => {
      if (!callerFocus.current && node.contains(document.activeElement)) returnFocusTo.current?.focus();
    };
  }, [open]);

  function runAction(action: ToastAction) {
    const node = card.current;
    callerFocus.current = action.focus === 'caller';
    toastManager.close(id);
    // Back where it came from only while the focus is still in this toast or has dropped to the page.
    action.onClick(() => {
      const focused = document.activeElement;
      if (focused === null || focused === document.body || node?.contains(focused)) returnFocusTo.current?.focus();
    });
  }

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: these handlers only hold the timer; the buttons are the interaction
    <div
      ref={card}
      data-slot="toast"
      hidden={!open}
      inert={!open}
      onPointerEnter={() => attend('pointer', true)}
      onPointerLeave={() => attend('pointer', false)}
      onFocus={handleFocus}
      onBlur={handleBlur}
      className="pointer-events-auto w-full max-w-reading starting:translate-y-4 rounded-lg border border-overlay-border bg-overlay text-ink inert:opacity-0 starting:opacity-0 shadow-overlay transition-[opacity,translate,display] transition-discrete duration-(--duration-slow) ease-enter inert:ease-exit"
    >
      <div data-slot="toast-content" className="flex items-center gap-2 py-2 pr-2 pl-inset">
        <div className="flex min-w-0 flex-1 flex-col">
          <p data-slot="toast-title" className="font-medium text-16">
            {toast.title}
          </p>
          {toast.description !== undefined && (
            <p data-slot="toast-description" className="text-14 text-ink-2">
              {toast.description}
            </p>
          )}
        </div>
        {actionProps && (
          <Button data-slot="toast-action" variant="secondary" onClick={() => runAction(actionProps)}>
            {actionProps.children}
          </Button>
        )}
        <Button
          data-slot="toast-close"
          variant="ghost"
          size="icon"
          aria-label={closeLabel}
          onClick={() => toastManager.close(id)}
        >
          <XIcon aria-hidden className="text-ink-2" />
        </Button>
      </div>
    </div>
  );
}

export { createToastManager, Toaster, type ToastManager, type ToastObject, type ToastOptions };
