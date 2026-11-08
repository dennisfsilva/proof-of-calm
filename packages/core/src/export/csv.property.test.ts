import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { anEntry, aPlan, money, units } from '../../test/builders';
import { isPositive } from '../money/decimal';
import { CoinIdSchema } from '../schema/ids';
import { logCsv, textCell } from './csv';

// The CSV's price column (docs/DOMAIN.md §3.13): a positive amount for positive units never exports a
// price of 0, however small the price per coin (a coin under a cent, a large number of units).

const plan = aPlan();
/** A positive decimal with up to `dp` places, from one smallest step up to `10^digits`. */
const positive = (digits: number, dp: number) =>
  fc.bigInt({ min: 1n, max: 10n ** BigInt(digits + dp) }).map((scaled) => {
    const text = scaled.toString().padStart(dp + 1, '0');
    const whole = text.slice(0, text.length - dp);
    const fraction = text.slice(text.length - dp).replace(/0+$/u, '');
    return fraction === '' ? whole : `${whole}.${fraction}`;
  });

// A text cell (docs/DOMAIN.md §3.13, #207): in a spreadsheet that splits on ; and ends a record at a line
// break, no piece starts a formula, and the only change to the text is a ' before each piece that would have.
const FORMULA_START = /^[=+\-@\t\r]/u;
/** Where a spreadsheet in a ;-locale starts a cell: after ;, CR or LF. Each separator is one character. */
const SEPARATOR = /[;\r\n]/u;
/** A separator as written: CR LF is two separators with an empty piece between them. */
const separator = fc.constantFrom(';', '\r', '\n', '\r\n');
/** The characters that start a formula; a CR is both a trigger and a separator. */
const trigger = fc.constantFrom('=', '+', '-', '@', '\t', '\r');
/** Filler drawn mostly from the characters the rule and RFC 4180 care about. */
const filler = fc.string({
  unit: fc.oneof(
    fc.constantFrom(';', '=', '+', '-', '@', '\t', '\r', '\n', '"', ',', "'", ' '),
    fc.string({ minLength: 1, maxLength: 1 }),
  ),
  maxLength: 4,
});
/** A piece: empty (so separators come in runs), or an optional trigger followed by filler. */
const piece = fc.oneof(
  fc.constant(''),
  fc.tuple(fc.option(trigger, { nil: '' }), filler).map(([start, rest]) => start + rest),
);
const maybeSeparator = fc.option(separator, { nil: '' });
/** Text built by construction, so every trigger reaches index 0 and the place after every separator. */
const text = fc
  .tuple(maybeSeparator, piece, fc.array(fc.tuple(separator, piece), { maxLength: 5 }), maybeSeparator)
  .map(([lead, first, rest, trail]) => lead + first + rest.map(([sep, next]) => sep + next).join('') + trail);
/** The edge positions, tried on every run: each trigger at index 0, one after each separator, runs, a CR first. */
const EDGES = [
  ...['=1', '+1', '-1', '@1', '\t1', '\r1'],
  ...['a;=1', 'a\r=1', 'a\n=1', 'a\r\n=1', ';=1', '\n=1'],
  ...[';;=1', '\r\r=1', '\n\r=1', ';\r=1', '\n\n@x', '\r\n\r\n+1', ';\n-1'],
  ...['\r=1', '\r@x', '\r+SUM(A1)', '\r\t1', '\r-1', '\r;=1', '\r\n=1'],
  ...['=1;', 'a\r', '\r', ';', ''],
].map((edge) => [edge] as [string]);
/** RFC 4180's reading of one cell: a quoted cell loses its outer quotes and has each "" read as ". */
const unquote = (cell: string) => (cell.startsWith('"') ? cell.slice(1, -1).replaceAll('""', '"') : cell);

describe('textCell (property)', () => {
  it('starts no piece after ; CR or LF with = + - @ tab or CR, and removing the inserted quotes gives the text back', () => {
    fc.assert(
      fc.property(text, (original) => {
        const written = unquote(textCell(original)).split(SEPARATOR);
        const pieces = original.split(SEPARATOR);
        expect(written.some((piece) => FORMULA_START.test(piece))).toBe(false);
        expect(written.length).toBe(pieces.length);
        let start = 0;
        pieces.forEach((source, index) => {
          // The piece's first character in the text, or the separator after an empty piece (a CR is both).
          const inserted = FORMULA_START.test(original.slice(start)) ? "'" : '';
          expect(written[index]).toBe(`${inserted}${source}`);
          start += source.length + 1;
        });
      }),
      { examples: EDGES },
    );
  });
});

// The coin cell (docs/DOMAIN.md §3.13): a CoinId may start with - (an imported backup's -A1), which a
// spreadsheet reads as the formula =-A1, so the cell never starts with a trigger and reads back as the coin.
const COIN_ALPHABET = [...'ABCZ019.$-'];
const coinId = fc.string({ unit: fc.constantFrom(...COIN_ALPHABET), minLength: 1, maxLength: 12 });
/** The edge positions, tried on every run: a - first, alone, doubled, inside and last, at both lengths. */
const COIN_EDGES = ['-', '-A1', '--', '-1', 'A-', 'A-1', '-ABCDEFGHIJK', 'ABCDEFGHIJK-', '$', '.'].map(
  (edge) => [edge] as [string],
);

describe('logCsv coin (property)', () => {
  it('never starts the coin cell with a formula trigger, and dropping a leading quote gives the coin back', () => {
    fc.assert(
      fc.property(coinId, (coin) => {
        expect(CoinIdSchema.safeParse(coin).success).toBe(true);
        const cell =
          logCsv(plan, [anEntry({ coin: coin as never })])
            .split('\n')[1]
            ?.split(',')[1] ?? '';
        expect(FORMULA_START.test(cell)).toBe(false);
        expect(cell.replace(/^'/u, '')).toBe(coin);
      }),
      { examples: COIN_EDGES },
    );
  });
});

describe('logCsv price (property)', () => {
  it('is never 0 for a positive amount and positive units', () => {
    fc.assert(
      fc.property(positive(7, 2), positive(14, 10), (amount, bought) => {
        const line = logCsv(plan, [anEntry({ amount: money(amount), units: units(bought) })]).split('\n')[1] ?? '';
        const price = line.split(',')[7] ?? '0';
        expect(isPositive(price as never)).toBe(true);
      }),
    );
  });
});
