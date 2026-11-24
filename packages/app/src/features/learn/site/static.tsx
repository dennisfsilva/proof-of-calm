import type { CalendarDate } from '@proofofcalm/core';
import { createContext, type ReactNode, useContext, useMemo } from 'react';
import { IntlProvider } from 'use-intl';
import { createFormatters, type Formatters } from '../../../lib/format';
import { localesFor } from '../../../lib/i18n';
import countries from '../../../messages/en/countries.json';
import learn from '../../../messages/en/learn.json';
import shell from '../../../messages/en/shell.json';

// What the static Learn pages render in (ADR-0048 Deviations of 2026-11-15): English, as the app's `I18nProvider` sets
// it, and the formatters of no country, since a public page belongs to no plan. No services, no router and no clock:
// the web host's prerender passes the day the pages are read at. Of `shell`, only the country cards' date line; the
// country forms (`countries`) for the cards' headings.

const MESSAGES = { countries, learn, shell: { countryLine: shell.countryLine } };

/** The site's paths; `apps/web` owns the values, so these pages link with plain anchors and no router. */
export type SiteLinks = {
  readonly learn: string;
  readonly module: (slug: string) => string;
  readonly countries: string;
  readonly country: (code: string) => string;
  readonly holding: string;
};

const FormattersContext = createContext<Formatters | null>(null);

/** The formatters `StaticLearn` provides; a page rendered outside it is a bug. */
export function useSiteFormatters(): Formatters {
  const f = useContext(FormattersContext);
  if (f === null) throw new Error('A static Learn page renders inside StaticLearn');
  return f;
}

export type StaticLearnProps = { today: CalendarDate; children: ReactNode };

export function StaticLearn({ today, children }: StaticLearnProps) {
  const f = useMemo(() => {
    const locales = localesFor('en', null);
    return createFormatters(locales.numbers, locales.ui);
  }, []);
  return (
    <IntlProvider locale="en" messages={MESSAGES} timeZone="UTC" now={new Date(`${today}T00:00:00Z`)}>
      <FormattersContext.Provider value={f}>{children}</FormattersContext.Provider>
    </IntlProvider>
  );
}
