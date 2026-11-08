// The four starting points of docs/DOMAIN.md §5 (ADR-0009), in the order of its table, as the core's
// `Template`: the onboarding offers them, `planFromTemplate` starts a plan from one, and `followsTemplate`
// with `templateById(plan.templateId)` tells the Plan page whether the plan is still the template.
import type { CalendarDate, Percent, References, Split, Template } from '@proofofcalm/core';
import accumulate from '../../templates/accumulate.json' with { type: 'json' };
import btcOnlyHold from '../../templates/btc-only-hold.json' with { type: 'json' };
import cyclePlan from '../../templates/cycle-plan.json' with { type: 'json' };
import twoCoins from '../../templates/two-coins.json' with { type: 'json' };
import type { ContentTemplate } from '../schema/template.ts';
import { asCoinId, asDate, asPercent } from './brands.ts';

/** A record with every value branded; absent keys stay absent, as `exactOptionalPropertyTypes` wants. */
const branded = <T>(record: Readonly<Record<string, string>>, brand: (value: string) => T) =>
  Object.fromEntries(Object.entries(record).map(([key, value]) => [key, brand(value)]));

function forCore(template: ContentTemplate): Template {
  const { coins, split, lastBuy, sellWindow, references, validUntil, lastReviewed, ...text } = template;
  return {
    ...text,
    coins: coins.map((coin) => ({ ...coin, id: asCoinId(coin.id) })),
    // The keys are the coins' tickers, checked against `coins` by the content gate (split-unknown-coin).
    split: branded(split, asPercent) as Split,
    ...(lastBuy === undefined ? {} : { lastBuy: asDate(lastBuy) }),
    sellWindow: sellWindow === null ? null : (branded(sellWindow, asDate) as Template['sellWindow']),
    references: branded(references, asDate) as References,
    ...(validUntil === undefined ? {} : { validUntil: asDate(validUntil) }),
    lastReviewed: asDate(lastReviewed),
  };
}

/** The core's template with the falls its card's dated band is composed from (docs/LEGAL.md §4), which the core never reads. */
export type OfferedTemplate = Template & { readonly drawdowns: readonly Drawdown[] };

/** One coin's fall, branded as the app formats it: the dates are calendar days, the fall a percentage of 0–100. */
export type Drawdown = Omit<ContentTemplate['drawdowns'][number], 'high' | 'low' | 'fall'> & {
  readonly high: CalendarDate;
  readonly low: CalendarDate;
  readonly fall: Percent;
};

export const TEMPLATES: readonly OfferedTemplate[] = [btcOnlyHold, twoCoins, cyclePlan, accumulate].map((json) => {
  const template = json as ContentTemplate;
  const drawdowns = template.drawdowns.map((each) => ({
    ...each,
    high: asDate(each.high),
    low: asDate(each.low),
    fall: asPercent(each.fall),
  }));
  return { ...forCore(template), drawdowns };
});

/** The template a plan started from (`plan.templateId`), or null for a custom plan or an id no longer offered. */
export function templateById(id: string | null): OfferedTemplate | null {
  return TEMPLATES.find((template) => template.id === id) ?? null;
}
