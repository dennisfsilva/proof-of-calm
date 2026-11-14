import { describe, expect, it } from 'vitest';
import { anEntry, aPlan, date, money, split, units } from '../../../test/builders';
import { LISBON, testId } from '../../../test/exchange/plan-fixture';
import type { Entry } from '../../schema/entry';
import type { CoinId } from '../../schema/ids';
import { changedLog, type LogChange } from './plan-remedy';

// The changes the starting line's sentence asks for, made as the Log's form saves them (docs/DOMAIN.md §3.13, "Lines
// that ask for a change"): Edit entry on a row and Record a purchase, each refused where the Log refuses it.

const BTC = 'BTC' as CoinId;
const P6 = aPlan({
  firstBuy: date('2026-07-02'),
  startingAmount: money('1000'),
  split: split({ BTC: '100', ETH: '0' }),
});
const hand = (overrides: Partial<Entry>) => anEntry({ source: 'manual', slot: null, ...overrides });
const lump = (overrides: Partial<Entry> = {}) =>
  hand({ kind: 'lump', date: date('2026-07-02'), amount: money('1000'), units: units('0.0125'), ...overrides });

describe('changedLog, Edit entry and Record a purchase', () => {
  const stored = { plan: P6, entries: [lump({ fee: money('2') })] };
  const [entry] = stored.entries as [Entry];
  const sale = (held: string) =>
    hand({ kind: 'sell', date: date('2026-07-05'), amount: money('900'), units: units(held) });

  it('an edit keeps the row its kind, fee, venue and note, and dates it with the figures given', () => {
    const figures = new Map([[entry.id, { amount: money('990'), units: units('0.0124') }]]);
    const change: LogChange = { kind: 'edit', row: [entry], date: date('2026-06-10'), figures };
    const [saved] = changedLog(stored, change, LISBON) as [Entry];
    const fields = [saved.id, saved.kind, saved.date, saved.amount, saved.units, saved.fee, saved.source];
    expect(fields).toEqual([entry.id, 'lump', '2026-06-10', '990', '0.0124', '2', 'manual']);
  });

  it('an edit with no figures moves only the date, and a one-tap entry stays one-tap', () => {
    const tapped = lump({ source: 'one-tap' });
    const change: LogChange = { kind: 'edit', row: [tapped], date: date('2026-06-10'), figures: new Map() };
    const [saved] = changedLog({ plan: P6, entries: [tapped] }, change, LISBON) as [Entry];
    expect([saved.date, saved.amount, saved.units, saved.fee, saved.source]).toEqual([
      '2026-06-10',
      '1000',
      '0.0125',
      null,
      'one-tap',
    ]);
  });

  it('a record takes ids no movement key holds, one per coin, and no fee', () => {
    const rows = [{ coin: BTC, amount: money('1000'), units: units('0.0125') }];
    const draft = {
      kind: 'lump',
      date: date('2026-06-10'),
      slot: null,
      fee: null,
      note: '',
      venue: null,
      rows,
    } as const;
    const changed = changedLog({ plan: P6, entries: [] }, { kind: 'record', draft }, LISBON) as Entry[];
    expect(changed.map((each) => [each.id, each.kind, each.date, each.fee])).toEqual([
      [testId('remedy|starting|BTC'), 'lump', '2026-06-10', null],
    ]);
  });

  it('null when the Log refuses the change: a sale left uncovered, or a form error', () => {
    const figures = new Map([[entry.id, { amount: money('990'), units: units('0.001') }]]);
    const edit: LogChange = { kind: 'edit', row: [entry], date: date('2026-06-10'), figures };
    expect(changedLog({ plan: P6, entries: [...stored.entries, sale('0.012')] }, edit, LISBON)).toBeNull();
    const negative = new Map([[entry.id, { amount: money('-1'), units: units('0.0125') }]]);
    expect(changedLog(stored, { ...edit, figures: negative }, LISBON)).toBeNull();
  });

  // The Log stores an edit through `keepSources` (as `saveOn` does): what the person left alone stays each entry's own.
  const ETH = 'ETH' as CoinId;
  const kept = (entries: readonly Entry[]) => entries.map((each) => [each.coin, each.fee, each.venue, each.note]);

  it("a date-only edit of a row grouping two saves keeps each entry's fee, venue and note", () => {
    const btc = lump({ amount: money('100'), fee: money('1'), venue: 'Kraken', note: 'first' });
    const eth = lump({ coin: ETH, amount: money('100'), fee: money('3'), venue: 'Bitvavo', note: 'second' });
    const change: LogChange = { kind: 'edit', row: [btc, eth], date: date('2026-06-10'), figures: new Map() };
    const changed = changedLog({ plan: P6, entries: [btc, eth] }, change, LISBON) as Entry[];
    expect(changed.map((each) => each.date)).toEqual(['2026-06-10', '2026-06-10']);
    expect(kept(changed)).toEqual([
      [BTC, '1', 'Kraken', 'first'],
      [ETH, '3', 'Bitvavo', 'second'],
    ]);
  });

  it("an edit of one coin's figures keeps the fee split as stored, since the fee was not changed", () => {
    const btc = lump({ amount: money('100'), fee: money('1') });
    const eth = lump({ coin: ETH, amount: money('200'), fee: money('2') });
    const figures = new Map([[btc.id, { amount: money('200'), units: units('0.0025') }]]);
    const change: LogChange = { kind: 'edit', row: [btc, eth], date: btc.date, figures };
    const changed = changedLog({ plan: P6, entries: [btc, eth] }, change, LISBON) as Entry[];
    expect(changed.map((each) => [each.coin, each.amount, each.fee])).toEqual([
      [BTC, '200', '1'],
      [ETH, '200', '2'],
    ]);
  });

  it('an amount or units equal in value to the stored ones keep the text stored', () => {
    const stored = lump({ amount: money('1000.50'), units: units('0.01250') });
    const figures = new Map([[stored.id, { amount: money('1000.5'), units: units('0.0125') }]]);
    const change: LogChange = { kind: 'edit', row: [stored], date: date('2026-06-10'), figures };
    const [saved] = changedLog({ plan: P6, entries: [stored] }, change, LISBON) as [Entry];
    expect([saved.amount, saved.units]).toEqual(['1000.50', '0.01250']);
  });

  it('throws on a change of no known kind', () => {
    expect(() => changedLog(stored, { kind: 'move' } as unknown as LogChange, LISBON)).toThrow();
  });
});
