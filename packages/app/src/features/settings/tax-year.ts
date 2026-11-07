// The tax-year export of Your data (docs/DOMAIN.md §3.13): the core builds the rows, this file words the header
// lines from the settings messages and saves the file. The year, the lot rule and the holding rule come only from
// the rules of the plan's country, the lot rule's note, the conditions and the sources only from its profile:
// never the CSV log's fallback to no rules, which would date every lot by the plan's own rule. A per-lot country
// with a matched lot rule (`fifo`, `lifo`, `unspecified`) gets the lot pieces, one with a rule the app does not
// match (`pooled`, `specific`, `average`) the raw listing; the shell offers no file for the other models.
// The download counts nothing (ADR-0028: `export_downloaded` stays the backup's and the log's).
import { type CountryProfile, GENERIC_COUNTRY, loadProfile, ruleSource } from '@proofofcalm/content';
import {
  addDays,
  type CalendarDate,
  type CountryRules,
  type Entry,
  type HoldingRule,
  type Plan,
  POOLED_MATCH_DAYS,
  sameHoldingRule,
  type TaxYearSpan,
  taxYearFileName,
  taxYearLots,
  taxYearLotsCsv,
  taxYearPool,
  taxYearPoolCsv,
  taxYearSpan,
  underReview,
} from '@proofofcalm/core';
import { useTranslations } from 'use-intl';
import { BRAND } from '../../lib/brand';
import type { Services } from '../../lib/services';

/** The header's words, `settings.data.taxYear.file` in the UI language. */
export function useTaxYearWords() {
  return useTranslations('settings.data.taxYear.file');
}
export type TaxYearWords = ReturnType<typeof useTaxYearWords>;

/** What the rows tell the header: the per-lot file's flags, or the raw listing's (no matching, no venue groups). */
type FileFacts = {
  readonly raw: boolean;
  readonly ongoing: boolean;
  readonly uncosted: boolean;
  readonly estimated: boolean;
  readonly unmatched: boolean;
  readonly crossVenue: number;
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

/** The header lines, in docs/DOMAIN.md §3.13's order; ISO dates, each line one cell of the file. */
function taxYearHeader(
  input: {
    readonly plan: Plan;
    readonly rules: CountryRules;
    readonly profile: CountryProfile;
    readonly span: TaxYearSpan;
    readonly facts: FileFacts;
    readonly today: CalendarDate;
  },
  t: TaxYearWords,
): string[] {
  const { plan, rules, profile, span, facts, today } = input;
  const country = rules.name;
  const date = rules.status.lastReviewed;
  const generic = rules.code === GENERIC_COUNTRY;
  // A profile more than twelve months past its review keeps no rule words (docs/JURISDICTIONS.md §1).
  const reviewing = !generic && underReview(rules.status, today);
  const sources = [...new Set([ruleSource(profile, 'lotRule'), ruleSource(profile, 'holdingRule')].filter(notNull))];
  const length = ruleLength(rules.holdingRule);
  const holding =
    length === null
      ? []
      : [
          facts.raw
            ? t('holdingRaw', { country, ...length })
            : t('holding', { country, ...length, held: today < span.to ? today : span.to }),
          ...(reviewing ? [] : profile.holdingRuleConditions),
          ...(sameHoldingRule(plan.holdingRule, rules.holdingRule) ? [] : [t('planRule', { country })]),
        ];
  const pooled = rules.lotRule === 'pooled';
  return [
    t('title', { product: BRAND.name, country, from: span.from, to: span.to }),
    t('owned'),
    plan.payCurrency === rules.currency
      ? t('currency', { currency: plan.payCurrency })
      : t('notConverted', { currency: plan.payCurrency, countryCurrency: rules.currency }),
    generic
      ? t('generic', { date })
      : reviewing
        ? t('underReview', { country, date })
        : sources.length === 0
          ? t('reviewed', { country, date })
          : t('reviewedSources', { country, date, sources: sources.join(', ') }),
    facts.raw ? t('raw') : t('matched', { rule: rules.lotRule }),
    ...(reviewing ? [] : [profile.lotRuleNote]),
    ...holding,
    ...(!facts.raw && rules.lotScope === 'per-venue' ? [t('perVenue')] : []),
    ...(facts.crossVenue > 0 ? [t('crossVenue', counted(facts.crossVenue))] : []),
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
    ...(facts.estimated ? [t('estimated')] : []),
    ...(facts.unmatched ? [t('unmatched')] : []),
    ...(facts.ongoing ? [t('ongoing', { to: span.to, today })] : []),
  ];
}

/**
 * Saves the file of the tax year ending in `endingIn`; false when the platform saved none. Throws while the
 * rules or the profile of the plan's country are not on the device: the control is not offered then.
 */
export async function downloadTaxYear(
  services: Services,
  { plan, entries }: { readonly plan: Plan; readonly entries: readonly Entry[] },
  endingIn: number,
  t: TaxYearWords,
): Promise<boolean> {
  const loaded = services.ui.getState().rules;
  const rules = loaded !== null && loaded.country === plan.country ? loaded.rules : null;
  const profile = rules === null ? null : await loadProfile(rules.code);
  if (rules === null || profile === null) throw new Error("the country's rules or profile are not loaded");
  const today = services.ui.getState().today;
  const span = taxYearSpan(rules.taxYear, endingIn);
  const header = (facts: FileFacts) => taxYearHeader({ plan, rules, profile, span, facts, today }, t);
  let content: string;
  switch (rules.lotRule) {
    case 'fifo':
    case 'lifo':
    case 'unspecified': {
      const lots = taxYearLots(plan, entries, rules, span, today);
      content = taxYearLotsCsv(lots, header({ ...lots, raw: false, windowOpen: false }));
      break;
    }
    default: {
      const pool = taxYearPool(plan, entries, rules, span, today);
      content = taxYearPoolCsv(pool, header({ ...pool, raw: true, unmatched: false, crossVenue: 0 }));
    }
  }
  return services.platform.download(taxYearFileName(BRAND.slug, span, rules.code, today), content, 'text/csv');
}
