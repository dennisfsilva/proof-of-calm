import {
  type CalendarDate,
  type CoinId,
  compare,
  decimalPlaces,
  isNegative,
  isPositive,
  MINOR_UNITS,
  type Money,
  type Percent,
  type Result,
  type SimulationError,
  type SimulationInput,
  type Split,
} from '@proofofcalm/core';
import type { NumberInput, NumberInputError } from '../../../lib/format';
import type { ClosesRange } from './simulator-dates';
import { type CoinSplitValue, readShares, type SplitIssue } from './split';

// The simulator's form (docs/EDUCATION.md §7, the verdicts V1 to V3 of #14): the fields as typed, read in the
// formatting locale (ADR-0034) and checked as the core checks them (packages/core/src/simulate/simulate.ts), so a
// refusal sits under its field before the core runs. Unlike the core, which names only the first coin it cannot
// run, every chosen coin with a share above 0 and no closes is marked. The share issues and the input's codes are
// worded as the coin editor words them (`plan.coins.issue`, `errors.input`); the rest under
// `learn.simulator.form.errors`, one message per code.

/** Each chosen coin's closes, or `none` for a coin with no closes yet (a 404, or a dataset with no day). */
export type ClosesByCoin = Readonly<Record<CoinId, ClosesRange | 'none'>>;

export type SimulatorFields = {
  readonly split: CoinSplitValue;
  /** Typed in the locale, in euros, the closes' currency. */
  readonly amount: string;
  readonly buyDay: number;
  /** The date fields' values: empty until a full date is chosen. */
  readonly start: CalendarDate | '';
  readonly end: CalendarDate | '';
  /** A flat percentage, typed in the locale; empty reads as 0. */
  readonly fee: string;
};

export type SimulatorInputs = Omit<SimulationInput, 'histories'>;

export type FieldErrorCode = SplitIssue['code'] | NumberInputError['code'] | SimulationError['code'] | 'date-required';

export type FieldError = {
  readonly field: 'split' | 'amount' | 'buyDay' | 'start' | 'end' | 'fee';
  readonly code: FieldErrorCode;
  /** The coin a share issue or a refusal of the closes names. */
  readonly coin?: CoinId;
  /** The coin's first close (a start too early) or last close (an end too late). */
  readonly date?: CalendarDate;
  /** For `number-invalid`: 1234.56 in the locale's format. */
  readonly example?: string;
};

/** The core's bounds (simulate.ts's inputError), which it exports no constant for. */
const AMOUNT_DECIMALS = MINOR_UNITS.EUR;
const FEE_DECIMALS = 4;
const HUNDRED = '100' as Percent;

const unread = (field: FieldError['field'], error: NumberInputError): FieldError =>
  error.code === 'number-invalid' ? { field, code: error.code, example: error.example } : { field, code: error.code };

function shareError(issue: SplitIssue): FieldError {
  const [head, coin] = issue.path;
  const base: FieldError =
    issue.code === 'number-invalid' ? unread('split', issue) : { field: 'split', code: issue.code };
  // A share's issue is on its coin's path (`['split', coin]`); the sum's and the coins' are on the whole split.
  return head === 'split' && typeof coin === 'string' ? { ...base, coin: coin as CoinId } : base;
}

/** The coins the core would buy: a share that reads above 0 (one that cannot be read is its own issue). */
function funded(value: CoinSplitValue, numberInput: NumberInput): CoinId[] {
  return value.coins
    .map((coin) => coin.id)
    .filter((coin) => {
      const read = numberInput.parse<Percent>((value.shares[coin] ?? '').trim());
      return read.ok && isPositive(read.value);
    });
}

function readAmount(typed: string, numberInput: NumberInput, errors: FieldError[]): Money | null {
  const text = typed.trim();
  const read = text === '' ? null : numberInput.parse<Money>(text);
  if (read !== null && !read.ok) {
    errors.push(unread('amount', read.error));
    return null;
  }
  if (read === null || !isPositive(read.value) || decimalPlaces(read.value) > AMOUNT_DECIMALS) {
    errors.push({ field: 'amount', code: 'invalid-amount' });
    return null;
  }
  return read.value;
}

