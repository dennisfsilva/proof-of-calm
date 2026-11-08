import { type ReactNode, useSyncExternalStore } from 'react';
import { IntlProvider } from 'use-intl';
import type { Messages } from './messages';
import { messageRegistry } from './registry';

export type I18nProviderProps = {
  /**
   * The namespaces this tree needs, whole (`{ errors, today }`); the host's entry imports its static
   * namespaces from `messages/<locale>/<namespace>.json` (ADR-0045 §8). Nothing by default, so the
   * merged file stays out of every bundle. A namespace given here wins over the registry's copy.
   */
  messages?: Partial<Messages>;
  children: ReactNode;
};

export function I18nProvider({ messages = {}, children }: I18nProviderProps) {
  // The lazy screens' namespaces, as `lazyScreen` registers them; the same snapshot serves the static
  // render of a test, where no screen has loaded yet.
  const registered = useSyncExternalStore(
    messageRegistry.subscribe,
    messageRegistry.getSnapshot,
    messageRegistry.getSnapshot,
  );
  const merged = { ...registered, ...messages };
  return (
    <IntlProvider locale="en" messages={merged as Messages} timeZone="UTC">
      {children}
    </IntlProvider>
  );
}
