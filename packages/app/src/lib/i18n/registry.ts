import type { UiLanguage } from './locale';
import type { Messages } from './messages';
import type { Namespace } from './namespaces';

// The namespaces the lazy screens have loaded so far (ADR-0045 §8): catalogue data only, never user
// state. `I18nProvider` reads it through `useSyncExternalStore`, so the snapshot is replaced, never
// mutated, and stays the same reference while nothing was added. It also holds the UI language whose
// files `loadNamespace` and `lazyScreen` load, which the hosts' entries set before the first render.

export type MessageRegistry = {
  add<N extends Namespace>(namespace: N, messages: Messages[N]): void;
  subscribe(listener: () => void): () => void;
  getSnapshot(): Partial<Messages>;
  language(): UiLanguage;
  setLanguage(language: UiLanguage): void;
};

export function createMessageRegistry(): MessageRegistry {
  let snapshot: Partial<Messages> = {};
  let current: UiLanguage = 'en';
  const listeners = new Set<() => void>();
  return {
    add(namespace, messages) {
      if (snapshot[namespace] === messages) return;
      snapshot = { ...snapshot, [namespace]: messages };
      for (const listener of listeners) listener();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getSnapshot: () => snapshot,
    language: () => current,
    setLanguage(language) {
      current = language;
    },
  };
}

/** The one registry of the running app; the provider and `lazyScreen` share it. */
export const messageRegistry = createMessageRegistry();
