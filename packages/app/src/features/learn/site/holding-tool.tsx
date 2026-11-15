import type { CalendarDate, HoldingEffect } from '@proofofcalm/core';
import { buttonVariants } from '@proofofcalm/ui/components/button';
import { DateInput } from '@proofofcalm/ui/components/input';
import { useTranslations } from 'use-intl';
import type { CountryCardModel, CountryEntry } from '../../../lib/services';
import { CountryDateLine } from '../components/country-date-line';
import { COUNTRY_LINK } from './countries';
import { effectsOf, encodeHoldingRule, HOLDING_MIN, type HoldingRules, holdingMax } from './holding-tool.ts';
import { type SiteLinks, useSiteFormatters } from './static';

// The holding-date tool's markup (its design check of 2026-11-15), prerendered with no
// script: a form in the first paint, hidden where script is off and posting nowhere (`method="dialog"`), so a page
// whose script fails never puts the inputs in a query. Its result region holds one hidden block per country and, in a
// dated country's block, one hidden line set per effect its rule can state; the page's script (apps/web) reads the
// fragment, reveals one block and one effect and writes the dates into their `<time>` elements. Every word is from
// the messages or the profile, so the banned-words lint reads it all; the dates go through the one formatting layer.

const SOURCES = 'inline-flex min-h-target items-center text-13 text-ink underline underline-offset-4 hover:text-ink-2';
const NOTE = 'text-13 text-ink-2';
const HINT = 'text-16';

/** One effect's lines: the date, the purchase it was computed from, the note, then the conditions. */
function Effect({ effect, conditions }: { effect: HoldingEffect; conditions: readonly string[] }) {
  const t = useTranslations('learn.holding.tool');
  const [first, ...rest] = conditions;
  return (
    <div hidden data-effect={effect} className="flex flex-col gap-stack-xs">
      <p className="font-semibold text-18">
        {t.rich(effect === 'exempt' ? 'exempt' : 'lowerRate', { date: () => <time data-from="" className="nums" /> })}
      </p>
      <p className="text-16">{t.rich('from', { date: () => <time data-bought="" className="nums" /> })}</p>
      <p className={NOTE}>{t('note')}</p>
      {first !== undefined && <p className={NOTE}>{first}</p>}
      {rest.length > 0 && (
        <details className="flex flex-col gap-stack-xs">
          <summary className="inline-flex min-h-target cursor-pointer items-center text-16 text-ink-2 hover:text-ink">
            {t('more', { count: rest.length })}
          </summary>
          <ul className={`flex flex-col gap-stack-xs ${NOTE}`}>
            {rest.map((condition) => (
              <li key={condition}>{condition}</li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

type BlockProps = { code: string; country: CountryCardModel; rules: HoldingRules | undefined; links: SiteLinks };

/** A country's result: its name, then by its rule the effects, its card's holding-rule text, or nothing; Sources; the date line. */
function Block({ code, country, rules, links }: BlockProps) {
  const t = useTranslations('learn.card');
  const f = useSiteFormatters();
  const source = country.underReview ? null : country.ruleSources.holdingRule;
  const effects = country.underReview || rules === undefined ? [] : effectsOf(rules.rule, rules.overrides);
  return (
    <section hidden data-country={code.toLowerCase()} className="flex flex-col gap-stack-xs">
      <h2>
        <a href={links.country(code)} className={COUNTRY_LINK}>
          {country.name}
        </a>
      </h2>
      {!country.underReview && effects.length === 0 && <p className="text-16">{country.card.holdingRuleText}</p>}
      {effects.map((effect) => (
        <Effect key={effect} effect={effect} conditions={country.holdingRuleConditions} />
      ))}
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
      <CountryDateLine
        country={{ reviewed: f.date(country.lastReviewed), source: null, underReview: country.underReview }}
      />
    </section>
  );
}

export type SiteHoldingToolProps = {
  entries: readonly CountryEntry[];
  /** Each listed country's card by its code, as `loadCountrySite` keys them. */
  cards: ReadonlyMap<string, CountryCardModel>;
  /** Each listed country's rule and overrides by the same code. */
  rules: ReadonlyMap<string, HoldingRules>;
  links: SiteLinks;
  /** The build's day: the date field takes purchases up to a year after it. */
  today: CalendarDate;
};

/**
 * The form with its two hidden hints, each under its field, and the result region the page's script fills; then,
 * outside the form so it shows without script, the line on what the app does. The radios in the library's order,
 * none checked.
 */
export function SiteHoldingTool({ entries, cards, rules, links, today }: SiteHoldingToolProps) {
  const t = useTranslations('learn.holding.tool');
  const f = useSiteFormatters();
  const max = holdingMax(today);
  const listed = entries.flatMap((entry) => {
    const country = cards.get(entry.code);
    return country === undefined ? [] : [{ code: entry.code, country, rules: rules.get(entry.code) }];
  });
  return (
    <div className="flex flex-col gap-stack-md">
      <form method="dialog" className="flex noscript:hidden flex-col gap-stack-md">
        <div className="flex flex-col gap-stack-xs">
          <fieldset aria-describedby="holding-no-country" className="flex flex-col gap-target-gap">
            <legend className="font-semibold text-16">{t('country')}</legend>
            {listed.map(({ code, country, rules: rule }) => (
              <label key={code} className="flex min-h-target items-center gap-target-gap text-16">
                <input
                  type="radio"
                  name="country"
                  value={code.toLowerCase()}
                  data-rule={country.underReview || rule === undefined ? undefined : encodeHoldingRule(rule)}
                  className="size-5 accent-ink"
                />
                {country.name}
              </label>
            ))}
          </fieldset>
          <p hidden id="holding-no-country" data-holding-no-country="" className={HINT}>
            {t('noCountry')}
          </p>
        </div>
        <div className="flex flex-col gap-stack-xs">
          <label htmlFor="holding-bought" className="font-semibold text-16">
            {t('bought')}
          </label>
          {/* 15 rem: a native date field's text and its picker icon, kept from stretching across the column. */}
          <DateInput
            id="holding-bought"
            name="bought"
            min={HOLDING_MIN}
            max={max}
            aria-describedby="holding-invalid"
            className="max-w-60"
          />
          <p hidden id="holding-invalid" data-holding-invalid="" className={HINT}>
            {t('invalid', { min: f.date(HOLDING_MIN), max: f.date(max) })}
          </p>
        </div>
        <button type="submit" className={`${buttonVariants()} self-start`}>
          {t('submit')}
        </button>
        {/* 16 rem: the height a dated block (its date, purchase, note, first condition, Sources and date line) takes
            at 360 px, reserved so the line below does not move when it fills. */}
        <div aria-live="polite" className="flex min-h-64 flex-col gap-stack-md">
          {listed.map(({ code, country, rules: rule }) => (
            <Block key={code} code={code} country={country} rules={rule} links={links} />
          ))}
        </div>
      </form>
      <p className="text-16">{t('app')}</p>
    </div>
  );
}
