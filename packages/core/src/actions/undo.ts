// What a delete notes for its undo, and the undo's check across a change of the plan's pay currency (docs/DOMAIN.md
// §6, Delete entry; ADR-0053): an entry carries no currency, so an amount typed in the old one would come back reading
// as the new one. Nothing converts it. The note lives in the toast's memory only; no stored shape holds it.
import type { Instant, MonthKey } from '../dates/calendar';
import type { CurrencyCode } from '../money/currency';
import type { Entry } from '../schema/entry';
import type { EntityId } from '../schema/ids';
import type { Plan } from '../schema/plan';

/** A month of a deleted monthly buy as it stood at the delete: skipped or not, and the other monthly buys recording it. */
export type SlotAtDelete = {
  readonly slot: MonthKey;
  readonly skipped: boolean;
  readonly recordedBy: readonly EntityId[];
};
/**
 * What the undo needs of its delete: the stamp the delete wrote (`at`), the live entries it deleted (`ids`), the
 * months as they stood and the plan's pay currency (null without a plan).
 */
export type SlotsAtDelete = {
  readonly at: Instant;
  readonly ids: readonly EntityId[];
  readonly slots: readonly SlotAtDelete[];
  readonly currency: CurrencyCode | null;
};

/** The undo restores nothing: the plan's pay currency moved from `from` to `to` since the delete. */
export type CurrencyMoved = {
  readonly code: 'currency-changed';
  readonly from: CurrencyCode;
  readonly to: CurrencyCode;
};

/**
 * Refuses restoring `entries` when the plan's pay currency is no longer `atDelete`, the one the delete saw, and any of
 * them holds an amount or a fee; a delete that saw no plan (`null`) has nothing to compare.
 */
export function currencyMoved(
  plan: Plan,
  entries: readonly Entry[],
  atDelete: CurrencyCode | null,
): CurrencyMoved | null {
  if (atDelete === null || atDelete === plan.payCurrency) return null;
  const priced = entries.some((entry) => entry.amount !== null || entry.fee !== null);
  return priced ? { code: 'currency-changed', from: atDelete, to: plan.payCurrency } : null;
}
