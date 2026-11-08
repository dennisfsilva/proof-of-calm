import {
  CoinIdSchema,
  type CurrencyCode,
  EntityIdSchema,
  type FillField,
  fillRow,
  isPositive,
  MAX_UNIT_DECIMALS,
  MINOR_UNITS,
  type Money,
  type Price,
  type Units,
} from '@proofofcalm/core';
import * as z from 'zod/mini';
import type { NumberInput } from '../../../lib/format';

// One row of the entry form as typed, and the three-way fill of it as one field is typed (ADR-0034).

export const FormRowSchema = z.readonly(
  z.object({
    /** The id of the entry an edit loaded the row from; null on a new transaction's rows and on a row the edit adds. */
    source: z.nullable(EntityIdSchema),
    coin: CoinIdSchema,
    decimals: z.int().check(z.minimum(0), z.maximum(MAX_UNIT_DECIMALS)),
    amount: z.string(),
    units: z.string(),
    price: z.string(),
    /** The field an edit filled and the person has not typed into since; null once they do, or before any fill. */
    derived: z.nullable(z.enum(['amount', 'units', 'price'])),
  }),
);
export type FormRow = z.infer<typeof FormRowSchema>;

export function read<T extends Money | Units | Price>(typed: string, numberInput: NumberInput): T | null {
  if (typed.trim() === '') return null;
  const parsed = numberInput.parse<T>(typed);
  return parsed.ok ? parsed.value : null;
}

export const positive = (value: Money | Units | Price | null): boolean => value !== null && isPositive(value);

/**
 * `field` of `row` typed; the other two fields filled by `fillRow` where they can be. A derived field is never read
 * back as a source, so an edit of either of its sources recomputes it from the two fields the person typed. An
 * amount is filled only where none was typed: an amount the person typed, even zero or unreadable, stays. An edit
 * whose own text fills nothing (cleared, zero or unreadable, as "0" or "0," on the way to 0.75) pauses the
 * derivation: the marker stays and the derived text is left as it is. An edit that reads while no fill follows (the
 * other source does not read, or the amount rounds to 0) blanks the derived text, as no fill backs it, and keeps the
 * marker until a fill backs it again. Only typing into the derived field ends it.
 */
export function fillFrom(
  row: FormRow,
  field: FillField,
  typed: string,
  numberInput: NumberInput,
  currency: CurrencyCode,
): FormRow {
  const derived = row.derived === field ? null : row.derived;
  const next: FormRow = { ...row, [field]: typed, derived };
  const values = {
    amount: derived === 'amount' ? null : read<Money>(next.amount, numberInput),
    units: derived === 'units' ? null : read<Units>(next.units, numberInput),
    price: derived === 'price' ? null : read<Price>(next.price, numberInput),
  };
  const filled = fillRow(field, values, row.decimals, currency);
  const untyped = derived === 'amount' || next.amount.trim() === '';
  if (untyped && filled.amount !== values.amount && filled.amount !== null) {
    return { ...next, amount: numberInput.format(filled.amount, 2), derived: 'amount' };
  }
  if (filled.units !== values.units && filled.units !== null) {
    return { ...next, units: numberInput.format(filled.units), derived: 'units' };
  }
  if (filled.price !== values.price && filled.price !== null) {
    return { ...next, price: numberInput.format(filled.price, MINOR_UNITS[currency]), derived: 'price' };
  }
  if (derived !== null && positive(values[field])) return { ...next, [derived]: '' };
  return next;
}
