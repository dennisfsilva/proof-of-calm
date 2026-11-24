// The tax-year export of Your data (docs/DOMAIN.md §3.13): the core builds the rows, this file words the header
// lines from the settings messages and saves the file. The year, the lot rule and the holding rule come only from
// the rules of the plan's country, the lot rule's note, the conditions and the sources only from its profile:
// never the CSV log's fallback to no rules, which would date every lot by the plan's own rule. A per-lot country
// with a matched lot rule (`fifo`, `lifo`, `unspecified`) gets the lot pieces, one with a rule the app does not
// match (`pooled`, `specific`, `average`) the raw listing. A `portfolio-wide` country (France) gets the cessions
// file and a `wealth-snapshot` one (the Netherlands) the snapshot file, switched on the model first, so France's
// `unspecified` lot rule never reaches the lot pieces. Neither gets closes: no downloaded file holds values derived
// from CoinGecko data (ADR-0036 Readings, 2026-11-08), so their value cells stay empty and the header says so.
// The download counts nothing (ADR-0028: `export_downloaded` stays the backup's and the log's).
import { type CountryProfile, GENERIC_COUNTRY, loadProfile, ruleSource } from '@proofofcalm/content';
import {
  addDays,
  assertNever,
  type CalendarDate,
  type CountryRules,
  type Entry,
  entryRole,
  type HoldingRule,
  isPositive,
  minus,
  type Plan,
  POOLED_MATCH_DAYS,
  type PoolRow,
  type PriceHistories,
  sameHoldingRule,
  type TaxYearCessions,
  type TaxYearSnapshot,
  type TaxYearSpan,
  taxYearCessions,
  taxYearCessionsCsv,
  taxYearFileName,
  taxYearLots,
  taxYearLotsCsv,
  taxYearPool,
  taxYearPoolCsv,
  taxYearSnapshot,
  taxYearSnapshotCsv,
  taxYearSpan,
  underReview,
} from '@proofofcalm/core';
import { useLocale, useTranslations } from 'use-intl';
import { createTranslator } from 'use-intl/core';
import { BRAND } from '../../lib/brand';
import { type CountriesTranslator, type CountryArgs, countryArgs } from '../../lib/countries';
import { NAMESPACE_LOADERS, type UiLanguage } from '../../lib/i18n';
import type { Services } from '../../lib/services';

/** The languages whose settings messages write the header's own words; every other screen gets English's (D10). */
export const HEADER_LANGUAGES: readonly UiLanguage[] = ['en', 'pt-PT', 'de'];

/**
 * The header's words, `settings.data.taxYear.file`, the country forms of the UI language, and the language the words
 * are in: the UI language where it writes a header, else English, whose merged words stand in for it.
 */
export function useTaxYearWords() {
  const locale = useLocale();
  return {
    file: useTranslations('settings.data.taxYear.file'),
    countries: useTranslations('countries'),
    language: HEADER_LANGUAGES.find((each) => each === locale) ?? 'en',
  };
}
export type TaxYearWords = ReturnType<typeof useTaxYearWords>;
type FileWords = TaxYearWords['file'];

/**
 * The country forms of the header's language: the screen's own where its words are the screen's language, else
 * English's, so an English line never names „für Deutschland“ (`services.language` is the UI language, ADR-0057).
 */
async function headerForms(services: Services, words: TaxYearWords): Promise<CountriesTranslator> {
  if (words.language === services.language) return words.countries;
  const { default: countries } = await NAMESPACE_LOADERS.en.countries();
  return createTranslator({ locale: 'en', messages: { countries }, namespace: 'countries' });
}

/** What the rows tell the header: the per-lot file's flags, or the raw listing's (no matching, no venue groups). */
type FileFacts = {
  readonly raw: boolean;
  readonly ongoing: boolean;
  readonly uncosted: boolean;
  readonly estimated: boolean;
  readonly unmatched: boolean;
  readonly crossVenue: number;
  /**
   * The per-lot file holds a piece a move paid as its fee in the coin; the raw listing a move dated in the year whose
   * `units` less `units_received` is above 0 (`rawMoveFees`).
   */
  readonly moveFees: boolean;
  /** The per-lot file's fee pieces a move took at its destination, since nothing outside it was left (ADR-0055). */
  readonly feeAtDestination: number;
  /** The raw listing holds a move. */
  readonly moves: boolean;
  readonly windowOpen: boolean;
};

const notNull = <T>(value: T | null): value is T => value !== null;

/** A count as a plain figure: the file's numbers carry no grouping (`format`), and ICU's `#` would add one. */
const counted = (count: number) => ({ count, figure: String(count) });

/** The rule's length for the holding line; null where the country has no rule. */
function ruleLength(rule: HoldingRule) {
  if (rule.kind === 'none') return null;
  return { unit: rule.kind, ...counted(rule.kind === 'days' ? rule.days : rule.years) };
}

