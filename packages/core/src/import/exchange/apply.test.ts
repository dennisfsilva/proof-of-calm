import { describe, expect, it } from 'vitest';
import { anEntry, date, instant, money, month, units } from '../../../test/builders';
import { fileOf } from '../../../test/exchange/plan-arbitraries';
import { LISBON, NOW, PLAN } from '../../../test/exchange/plan-fixture';
import { MAX_ENTRIES } from '../../constants';
import type { Entry } from '../../schema/entry';
import { applyExchangeImport, sameImport } from './apply';
import { importId } from './import-id';
import { type ExchangeImportPlan, planExchangeImport } from './plan';
import { readExchangeFile } from './read';

// The write's cap (docs/DOMAIN.md §3.13, D8's write tier): live entries after the write, tombstones not counted.

const EMPTY = planExchangeImport(
  fileOf([]),
  { plan: PLAN, entries: [] },
  { addHeld: false, venue: null },
  { ...LISBON, idOf: importId },
);
const adding = (entries: readonly Entry[], replaced: ExchangeImportPlan['replaced'] = []): ExchangeImportPlan => ({
  ...EMPTY,
  entries,
  replaced,
});
const many = (count: number) => Array.from({ length: count }, () => anEntry({ source: 'import-csv' }));

describe('applyExchangeImport', () => {
  it('adds nothing and refuses nothing when the plan adds nothing', () => {
    const stored = many(2);
    expect(applyExchangeImport(stored, EMPTY, NOW)).toEqual({ entries: stored, added: 0, replaced: 0, refused: null });
  });

  it('writes up to MAX_ENTRIES live entries, a tombstoned estimate not counted, and refuses one more', () => {
    const estimate = anEntry({ source: 'one-tap', updatedAt: instant('2026-11-13T12:00:00Z') });
    const stored = [...many(MAX_ENTRIES - 2), estimate, anEntry({ deletedAt: NOW })];
    const [one, two] = many(2) as [Entry, Entry];
    const replacing = applyExchangeImport(stored, adding([one, two], [{ estimates: [estimate], by: [one.id] }]), NOW);
    expect([replacing.refused, replacing.added, replacing.replaced]).toEqual([null, 2, 1]);
    expect(replacing.entries.find((entry) => entry.id === estimate.id)?.updatedAt).toBe('2026-11-13T12:00:00.001Z');

    const over = applyExchangeImport(stored, adding([one, two]), NOW);
    expect(over).toEqual({
      entries: stored,
      added: 0,
      replaced: 0,
      refused: { code: 'too-many-entries', entries: MAX_ENTRIES + 1, max: MAX_ENTRIES },
    });
  });

  // One write never stores two rows under one id: the store puts rows by id, so the second would replace the first.
  const held = (overrides: Partial<Entry>) =>
    anEntry({ kind: 'held', amount: null, slot: null, source: 'import-csv', ...overrides });
  it.each([
    ['two held entries', () => [held({ units: units('0.00005') }), held({ units: units('0.00003') })]],
    ['a monthly buy and a held entry', () => [anEntry({ source: 'import-csv' }), held({ units: units('0.00005') })]],
  ] as const)('refuses `invalid-entries` when %s share an id, and writes nothing', (_, pair) => {
    const stored = many(2);
    const [first, second] = pair() as [Entry, Entry];
    const other = anEntry({ source: 'import-csv' });
    const write = applyExchangeImport(stored, adding([first, { ...second, id: first.id }, other]), NOW);
    expect(write).toEqual({
      entries: stored,
      added: 0,
      replaced: 0,
      refused: { code: 'invalid-entries', ids: [first.id] },
    });
  });

  // The file behind the first case, two invite-bonus rows of one coin under one refid, now reads as one receipt
  // (ADR-0056, Corrections, 2026-11-13), so its plan writes one `held` entry instead of refusing.
  it('writes a file of two invite-bonus rows of one coin under one refid as one held entry', () => {
    const text = [
      '"txid","refid","time","type","subtype","asset","amount","fee"',
      '"LSYN1","BSYN1","2026-04-10 09:00:00","invite bonus","","BTC","0.00005","0"',
      '"LSYN2","BSYN1","2026-04-10 10:00:00","invite bonus","","XXBT","0.00003","0"',
    ].join('\n');
    const read = readExchangeFile(text);
    const file = read.ok ? read.value : fileOf([]);
    const plan = planExchangeImport(
      file,
      { plan: PLAN, entries: [] },
      { addHeld: false, venue: null },
      { ...LISBON, idOf: importId },
    );
    const write = applyExchangeImport([], plan, NOW);
    expect([write.refused, write.added, write.entries.map((entry) => [entry.kind, entry.units, entry.amount])]).toEqual(
      [null, 1, [['held', '0.00008', '0']]],
    );
  });
});

describe('sameImport over the estimates it tombstones', () => {
  const [one, two] = many(2) as [Entry, Entry];
  const a = anEntry({
    source: 'one-tap',
    venue: 'Bitvavo',
    note: 'tapped',
    slot: month('2026-10'),
    date: date('2026-10-06'),
  });
  const b = anEntry({ source: 'one-tap', slot: month('2026-11'), date: date('2026-11-06') });
  const shown = adding(
    [one, two],
    [
      { estimates: [a], by: [one.id] },
      { estimates: [b], by: [two.id] },
    ],
  );
  const replacing = (estimates: readonly [Entry, Entry]) =>
    adding(
      [one, two],
      [
        { estimates: [estimates[0]], by: [one.id] },
        { estimates: [estimates[1]], by: [two.id] },
      ],
    );

  it('ignores only their updatedAt, and their order across items', () => {
    expect(sameImport(shown, replacing([{ ...a, updatedAt: NOW }, b]))).toBe(true);
    expect(sameImport(shown, replacing([b, a]))).toBe(true);
  });

  it.each([
    ['amount', { amount: money('80') }],
    ['units', { units: units('0.002') }],
    ['venue', { venue: 'Kraken' }],
    ['date within the month', { date: date('2026-10-20') }],
    ['note', { note: 'edited' }],
  ] as const)('differs when another tab changed one’s %s since the preview', (_, change) => {
    expect(sameImport(shown, replacing([{ ...a, ...change }, b]))).toBe(false);
  });
});
