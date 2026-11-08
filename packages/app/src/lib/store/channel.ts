// Tells the other tabs of this browser that the stored data changed, so that each reloads its snapshot
// (ADR-0019). One BroadcastChannel named after the database; every message names the tab that sent it,
// because BroadcastChannel only skips the object that posted, and a second one in the same tab (a
// remount, two stores) must not answer its own tab's write.
import * as z from 'zod/mini';
import { DATABASE_NAME } from '../adapters/idb/database';

/** What another tab did: changed the stored data, or wiped it ("Delete everything"). */
export type TabEvent = 'changed' | 'wiped';

export type CrossTabChannel = {
  /**
   * Tells the other tabs that this one changed the stored data. A wipe is told first as a wipe, then as a
   * change, so a tab of an earlier version that reads only the change still reloads.
   */
  post(event?: TabEvent): void;
  /** Calls `listener` when another tab changed or wiped it; returns the unsubscribe. */
  subscribe(listener: (event: TabEvent) => void): () => void;
  close(): void;
};

const ChangedSchema = z.strictObject({ kind: z.enum(['changed', 'wiped']), from: z.string() });

/** For tests, Storybook and runtimes without BroadcastChannel: nothing to tell, nothing to hear. */
export const localOnly: CrossTabChannel = {
  post: () => undefined,
  subscribe: () => () => undefined,
  close: () => undefined,
};

export type CrossTabOptions = {
  readonly name?: string;
  /** This tab's id: crypto.randomUUID unless a test brings its own. */
  readonly tabId?: string;
};

export function crossTabChannel(options: CrossTabOptions = {}): CrossTabChannel {
  if (typeof BroadcastChannel === 'undefined') return localOnly;
  const tabId = options.tabId ?? crypto.randomUUID();
  const channel = new BroadcastChannel(options.name ?? DATABASE_NAME);
  const listeners = new Set<(event: TabEvent) => void>();
  let open = true;
  channel.addEventListener('message', (event: MessageEvent<unknown>) => {
    const message = ChangedSchema.safeParse(event.data);
    // Another version of the app may say something else: what this one cannot read, it ignores.
    if (!message.success || message.data.from === tabId) return;
    for (const listener of listeners) listener(message.data.kind);
  });
  const send = (kind: TabEvent) => channel.postMessage({ kind, from: tabId } satisfies z.infer<typeof ChangedSchema>);
  return {
    post(event = 'changed') {
      if (!open) return;
      if (event === 'wiped') send('wiped');
      send('changed');
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    close() {
      open = false;
      listeners.clear();
      channel.close();
    },
  };
}
