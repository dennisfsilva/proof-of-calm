import { describe, expect, it } from 'vitest';
import { date, id, instant } from '../../test/builders';
import { exportBackup } from '../export/backup';
import { planTotals } from '../plan/totals';
import { EntrySchema } from '../schema/entry';
import type { EntityId } from '../schema/ids';
import { importPrototype, type PrototypeImport, type PrototypeImportInput, recogniseImport } from './prototype';

const now = instant('2026-10-17T09:00:00Z');
const fresh = [id(), id(), id(), id()];
const input = (overrides: Partial<PrototypeImportInput> = {}): PrototypeImportInput => ({
  planId: 'p0plan' as EntityId,
  country: 'PT',
  countryRuleVersion: 2,
  ids: fresh,
  now,
  today: date('2026-10-17'),
  ...overrides,
});
const coin = (symbol: string, name: string, gecko: string, dec: number, color: string) => ({
  id: symbol,
  name,
  gecko,
  dec,
  color,
});
type State = { settings: Record<string, unknown>; purchases: unknown[]; [key: string]: unknown };
const exported = (): State => ({
  version: 4,
  settings: {
    base: 'EUR',
    quote: 'USD',
    strategy: 'recommended',
    monthly: 1000,
    initial: 500,
    firstBuy: '2026-01-05',
    taxNote: '',
    coins: [
      coin('BTC', 'Bitcoin', 'bitcoin', 8, '#eb6834'),
      coin('ETH', 'Ethereum', 'ethereum', 6, '#6250d6'),
      coin('SOL', 'Solana', 'solana', 4, '#1baf7a'),
      coin('LINK', 'Chainlink', 'chainlink', 3, '#2a78d6'),
    ],
    split: { BTC: 40, ETH: 30, SOL: 15, LINK: 15 },
    dcaDay: 1,
    lastBuy: '2028-06-01',
    holdDays: 365,
    sellFrom: '2029-06-01',
    sellTo: '2029-10-31',
    peakFrom: '2029-09-01',
    peakTo: '2029-10-31',
    exitBy: '2029-12-31',
    halving: '2028-04-15',
    expect: { bear: 0.7, base: 2.3, bull: 3.5 },
  },
  purchases: [
    { id: 'pm1a2b3c', kind: 'lump', date: '2026-01-05', coin: 'BTC', eur: 200, units: 0.0021, fee: 1.5, note: 'start' },
    { id: 'pm1a2b3d', kind: 'dca', date: '2026-02-01', coin: 'ETH', eur: 300, units: 0.1, fee: null, slot: '2026-02' },
    { id: 'pm1a2b3e', kind: 'sell', date: '2026-03-10', coin: 'btc', eur: 50, units: 0.0005, fee: '', note: '' },
  ],
  checks: { sell1: true, sell2: false, sell3: false },
  meta: { lastBackupAt: 1_760_601_906_007, theme: 'dark', range: '90', setupDone: true },
});
const imported = (state: unknown, overrides: Partial<PrototypeImportInput> = {}): PrototypeImport => {
  const result = importPrototype(state, input(overrides));
  if (!result.ok) throw new Error(JSON.stringify(result.error));
  return result.value;
};
const withSettings = (settings: Record<string, unknown>, purchases?: unknown[]): State => {
  const state = exported();
  return { ...state, settings: { ...state.settings, ...settings }, purchases: purchases ?? state.purchases };
};

