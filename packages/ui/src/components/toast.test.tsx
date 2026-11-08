// @vitest-environment jsdom
import { UNDO_WINDOW_MS } from '@proofofcalm/core';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useModalLayer } from '#lib/modal-layer';
import { Button } from './button';
import { Dialog, DialogContent, DialogTitle } from './dialog';
import { Sheet, SheetContent, SheetTitle } from './sheet';
import { createToastManager, Toaster, type ToastManager } from './toast';

// The own toast (ADR-0045 §14): one toast at a time with one action beside the close button, a polite
// live region that stays in the document, and the undo window timed by the manager, not the component.
// Fake timers stand in for the clock where time matters; those tests use synchronous events, because
// Testing Library's async wrapper waits on a real timeout that only Jest's fake timers advance.

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function showDeleted(manager: ToastManager, onUndo: () => void = () => {}) {
  return manager.add({
    title: 'Entry deleted',
    description: 'Bought 70 € of BTC on 5 October 2026.',
    timeout: UNDO_WINDOW_MS,
    actionProps: { children: 'Undo', onClick: onUndo },
  });
}

describe('createToastManager', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it('holds one toast: a new one replaces it, and neither the old timer nor the old id closes it', () => {
    const manager = createToastManager();
    const first = showDeleted(manager);
    vi.advanceTimersByTime(UNDO_WINDOW_MS - 1000);
    const second = manager.add({ title: 'Recorded', timeout: UNDO_WINDOW_MS });
    expect(manager.getSnapshot()).toMatchObject({ id: second, title: 'Recorded', open: true });
    expect(vi.getTimerCount()).toBe(1);
    vi.advanceTimersByTime(1000);
    manager.close(first);
    expect(manager.getSnapshot()).toMatchObject({ id: second, open: true });
    expect(second).not.toBe(first);
  });

  it('closes a toast when its window ends, and keeps one with a timeout of 0 until it is closed', () => {
    const manager = createToastManager();
    showDeleted(manager);
    vi.advanceTimersByTime(UNDO_WINDOW_MS - 1);
    expect(manager.getSnapshot()?.open).toBe(true);
    vi.advanceTimersByTime(1);
    expect(manager.getSnapshot()?.open).toBe(false);

    const update = manager.add({ title: 'A new version is ready', timeout: 0 });
    vi.advanceTimersByTime(24 * 60 * 60 * 1000);
    expect(manager.getSnapshot()).toMatchObject({ id: update, open: true });
    manager.close();
    expect(manager.getSnapshot()).toMatchObject({ id: update, open: false });
  });

  it('stops the window while the toast is attended to, and starts it again in full after', () => {
    const manager = createToastManager();
    const id = showDeleted(manager);
    vi.advanceTimersByTime(UNDO_WINDOW_MS - 1);
    manager.pause(id);
    vi.advanceTimersByTime(60_000);
    expect(manager.getSnapshot()?.open).toBe(true);
    manager.resume(id);
    vi.advanceTimersByTime(UNDO_WINDOW_MS - 1);
    expect(manager.getSnapshot()?.open).toBe(true);
    vi.advanceTimersByTime(1);
    expect(manager.getSnapshot()?.open).toBe(false);
  });

  it('ignores a pause or a resume for a toast that is no longer on screen', () => {
    const manager = createToastManager();
    const old = showDeleted(manager);
    showDeleted(manager);
    manager.pause(old);
    vi.advanceTimersByTime(UNDO_WINDOW_MS);
    expect(manager.getSnapshot()?.open).toBe(false);

    const closed = showDeleted(manager);
    manager.close(closed);
    manager.resume(closed);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('tells its subscribers about each change until they unsubscribe', () => {
    const manager = createToastManager();
    const listener = vi.fn();
    const unsubscribe = manager.subscribe(listener);
    const id = showDeleted(manager);
    manager.close(id);
    manager.close(id);
    manager.close();
    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
    showDeleted(manager);
    expect(listener).toHaveBeenCalledTimes(2);
  });
});

describe('Toaster', () => {
  // jsdom has no system focus: its hasFocus() is true only once something has had focus. Here the page
  // has focus unless a test takes it away.
  beforeEach(() => {
    vi.spyOn(document, 'hasFocus').mockReturnValue(true);
  });

  function setup() {
    const manager = createToastManager();
    render(
      <Toaster closeLabel="Dismiss" toastManager={manager}>
        <Button variant="destructive">Delete entry</Button>
      </Toaster>,
    );
    return { manager, trigger: screen.getByRole('button', { name: 'Delete entry' }) };
  }

  /** The toast on screen, or null: a closed toast stays in the document, hidden, while it fades out. */
  const shown = () => document.querySelector<HTMLElement>('[data-slot="toast"]:not([hidden])');
  const passTime = (ms: number) => act(() => vi.advanceTimersByTime(ms));
  const button = (name: string) => screen.getByRole('button', { name });

  it('announces each toast in a polite live region that is in the document before and after it', () => {
    const { manager } = setup();
    const region = screen.getByRole('status');
    expect(region.getAttribute('aria-live')).toBe('polite');
    expect(region.textContent).toBe('');

    act(() => void showDeleted(manager));
    const toast = shown();
    expect(toast?.parentElement).toBe(region);
    expect(within(region).getByText('Entry deleted').dataset.slot).toBe('toast-title');
    expect(within(region).getByText('Bought 70 € of BTC on 5 October 2026.').dataset.slot).toBe('toast-description');

    act(() => manager.close());
    expect(shown()).toBeNull();
    expect(screen.getByRole('status')).toBe(region);
    expect(within(region).queryByRole('button')).toBeNull();
  });

  it('never takes focus, and offers one action beside the close button, both in the tab order', async () => {
    const { manager, trigger } = setup();
    const user = userEvent.setup();
    trigger.focus();
    act(() => void showDeleted(manager));
    expect(document.activeElement).toBe(trigger);

    const buttons = within(screen.getByRole('status')).getAllByRole('button');
    expect(buttons.map((element) => element.dataset.slot)).toEqual(['toast-action', 'toast-close']);
    await user.tab();
    expect(document.activeElement).toBe(button('Undo'));
    await user.tab();
    expect(document.activeElement).toBe(button('Dismiss'));

    act(() => void manager.add({ title: 'Saved', timeout: UNDO_WINDOW_MS }));
    expect(within(screen.getByRole('status')).getAllByRole('button')).toHaveLength(1);
  });

  it('runs the action once and closes; the close button closes without running it', async () => {
    const { manager } = setup();
    const user = userEvent.setup();
    const undo = vi.fn();
    act(() => void showDeleted(manager, undo));
    await user.click(button('Undo'));
    expect(undo).toHaveBeenCalledOnce();
    expect(shown()).toBeNull();

    act(() => void showDeleted(manager, undo));
    await user.click(button('Dismiss'));
    expect(undo).toHaveBeenCalledOnce();
    expect(shown()).toBeNull();
  });

  it('shows one toast at a time: a new one replaces the one on screen', () => {
    const { manager } = setup();
    act(() => void showDeleted(manager));
    act(
      () =>
        void manager.add({
          title: 'Recorded: 100 € of BTC on 16 October 2026.',
          timeout: UNDO_WINDOW_MS,
          actionProps: { children: 'Edit', onClick: () => {} },
        }),
    );
    expect(document.querySelectorAll('[data-slot="toast"]:not([hidden])')).toHaveLength(1);
    expect(shown()?.textContent).toContain('Recorded: 100 € of BTC on 16 October 2026.');
    expect(screen.queryByRole('button', { name: 'Undo' })).toBeNull();
    expect(button('Edit').dataset.slot).toBe('toast-action');
  });

  it('keeps the undo for UNDO_WINDOW_MS, then closes', () => {
    vi.useFakeTimers();
    const { manager } = setup();
    act(() => void showDeleted(manager));
    passTime(UNDO_WINDOW_MS - 1);
    expect(button('Undo').dataset.slot).toBe('toast-action');
    passTime(1);
    expect(screen.queryByRole('button', { name: 'Undo' })).toBeNull();
    expect(shown()).toBeNull();
  });

  it('holds the window while the pointer is on the toast, and gives it in full after', () => {
    vi.useFakeTimers();
    const { manager } = setup();
    act(() => void showDeleted(manager));
    passTime(UNDO_WINDOW_MS - 1000);
    const toast = shown();
    if (toast === null) throw new Error('no toast on screen');
    fireEvent.pointerEnter(toast);
    passTime(60_000);
    expect(shown()).toBe(toast);
    fireEvent.pointerLeave(toast);
    passTime(UNDO_WINDOW_MS - 1);
    expect(shown()).toBe(toast);
    passTime(1);
    expect(shown()).toBeNull();
  });

  it('holds the window while focus is in the toast, and gives it in full after', () => {
    vi.useFakeTimers();
    const { manager, trigger } = setup();
    trigger.focus();
    act(() => void showDeleted(manager));
    passTime(UNDO_WINDOW_MS - 1000);
    act(() => button('Undo').focus());
    act(() => button('Dismiss').focus());
    passTime(60_000);
    expect(shown()).not.toBeNull();
    act(() => trigger.focus());
    passTime(UNDO_WINDOW_MS - 1);
    expect(shown()).not.toBeNull();
    passTime(1);
    expect(shown()).toBeNull();
  });

  it('holds the window while the page is out of focus, and gives it in full when the page has focus again', () => {
    vi.useFakeTimers();
    const { manager, trigger } = setup();
    trigger.focus();
    act(() => void showDeleted(manager));
    passTime(UNDO_WINDOW_MS - 1000);

    // Another tab or app: the window blurs and the page has no focus; on the way back the window has
    // focus first.
    vi.mocked(document.hasFocus).mockReturnValue(false);
    fireEvent.blur(window);
    passTime(60_000);
    expect(shown()).not.toBeNull();
    vi.mocked(document.hasFocus).mockReturnValue(true);
    fireEvent.focus(window);
    passTime(UNDO_WINDOW_MS - 1);
    expect(shown()).not.toBeNull();
    passTime(1);
    expect(shown()).toBeNull();
  });

  it('holds the window while the page is out of sight, as when a phone switches apps', () => {
    vi.useFakeTimers();
    const visibility = vi.spyOn(document, 'visibilityState', 'get');
    const { manager } = setup();
    act(() => void showDeleted(manager));
    visibility.mockReturnValue('hidden');
    fireEvent(document, new Event('visibilitychange'));
    passTime(60_000);
    expect(shown()).not.toBeNull();
    visibility.mockReturnValue('visible');
    fireEvent(document, new Event('visibilitychange'));
    passTime(UNDO_WINDOW_MS - 1);
    expect(shown()).not.toBeNull();
    passTime(1);
    expect(shown()).toBeNull();
  });

  it('holds the window of a toast shown while the page is out of focus until the page has focus', () => {
    vi.useFakeTimers();
    const { manager } = setup();
    vi.mocked(document.hasFocus).mockReturnValue(false);
    act(() => void showDeleted(manager));
    passTime(60_000);
    expect(shown()).not.toBeNull();
    vi.mocked(document.hasFocus).mockReturnValue(true);
    fireEvent.focus(window);
    passTime(UNDO_WINDOW_MS - 1);
    expect(shown()).not.toBeNull();
    passTime(1);
    expect(shown()).toBeNull();
  });

  it('still holds the window for focus left in the toast once the page has focus again', () => {
    vi.useFakeTimers();
    const { manager, trigger } = setup();
    trigger.focus();
    act(() => void showDeleted(manager));
    fireEvent.keyDown(trigger, { key: 'F6' });
    vi.mocked(document.hasFocus).mockReturnValue(false);
    fireEvent.focusOut(button('Undo'), { relatedTarget: null });
    fireEvent.blur(window);
    vi.mocked(document.hasFocus).mockReturnValue(true);
    fireEvent.focus(window);
    passTime(60_000);
    expect(document.activeElement).toBe(button('Undo'));
    expect(shown()).not.toBeNull();
    act(() => trigger.focus());
    passTime(UNDO_WINDOW_MS - 1);
    expect(shown()).not.toBeNull();
    passTime(1);
    expect(shown()).toBeNull();
  });

  // A modal sheet or dialog puts the toast under its scrim, out of reach (decided in session 21), so the
  // window waits while one is open and runs in full once the last one has closed (WCAG 2.2.1).
  describe('under a modal', () => {
    function setupWithModal(Modal: (props: { open: boolean }) => ReactNode) {
      const manager = createToastManager();
      const page = (open: boolean) => (
        <Toaster closeLabel="Dismiss" toastManager={manager}>
          <Modal open={open} />
        </Toaster>
      );
      const view = render(page(false));
      return { manager, setOpen: (open: boolean) => act(() => view.rerender(page(open))) };
    }

    const modals: [string, (props: { open: boolean }) => ReactNode, string][] = [
      [
        'sheet',
        ({ open }) => (
          <Sheet open={open}>
            <SheetContent>
              <SheetTitle>Edit the entry</SheetTitle>
            </SheetContent>
          </Sheet>
        ),
        'sheet-content',
      ],
      [
        'dialog',
        ({ open }) => (
          <Dialog open={open}>
            <DialogContent>
              <DialogTitle>Delete this entry?</DialogTitle>
            </DialogContent>
          </Dialog>
        ),
        'dialog-content',
      ],
    ];

    it.each(modals)(
      'holds the window while a %s is open, and gives it in full once it has closed',
      (_, Modal, slot) => {
        vi.useFakeTimers();
        const { manager, setOpen } = setupWithModal(Modal);
        act(() => void showDeleted(manager));
        passTime(UNDO_WINDOW_MS - 1000);
        setOpen(true);
        expect(document.querySelector(`[data-slot="${slot}"]`)).not.toBeNull();
        passTime(60_000);
        expect(shown()).not.toBeNull();
        setOpen(false);
        // The popup leaves once its exit has finished; the window runs from then.
        for (let step = 0; step < 100 && document.querySelector(`[data-slot="${slot}"]`) !== null; step += 1)
          passTime(1);
        expect(document.querySelector(`[data-slot="${slot}"]`)).toBeNull();
        passTime(UNDO_WINDOW_MS - 1);
        expect(shown()).not.toBeNull();
        passTime(1);
        expect(shown()).toBeNull();
      },
    );

    it('holds the window until the last of two layers has gone', () => {
      vi.useFakeTimers();
      const manager = createToastManager();
      function Layer() {
        useModalLayer();
        return null;
      }
      const page = (layers: number) => (
        <Toaster closeLabel="Dismiss" toastManager={manager}>
          {layers > 0 && <Layer />}
          {layers > 1 && <Layer />}
        </Toaster>
      );
      const view = render(page(2));
      act(() => void showDeleted(manager));
      passTime(60_000);
      act(() => view.rerender(page(1)));
      passTime(60_000);
      expect(shown()).not.toBeNull();
      act(() => view.rerender(page(0)));
      passTime(UNDO_WINDOW_MS - 1);
      expect(shown()).not.toBeNull();
      passTime(1);
      expect(shown()).toBeNull();
    });
  });

  it('moves focus into the toast on F6 and back to where it was when the action closes it', async () => {
    const { manager, trigger } = setup();
    const user = userEvent.setup();
    trigger.focus();
    expect(fireEvent.keyDown(trigger, { key: 'F6' })).toBe(true);

    const undo = vi.fn();
    act(() => void showDeleted(manager, undo));
    expect(fireEvent.keyDown(trigger, { key: 'F6' })).toBe(false);
    expect(document.activeElement).toBe(button('Undo'));
    expect(fireEvent.keyDown(button('Undo'), { key: 'F6' })).toBe(true);

    await user.keyboard('{Enter}');
    expect(undo).toHaveBeenCalledOnce();
    expect(shown()).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it('keeps holding the window, and where focus came from, while the page loses focus and gets it back', () => {
    vi.useFakeTimers();
    const { manager, trigger } = setup();
    trigger.focus();
    act(() => void showDeleted(manager));
    fireEvent.keyDown(trigger, { key: 'F6' });

    // Another window, or F6 again to the browser's own controls: the browser blurs Undo with no related
    // target but keeps it as the page's focused element, and on the way back focuses it the same way.
    fireEvent.focusOut(button('Undo'), { relatedTarget: null });
    passTime(UNDO_WINDOW_MS);
    expect(shown()).not.toBeNull();
    fireEvent.focusIn(button('Undo'), { relatedTarget: null });
    fireEvent.click(button('Undo'));
    expect(shown()).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it('returns focus when a new toast replaces the one it was in, and leaves it where an action puts it', async () => {
    const { manager, trigger } = setup();
    const user = userEvent.setup();
    trigger.focus();
    act(() => void showDeleted(manager, () => trigger.focus()));
    fireEvent.keyDown(trigger, { key: 'F6' });
    act(() => void manager.add({ title: 'A new version is ready.', timeout: 0 }));
    expect(document.activeElement).toBe(trigger);

    const elsewhere = document.body.appendChild(document.createElement('input'));
    act(() => void showDeleted(manager, () => elsewhere.focus()));
    await user.tab();
    await user.keyboard('{Enter}');
    expect(document.activeElement).toBe(elsewhere);
    elsewhere.remove();
  });

  // An Undo that restores a control puts the focus there itself (docs/DESIGN.md §6): with `focus: 'caller'` the
  // toast's closing leaves the focus alone, and the action's `returnFocus` gives it back for a refusal.
  it("leaves the focus to an action with focus 'caller', whose returnFocus gives it back", async () => {
    const { manager, trigger } = setup();
    const user = userEvent.setup();
    let giveBack: (() => void) | undefined;
    trigger.focus();
    act(
      () =>
        void manager.add({
          title: 'Buying ended on 3 Oct 2026.',
          timeout: UNDO_WINDOW_MS,
          actionProps: {
            children: 'Undo',
            focus: 'caller',
            onClick: (returnFocus) => {
              giveBack = returnFocus;
            },
          },
        }),
    );
    fireEvent.keyDown(trigger, { key: 'F6' });
    await user.keyboard('{Enter}');
    expect(shown()).toBeNull();
    expect(document.activeElement).not.toBe(trigger);
    act(() => giveBack?.());
    expect(document.activeElement).toBe(trigger);
  });

  it('gives no focus back once the person has moved it elsewhere', async () => {
    const { manager, trigger } = setup();
    const user = userEvent.setup();
    let giveBack: (() => void) | undefined;
    trigger.focus();
    act(
      () =>
        void manager.add({
          title: 'Plan deleted.',
          timeout: UNDO_WINDOW_MS,
          actionProps: {
            children: 'Undo',
            focus: 'caller',
            onClick: (returnFocus) => {
              giveBack = returnFocus;
            },
          },
        }),
    );
    await user.click(button('Undo'));
    const elsewhere = document.body.appendChild(document.createElement('input'));
    elsewhere.focus();
    act(() => giveBack?.());
    expect(document.activeElement).toBe(elsewhere);
    elsewhere.remove();
  });

  // The toast lies over the bottom of the page. While one shows, `--toast-inset` holds the band it covers, from
  // its top to the bottom of the screen, plus the gutter; the page's scroll padding and the screen area's bottom
  // padding take it (docs/DESIGN.md §7), and a focused element under it scrolls clear. jsdom lays nothing out, so
  // the boxes are stubbed: the card sits a 16 px gutter above the bottom of jsdom's window unless a test moves it.
  describe('the inset', () => {
    const inset = () => document.documentElement.style.getPropertyValue('--toast-inset');
    const box = (top: number, height: number) =>
      ({ top, bottom: top + height, left: 16, right: 344, height, width: 328, x: 16, y: top }) as DOMRect;
    const scrolled = vi.fn();
    let cardTop = 0;
    /** How far the card's entry transition (`starting:translate-y-4`) still holds it below its place. */
    let shift = 0;

    beforeEach(() => {
      cardTop = window.innerHeight - 16 - 72;
      shift = 0;
      scrolled.mockClear();
      Element.prototype.scrollIntoView = scrolled;
      vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
        if (this.dataset.slot === 'toast') return box(cardTop + shift, 72);
        // A focus whose bottom lies 8 px below the card's place: covered by the card, not by the card mid-entry.
        if (this.dataset.near !== undefined) return box(cardTop - 44 + 8, 44);
        return this.dataset.clear === undefined ? box(720, 44) : box(100, 44);
      });
    });

    afterEach(() => {
      Reflect.deleteProperty(Element.prototype, 'scrollIntoView');
      Reflect.deleteProperty(HTMLElement.prototype, 'getAnimations');
    });

    /** The card's entry transition as the browser reports it: one animation, finished when the test settles it. */
    function entryTransition(ended = false) {
      let settle = () => {};
      const finished = ended
        ? Promise.resolve()
        : new Promise<void>((resolve) => {
            settle = () => {
              shift = 0;
              resolve();
            };
          });
      Object.defineProperty(HTMLElement.prototype, 'getAnimations', {
        configurable: true,
        value(this: HTMLElement) {
          return this.dataset.slot === 'toast' ? [{ finished }] : [];
        },
      });
      return settle;
    }

    it('is the band from the toast’s top to the bottom plus the gutter while a toast shows, and 0px after', () => {
      const { manager } = setup();
      expect(inset()).toBe('0px');
      act(() => void showDeleted(manager));
      expect(inset()).toBe('calc(88px + var(--gutter))');
      act(() => void manager.add({ title: 'Entry saved.', timeout: UNDO_WINDOW_MS }));
      expect(inset()).toBe('calc(88px + var(--gutter))');
      act(() => manager.close());
      expect(inset()).toBe('0px');
    });

    // With no tab bar (--bottom-bar 0px) the card still sits above the home indicator's inset, which its height
    // alone does not tell: the measured band includes it, and follows the window when it resizes.
    it('covers a safe area under the toast that its height does not imply, and follows a resize', () => {
      cardTop = window.innerHeight - 16 - 34 - 72;
      const { manager } = setup();
      act(() => void showDeleted(manager));
      expect(inset()).toBe('calc(122px + var(--gutter))');
      cardTop = window.innerHeight - 16 - 72;
      act(() => void window.dispatchEvent(new Event('resize')));
      expect(inset()).toBe('calc(88px + var(--gutter))');
      act(() => manager.close());
      expect(inset()).toBe('0px');
    });

    // A translate never fires the ResizeObserver, so the band measured mid-entry would stay 16 px short for the
    // toast's life: it is measured again once the entry transition has finished (Chromium 360x640: 72, then 88).
    it('is the settled band once the entry transition finishes, though the card starts 16 px lower', async () => {
      shift = 16;
      const settle = entryTransition();
      const { manager } = setup();
      act(() => void showDeleted(manager));
      expect(inset()).toBe('calc(72px + var(--gutter))');
      await act(async () => settle());
      expect(inset()).toBe('calc(88px + var(--gutter))');
    });

    // Under reduced motion the transition lasts 1 ms (--duration-slow), not none: still measured once it ends.
    it('is the settled band under reduced motion too, whose transition lasts 1 ms rather than none', async () => {
      shift = 16;
      entryTransition(true);
      const { manager } = setup();
      act(() => void showDeleted(manager));
      shift = 0;
      await act(() => Promise.resolve());
      expect(inset()).toBe('calc(88px + var(--gutter))');
    });

    it('is measured again on the card’s transitionend where the page has no getAnimations', () => {
      shift = 16;
      const { manager } = setup();
      act(() => void showDeleted(manager));
      expect(inset()).toBe('calc(72px + var(--gutter))');
      shift = 0;
      act(() => void shown()?.dispatchEvent(new Event('transitionend', { bubbles: true })));
      expect(inset()).toBe('calc(88px + var(--gutter))');
    });

    it('scrolls clear a focus whose bottom lies within 16 px of the card’s settled top', async () => {
      shift = 16;
      const settle = entryTransition();
      const { manager } = setup();
      const near = document.body.appendChild(document.createElement('button'));
      near.dataset.near = '';
      near.focus();
      act(() => void showDeleted(manager));
      expect(scrolled).not.toHaveBeenCalled();
      await act(async () => settle());
      expect(scrolled.mock.contexts).toEqual([near]);
      near.remove();
    });

    it('scrolls the focused element clear when the toast covers it, now or when focus lands there', async () => {
      const { manager, trigger } = setup();
      const clear = document.body.appendChild(document.createElement('button'));
      clear.dataset.clear = '';
      trigger.focus();
      act(() => void showDeleted(manager));
      expect(scrolled).toHaveBeenCalledOnce();
      expect(scrolled.mock.contexts[0]).toBe(trigger);
      expect(scrolled).toHaveBeenCalledWith({ block: 'nearest' });

      scrolled.mockClear();
      act(() => clear.focus());
      act(() => trigger.focus());
      await act(() => new Promise(requestAnimationFrame));
      expect(scrolled.mock.contexts).toEqual([trigger]);

      scrolled.mockClear();
      fireEvent.keyDown(trigger, { key: 'F6' });
      await act(() => new Promise(requestAnimationFrame));
      act(() => manager.close());
      act(() => trigger.focus());
      await act(() => new Promise(requestAnimationFrame));
      expect(scrolled).not.toHaveBeenCalled();
      clear.remove();
    });
  });
});
