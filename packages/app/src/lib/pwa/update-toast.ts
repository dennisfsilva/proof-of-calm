// The "A new version is ready. Reload" toast (ADR-0045 §5 step 3, §14; docs/DESIGN.md §8) as the handler
// for `registerServiceWorker`'s `onUpdateReady`. One toast shows at a time, so the update yields to a toast
// with an action (an undo in its window) and comes back after a toast that replaced it; it stays until it
// is answered or closed. The shell wires it with the labels of the current locale.
import type { ToastManager } from '@proofofcalm/ui/components/toast';
import type { UpdatePrompt } from './register.ts';

export type UpdateToastLabels = { readonly title: string; readonly reload: string };

export function updateToast(toasts: ToastManager, labels: UpdateToastLabels): (update: UpdatePrompt) => () => void {
  return (update) => {
    /** The update toast's id while it is the one on screen; null while it waits behind another toast. */
    let id: string | null = null;
    let answered = false;
    let unsubscribe = () => {};
    const end = () => {
      answered = true;
      unsubscribe();
    };
    const accept = () => {
      end();
      update.accept();
    };
    const show = () => {
      // `add` notifies the listener below before it returns: `id` is still null then, so it is a no-op.
      id = toasts.add({ title: labels.title, timeout: 0, actionProps: { children: labels.reload, onClick: accept } });
    };
    const changed = () => {
      const toast = toasts.getSnapshot();
      if (toast === null) return;
      if (toast.id !== id) {
        // Another toast took the screen (or the one the update waited behind changed): wait for it to close.
        id = null;
        if (!toast.open) show();
        return;
      }
      if (toast.open) return;
      // Closed under its own id: the close button, or the action, which closes the toast before it runs
      // `accept` in the same click. The dismissal waits a microtask so the action, if it follows, wins.
      id = null;
      queueMicrotask(() => {
        if (answered) return;
        end();
        update.dismiss();
      });
    };
    unsubscribe = toasts.subscribe(changed);
    const onScreen = toasts.getSnapshot();
    if (onScreen === null || !onScreen.open || onScreen.actionProps === undefined) show();
    return () => {
      // The prompt closed without this tab's answer (another tab accepted): no reload here, the next
      // navigation loads the new version (§5 step 4).
      end();
      if (id !== null) toasts.close(id);
    };
  };
}
