'use client';

import type { CalendarDate } from '@proofofcalm/core';
import type { ReactNode } from 'react';
import { useTranslations } from 'use-intl';
import { type CountryCardModel, useFormatters } from '../../../lib/services';
import { CountryDateLine } from './country-date-line';

// A country's card (docs/JURISDICTIONS.md §1 and §2, docs/EDUCATION.md §4): the summary, then every field of the
// profile's card in one order, the holding rule with all of its conditions in a plain list, so the card never
// states an exemption without its condition. It is a reading page, so nothing is behind a control. Each rule
// with a `ruleSources` key ends with its own Sources link, so the date line takes its plain form, and the card
// ends with the profile's `sources` in the file's order, which also back the rules without a link (classification,
// taxable events, allowances; docs/LEGAL.md §4). `sources` hold only what backs a current card line (§2), so the
// foot lists them as they stand. The generic profile links no source (§2, "Generic profile `XX`") and is never
// under review; a card under review shows its title and the under-review date line only (§1). Pending changes
// are not shown: they are proposals, not rules. The profile's dates passed its schema in CI, so they are
// calendar dates. The card renders the model the countries port derives from the profile at today
// (`lib/services/countries.ts`), so this lazy chunk imports no value of packages/content or packages/core.

type RuleKey = keyof CountryCardModel['ruleSources'];

export type CountryCardProps = {
  readonly country: CountryCardModel;
  /** The title's heading level; the sections are one level below. */
  readonly level: 1 | 2;
  /** The title's id, for a link or a focus move to the card. */
  readonly id?: string | undefined;
};

export function CountryCard({ country, level, id }: CountryCardProps) {
  const t = useTranslations('learn.card');
  const f = useFormatters();
  const { card, generic, underReview: stale } = country;
  const Title = level === 1 ? 'h1' : 'h2';
  const Section = level === 1 ? 'h2' : 'h3';
  const date = (value: string) => f.date(value as CalendarDate);

  const sources = (rule: RuleKey) => {
    const href = country.ruleSources[rule];
    if (href === null) return null;
    return (
      <p className="text-13">
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={t('sourcesName', { rule })}
          className="inline-flex min-h-target items-center text-ink underline underline-offset-4 hover:text-ink-2"
        >
          {t('sources')}
        </a>
      </p>
    );
  };

  const section = (heading: string, children: ReactNode, rule?: RuleKey) => (
    <div className="flex flex-col gap-stack-xs">
      <Section className={level === 1 ? 'text-20' : 'text-18'}>{heading}</Section>
      {children}
      {rule !== undefined && sources(rule)}
    </div>
  );

  const list = (items: readonly string[]) => (
    <ul className="flex list-disc flex-col gap-stack-xs ps-inset-lg">
      {items.map((item) => (
        <li key={item} className="text-16">
          {item}
        </li>
      ))}
    </ul>
  );

  const line = (
    <CountryDateLine
      country={{
        reviewed: date(country.lastReviewed),
        source: null,
        ...(generic && { unreviewed: true }),
        underReview: stale,
      }}
    />
  );

  return (
    <article className="flex flex-col gap-stack-md">
      <Title id={id} tabIndex={-1} className={level === 1 ? 'text-28' : 'text-20'}>
        {country.name}
      </Title>
      {stale ? (
        line
      ) : (
        <>
          <p className="text-16">{card.summary60}</p>
          {section(t('classification'), <p className="text-16">{card.classification}</p>)}
          {section(
            t('events'),
            <ul className="flex flex-col gap-stack-sm">
              {card.taxableEvents.map((event) => (
                <li key={event.event} className="flex flex-col">
                  <span className="text-16">
                    {t('eventLine', { event: t(`event.${event.event}`), taxable: t(`taxable.${event.taxable}`) })}
                  </span>
                  <span className="text-14 text-ink-2">{event.note}</span>
                </li>
              ))}
            </ul>,
          )}
          {section(
            t('rates'),
            <ul className="flex flex-col gap-stack-sm">
              {card.rates.map((rate) => (
                <li key={`${rate.label} ${rate.validFrom}`} className="flex flex-col">
                  <span className="text-16">{t('rateLine', { label: rate.label, value: rate.value })}</span>
                  <span className="text-13 text-ink-2">
                    {rate.validTo === null
                      ? t('validFrom', { date: date(rate.validFrom) })
                      : t('validRange', { from: date(rate.validFrom), to: date(rate.validTo) })}
                  </span>
                  {rate.note !== undefined && <span className="text-14 text-ink-2">{rate.note}</span>}
                </li>
              ))}
            </ul>,
            'rates',
          )}
          {card.allowances.length > 0 && section(t('allowances'), list(card.allowances))}
          {section(
            t('holdingRule'),
            <>
              <p className="text-16">{card.holdingRuleText}</p>
              {country.holdingRuleConditions.length > 0 && list(country.holdingRuleConditions)}
            </>,
            'holdingRule',
          )}
          {section(t('lotRule'), <p className="text-16">{card.lotRuleText}</p>, 'lotRule')}
          {section(t('losses'), <p className="text-16">{card.losses}</p>, 'losses')}
          {section(t('reporting'), list(card.reporting), 'reporting')}
          {section(t('caveats'), list(card.caveats))}
          {line}
          {!generic &&
            section(
              t('sourceList'),
              <ul className="flex flex-col gap-stack-sm">
                {country.sources.map((source) => (
                  <li key={source.key} className="flex flex-col">
                    <a
                      href={source.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex min-h-target items-center self-start text-16 text-ink underline underline-offset-4 hover:text-ink-2"
                    >
                      {source.title}
                    </a>
                    <span className="text-13 text-ink-2">
                      {source.published === null
                        ? t('sourceAccessed', { publisher: source.publisher, date: date(source.accessed) })
                        : t('sourcePublished', { publisher: source.publisher, date: date(source.published) })}
                    </span>
                  </li>
                ))}
              </ul>,
            )}
        </>
      )}
    </article>
  );
}
