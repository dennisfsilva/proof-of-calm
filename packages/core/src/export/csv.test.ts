import { describe, expect, it } from 'vitest';
import { anEntry, aPlan, date, instant, money, month, units } from '../../test/builders';
import { logCsv, textCell } from './csv';

const plan = aPlan();
const header = 'date,coin,kind,slot,amount,currency,units,price,fee,holding_eligible_from,note';

describe('logCsv (docs/DOMAIN.md §3.13)', () => {
  it('writes one line per entry in date order, with the derived price and the holding date', () => {
    const entries = [
      anEntry({
        kind: 'sell',
        slot: null,
        date: date('2027-03-02'),
        amount: money('150'),
        units: units('0.002'),
        fee: money('0.75'),
      }),
      anEntry({ date: date('2026-02-01'), slot: month('2026-02'), amount: money('70'), units: units('0.0011') }),
      anEntry({ kind: 'lump', slot: null, date: date('2026-01-01'), amount: money('500'), units: units('0.0083') }),
    ];
    expect(logCsv(plan, entries).split('\n')).toEqual([
      header,
      '2026-01-01,BTC,initial,,500,EUR,0.0083,60240.96,,2027-01-01,',
      '2026-02-01,BTC,dca,2026-02,70,EUR,0.0011,63636.36,,2027-02-01,',
      '2027-03-02,BTC,sell,,150,EUR,0.002,75000,0.75,,',
    ]);
  });

  it('orders entries of one day by creation, leaves deleted ones out and omits the date where no rule applies', () => {
    const later = anEntry({ coin: 'ETH' as never, createdAt: instant('2026-01-01T10:00:00+02:00') });
    const earlier = anEntry({ createdAt: instant('2026-01-01T09:00:00Z') });
    const deleted = anEntry({ deletedAt: instant('2026-01-02T10:00:00Z') });
    const lines = logCsv({ ...plan, holdingRule: { kind: 'none' } }, [earlier, later, deleted]).split('\n');
    expect(
      lines.slice(1).map((line) =>
        line
          .split(',')
          .slice(1, 2)
          .concat(line.split(',')[9] ?? ''),
      ),
    ).toEqual([
      ['ETH', ''],
      ['BTC', ''],
    ]);
  });

  it('quotes notes that need it and keeps spreadsheet formulas from running', () => {
    const noted = (note: string) =>
      logCsv(plan, [anEntry({ note })])
        .slice(header.length + 1)
        .split(',2027-01-01,')[1];
    expect(noted('plain')).toBe('plain');
    expect(noted('fee, "maker"')).toBe('"fee, ""maker"""');
    expect(noted('line\nbreak')).toBe('"line\nbreak"');
    expect(noted('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
    expect(noted('+1')).toBe("'+1");
    expect(noted('@sum')).toBe("'@sum");
    expect(noted('-5 fee')).toBe("'-5 fee");
    expect(noted('x;=1+1')).toBe("x;'=1+1");
  });

  it('writes the note through textCell, the rule every free-text cell takes', () => {
    const text = 'a;=b, "c"';
    const line = logCsv(plan, [anEntry({ note: text })]).split('\n')[1] ?? '';
    expect(line.endsWith(`,${textCell(text)}`)).toBe(true);
  });

  it('writes the coin through textCell, since a CoinId may start with -', () => {
    const coinCell = (coin: string) =>
      logCsv(plan, [anEntry({ coin: coin as never })])
        .split('\n')[1]
        ?.split(',')[1];
    expect(coinCell('-A1')).toBe("'-A1");
    expect(coinCell('-')).toBe("'-");
    expect(coinCell('A-1')).toBe('A-1');
    expect(coinCell('BTC')).toBe('BTC');
  });

  it('writes the price at PRICE_FIGURES significant figures, or at the minor unit when that keeps more', () => {
    const price = (amount: string, bought: string) =>
      logCsv(plan, [anEntry({ amount: money(amount), units: units(bought) })])
        .split('\n')[1]
        ?.split(',')[7];
    // 10 € for 813,008 PEPE: a coin under a cent never exports a price of 0.
    expect(price('10', '813008')).toBe('0.0000123');
    expect(price('73732.759', '1')).toBe('73732.76');
  });

  it('writes coins held as held, with an empty amount and price where no cost is recorded', () => {
    const held = (amount: string | null, day: string) =>
      anEntry({
        kind: 'held',
        slot: null,
        fee: null,
        date: date(day),
        amount: amount === null ? null : money(amount),
        units: units('0.5'),
      });
    expect(logCsv(plan, [held(null, '2025-03-01'), held('0', '2025-04-01')]).split('\n')).toEqual([
      header,
      '2025-03-01,BTC,held,,,EUR,0.5,,,2026-03-01,',
      '2025-04-01,BTC,held,,0,EUR,0.5,0,,2026-04-01,',
    ]);
  });

  it('is the header alone without entries', () => {
    expect(logCsv(plan, [])).toBe(header);
  });
});

// A spreadsheet in a locale whose list separator is ; (de, pt) splits a double-clicked file on ;, so each
// ;-separated piece of a text cell is a cell's start there (#207).
describe('textCell (docs/DOMAIN.md §3.13)', () => {
  it("writes x;=1+1 as x;'=1+1", () => {
    expect(textCell('x;=1+1')).toBe("x;'=1+1");
  });

  it('neutralises both pieces of a;@b;+c', () => {
    expect(textCell('a;@b;+c')).toBe("a;'@b;'+c");
  });

  it('leaves a piece starting with a space unchanged', () => {
    expect(textCell('a; =1')).toBe('a; =1');
    expect(textCell(' -2')).toBe(' -2');
  });

  it('neutralises a piece starting with a tab, a CR or a minus, and an empty piece stays empty', () => {
    expect(textCell(';\t1;-2;;')).toBe(";'\t1;'-2;;");
    expect(textCell('a;\r=1')).toBe(`"a;'\r'=1"`);
  });

  // Within RFC 4180 quotes a line break is text, but in the ;-locale reading the quote opens no ;-field, so
  // the break ends the record and the next piece starts a row's first cell.
  it('neutralises a piece after a line break: LF, CR LF or CR', () => {
    expect(textCell('x\n=1+1')).toBe(`"x\n'=1+1"`);
    expect(textCell('x\r\n=1+1')).toBe(`"x\r\n'=1+1"`);
    expect(textCell('x\r=1+1')).toBe(`"x\r'=1+1"`);
  });

  // A CR at index 0 is a trigger and also ends the piece before it, so the piece after it is neutralised too.
  it.each([
    ['\r=1', `"'\r'=1"`],
    ['\r@x', `"'\r'@x"`],
    ['\r+SUM(A1)', `"'\r'+SUM(A1)"`],
    ['\r\r=1', `"'\r'\r'=1"`],
    ['\n=1', `"\n'=1"`],
    ['a\r\n=1', `"a\r\n'=1"`],
    [';=1', ";'=1"],
    ['=1;', "'=1;"],
  ])('writes %j as %j', (text, written) => {
    expect(textCell(text)).toBe(written);
  });

  it('leaves a line break before plain text as it is', () => {
    expect(textCell('line\nbreak')).toBe(`"line\nbreak"`);
  });

  it('quotes per RFC 4180 after neutralising', () => {
    expect(textCell('=a,b;"c"')).toBe(`"'=a,b;""c"""`);
    expect(textCell('')).toBe('');
  });
});