type HeaderInput = {
  readonly plan: Plan;
  readonly rules: CountryRules;
  readonly profile: CountryProfile;
  readonly span: TaxYearSpan;
  readonly today: CalendarDate;
  /** The plan's country in the forms of `countries` (docs/CONTENT-STYLE.md §9). */
  readonly country: CountryArgs;
};

/** A profile more than twelve months past its review keeps no rule words (docs/JURISDICTIONS.md §1). */
const reviewingOf = ({ rules, today }: HeaderInput) =>
  rules.code !== GENERIC_COUNTRY && underReview(rules.status, today);

/** The lines every file opens with: the app, the country and the span, the export sentence, the currency, the review. */
function openingLines(input: HeaderInput, t: FileWords): string[] {
  const { plan, rules, profile, span, country } = input;
  const date = rules.status.lastReviewed;
  const sources = [...new Set([ruleSource(profile, 'lotRule'), ruleSource(profile, 'holdingRule')].filter(notNull))];
  return [
    t('title', { product: BRAND.name, ...country, from: span.from, to: span.to }),
    t('owned'),
    plan.payCurrency === rules.currency
      ? t('currency', { currency: plan.payCurrency })
      : t('notConverted', { currency: plan.payCurrency, countryCurrency: rules.currency }),
    rules.code === GENERIC_COUNTRY
      ? t('generic', { date })
      : reviewingOf(input)
        ? t('underReview', { ...country, date })
        : sources.length === 0
          ? t('reviewed', { ...country, date })
          : t('reviewedSources', { ...country, date, sources: sources.join(', ') }),
  ];
}

/** The per-lot file's and the raw listing's header, in docs/DOMAIN.md §3.13's order; each line one cell of the file. */
function taxYearHeader(input: HeaderInput & { readonly facts: FileFacts }, t: FileWords): string[] {
  const { plan, rules, profile, span, facts, today, country } = input;
  const reviewing = reviewingOf(input);
  const length = ruleLength(rules.holdingRule);
  const holding =
    length === null
      ? []
      : [
          facts.raw
            ? t('holdingRaw', { ...country, ...length })
            : t('holding', { ...country, ...length, held: today < span.to ? today : span.to }),
          ...(reviewing ? [] : profile.holdingRuleConditions),
          ...(sameHoldingRule(plan.holdingRule, rules.holdingRule) ? [] : [t('planRule', country)]),
        ];
  const pooled = rules.lotRule === 'pooled';
  return [
    ...openingLines(input, t),
    facts.raw ? t('raw') : t('matched', { rule: rules.lotRule }),
    ...(reviewing ? [] : [profile.lotRuleNote]),
    ...holding,
    ...(!facts.raw && rules.lotScope === 'per-venue' ? [t('perVenue')] : []),
    ...(facts.crossVenue > 0 ? [t('crossVenue', counted(facts.crossVenue))] : []),
    // Every row of the per-lot file has the held_at and moved_on columns, so their line is there whether or not a
    // move is; held_at is empty on a row with no acquired date (docs/DOMAIN.md §3.13).
    ...(facts.raw ? [] : [t('heldAt')]),
    ...(facts.moveFees && !facts.raw ? [t('moveFee')] : []),
    ...(facts.feeAtDestination > 0 ? [t('feeAtDestination', counted(facts.feeAtDestination))] : []),
    ...(facts.moves ? [t('moveRows')] : []),
    ...(facts.moveFees && facts.raw ? [t('moveFeeRaw')] : []),
    ...(facts.raw
      ? [
          pooled
            ? t('pooledListed', { to: span.to, windowEnd: addDays(span.to, POOLED_MATCH_DAYS) })
            : t('rawListed', { to: span.to }),
        ]
      : []),
    ...(facts.windowOpen ? [t('windowOpen', { today })] : []),
    t('format'),
    ...(facts.uncosted ? [facts.raw ? t('uncostedRaw') : t('uncosted')] : []),
    ...(facts.estimated ? [t('estimated', { product: BRAND.name })] : []),
    ...(facts.unmatched ? [t('unmatched')] : []),
    ...(facts.ongoing ? [t('ongoing', { to: span.to, today })] : []),
  ];
}

/**
 * The cessions file's header (France): no lot, matching or holding-rule line, and no threshold or form line number.
 * Its estimate line names the block, since a sale row carries the flag of every row in it.
 */
function cessionsHeader(input: HeaderInput, file: TaxYearCessions, t: FileWords): string[] {
  return [
    ...openingLines(input, t),
    t('cessions'),
    t('cessionPrices'),
    t('cessionCosts'),
    t('salePrice'),
    t('format'),
    ...(file.uncosted ? [t('heldWithoutCost')] : []),
    ...(file.estimated ? [t('estimatedBlock', { product: BRAND.name })] : []),
    ...(file.ongoing ? [t('ongoing', { to: input.span.to, today: input.today })] : []),
  ];
}

