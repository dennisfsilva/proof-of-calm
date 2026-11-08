// The reload after a deployment (ADR-0045 §3 and its deviation of 2026-10-22). Vite dispatches
// `vite:preloadError` whenever a dynamic import fails: when the chunk is gone after a new deployment,
// but also when the browser cancels it because the page is leaving (WebKit cancels a leaving
// document's loads), where a reload would replace the navigation the person started. So the handler
// asks the server whether the build the page runs is still there: the entry's hash changes whenever any
// chunk it can import changes, so a missing entry means a new deployment. The HEAD reaches the network,
// as the service worker routes only GET (`apps/web/src/sw.ts`); `connect-src 'self'` allows it; Vercel
// does not rewrite `/assets/*`, so a missing file answers 404.

/** Set once this tab reloaded for a new build: a second failure never reloads again (no loop). */
export const CHUNK_RELOAD_KEY = 'poc.preload-reload';

export type ChunkReloadOptions = {
  readonly target: EventTarget;
  readonly entryUrl: string;
  readonly fetch: (url: string, init: RequestInit) => Promise<{ readonly status: number }>;
  readonly storage: () => Pick<Storage, 'getItem' | 'setItem'>;
  readonly reload: () => void;
};

const GONE = new Set([404, 410]);

export function installChunkReload(options: ChunkReloadOptions): void {
  // One check at a time: the chunks a screen fails together share one HEAD. A check that keeps the
  // page frees the guard, so a deployment later in the life of this document is still found.
  let checking = false;

  /** Resolves true once it reloaded. */
  const check = async (): Promise<boolean> => {
    try {
      if (options.storage().getItem(CHUNK_RELOAD_KEY) !== null) return false;
    } catch {
      // Without storage the guard cannot be read: the check below still decides.
    }
    let status: number;
    try {
      ({ status } = await options.fetch(options.entryUrl, { method: 'HEAD', cache: 'no-store' }));
    } catch {
      return false;
    }
    if (!GONE.has(status)) return false;
    try {
      options.storage().setItem(CHUNK_RELOAD_KEY, '1');
    } catch {
      // Without storage the guard cannot be kept: one reload is still the better outcome.
    }
    options.reload();
    return true;
  };

  options.target.addEventListener('vite:preloadError', (event) => {
    event.preventDefault();
    if (checking) return;
    checking = true;
    void check().then((reloaded) => {
      checking = reloaded;
    });
  });
}
