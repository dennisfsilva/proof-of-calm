import type { ReactNode } from 'react';
import { useTranslations } from 'use-intl';
import type { CountryCardModel, CountryEntry } from '../../../lib/services';
import { CountryDateLine } from '../components/country-date-line';
import { COUNTRY_LINK } from './countries';
import { BACK_LINK, PAGE } from './modules';
import { type SiteLinks, useSiteFormatters } from './static';

// The holding-date page's static half (ADR-0048 Deviations of 2026-11-15): each listed country's holding rule as its
// card states it, with every one of the profile's conditions under it, so no exemption shows without its condition,
// then the rule's Sources link and the card's date line (docs/JURISDICTIONS.md §1, docs/LEGAL.md §4 and §6 question
// 13). A country under review shows its name and the under-review date line only, as its card does. It computes no
// date: the tool half that reads a visitor's purchase date sits in `children`, between the intro and the list.

const LIST = 'flex list-disc flex-col gap-stack-xs ps-inset-lg';
const SOURCES = 'inline-flex min-h-target items-center text-13 text-ink underline underline-offset-4 hover:text-ink-2';

function HoldingRule({ code, country, links }: { code: string; country: CountryCardModel; links: SiteLinks }) {
  const t = useTranslations('learn.card');
  const f = useSiteFormatters();
  const source = country.ruleSources.holdingRule;
  return (
    <li className="flex flex-col gap-stack-xs">
      <h2>
        <a href={links.country(code)} className={COUNTRY_LINK}>
          {country.name}
        </a>
      </h2>
      {!country.underReview && (
        <>
          <p className="text-16">{country.card.holdingRuleText}</p>
          {country.holdingRuleConditions.length > 0 && (
            <ul className={LIST}>
              {country.holdingRuleConditions.map((condition) => (
                <li key={condition} className="text-16">
                  {condition}
                </li>
              ))}
            </ul>
          )}
          {source !== null && (
            <a
              href={source}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={t('sourcesName', { rule: 'holdingRule' })}
              className={SOURCES}
            >
              {t('sources')}
            </a>
          )}
        </>
      )}
      <CountryDateLine
        country={{ reviewed: f.date(country.lastReviewed), source: null, underReview: country.underReview }}
      />
    </li>
  );
}

export type SiteHoldingDatesProps = {
  entries: readonly CountryEntry[];
  /** Each listed country's card by its code, as `loadCountrySite` keys them. */
  cards: ReadonlyMap<string, CountryCardModel>;
  links: SiteLinks;
  /** Between the intro and the list: the page's tool half, once it exists. */
  children?: ReactNode;
};

/** The way back to the countries, the heading, one intro line, then each country's holding rule in the library's order. */
export function SiteHoldingDates({ entries, cards, links, children }: SiteHoldingDatesProps) {
  const t = useTranslations('learn');
  return (
    <div className={PAGE}>
      <a href={links.countries} className={BACK_LINK}>
        {t('countries.back')}
      </a>
      <h1 className="text-28">{t('holding.title')}</h1>
      <p className="text-16">{t('holding.line')}</p>
      {children}
      <ul className="flex flex-col gap-stack-lg">
        {entries.map((entry) => {
          const country = cards.get(entry.code);
          return country === undefined ? null : (
            <HoldingRule key={entry.code} code={entry.code} country={country} links={links} />
          );
        })}
      </ul>
    </div>
  );
}
