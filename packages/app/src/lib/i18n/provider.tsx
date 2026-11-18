import { createContext, type ReactNode, useContext, useSyncExternalStore } from 'react';
import { IntlProvider } from 'use-intl';
import { VISIBLE_LANGUAGES } from './language';
import type { UiLanguage } from './locale';
import type { Messages } from './messages';
import { messageRegistry } from './registry';

export type I18nProviderProps = {
  /** The UI language the entry read (`readLanguage`); English where a test or story gives none. */
  locale?: UiLanguage;
  /**
   * The namespaces this tree needs, whole (`{ errors, today }`); the host's entry imports its static
   * namespaces from `messages/<locale>/<namespace>.json` (ADR-0045 §8). Nothing by default, so the
   * merged file stays out of every bundle. A namespace given here wins over the registry's copy.
   */
  messages?: Partial<Messages>;
  /**
   * The languages Settings offers: the host's `listedLanguages(__POC_LANGUAGES__)` (ADR-0023, Deviations of
   * 2026-11-18); the visible ones by default, so a test or story shows no picker unless it asks.
   */
  languages?: readonly UiLanguage[];
  children: ReactNode;
};

const OfferedLanguages = createContext<readonly UiLanguage[]>(VISIBLE_LANGUAGES);

/** The languages this build offers; the picker shows only when there are two. */
export function useOfferedLanguages(): readonly UiLanguage[] {
  return useContext(OfferedLanguages);
}

export function I18nProvider({
  locale = 'en',
  messages = {},
  languages = VISIBLE_LANGUAGES,
  children,
}: I18nProviderProps) {
  // The lazy screens' namespaces, as `lazyScreen` registers them; the same snapshot serves the static
  // render of a test, where no screen has loaded yet.
  const registered = useSyncExternalStore(
    messageRegistry.subscribe,
    messageRegistry.getSnapshot,
    messageRegistry.getSnapshot,
  );
  const merged = { ...registered, ...messages };
  return (
    <OfferedLanguages.Provider value={languages}>
      <IntlProvider locale={locale} messages={merged as Messages} timeZone="UTC">
        {children}
      </IntlProvider>
    </OfferedLanguages.Provider>
  );
}
