// The input-parsing module of ADR-0034 (docs/ENGINEERING.md §1.2): what a person types in a numeric field,
// read in the formatting locale (ADR-0023), becomes an exact decimal string or a coded reason it cannot;
// on blur the value is written back in the locale's format with every decimal it has. Built from the
// typed characters; nothing passes through a float (ADR-0017).
import { type Decimal, decimal, decimalPlaces, defined, err, ok, type Result } from '@proofofcalm/core';
import { LATIN_DIGITS } from './digits';

/** Worded by lib/errors (`errors.input.*`); `example` is 1234.56 in the locale's format. */
export type NumberInputError =
  | { readonly code: 'number-empty' }
  | { readonly code: 'number-negative' }
  | { readonly code: 'number-invalid'; readonly example: string };

export type NumberInput = {
  parse<T extends Decimal = Decimal>(typed: string): Result<T, NumberInputError>;
  /** The value in the locale's format, never rounded; padded to `minimumFractionDigits` (2 for money). */
  format(value: Decimal, minimumFractionDigits?: number): string;
};

const MINUS_SIGNS: ReadonlySet<string> = new Set(['-', '\u2212']);
/** What a keyboard types where the locale groups with a no-break space (pt-PT) or a narrow one (fr-FR). */
const SPACES = /[\u0020\u00a0\u202f]/g;
const SPACE_GROUPS: ReadonlySet<string> = new Set([' ', '\u00a0', '\u202f']);
/** Intl's limit: a value with more fraction digits could not be written back without rounding. */
const MAX_FRACTION_DIGITS = 100;
const DIGITS = /^\d*$/;

type Symbols = { readonly group: string; readonly decimal: string; readonly other: string };
type Read = { readonly integer: string; readonly fraction: string };

export function createNumberInput(formattingLocale: string): NumberInput {
  const symbols = symbolsOf(formattingLocale);
  const format = (value: Decimal, minimumFractionDigits = 0) => {
    const digits = Math.min(Math.max(decimalPlaces(value), minimumFractionDigits), MAX_FRACTION_DIGITS);
    return new Intl.NumberFormat(formattingLocale, {
      ...LATIN_DIGITS,
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    }).format(value as unknown as `${number}`);
  };
  const invalid = err({ code: 'number-invalid', example: format(decimal('1234.56')) } as const);
  return {
    format,
    parse<T extends Decimal = Decimal>(typed: string): Result<T, NumberInputError> {
      const trimmed = typed.trim();
      if (trimmed === '') return err({ code: 'number-empty' });
      if (MINUS_SIGNS.has(trimmed.charAt(0))) return err({ code: 'number-negative' });
      const text = SPACE_GROUPS.has(symbols.group) ? trimmed.replace(SPACES, symbols.group) : trimmed;
      const read = readNumber(text, symbols);
      if (read === null || (read.integer === '' && read.fraction === '')) return invalid;
      if (read.fraction.length > MAX_FRACTION_DIGITS) return invalid;
      // Digits only by now, so the normalised string is a plain decimal (no leading zeros) by construction.
      const integer = read.integer.replace(/^0+(?=\d)/, '') || '0';
      return ok(decimal<T>(read.fraction === '' ? integer : `${integer}.${read.fraction}`));
    },
  };
}

/**
 * The locale's symbols, from a seven-digit number because pt-PT and es-ES group only from five digits.
 * Every formatting locale of the country profiles has both; a locale without them is a programmer error.
 */
function symbolsOf(locale: string): Symbols {
  const parts = new Intl.NumberFormat(locale, LATIN_DIGITS).formatToParts(1234567.5);
  const symbol = (type: 'group' | 'decimal') =>
    defined(parts.find((part) => part.type === type)?.value, `the ${type} symbol of ${locale}`);
  const decimal = symbol('decimal');
  return { group: symbol('group'), decimal, other: decimal === ',' ? '.' : ',' };
}

/**
 * The digits either side of the decimal point, or null. The locale's decimal symbol is the point;
 * without it, the other symbol is the point when it appears once and cannot be the locale's grouping
 * (people switch keyboards: 12.5 in de-DE). Groups must be well formed: in en-GB, 1,234 is 1234 and
 * 1,234,56 is nothing.
 */
function readNumber(text: string, { group, decimal, other }: Symbols): Read | null {
  if (![...text].every((char) => DIGITS.test(char) || char === group || char === decimal || char === other)) {
    return null;
  }
  const points = count(text, decimal);
  if (points > 1) return null;
  if (points === 1) {
    const [head = '', fraction = ''] = text.split(decimal);
    if (!DIGITS.test(fraction) || (other !== group && head.includes(other))) return null;
    const integer = ungrouped(head, group);
    return integer === null ? null : { integer, fraction };
  }
  if (text.includes(group)) {
    const integer = ungrouped(text, group);
    if (integer !== null) return { integer, fraction: '' };
    return group === other && count(text, other) === 1 ? split(text, other) : null;
  }
  return count(text, other) > 1 ? null : split(text, other);
}

/**
 * An integer part (digits and group symbols only, by now) without its group symbols, or null when the
 * groups are malformed: a first group of one to three digits not starting with zero, then threes.
 */
function ungrouped(text: string, group: string): string | null {
  if (!text.includes(group)) return text;
  const [first = '', ...rest] = text.split(group);
  return /^[1-9]\d{0,2}$/.test(first) && rest.every((digits) => /^\d{3}$/.test(digits))
    ? `${first}${rest.join('')}`
    : null;
}

/** The digits either side of `point`, which appears at most once among digits by now. */
function split(text: string, point: string): Read {
  const [integer = '', fraction = ''] = text.split(point);
  return { integer, fraction };
}

function count(text: string, symbol: string): number {
  return text.split(symbol).length - 1;
}