describe('importPrototype (docs/DOMAIN.md §7)', () => {
  it('maps a prototype export field by field', () => {
    const result = imported(exported());
    expect(result.plan).toEqual({
      id: 'p0plan',
      schemaVersion: 3,
      country: 'PT',
      countryRuleVersion: 2,
      payCurrency: 'EUR',
      displayCurrency: 'USD',
      coins: [
        { id: 'BTC', name: 'Bitcoin', geckoId: 'bitcoin', decimals: 8, color: '#eb6834' },
        { id: 'ETH', name: 'Ethereum', geckoId: 'ethereum', decimals: 6, color: '#6250d6' },
        { id: 'SOL', name: 'Solana', geckoId: 'solana', decimals: 4, color: '#1baf7a' },
        { id: 'LINK', name: 'Chainlink', geckoId: 'chainlink', decimals: 3, color: '#2a78d6' },
      ],
      split: { BTC: '40', ETH: '30', SOL: '15', LINK: '15' },
      monthlyAmount: '1000',
      startingAmount: '500',
      firstBuy: '2026-01-05',
      buyDay: 1,
      lastBuy: '2028-06-01',
      holdingRule: { kind: 'days', days: 365, effect: 'exempt' },
      sellWindow: { opens: '2029-06-01', closes: '2029-10-31', exitBy: '2029-12-31' },
      references: { peakFrom: '2029-09-01', peakTo: '2029-10-31', halving: '2028-04-15' },
      expectations: { bear: '0.7', base: '2.3', bull: '3.5' },
      pauses: [],
      skips: [],
      endedBuyingOn: null,
      sellChecks: { part1: true, part2: false, part3: false },
      why: '',
      templateId: 'cycle-plan',
      // The prototype records no acknowledgement: the plan-creation disclosure was never shown (§2.1).
      riskAcknowledgedAt: null,
      riskWordingVersion: 0,
      createdAt: now,
      updatedAt: now,
    });
    const common = { venue: null, source: 'import-prototype', createdAt: now, updatedAt: now, deletedAt: null };
    expect(result.entries).toEqual([
      {
        id: 'pm1a2b3c',
        kind: 'lump',
        date: '2026-01-05',
        coin: 'BTC',
        amount: '200',
        units: '0.0021',
        fee: '1.5',
        note: 'start',
        slot: null,
        ...common,
      },
      {
        id: 'pm1a2b3d',
        kind: 'dca',
        date: '2026-02-01',
        coin: 'ETH',
        amount: '300',
        units: '0.1',
        fee: null,
        note: '',
        slot: '2026-02',
        ...common,
      },
      {
        id: 'pm1a2b3e',
        kind: 'sell',
        date: '2026-03-10',
        coin: 'BTC',
        amount: '50',
        units: '0.0005',
        fee: null,
        note: '',
        slot: null,
        ...common,
      },
    ]);
    expect(result.prefs).toEqual({ theme: 'dark', chartRange: '90d', lastBackupAt: '2025-10-16T08:05:06.007Z' });
    expect(result.report).toEqual([]);
  });

  it('accepts the older shapes the prototype accepted, saying what it derived', () => {
    const { lastBuy: _, firstBuy: __, split: ___, initial: ____, ...rest } = exported().settings;
    const older = {
      settings: {
        ...rest,
        coins: [coin('BTC', 'Bitcoin', 'bitcoin', 8, '#eb6834'), coin('ETH', 'Ethereum', 'ethereum', 6, '#6250d6')],
        dcaSplit: { BTC: 60, ETH: 40 },
        lumpSteps: [{ eur: 100 }, { eur: 150 }, { eur: -5 }, null],
      },
      purchases: [
        { kind: 'extra', date: '2026-03-02', coin: 'BTC', eur: 10, units: 0.0001 },
        { kind: 'extra', date: '2026-02-15', coin: 'ETH', eur: 10, units: 0.004 },
      ],
    };
    const result = imported(older);
    expect([result.plan.split, result.plan.startingAmount, result.plan.firstBuy, result.plan.lastBuy]).toEqual([
      { BTC: '60', ETH: '40' },
      '250',
      '2026-02-15',
      '2028-06-01',
    ]);
    expect(result.plan.templateId).toBeNull();
    expect(result.report).toEqual([
      { code: 'split-from-dca-split' },
      { code: 'starting-amount-from-steps' },
      { code: 'first-buy-from-entries' },
      { code: 'ids-regenerated', count: 2 },
    ]);
    expect(result.entries.map((entry) => entry.id)).toEqual([fresh[0], fresh[1]]);
    expect(result.prefs).toEqual({ theme: 'system', chartRange: '30d', lastBackupAt: null });
  });

  it('closes a split that is off by a rounding residue on its largest share, and no more', () => {
    const thirds = withSettings({
      coins: [coin('BTC', 'Bitcoin', 'bitcoin', 8, '#eb6834'), coin('ETH', 'Ethereum', 'ethereum', 6, '#6250d6')],
      split: { BTC: 49.995, ETH: 49.995 },
    });
    const result = imported(thirds);
    expect(result.plan.split).toEqual({ BTC: '50.005', ETH: '49.995' });
    expect(result.report).toContainEqual({ code: 'split-normalised', coin: 'BTC', from: '49.995', to: '50.005' });
    const uneven = imported({ ...thirds, settings: { ...thirds.settings, split: { BTC: 33.333, ETH: 66.666 } } });
    expect(uneven.plan.split).toEqual({ BTC: '33.333', ETH: '66.667' });
    expect(importPrototype(withSettings({ split: { BTC: 40, ETH: 30, SOL: 15, LINK: 5 } }), input())).toEqual({
      ok: false,
      error: { code: 'invalid-plan', issues: ['split: split-sum'] },
    });
  });

  it('rounds money to cents and units to ten decimals, keeping the prototype’s p-ids', () => {
    const purchases = [
      { id: 'not-a-p-id', kind: 'extra', date: '2026-02-01', coin: 'BTC', eur: 70.123, units: 0.123456789012 },
      { id: 'pkeep1', kind: 'extra', date: '2026-02-01', coin: 'BTC', eur: 10, units: 1, fee: -1 },
      { id: 'pkeep1', kind: 'extra', date: '2026-02-01', coin: 'BTC', eur: 10, units: 1, fee: 0.004 },
    ];
    const result = imported(withSettings({}, purchases));
    expect(result.entries.map((entry) => [entry.id, entry.amount, entry.units, entry.fee])).toEqual([
      [fresh[0], '70.12', '0.123456789', null],
      ['pkeep1', '10', '1', null],
      [fresh[1], '10', '1', '0'],
    ]);
    expect(result.report).toEqual([
      { code: 'entries-rounded', count: 2 },
      { code: 'fees-dropped', count: 1 },
      { code: 'ids-regenerated', count: 2 },
    ]);
  });

  it('drops entries it cannot hold and records a monthly buy without its month as an extra buy', () => {
    const valid = { kind: 'extra', date: '2026-02-01', coin: 'BTC', eur: 10, units: 0.0001 };
    const purchases = [
      null,
      { ...valid, coin: '' },
      { ...valid, coin: 'B?C' },
      { ...valid, eur: 'many' },
      { ...valid, units: undefined },
      { ...valid, date: '16/10/2026' },
      { ...valid, date: '2026-02-30' },
      { ...valid, eur: 0 },
      { ...valid, units: 0.00000000001 },
      { ...valid, id: 'pmonth', kind: 'dca', slot: undefined },
      { ...valid, id: 'pnote', kind: 'swap', note: 'x'.repeat(600), slot: '2026-02' },
      { ...valid, id: 'pminus', eur: -10, units: -0.0001, date: '2026-02' },
    ];
    const result = imported(withSettings({}, purchases));
    expect(result.entries.map((entry) => [entry.id, entry.kind, entry.slot, entry.note.length, entry.date])).toEqual([
      ['pmonth', 'extra', null, 0, '2026-02-01'],
      ['pnote', 'extra', null, 500, '2026-02-01'],
      ['pminus', 'extra', null, 0, '2026-02-01'],
    ]);
    expect(result.entries[2]).toEqual(expect.objectContaining({ amount: '10', units: '0.0001' }));
    expect(result.report).toEqual([
      { code: 'entries-dropped', count: 9 },
      { code: 'monthly-without-month', count: 1 },
      { code: 'notes-shortened', count: 1 },
    ]);
  });

  it('maps only the prototype’s own kinds, so a held or unknown kind comes in as an extra buy with its fee', () => {
    const valid = { date: '2026-02-01', coin: 'BTC', eur: 10, units: 0.0001 };
    const purchases = [
      { ...valid, id: 'pheldfee', kind: 'held', fee: 1 },
      { ...valid, id: 'pheldzero', kind: 'held', fee: 0 },
      { ...valid, id: 'pheld', kind: 'held' },
      { ...valid, id: 'pgift', kind: 'gift', fee: 0.5 },
    ];
    const result = imported(withSettings({}, purchases));
    expect(result.entries.map((entry) => [entry.id, entry.kind, entry.fee])).toEqual([
      ['pheldfee', 'extra', '1'],
      ['pheldzero', 'extra', '0'],
      ['pheld', 'extra', null],
      ['pgift', 'extra', '0.5'],
    ]);
    for (const entry of result.entries) expect(EntrySchema.safeParse(entry).success).toBe(true);
    const totals = planTotals(result.plan, result.entries.slice(2, 3), date('2026-02-01'));
    expect(totals.investedSoFar).toBe('10');
  });

  it('completes coins from what it knows, adds coins that have entries, and falls back to the default four', () => {
    const coins = [
      { id: ' btc ', dec: 'eight' },
      { id: 'xyz', name: '  ', gecko: 'Bad Id!', dec: 14, color: 'red' },
      { id: 'btc' },
      { id: '' },
      { name: 'No id' },
      'ETH',
    ];
    const purchases = [{ kind: 'extra', date: '2026-02-01', coin: 'SOL', eur: 10, units: 0.1 }];
    const result = imported(withSettings({ coins, split: { BTC: 100 } }, purchases));
    expect(result.plan.coins).toEqual([
      { id: 'BTC', name: 'Bitcoin', geckoId: 'bitcoin', decimals: 8 },
      { id: 'XYZ', name: 'XYZ', geckoId: 'xyz', decimals: 10 },
      { id: 'SOL', name: 'Solana', geckoId: 'solana', decimals: 4 },
    ]);
    expect(result.plan.split).toEqual({ BTC: '100', XYZ: '0', SOL: '0' });
    expect(result.report).toEqual([
      { code: 'coin-added', coin: 'SOL' },
      { code: 'ids-regenerated', count: 1 },
    ]);

    const odd = [{ kind: 'extra', date: '2026-02-01', coin: 'BTC.B', eur: 10, units: 0.1 }];
    const defaulted = imported(withSettings({ coins: [] }, odd));
    expect(defaulted.plan.coins.map((entry) => [entry.id, entry.geckoId, entry.decimals])).toEqual([
      ['BTC', 'bitcoin', 8],
      ['ETH', 'ethereum', 6],
      ['SOL', 'solana', 4],
      ['LINK', 'chainlink', 4],
      ['BTC.B', 'btc-b', 4],
    ]);
    expect(defaulted.report.slice(0, 2)).toEqual([{ code: 'coins-defaulted' }, { code: 'coin-added', coin: 'BTC.B' }]);
  });

  it('defaults what the prototype defaulted, saying so', () => {
    const state = withSettings({
      base: 'SEK',
      quote: null,
      holdDays: -3,
      dcaDay: 31,
      monthly: 99.999,
      taxNote: 'Ask the accountant',
      lastBuy: 'soon',
      expect: { bear: -1, base: 'two' },
      firstBuy: 'whenever',
    });
    const result = imported(state);
    expect(result.plan).toEqual(
      expect.objectContaining({
        payCurrency: 'EUR',
        displayCurrency: 'USD',
        holdingRule: { kind: 'days', days: 365, effect: 'exempt' },
        buyDay: 28,
        monthlyAmount: '100',
        lastBuy: '2028-06-01',
        firstBuy: '2026-01-05',
        expectations: { bull: '3.5' },
      }),
    );
    expect(result.report).toEqual([
      { code: 'currency-defaulted', field: 'payCurrency' },
      { code: 'currency-defaulted', field: 'displayCurrency' },
      { code: 'plan-amounts-rounded' },
      { code: 'first-buy-from-entries' },
      { code: 'last-buy-defaulted' },
      { code: 'buy-day-clamped' },
      { code: 'hold-days-defaulted' },
      { code: 'expectation-dropped', key: 'bear' },
      { code: 'expectation-dropped', key: 'base' },
      { code: 'tax-note-dropped' },
    ]);
  });

  it('starts on today without a first-buy date or entries, and keeps a long hold in range', () => {
    const settings = { firstBuy: undefined, holdDays: 99_999.4, monthly: 'none', dcaDay: 'first' };
    const result = imported(withSettings(settings, []), { today: date('2026-10-17') });
    expect([result.plan.firstBuy, result.plan.holdingRule, result.plan.monthlyAmount, result.plan.buyDay]).toEqual([
      '2026-10-17',
      { kind: 'days', days: 36_500, effect: 'exempt' },
      '0',
      1,
    ]);
    const nothing = imported(withSettings({ initial: 'lots' }, [])).plan.startingAmount;
    expect(nothing).toBe('0');
  });

  it('reads a state without settings as the prototype’s defaults', () => {
    const result = imported({ purchases: [] });
    expect(result.plan).toEqual(
      expect.objectContaining({
        coins: [
          { id: 'BTC', name: 'Bitcoin', geckoId: 'bitcoin', decimals: 8 },
          { id: 'ETH', name: 'Ethereum', geckoId: 'ethereum', decimals: 6 },
          { id: 'SOL', name: 'Solana', geckoId: 'solana', decimals: 4 },
          { id: 'LINK', name: 'Chainlink', geckoId: 'chainlink', decimals: 4 },
        ],
        split: { BTC: '40', ETH: '30', SOL: '15', LINK: '15' },
        monthlyAmount: '1000',
        startingAmount: '0',
        firstBuy: '2026-10-17',
        lastBuy: '2028-06-01',
        expectations: { bear: '0.7', base: '2.3', bull: '3.5' },
        templateId: 'cycle-plan',
      }),
    );
    expect(result.report).toEqual([{ code: 'coins-defaulted' }]);
  });

  it('keeps a sell window only with all three dates, and accepts one that opens before the rule passes', () => {
    const partial = imported(withSettings({ sellTo: '' }));
    expect(partial.plan.sellWindow).toBeNull();
    expect(partial.report).toEqual([{ code: 'sell-window-dropped' }]);
    expect(imported(withSettings({ sellFrom: '', sellTo: '', exitBy: '' })).report).toEqual([]);
    const early = imported(withSettings({ holdDays: 400 }));
    expect(early.plan.sellWindow).toEqual(expect.objectContaining({ acceptedEarlyOpen: true }));
    expect(early.report).toEqual([{ code: 'sell-window-accepted-early' }]);
  });

  it('keeps references that are dates and leaves out the rest', () => {
    const result = imported(withSettings({ peakFrom: '', halving: 'April' }));
    expect(result.plan.references).toEqual({ peakTo: '2029-10-31' });
  });

  it('reads the device preferences it can', () => {
    const state = { ...exported(), meta: { theme: 'neon', range: '7', lastBackupAt: 0 } };
    expect(imported(state).prefs).toEqual({ theme: 'system', chartRange: '7d', lastBackupAt: null });
    expect(imported({ ...exported(), meta: { range: '365', theme: 'light' } }).prefs.chartRange).toBe('1y');
  });

  // The ranges are an object literal: a key it inherits is not a range, so it falls back as any unknown one does.
  it.each(['__proto__', 'constructor', 'toString', 'hasOwnProperty'])('reads a range named %s as 30d', (range) => {
    expect(imported({ ...exported(), meta: { range } }).prefs.chartRange).toBe('30d');
  });

  it('refuses what is not a prototype export, and a plan that cannot be valid', () => {
    for (const other of [null, [], {}, { purchases: 'none' }]) {
      expect(importPrototype(other, input())).toEqual({ ok: false, error: { code: 'not-prototype' } });
    }
    expect(importPrototype(withSettings({ monthly: 0, initial: 0 }), input())).toEqual({
      ok: false,
      error: { code: 'invalid-plan', issues: ['monthlyAmount: no-amount'] },
    });
  });

  it('needs a fresh id for each entry whose id it cannot keep', () => {
    const purchases = [{ kind: 'extra', date: '2026-02-01', coin: 'BTC', eur: 10, units: 0.1 }];
    expect(() => importPrototype(withSettings({}, purchases), input({ ids: [] }))).toThrow('Missing a fresh id');
  });

  it('refuses entries that do not read as entries, naming them, and imports nothing', () => {
    const purchases = [
      { id: 'p1', kind: 'extra', date: '2026-02-01', coin: 'BTC', eur: 10, units: 0.1 },
      { kind: 'extra', date: '2026-02-02', coin: 'BTC', eur: 10, units: 0.1 },
    ];
    const ids = ['not-an-id' as EntityId];
    expect(importPrototype(withSettings({}, purchases), input({ ids }))).toEqual({
      ok: false,
      error: { code: 'invalid-entries', ids },
    });
  });
});

describe('recogniseImport', () => {
  it('tells a Proof of Calm backup from a prototype export, and both from anything else', () => {
    expect(recogniseImport(JSON.parse(JSON.stringify(exportBackup(imported(exported()).plan, [], now))))).toBe(
      'backup',
    );
    expect(recogniseImport(exported())).toBe('prototype');
    for (const other of [null, 'text', [], { purchases: {} }]) expect(recogniseImport(other)).toBeNull();
  });
});
