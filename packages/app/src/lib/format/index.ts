// The one formatting layer (ADR-0023, docs/DESIGN.md §5 "Number typography"): Intl with the country's
// formatting locale; decimal strings go to Intl as strings, so nothing passes through a float; half-even
// display rounding; U+2212 for the minus sign; calendar dates rendered from their parts in UTC, so no
// device zone shifts a day (ADR-0018). Dates and month names follow the UI language. Times of instants
// and relative days are in ./time; the numeric-input parser, the inverse of this layer (ADR-0034), is in
// ./number-input.
import { type CalendarDate, type CurrencyCode, type Decimal, dateParts, type MonthKey } from '@proofofcalm/core';
import { LATIN_DIGITS } from './digits';
import { createTimeFormatters, dateOptions, type TimeFormatters, unbroken } from './time';

export { createNumberInput, type NumberInput, type NumberInputError } from './number-input';

const MINUS = '\u2212';
const NO_BREAK_SPACE = '\u00a0';

type Numeric = `${number}`;
/** Intl takes decimal strings exactly; the branded types are plain decimal strings underneath. */
const numeric = (value: Decimal): Numeric => value as unknown as Numeric;

function render(format: Intl.NumberFormat, value: Decimal): string {
  return format
    .formatToParts(numeric(value))
    .map((part) => (part.type === 'minusSign' ? MINUS : part.value))
    .join('');
}

/** Where a percentage is stored as 0–100, Intl's percent style wants the fraction: move the point. */
function fraction(percent: Decimal): Decimal {
  const negative = percent.startsWith('-');
  const [whole = '0', decimals = ''] = (negative ? percent.slice(1) : percent).split('.');
  const digits = whole.padStart(3, '0');
  const value = `${digits.slice(0, -2)}.${digits.slice(-2)}${decimals}`.replace(/^0+(?=\d)/, '');
  return `${negative ? '-' : ''}${value}` as Decimal;
}

export type MoneyOptions = { readonly decimals?: number; readonly signed?: boolean };

export type Formatters = {
  /** The locales it writes in: a key for what is built from its output, since each mount makes its own. */
  readonly locales: { readonly numbers: string; readonly ui: string };
  /** `€1,234.56`, `1 234,56 €`; `signed` shows `+` and `\u2212` (never on zero). */
  money(amount: Decimal, currency: CurrencyCode, options?: MoneyOptions): string;
  /** Fixed decimals per asset (BTC 8, ETH 6, SOL and LINK 4), the code after a no-break space. */
  units(units: Decimal, coin: string, decimals: number): string;
  /** A percentage stored as 0–100: one decimal by default (changes), `0` for shares over 10 %. */
  percent(value: Decimal, options?: MoneyOptions): string;
  /** The value with two decimals and U+00D7 after it, no space (1.89 times). */
  multiple(value: Decimal, decimals?: number): string;
  /** `16 Oct 2026`, `16. Okt. 2026`: the month's name in the UI language, never digits (`dateOptions`). */
  date(date: CalendarDate): string;
  /** `1 October`, for a buy day in the current year's copy. */
  dayMonth(date: CalendarDate): string;
  /** `October 2026`, from a month key, in the UI language. */
  month(key: MonthKey): string;
  /** `BTC, ETH and SOL`: the items joined with the UI language's word for "and". */
  list(items: readonly string[]): string;
} & TimeFormatters;

export function createFormatters(formattingLocale: string, uiLocale: string): Formatters {
  // One Intl formatter per set of options, built on first use: a screen formats hundreds of values.
  const numbers = new Map<string, Intl.NumberFormat>();
  const number = (options: Intl.NumberFormatOptions) => {
    const key = JSON.stringify(options);
    const known = numbers.get(key);
    if (known !== undefined) return known;
    const made = new Intl.NumberFormat(formattingLocale, { ...LATIN_DIGITS, roundingMode: 'halfEven', ...options });
    numbers.set(key, made);
    return made;
  };
  const utc = (date: CalendarDate) => {
    const { year, month, day } = dateParts(date);
    return Date.UTC(year, month - 1, day);
  };
  const dates = new Intl.DateTimeFormat(uiLocale, { ...LATIN_DIGITS, timeZone: 'UTC', ...dateOptions(uiLocale) });
  const days = new Intl.DateTimeFormat(uiLocale, { ...LATIN_DIGITS, timeZone: 'UTC', day: 'numeric', month: 'long' });
  const months = new Intl.DateTimeFormat(uiLocale, {
    ...LATIN_DIGITS,
    timeZone: 'UTC',
    month: 'long',
    year: 'numeric',
  });
  // English lists take the serial comma, en-GB's included (docs/CONTENT-STYLE.md §1 rule 9); other languages keep
  // their own rule.
  const listLocale = new Intl.Locale(uiLocale).language === 'en' ? 'en-US' : uiLocale;
  const lists = new Intl.ListFormat(listLocale, { type: 'conjunction' });
  const sign = (signed: boolean | undefined) => (signed === true ? 'exceptZero' : 'negative');

  return {
    locales: { numbers: formattingLocale, ui: uiLocale },
    money: (amount, currency, options = {}) =>
      render(
        number({
          style: 'currency',
          currency,
          signDisplay: sign(options.signed),
          ...(options.decimals === undefined
            ? {}
            : { minimumFractionDigits: options.decimals, maximumFractionDigits: options.decimals }),
        }),
        amount,
      ),
    units: (units, coin, decimals) =>
      `${render(number({ minimumFractionDigits: decimals, maximumFractionDigits: decimals, signDisplay: 'negative' }), units)}${NO_BREAK_SPACE}${coin}`,
    percent: (value, options = {}) =>
      render(
        number({
          style: 'percent',
          signDisplay: sign(options.signed),
          minimumFractionDigits: options.decimals ?? 1,
          maximumFractionDigits: options.decimals ?? 1,
        }),
        fraction(value),
      ),
    multiple: (value, decimals = 2) =>
      `${render(number({ minimumFractionDigits: decimals, maximumFractionDigits: decimals, signDisplay: 'negative' }), value)}\u00d7`,
    date: (date) => unbroken(dates.format(utc(date))),
    dayMonth: (date) => unbroken(days.format(utc(date))),
    month: (key) => unbroken(months.format(utc(`${key}-01` as CalendarDate))),
    list: (items) => lists.format(items),
    ...createTimeFormatters(formattingLocale, uiLocale),
  };
}
