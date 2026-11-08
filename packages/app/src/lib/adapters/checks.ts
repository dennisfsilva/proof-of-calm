// What both PlanStore adapters refuse to keep, and how a schema's complaint is written down. A write is
// checked against the core's schemas before it reaches storage (ADR-0019): the actions validate first,
// so a refusal is a programmer error, and storing the row would only set the user's data aside as
// unreadable at the next load.
import { EntrySchema, InstantSchema, PlanSchema, PrefsSchema } from '@proofofcalm/core';
import type * as z from 'zod/mini';
import { type Changes, PricesStateSchema } from '../ports';

type Issue = { readonly code: string; readonly path: readonly PropertyKey[]; readonly message: string };

/**
 * Each issue as "path: code": the core's own code where it has one (`payload.split: split-sum`), zod's
 * code otherwise (`payload.amount: invalid_type`), or the check's sentence for a failed refinement.
 */
export function issueCodes(issues: readonly Issue[], prefix: string | null): string[] {
  return issues.map((issue) => {
    const path = [...(prefix === null ? [] : [prefix]), ...issue.path.map(String)].join('.') || 'row';
    return `${path}: ${issue.code === 'custom' ? issue.message : issue.code}`;
  });
}

export function assertStorable(schema: z.ZodMiniType, value: unknown, what: string): void {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new TypeError(`Refusing to store an invalid ${what}: ${issueCodes(parsed.error.issues, null).join('; ')}`);
  }
}

export function assertStorableChanges(changes: Changes): void {
  // A Promise is not changes: an update's build that awaited would let its transaction commit first.
  if ('then' in changes) throw new TypeError('The changes to store are a Promise, not changes');
  if (changes.plan !== undefined && changes.plan !== null) assertStorable(PlanSchema, changes.plan, 'plan');
  for (const entry of changes.entries ?? []) assertStorable(EntrySchema, entry, 'entry');
  if (changes.prefs !== undefined) assertStorable(PrefsSchema, changes.prefs, 'set of preferences');
  if (changes.changedAt !== undefined) assertStorable(InstantSchema, changes.changedAt, 'change time');
  if (changes.prices !== undefined) assertStorable(PricesStateSchema, changes.prices, 'price snapshot');
}
