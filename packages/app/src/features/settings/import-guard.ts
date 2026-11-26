// The imports' checks in their turn in the queue (docs/DOMAIN.md §3.13): rows a newer version wrote refuse every
// import, and the turn compares the stored rows with what the screen showed (ADR-0053 Readings, 2026-11-26). A plan
// another tab stored since a screen that showed none, or a kept-currency question other than the one shown, refuses
// with `changed` and writes nothing, so a no-plan import never replaces a plan nobody saw and the kept entries never
// show in the file's currency without the person's word.
import {
  type CurrencyCode,
  type ImportRefusal,
  type KeptCurrencyQuestion,
  prototypePayCurrency,
} from '@proofofcalm/core';
import type { Snapshot } from '../../lib/ports';
import { keptQuestion } from '../../lib/store';
import type { ReadImport } from './model/import';

/** Why an import applied nothing: the core's refusals, and those only the stored rows can give. */
export type DataRefusal = ImportRefusal | { readonly code: 'newer-rows' | 'changed' };

/** What the screen showed when the import was asked for: whether a plan, and the kept-currency question or null. */
export type ImportShown = { readonly planShown: boolean; readonly question: KeptCurrencyQuestion | null };

/** Whether live rows a newer version wrote are on this device: an export leaves them out. */
export const leavesRowsOut = ({ newer }: Snapshot) => newer.plans + newer.entries > 0;

/** Whether any row a newer version wrote is on this device, a tombstone included: an import is refused. */
export const holdsNewerRows = (snapshot: Snapshot) => leavesRowsOut(snapshot) || snapshot.newerTombstones > 0;

/** The pay currency a DCA plan page file's plan takes: its base, or EUR, the import's default for one unread (§7). */
export const prototypeCurrency = (json: unknown): CurrencyCode => prototypePayCurrency(json) ?? 'EUR';

/** What the screen shows before it imports `read`: the plan, and the question asked before the file's plan is written. */
export function importShown(snapshot: Snapshot, read: Exclude<ReadImport, { readonly kind: 'exchange' }>): ImportShown {
  const currency = read.kind === 'backup' ? read.file.plan.payCurrency : prototypeCurrency(read.json);
  return { planShown: snapshot.plan !== null, question: keptQuestion(snapshot, currency) };
}

const sameQuestion = (a: KeptCurrencyQuestion | null, b: KeptCurrencyQuestion | null) =>
  a === null || b === null
    ? a === b
    : a.kept === b.kept && a.next === b.next && a.count === b.count && a.first === b.first && a.last === b.last;

/** The refusal the import's turn finds before it applies a file whose plan pays in `currency`, or null. */
export function turnRefusal(snapshot: Snapshot, currency: CurrencyCode, shown: ImportShown): DataRefusal | null {
  if (holdsNewerRows(snapshot)) return { code: 'newer-rows' };
  if (snapshot.plan !== null && !shown.planShown) return { code: 'changed' };
  return sameQuestion(keptQuestion(snapshot, currency), shown.question) ? null : { code: 'changed' };
}