/** The snapshot file's header (the Netherlands), naming the columns by the dates the core writes into them. */
function snapshotHeader(input: HeaderInput, file: TaxYearSnapshot, t: FileWords): string[] {
  const { reference } = file;
  const columns = { opening: reference.slice(5), closing: input.span.to.slice(5) };
  return [
    ...openingLines(input, t),
    t('snapshotReference', {
      ...columns,
      reference,
      eve: addDays(reference, -1),
      to: input.span.to,
      ongoing: file.ongoing ? 'yes' : 'no',
    }),
    t('snapshotValues', columns),
    t('feeUnits'),
    t('format'),
    ...(file.heldInYear ? [t('heldInYear', { reference, opening: columns.opening })] : []),
    ...(file.uncosted ? [t('heldCost')] : []),
    ...(file.estimated ? [t('estimatedUnits', { product: BRAND.name })] : []),
    ...(file.ongoing ? [t('ongoing', { to: input.span.to, today: input.today })] : []),
  ];
}

/**
 * Whether the raw listing holds a move dated in the year that paid a network fee in the coin: the move row's `units`
 * less `units_received` above 0, the fee `taxYearPool` widens a coin's listing by.
 */
function rawMoveFees(rows: readonly PoolRow[], span: TaxYearSpan): boolean {
  return rows.some(
    (row) =>
      entryRole(row.kind) === 'move' &&
      span.from <= row.date &&
      row.date <= span.to &&
      isPositive(minus(row.units, row.unitsReceived ?? row.units)),
  );
}

/** The per-lot model's file: the lot pieces for a matched lot rule, else the raw listing. */
function perLotFile(input: HeaderInput, entries: readonly Entry[], t: FileWords): string {
  const { plan, rules, span, today } = input;
  const header = (facts: FileFacts) => taxYearHeader({ ...input, facts }, t);
  switch (rules.lotRule) {
    case 'fifo':
    case 'lifo':
    case 'unspecified': {
      const lots = taxYearLots(plan, entries, rules, span, today);
      return taxYearLotsCsv(lots, header({ ...lots, raw: false, moves: false, windowOpen: false }));
    }
    default: {
      const pool = taxYearPool(plan, entries, rules, span, today);
      const moveFees = rawMoveFees(pool.rows, span);
      return taxYearPoolCsv(
        pool,
        header({ ...pool, raw: true, unmatched: false, crossVenue: 0, moveFees, feeAtDestination: 0 }),
      );
    }
  }
}

/**
 * Saves the file of the tax year ending in `endingIn`; false when the platform saved none. Throws while the
 * rules or the profile of the plan's country are not on the device: the control is not offered then.
 */
export async function downloadTaxYear(
  services: Services,
  { plan, entries }: { readonly plan: Plan; readonly entries: readonly Entry[] },
  endingIn: number,
  words: TaxYearWords,
): Promise<boolean> {
  const loaded = services.ui.getState().rules;
  const rules = loaded !== null && loaded.country === plan.country ? loaded.rules : null;
  const profile = rules === null ? null : await loadProfile(rules.code, services.language);
  if (rules === null || profile === null) throw new Error("the country's rules or profile are not loaded");
  const today = services.ui.getState().today;
  const span = taxYearSpan(rules.taxYear, endingIn);
  const country = countryArgs(await headerForms(services, words), rules.code);
  const input: HeaderInput = { plan, rules, profile, span, today, country };
  const t = words.file;
  // No closes: the value cells stay empty until the reference closes of packages/data exist (ADR-0036 Readings).
  const noCloses: PriceHistories = { currency: plan.payCurrency, coins: {} };
  const model = rules.computationModel;
  let content: string;
  switch (model.kind) {
    case 'portfolio-wide': {
      const file = taxYearCessions(plan, entries, rules, span, noCloses, today);
      content = taxYearCessionsCsv(file, cessionsHeader(input, file, t));
      break;
    }
    case 'wealth-snapshot': {
      const file = taxYearSnapshot(plan, entries, rules, span, noCloses, today);
      content = taxYearSnapshotCsv(file, snapshotHeader(input, file, t));
      break;
    }
    case 'per-lot':
      content = perLotFile(input, entries, t);
      break;
    default:
      return assertNever(model);
  }
  // UTF-8 with a byte order mark, which Excel needs to read the file as UTF-8 (docs/DOMAIN.md §3.13).
  const name = taxYearFileName(BRAND.slug, span, rules.code, today);
  return services.platform.download(name, `﻿${content}`, 'text/csv');
}