function readFee(typed: string, numberInput: NumberInput, errors: FieldError[]): Percent | null {
  const text = typed.trim();
  if (text === '') return '0' as Percent;
  const read = numberInput.parse<Percent>(text);
  if (!read.ok) {
    errors.push(unread('fee', read.error));
    return null;
  }
  const fee = read.value;
  if (isNegative(fee) || compare(fee, HUNDRED) >= 0 || decimalPlaces(fee) > FEE_DECIMALS) {
    errors.push({ field: 'fee', code: 'invalid-fee' });
    return null;
  }
  return fee;
}

/** The coin whose closes bound a date: the latest first close or the earliest last one; on a tie the earlier coin. */
function bound(ranges: readonly [CoinId, ClosesRange][], later: (a: ClosesRange, b: ClosesRange) => boolean) {
  return ranges.reduce<[CoinId, ClosesRange] | undefined>(
    (best, item) => (best === undefined || later(item[1], best[1]) ? item : best),
    undefined,
  );
}

/** The dates against each other and against the closes of the coins bought: one refusal per date at most. */
function checkDates(fields: SimulatorFields, ranges: readonly [CoinId, ClosesRange][], errors: FieldError[]) {
  const { start, end } = fields;
  const first = bound(ranges, (a, b) => a.first > b.first);
  const last = bound(ranges, (a, b) => a.last < b.last);
  if (start === '') errors.push({ field: 'start', code: 'date-required' });
  else if (first !== undefined && first[1].first > start) {
    errors.push({ field: 'start', code: 'history-starts-later', coin: first[0], date: first[1].first });
  }
  if (end === '') errors.push({ field: 'end', code: 'date-required' });
  else if (start !== '' && end < start) errors.push({ field: 'end', code: 'invalid-dates' });
  else if (last !== undefined && last[1].last < end) {
    errors.push({ field: 'end', code: 'history-ends-earlier', coin: last[0], date: last[1].last });
  }
}

/**
 * The core's input from the form, without the histories, or every field's refusal in the order of the fields:
 * the split (the share issues of `readShares`, then each coin bought with no closes), the amount (above 0, at most
 * 2 decimals; empty reads as 0), the buy day (1 to 28), the dates (each one full, the end on or after the start, and
 * within the closes of every coin bought, naming the coin and its date), the fee (empty as 0, from 0 up to but not
 * including 100, at most 4 decimals). A coin missing from `closes` counts as one with none.
 */
export function readForm(
  fields: SimulatorFields,
  closes: ClosesByCoin,
  numberInput: NumberInput,
): Result<SimulatorInputs, FieldError[]> {
  const errors: FieldError[] = [];
  const shares = readShares(fields.split, numberInput);
  if (!shares.ok) errors.push(...shares.error.map(shareError));
  const bought = funded(fields.split, numberInput);
  const ranges: [CoinId, ClosesRange][] = [];
  for (const coin of bought) {
    const range = closes[coin] ?? 'none';
    if (range === 'none') errors.push({ field: 'split', code: 'history-missing', coin });
    else ranges.push([coin, range]);
  }
  const amount = readAmount(fields.amount, numberInput, errors);
  const { buyDay } = fields;
  if (!Number.isInteger(buyDay) || buyDay < 1 || buyDay > 28) errors.push({ field: 'buyDay', code: 'invalid-buy-day' });
  checkDates(fields, ranges, errors);
  const fee = readFee(fields.fee, numberInput, errors);
  if (errors.length > 0 || !shares.ok || amount === null || fee === null || fields.start === '' || fields.end === '') {
    return { ok: false, error: errors };
  }
  const split: Split = shares.value;
  return {
    ok: true,
    value: { split, monthlyAmount: amount, startDate: fields.start, endDate: fields.end, buyDay, feePercent: fee },
  };
}

/** The field the core's refusal belongs under, as readForm would have put it. */
export function fieldOf(error: SimulationError): FieldError {
  switch (error.code) {
    case 'invalid-split':
      return { field: 'split', code: error.code };
    case 'invalid-amount':
      return { field: 'amount', code: error.code };
    case 'invalid-fee':
      return { field: 'fee', code: error.code };
    case 'invalid-buy-day':
      return { field: 'buyDay', code: error.code };
    case 'invalid-dates':
      return { field: 'end', code: error.code };
    case 'history-missing':
      return { field: 'split', code: error.code, coin: error.coin };
    case 'history-starts-later':
      return { field: 'start', code: error.code, coin: error.coin, date: error.first };
    case 'history-ends-earlier':
      return { field: 'end', code: error.code, coin: error.coin, date: error.last };
  }
}
