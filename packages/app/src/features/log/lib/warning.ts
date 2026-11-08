import {
  assertNever,
  type CalendarDate,
  type DraftSale,
  type EntityId,
  type Entry,
  type HoldingContext,
  type HoldingEffect,
  type HoldingRule,
  type Plan,
  type SaleWarning,
  saleWarning,
} from '@proofofcalm/core';

// The entry form's holding warning on a sale: which warnings show, and their wording.

/**
 * The holding warning's second sentence follows the rule's effect (JURISDICTIONS §1): past a lower-rate rule the
 * rest is taxed too, at the other rate. A plan without a rule warns only through a country's dated override, and the
 * plain sentence claims no rate.
 */
export function saleWarningKey(rule: HoldingRule) {
  const effect: HoldingEffect = rule.kind === 'none' ? 'exempt' : rule.effect;
  switch (effect) {
    case 'exempt':
      return 'log.form.saleWarning.exempt';
    case 'lower-rate':
      return 'log.form.saleWarning.lowerRate';
    default:
      return assertNever(effect);
  }
}

/**
 * A holding warning with the venue it names: `venue` when its coin's warnings show at two venues or more, `unnamed`
 * for a sale with no venue among them, else `none`.
 */
export type NamedWarning = SaleWarning & { readonly venue: string | null; readonly at: 'venue' | 'unnamed' | 'none' };

/**
 * The holding warnings of the draft's sales (`saleWarning`). The sales are read together, as the save stores and
 * matches them, at every venue, and each warning knows its sale's venue by the sale's id: under per-venue lots a
 * coin's warnings at two venues name theirs. Each sale counts only its own group's lots past the rule: the matching may
 * also give it another group's lots for units its group cannot cover (DOMAIN §3.7), and the warning leaves those out,
 * so it warns more, never less. Elsewhere the venue changes no warning, so none is named.
 */
export function namedWarnings(
  plan: Plan,
  entries: readonly Entry[],
  sales: readonly DraftSale[],
  date: CalendarDate,
  context: HoldingContext,
  replaced: readonly EntityId[],
): NamedWarning[] {
  const read = saleWarning(plan, entries, sales, date, context, replaced);
  if (context.lotScope !== 'per-venue') return read.map((warning) => ({ ...warning, venue: null, at: 'none' }));
  const venueOf = new Map(sales.map((sale) => [sale.id, sale.venue]));
  const warnings = read.map((warning) => ({ ...warning, venue: venueOf.get(warning.sale) ?? null }));
  return warnings.map((warning) => {
    const venuesOfCoin = new Set(warnings.filter((other) => other.coin === warning.coin).map((other) => other.venue));
    return { ...warning, at: venuesOfCoin.size < 2 ? 'none' : warning.venue === null ? 'unnamed' : 'venue' };
  });
}
