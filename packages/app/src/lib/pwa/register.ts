// The service-worker registration, hand-written on the platform API (ADR-0045 §5; the owner's choice
// over @serwist/window for its 1,753 bytes). It keeps ADR-0033's update flow step for step: register
// once the screen settled (the host's job: after the load event, in the first idle period), count a worker as waiting when it
// is parked at registration or reaches `installed` under a controller, prompt once, post SKIP_WAITING
// only on accept, and reload once when the new worker takes control. The controllerchange of a first
// install (clientsClaim) never reloads: the reload listener exists only after an accept.

/** What the shell shows as the "A new version is ready. Reload" toast: one action, or leave it waiting. */
export type UpdatePrompt = {
  /**
   * Reload into the new version: SKIP_WAITING to the waiting worker, then reload on controllerchange. When
   * another tab accepted first (the new worker already controls this page), reload directly.
   */
  accept(): void;
  /** Leave the new worker waiting; the next visit asks again. */
  dismiss(): void;
};

export type RegisterOptions = {
  container: ServiceWorkerContainer;
  /** The worker's URL; `/sw.js` (ADR-0045 §5). */
  url?: string;
  reload: () => void;
  /**
   * Shows the prompt. A returned function is called once if the prompt closes without this tab's
   * `accept()` or `dismiss()`: another tab accepted and the new worker took this page too (step 4).
   */
  // biome-ignore lint/suspicious/noConfusingVoidType: a handler that only shows the prompt returns nothing; one that can take it down returns its cleanup, as a React effect does
  onUpdateReady: (update: UpdatePrompt) => void | (() => void);
};

const SKIP_WAITING = { type: 'SKIP_WAITING' } as const;

/** A worker reaching `installed` while a controller exists is an update, not the first install (step 2). */
const watchInstalling = (container: ServiceWorkerContainer, worker: ServiceWorker | null, ready: () => void) => {
  worker?.addEventListener('statechange', () => {
    if (worker.state === 'installed' && container.controller !== null) ready();
  });
};

export async function registerServiceWorker(options: RegisterOptions): Promise<void> {
  const { container, url = '/sw.js', reload, onUpdateReady } = options;
  // The platform's type promises a registration, but Playwright's `serviceWorkers: 'block'` resolves with none.
  let registration: ServiceWorkerRegistration | undefined;
  try {
    registration = await container.register(url, { scope: '/' });
  } catch {
    // A refused registration (an unsupported scope, a blocked worker) leaves the page a plain web page.
    return;
  }
  // No registration at all (a blocked worker): a plain web page too, with no update to offer.
  if (registration === undefined) return;

  let open: UpdatePrompt | null = null;
  let reloaded = false;
  const reloadOnce = () => {
    if (reloaded) return;
    reloaded = true;
    reload();
  };

  const ready = () => {
    if (open !== null) return;
    // A controllerchange this tab did not request while the prompt is up: another tab accepted and the new
    // worker controls this page too (step 4). The prompt closes here so a later update can prompt afresh, and
    // the handler's cleanup takes its toast down; a Reload pressed before that reloads directly.
    let overtaken = false;
    let cleanup: (() => void) | undefined;
    const close = () => {
      open = null;
      container.removeEventListener('controllerchange', overtake);
    };
    const overtake = () => {
      overtaken = true;
      close();
      cleanup?.();
    };
    const prompt: UpdatePrompt = {
      accept() {
        if (overtaken) {
          reloadOnce();
          return;
        }
        if (open !== prompt) return;
        close();
        const waiting = registration.waiting;
        if (waiting === null) {
          // The other tab's worker is activating and its claim has not reached this tab yet: reload into it.
          reloadOnce();
          return;
        }
        container.addEventListener('controllerchange', reloadOnce, { once: true });
        waiting.postMessage(SKIP_WAITING);
      },
      dismiss() {
        if (open === prompt) close();
      },
    };
    open = prompt;
    container.addEventListener('controllerchange', overtake);
    cleanup = onUpdateReady(prompt) ?? undefined;
  };

  if (registration.waiting !== null) ready();
  watchInstalling(container, registration.installing, ready);
  registration.addEventListener('updatefound', () => watchInstalling(container, registration.installing, ready));
}
