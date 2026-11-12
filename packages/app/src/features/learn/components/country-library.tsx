import { use } from 'react';
import { useTranslations } from 'use-intl';
import { Link, Redirect } from '../../../lib/navigation';
import { type CountryEntry, useFormatters, useServices, useSnapshot, useToday } from '../../../lib/services';
import { YOUR_COUNTRY } from '../lib/taxes';
import { CountryCard } from './country-card';

// The country library (docs/EDUCATION.md): the list of every reviewed profile and one country's card, read as plain
// models through the countries port of Services (`lib/services/countries.ts`), so this lazy chunk imports no value of
// packages/content or packages/core (`../lazy-chunk.test.ts`). Both screens read the port through `use()`, which
// wants the same promise on every render (a new one suspends again), so each answer is kept here for its day, the
// port's today: the screen suspends under the route table's fallback (the screen area stays busy) until the files
// are in, and each profile stays its own chunk. A promise that fails is dropped, so the screen boundary's Reload or
// the next visit asks again. The tax module leads with the card of the plan's country and ends its route with the
// library's rows (docs/EDUCATION.md §4).

const kept = new Map<string, Promise<unknown>>();
function keep<T>(key: string, ask: () => Promise<T>): Promise<T> {
  let promise = kept.get(key) as Promise<T> | undefined;
  if (promise === undefined) {
    promise = ask().catch((error: unknown) => {
      kept.delete(key);
      throw error;
    });
    kept.set(key, promise);
  }
  return promise;
}

const LIST = '~/learn/countries';
export const BACK_LINK =
  'inline-flex min-h-target items-center self-start font-semibold text-16 text-ink underline underline-offset-4';

/**
 * A row per country by name with its review date, worded as its card's date line: `Not reviewed since` for a card
 * under review (docs/LEGAL.md §4).
 */
function Rows({ countries }: { readonly countries: readonly CountryEntry[] }) {
  const t = useTranslations('learn');
  const f = useFormatters();
  return (
    <ul className="flex flex-col gap-stack-md">
      {countries.map((country) => (
        <li key={country.code} className="flex flex-col">
          <Link
            href={`/countries/${country.code.toLowerCase()}`}
            className="inline-flex min-h-target items-center self-start font-semibold text-18 text-ink underline underline-offset-4"
          >
            {country.name}
          </Link>
          <span className="text-13 text-ink-2">
            {t(country.underReview ? 'countries.notReviewedSince' : 'countries.lastReviewed', {
              date: f.date(country.lastReviewed),
            })}
          </span>
        </li>
      ))}
    </ul>
  );
}

function useLibrary(): readonly CountryEntry[] {
  const services = useServices();
  return use(keep(useToday(), () => services.countries.list()));
}

/** `/learn/countries`: the way back to Learn, the heading, and the library's rows. */
export function CountryList() {
  const t = useTranslations('learn');
  const countries = useLibrary();
  return (
    <>
      <Link href="~/learn" className={BACK_LINK}>
        {t('module.back')}
      </Link>
      <h1 className="text-28">{t('countries.title')}</h1>
      <Rows countries={countries} />
    </>
  );
}

const usePlanCountry = () => useSnapshot((snapshot) => snapshot.plan?.country ?? null);

/**
 * The tax module's lead (docs/EDUCATION.md §4): the card of the rules the plan's country runs on, at level 2 with the
 * id a "Why?" link names; the generic card on XX or in a country with no profile; nothing with no plan. A profile that
 * fails to load fails the screen, since the module's text without its card would read as no rules there.
 */
export function PlanCountryCard() {
  const services = useServices();
  const today = useToday();
  const code = usePlanCountry();
  if (code === null) return null;
  const country = use(keep(`${today}/plan/${code}`, () => services.countries.planCard(code)));
  return <CountryCard country={country} level={2} id={YOUR_COUNTRY} />;
}

/**
 * Below the tax module's text on its route: `Other countries`, the library without the plan's country, or with no
 * such row (no plan, XX, a country with no profile) every row under `Countries`.
 */
export function CountryRows() {
  const t = useTranslations('learn');
  const code = usePlanCountry();
  const countries = useLibrary();
  const others = countries.filter((country) => country.code !== code);
  return (
    <section className="flex flex-col gap-stack-md">
      <h2 className="text-20">{t(others.length < countries.length ? 'countries.other' : 'countries.title')}</h2>
      <Rows countries={others} />
    </section>
  );
}

function CountryPage({ code }: { readonly code: string }) {
  const t = useTranslations('learn');
  const services = useServices();
  const country = use(keep(`${useToday()}/${code}`, () => services.countries.card(code)));
  if (country === null) return <Redirect to={LIST} replace />;
  return (
    <>
      <Link href={LIST} className={BACK_LINK}>
        {t('countries.back')}
      </Link>
      <CountryCard country={country} level={1} />
    </>
  );
}

/** `/learn/countries/<code>`, the code in lower case; any other code, the generic one's too, lands on the list. */
export function CountryRoute({ code }: { readonly code: string }) {
  if (code !== code.toLowerCase()) return <Redirect to={LIST} replace />;
  return <CountryPage code={code.toUpperCase()} />;
}
