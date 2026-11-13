import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { textCell } from '../../export/csv';
import { csvRows } from './table';

// The exchange import's table reader (docs/DOMAIN.md §3.13) reads back what the export's cell writer wrote:
// rows of `textCell` cells joined by commas and line breaks give the same rows, each cell as written.

/** The characters RFC 4180 cares about; a CR and an LF are each a separator inside a cell's text. */
const special = fc.constantFrom('"', ',', '\r', '\n', '\r\n');
/** Filler drawn mostly from those characters, so they come in runs. */
const filler = fc.string({
  unit: fc.oneof(fc.constantFrom('"', ',', '\r', '\n', ' ', "'", '='), fc.string({ minLength: 1, maxLength: 1 })),
  maxLength: 4,
});
/** A piece: empty (so separators come in runs), or an optional special character followed by filler. */
const piece = fc.oneof(
  fc.constant(''),
  fc.tuple(fc.option(special, { nil: '' }), filler).map(([start, rest]) => start + rest),
);
/** A cell built by construction, so each special character reaches index 0 and the place after each separator. */
const cell = fc
  .tuple(fc.option(special, { nil: '' }), piece, fc.array(fc.tuple(special, piece), { maxLength: 4 }))
  .map(([lead, first, rest]) => lead + first + rest.map(([sep, next]) => sep + next).join(''));
/** At least two cells a row, so no row is written as an empty line. */
const rows = fc.array(fc.array(cell, { minLength: 2, maxLength: 4 }), { minLength: 1, maxLength: 4 });
const lineBreak = fc.constantFrom('\n', '\r\n');
/** The edge positions, tried on every run: each at index 0, after a separator, in runs, and a quote that closes a cell. */
const EDGES: [string[][], '\n' | '\r\n', boolean][] = [
  [
    [
      ['"', ','],
      ['\r', '\n'],
      ['\r\n', ''],
    ],
    '\n',
    true,
  ],
  [
    [
      ['a"', '"b'],
      ['a,', ',b'],
      ['a\r', '\rb'],
      ['a\n', '\nb'],
    ],
    '\r\n',
    false,
  ],
  [
    [
      ['""', ',,'],
      ['\r\r', '\n\n'],
      ['\r\n\r\n', '"",""'],
    ],
    '\n',
    false,
  ],
  [
    [
      ['"a"', '"a""'],
      ['a"', '","'],
      ['"\r\n"', '"\n'],
    ],
    '\r\n',
    true,
  ],
  [
    [
      ['=1', '\r=1'],
      ['a\n=1', ''],
    ],
    '\n',
    true,
  ],
];
/** RFC 4180's reading of one written cell: a quoted cell loses its outer quotes and has each "" read as ". */
const unquote = (written: string) => (written.startsWith('"') ? written.slice(1, -1).replaceAll('""', '"') : written);

describe('csvRows (property)', () => {
  it('reads rows written with textCell back as written', () => {
    fc.assert(
      fc.property(rows, lineBreak, fc.boolean(), (table, end, trailing) => {
        const lines = table.map((cells) => cells.map(textCell).join(','));
        const text = lines.join(end) + (trailing ? end : '');
        expect(csvRows(text)).toEqual(table.map((cells) => cells.map((value) => unquote(textCell(value)))));
      }),
      { examples: EDGES },
    );
  });
});
