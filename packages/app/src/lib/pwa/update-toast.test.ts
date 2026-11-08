// The "A new version is ready. Reload" toast (ADR-0045 §5 step 3, §14; DESIGN §8): one toast at a time,
// so the update waits behind a toast with an action (an undo) and returns when one replaces it.
import { UNDO_WINDOW_MS } from '@proofofcalm/core';
import { createToastManager, type ToastManager } from '@proofofcalm/ui/components/toast';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type FakeContainer, FakeWorker, updateWaitingContainer } from './fake-service-worker.testing';
import { registerServiceWorker } from './register';
import { updateToast } from './update-toast';

const labels = { title: 'A new version is ready', reload: 'Reload' };

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

async function registered(container: FakeContainer, toasts: ToastManager) {
  const reload = vi.fn();
  await registerServiceWorker({
    container: container as unknown as ServiceWorkerContainer,
    reload,
    onUpdateReady: updateToast(toasts, labels),
  });
  return reload;
}

/** The toast on screen, as the Toaster reads it. */
const onScreen = (toasts: ToastManager) => {
  const toast = toasts.getSnapshot();
  return toast?.open === true ? toast : null;
};

const undo = vi.fn();
const showUndo = (toasts: ToastManager) =>
  toasts.add({ title: 'Entry deleted', timeout: UNDO_WINDOW_MS, actionProps: { children: 'Undo', onClick: undo } });

/** The Toaster's action button: it closes the toast first, then runs the action. */
const pressAction = (toasts: ToastManager) => {
  const toast = onScreen(toasts);
  if (toast === null) throw new Error('no toast on screen');
  toasts.close(toast.id);
  toast.actionProps?.onClick(() => {});
};

/** The dismissal a close button causes is decided after the click handler has run (a microtask). */
const settled = () => new Promise<void>((resolve) => queueMicrotask(resolve));

describe('updateToast (ADR-0045 §5 step 3, §14; DESIGN §8)', () => {
  it('shows the update toast with the title and Reload when nothing is on screen, and keeps it (timeout 0)', async () => {
    const toasts = createToastManager();
    const { container } = updateWaitingContainer();
    await registered(container, toasts);
    const toast = onScreen(toasts);
    expect(toast?.title).toBe('A new version is ready');
    expect(toast?.actionProps?.children).toBe('Reload');
    vi.advanceTimersByTime(60_000);
    expect(onScreen(toasts)?.id).toBe(toast?.id);
  });

  it('waits behind an undo toast on screen and appears once it has closed', async () => {
    const toasts = createToastManager();
    const { container } = updateWaitingContainer();
    const undoId = showUndo(toasts);
    await registered(container, toasts);
    expect(onScreen(toasts)?.id).toBe(undoId);
    vi.advanceTimersByTime(UNDO_WINDOW_MS - 1);
    expect(onScreen(toasts)?.id).toBe(undoId);
    vi.advanceTimersByTime(1);
    expect(onScreen(toasts)?.title).toBe('A new version is ready');
  });

  it('keeps waiting while the undo toast is paused past its window (focus held)', async () => {
    const toasts = createToastManager();
    const { container } = updateWaitingContainer();
    const undoId = showUndo(toasts);
    toasts.pause(undoId);
    await registered(container, toasts);
    vi.advanceTimersByTime(UNDO_WINDOW_MS * 2);
    expect(onScreen(toasts)?.id).toBe(undoId);
    toasts.resume(undoId);
    vi.advanceTimersByTime(UNDO_WINDOW_MS);
    expect(onScreen(toasts)?.title).toBe('A new version is ready');
  });

  it('replaces a toast without an action at once', async () => {
    const toasts = createToastManager();
    const { container } = updateWaitingContainer();
    toasts.add({ title: 'Saved', timeout: 4_000 });
    await registered(container, toasts);
    expect(onScreen(toasts)?.title).toBe('A new version is ready');
  });

  it('Reload posts SKIP_WAITING to the waiting worker and reloads once on controllerchange', async () => {
    const toasts = createToastManager();
    const { container, next } = updateWaitingContainer();
    const reload = await registered(container, toasts);
    pressAction(toasts);
    await settled();
    expect(next.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' });
    expect(onScreen(toasts)).toBeNull();
    expect(reload).not.toHaveBeenCalled();
    container.controlledBy(next);
    container.controlledBy(next);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('the close button dismisses the prompt; a later updatefound prompts afresh', async () => {
    const toasts = createToastManager();
    const { container, next } = updateWaitingContainer();
    const reload = await registered(container, toasts);
    const toast = onScreen(toasts);
    toasts.close(toast?.id);
    await settled();
    expect(onScreen(toasts)).toBeNull();
    expect(next.postMessage).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
    // The dismissed prompt is closed: a toast closing later never shows the update toast again by itself.
    const undoId = showUndo(toasts);
    vi.advanceTimersByTime(UNDO_WINDOW_MS);
    expect(onScreen(toasts)).toBeNull();
    const later = new FakeWorker('installing');
    container.registration.found(later);
    container.registration.parks(later);
    const again = onScreen(toasts);
    expect(again?.title).toBe('A new version is ready');
    expect(again?.id).not.toBe(toast?.id);
    expect(again?.id).not.toBe(undoId);
  });

  it('an unrequested controllerchange while the update toast is up closes it without a reload', async () => {
    const toasts = createToastManager();
    const { container, next } = updateWaitingContainer();
    const reload = await registered(container, toasts);
    container.activatedElsewhere(next);
    await settled();
    expect(onScreen(toasts)).toBeNull();
    expect(reload).not.toHaveBeenCalled();
    expect(next.postMessage).not.toHaveBeenCalled();
  });

  it('an unrequested controllerchange while the update toast waits cancels the wait', async () => {
    const toasts = createToastManager();
    const { container, next } = updateWaitingContainer();
    const undoId = showUndo(toasts);
    const reload = await registered(container, toasts);
    container.activatedElsewhere(next);
    expect(onScreen(toasts)?.id).toBe(undoId);
    vi.advanceTimersByTime(UNDO_WINDOW_MS);
    expect(onScreen(toasts)).toBeNull();
    expect(reload).not.toHaveBeenCalled();
  });

  it('an undo toast replacing the update toast re-queues it: it returns once the undo has closed', async () => {
    const toasts = createToastManager();
    const { container, next } = updateWaitingContainer();
    const reload = await registered(container, toasts);
    const first = onScreen(toasts);
    const undoId = showUndo(toasts);
    await settled();
    expect(onScreen(toasts)?.id).toBe(undoId);
    expect(next.postMessage).not.toHaveBeenCalled();
    vi.advanceTimersByTime(UNDO_WINDOW_MS);
    const again = onScreen(toasts);
    expect(again?.title).toBe('A new version is ready');
    expect(again?.id).not.toBe(first?.id);
    // The prompt stayed open: Reload still posts SKIP_WAITING and reloads once.
    pressAction(toasts);
    container.controlledBy(next);
    expect(next.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' });
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('a second toast replacing the update toast before the first closes keeps it queued once', async () => {
    const toasts = createToastManager();
    const { container } = updateWaitingContainer();
    await registered(container, toasts);
    showUndo(toasts);
    vi.advanceTimersByTime(1_000);
    const saved = toasts.add({ title: 'Saved', timeout: 4_000 });
    await settled();
    expect(onScreen(toasts)?.id).toBe(saved);
    vi.advanceTimersByTime(4_000);
    expect(onScreen(toasts)?.title).toBe('A new version is ready');
    vi.advanceTimersByTime(60_000);
    expect(onScreen(toasts)?.title).toBe('A new version is ready');
  });
});
