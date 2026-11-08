'use client';

import type { ReactNode } from 'react';
import { useTranslations } from 'use-intl';

// A country card's date line (docs/JURISDICTIONS.md §1, docs/LEGAL.md §4): the review date, "general
// information, not advice", and the link to the rule's source once known; the generic profile's names the
// general profile as what was reviewed and links no source; a card under review leads with its last review
// and links none either. Hold & sell's holding-rule card, the country change's list and the conditions beside the
// first date all show it, so it lives here and in `shell`, whose words reach every screen, and the Log loads no
// `plan` file.

/** The parts of a `HoldingCountry` the line reads: a set `unreviewed` marks the generic profile. */
type Dated = {
  readonly reviewed: string;
  readonly source: string | null;
  readonly unreviewed?: unknown;
  readonly underReview?: boolean | undefined;
};

export function CountryDateLine({ country, id }: { readonly country: Dated; readonly id?: string | undefined }) {
  const t = useTranslations('shell.countryLine');
  const sources = (href: string) => (chunks: ReactNode) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-ink underline underline-offset-4 hover:text-ink-2"
    >
      {chunks}
    </a>
  );
  return (
    <p id={id} className="text-13 text-ink-2">
      {country.underReview === true
        ? t('underReview', { date: country.reviewed })
        : country.unreviewed !== undefined
          ? t('generic', { date: country.reviewed })
          : country.source === null
            ? t('plain', { date: country.reviewed })
            : t.rich('sources', { date: country.reviewed, sources: sources(country.source) })}
    </p>
  );
}
