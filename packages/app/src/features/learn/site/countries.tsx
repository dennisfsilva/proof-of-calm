import { useTranslations } from 'use-intl';
import type { CountryCardModel, CountryEntry } from '../../../lib/services';
import { CountryCardView } from '../components/country-card';
import { BACK_LINK, PAGE } from './modules';
import { type SiteLinks, useSiteFormatters } from './static';

// The country library as static pages (ADR-0048 Deviations of 2026-11-15), rendered inside `StaticLearn` from the
// models `loadCountrySite` derived at the prerender's today: the list, one country's card, and the rows the tax
// module's page ends with. Plain anchors through `links.country`; the generic profile is never listed, since
// `countryEntries` leaves it out (docs/JURISDICTIONS.md §2). With no plan on a public page, the rows are every
// country under `Countries`, as the app's tax module shows them with no plan (docs/EDUCATION.md §4).

export const COUNTRY_LINK =
  'inline-flex min-h-target items-center self-start font-semibold text-18 text-ink underline underline-offset-4';

type RowsProps = { entries: readonly CountryEntry[]; links: SiteLinks };

/** A row per country with its review date, worded as its card's date line (docs/LEGAL.md §4). */
function Rows({ entries, links }: RowsProps) {
  const t = useTranslations('learn.countries');
  const f = useSiteFormatters();
  return (
    <ul className="flex flex-col gap-stack-md">
      {entries.map((entry) => (
        <li key={entry.code} className="flex flex-col">
          <a href={links.country(entry.code)} className={COUNTRY_LINK}>
            {entry.name}
          </a>
          <span className="text-13 text-ink-2">
            {t(entry.underReview ? 'notReviewedSince' : 'lastReviewed', { date: f.date(entry.lastReviewed) })}
          </span>
        </li>
      ))}
    </ul>
  );
}

export type SiteCountryListProps = RowsProps;

/** The library as a page: the way back to Learn, the heading, the holding rules' page, and a row per country. */
export function SiteCountryList({ entries, links }: SiteCountryListProps) {
  const t = useTranslations('learn');
  return (
    <div className={PAGE}>
      <a href={links.learn} className={BACK_LINK}>
        {t('module.back')}
      </a>
      <h1 className="text-28">{t('countries.title')}</h1>
      <a href={links.holding} className={BACK_LINK}>
        {t('holding.title')}
      </a>
      <Rows entries={entries} links={links} />
    </div>
  );
}

export type SiteCountryRowsProps = RowsProps;

/** After the tax module's text: every country under `Countries`. */
export function SiteCountryRows({ entries, links }: SiteCountryRowsProps) {
  const t = useTranslations('learn.countries');
  return (
    <section className="flex flex-col gap-stack-md">
      <h2 className="text-20">{t('title')}</h2>
      <Rows entries={entries} links={links} />
    </section>
  );
}

export type SiteCountryPageProps = { card: CountryCardModel; links: SiteLinks };

/** One country's card as a page, as the app's route shows it; under review, its title and date line only. */
export function SiteCountryPage({ card, links }: SiteCountryPageProps) {
  const t = useTranslations('learn.countries');
  return (
    <div className={PAGE}>
      <a href={links.countries} className={BACK_LINK}>
        {t('back')}
      </a>
      <CountryCardView country={card} level={1} f={useSiteFormatters()} />
    </div>
  );
}
