import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { anEntry, aPlan, BTC, date, ETH, instant, money, split, units } from '../../test/builders';
import { rowEntries } from '../actions/rows';
import { compareDates, epochDay, fromEpochDay } from '../dates/calendar';
import { compare, minus, type Price, plus, type Units } from '../money/decimal';
import type { CountryRules } from '../schema/country';
import type { Entry } from '../schema/entry';
import type { Plan } from '../schema/plan';
import type { PriceSnapshot } from '../schema/prices';
import {
  DEFAULT_HOLDING_CONTEXT,
  eligibility,
  eligibleUnits,
  holdingContext,
  lotEligibleFrom,
  type SaleWarning,
  saleWarning,
  sellableNow,
} from './eligibility';
import { runningHeld } from './lots';

const portugal = aPlan({ coins: [BTC, ETH], split: split({ BTC: '70', ETH: '30' }) });
const germany: Plan = { ...portugal, holdingRule: { kind: 'years', years: 1, effect: 'exempt' } };
const spain: Plan = { ...portugal, holdingRule: { kind: 'none' } };
const buy = (coin: 'BTC' | 'ETH', day: string, quantity: string, amount = '100') =>
  anEntry({
    kind: 'extra',
    slot: null,
    coin: coin as never,
    date: date(day),
    units: units(quantity),
    amount: money(amount),
  });
const sell = (coin: 'BTC' | 'ETH', day: string, quantity: string) =>
  anEntry({
    kind: 'sell',
    slot: null,
    coin: coin as never,
    date: date(day),
    units: units(quantity),
    amount: money('50'),
  });
const prices = (btc: string, eth: string): PriceSnapshot => ({
  at: instant('2027-06-01T09:00:00Z'),
  prices: { BTC: { EUR: btc as Price }, ETH: { EUR: eth as Price } } as PriceSnapshot['prices'],
});

const entries = [buy('BTC', '2026-01-10', '0.01'), buy('BTC', '2026-06-10', '0.01'), buy('ETH', '2026-03-10', '1')];
const NOW = '2026-11-06T12:00:00Z';

describe('eligibility (docs/DOMAIN.md §3.7)', () => {
  it('counts the units past 365 days per coin and weights the share by value', () => {
    const result = eligibility(portugal, entries, prices('50000', '1000'), date('2027-04-01'));
    expect(result.coins).toEqual([
      { coin: 'BTC', units: '0.02', eligibleUnits: '0.01', fraction: '0.5' },
      { coin: 'ETH', units: '1', eligibleUnits: '1', fraction: '1' },
    ]);
    // BTC worth 1000 (half eligible), ETH worth 1000 (all eligible): 1500 of 2000.
    expect(result.share).toBe('0.75');
    expect(result.allEligibleBy).toBe('2027-06-10');
  });

  it('weights by the amount invested while prices are missing, as the prototype', () => {
    const result = eligibility(
      portugal,
      [buy('BTC', '2026-01-10', '0.01', '300'), buy('BTC', '2026-06-10', '0.01', '100')],
      null,
      date('2027-04-01'),
    );
    expect(result.share).toBe('0.5');
  });

  it('uses Germany’s "more than one year": eligible the day after the anniversary', () => {
    const one = [buy('BTC', '2026-03-15', '0.01')];
    expect(eligibility(germany, one, null, date('2027-03-15')).coins[0]?.eligibleUnits).toBe('0');
    expect(eligibility(germany, one, null, date('2027-03-16')).coins[0]?.eligibleUnits).toBe('0.01');
    expect(eligibility(portugal, one, null, date('2027-03-15')).coins[0]?.eligibleUnits).toBe('0.01');
  });

  it('takes sales from the oldest lots first, so later purchases stay ineligible', () => {
    const result = eligibility(portugal, [...entries, sell('BTC', '2026-12-01', '0.015')], null, date('2027-04-01'));
    expect(result.coins[0]).toEqual({ coin: 'BTC', units: '0.005', eligibleUnits: '0', fraction: '0' });
  });

  it('caps the eligible units at the units held when a sale exceeded what it could match', () => {
    // 0.1 bought, 0.3 sold (0.2 unmatched), 1 bought later: 0.8 held, but the later lot is whole.
    const odd = [buy('BTC', '2026-01-10', '0.1'), sell('BTC', '2026-02-10', '0.3'), buy('BTC', '2026-03-10', '1')];
    expect(eligibility(portugal, odd, null, date('2027-06-01')).coins[0]).toEqual({
      coin: 'BTC',
      units: '0.8',
      eligibleUnits: '0.8',
      fraction: '1',
    });
  });

  it('calls everything eligible where the country has no rule, with no date to wait for', () => {
    const result = eligibility(spain, entries, null, date('2026-07-01'));
    expect([result.share, result.allEligibleBy]).toEqual(['1', null]);
    expect(eligibility(spain, [], null, date('2026-07-01')).share).toBeNull();
    expect(eligibility(portugal, [], null, date('2026-07-01'))).toEqual({
      coins: [],
      share: null,
      allEligibleBy: null,
    });
  });

  it('applies an enacted override by acquisition date (Germany’s draft reform, if it passes)', () => {
    const reform = {
      ...DEFAULT_HOLDING_CONTEXT,
      overrides: [{ acquiredFrom: date('2027-01-01'), rule: { kind: 'none' } as const, note: '' }],
    };
    const result = eligibility(
      germany,
      [buy('BTC', '2026-12-31', '0.01'), buy('BTC', '2027-01-01', '0.01')],
      null,
      date('2027-06-01'),
      reform,
    );
    expect(result.coins[0]?.eligibleUnits).toBe('0.01');
    expect(result.allEligibleBy).toBe('2028-01-01');
  });

  it('grows with today and never exceeds the units held (docs/ROADMAP.md M0: monotonic in today)', () => {
    const days = fc.integer({ min: epochDay(date('2025-06-01')), max: epochDay(date('2028-06-01')) }).map(fromEpochDay);
    const plans = fc.constantFrom(portugal, germany);
    fc.assert(
      fc.property(plans, days, days, (plan, a, b) => {
        const [early, late] = compareDates(a, b) <= 0 ? [a, b] : [b, a];
        const before = eligibility(plan, entries, null, early).coins;
        const after = eligibility(plan, entries, null, late).coins;
        before.forEach((coin, index) => {
          expect(compare(coin.eligibleUnits, after[index]?.eligibleUnits ?? coin.eligibleUnits)).toBeLessThanOrEqual(0);
          expect(compare(coin.eligibleUnits, coin.units)).toBeLessThanOrEqual(0);
        });
      }),
    );
  });
});

describe('holdingContext', () => {
  const rules = {
    holdingRule: { kind: 'years', years: 1, effect: 'exempt' },
    holdingRuleOverrides: [{ acquiredFrom: date('2027-01-01'), rule: { kind: 'none' }, note: '' }],
    lotScope: 'per-venue',
    lotRule: 'fifo',
  } as unknown as CountryRules;

  it('applies the country overrides only while the plan uses the country rule', () => {
    expect(holdingContext(germany, rules)).toEqual({
      overrides: rules.holdingRuleOverrides,
      lotScope: 'per-venue',
      lotRule: 'fifo',
    });
    expect(holdingContext(portugal, rules).overrides).toEqual([]);
    expect(holdingContext(portugal, null)).toBe(DEFAULT_HOLDING_CONTEXT);
  });

  it('recognises the country rule whatever the order of its fields', () => {
    const reordered: Plan = { ...germany, holdingRule: { effect: 'exempt', years: 1, kind: 'years' } };
    expect(holdingContext(reordered, rules).overrides).toEqual(rules.holdingRuleOverrides);
  });

  it('dates a lot by its own rule', () => {
    expect(lotEligibleFrom(germany, { date: date('2026-03-15') }, DEFAULT_HOLDING_CONTEXT)).toBe('2027-03-16');
  });
});

describe('sellableNow and saleWarning', () => {
  it('splits the units into sellable now and later, by date', () => {
    const result = sellableNow(
      portugal,
      [...entries, buy('BTC', '2026-06-10', '0.005')],
      'BTC' as never,
      date('2027-04-01'),
    );
    expect(result).toEqual({ now: '0.01', later: [{ from: '2027-06-10', units: '0.015' }] });
    expect(sellableNow(spain, entries, 'BTC' as never, date('2026-02-01'))).toEqual({ now: '0.02', later: [] });
    const two = sellableNow(
      portugal,
      [buy('BTC', '2026-06-10', '0.01'), buy('BTC', '2026-05-10', '0.01')],
      'BTC' as never,
      date('2026-12-01'),
    );
    expect(two.later.map((part) => part.from)).toEqual(['2027-05-10', '2027-06-10']);
  });

  it('warns when a sale takes more units than are past the rule on its date, without blocking it', () => {
    const draft = [{ ...sell('BTC', '2027-04-01', '0.015'), id: '00000000-0000-4000-8000-999999999999' as never }];
    expect(saleWarning(portugal, entries, draft, date('2027-04-01'))).toEqual([
      { sale: draft[0]!.id, coin: 'BTC', sold: '0.015', eligible: '0.01' },
    ]);
    expect(saleWarning(portugal, entries, draft, date('2027-06-10'))).toEqual([]);
    expect(saleWarning(portugal, entries, [{ ...draft[0]!, units: units('0') }], date('2027-04-01'))).toEqual([]);
  });

  it('leaves the entry being edited out of its own warning', () => {
    const existing = sell('BTC', '2027-04-01', '0.01');
    expect(saleWarning(portugal, [...entries, existing], [existing], date('2027-04-01'))).toEqual([]);
    expect(eligibleUnits(portugal, [...entries, existing], 'BTC' as never, date('2027-04-01'))).toBe('0');
  });
});

// docs/DOMAIN.md §3.7: a sale is matched in its own venue's group, so only that group's lots can make it tax-free.
describe('sales per venue', () => {
  const perVenue = { ...DEFAULT_HOLDING_CONTEXT, lotScope: 'per-venue' } as const;
  const at = <T extends { venue: string | null }>(entry: T, venue: string | null): T => ({ ...entry, venue });
  const DRAFT = '00000000-0000-4000-8000-999999999999' as never;
  const draftSale = (quantity: string, venue: string | null) => [
    { ...sell('BTC', '2027-04-01', quantity), id: DRAFT, venue },
  ];
  const kraken = at(buy('BTC', '2026-01-10', '0.01'), 'Kraken');
  const bitvavo = at(buy('BTC', '2026-06-10', '0.01'), 'Bitvavo');

  it('in Portugal, old BTC at Kraken leave the warning on a sale of younger BTC at Bitvavo', () => {
    expect(
      saleWarning(portugal, [kraken, bitvavo], draftSale('0.005', 'Bitvavo'), date('2027-04-01'), perVenue),
    ).toEqual([{ sale: DRAFT, coin: 'BTC', sold: '0.005', eligible: '0' }]);
    expect(
      saleWarning(portugal, [kraken, bitvavo], draftSale('0.005', 'Kraken'), date('2027-04-01'), perVenue),
    ).toEqual([]);
    const btc = 'BTC' as never;
    expect(eligibleUnits(portugal, [kraken, bitvavo], btc, date('2027-04-01'), perVenue, 'Bitvavo')).toBe('0');
    expect(eligibleUnits(portugal, [kraken, bitvavo], btc, date('2027-04-01'), perVenue, 'Kraken')).toBe('0.01');
    expect(eligibleUnits(portugal, [kraken, bitvavo], btc, date('2027-04-01'), perVenue)).toBe('0.01');
  });

  it('counts only the lots without a venue for a sale without one', () => {
    const unnamed = at(buy('BTC', '2026-06-10', '0.01'), null);
    expect(saleWarning(portugal, [kraken, unnamed], draftSale('0.005', null), date('2027-04-01'), perVenue)).toEqual([
      { sale: DRAFT, coin: 'BTC', sold: '0.005', eligible: '0' },
    ]);
  });

  it('in Spain (global), counts every lot whatever the venue', () => {
    const spainContext = { ...DEFAULT_HOLDING_CONTEXT, lotScope: 'global' } as const;
    expect(
      saleWarning(spain, [kraken, bitvavo], draftSale('0.015', 'Bitvavo'), date('2026-07-01'), spainContext),
    ).toEqual([]);
    expect(saleWarning(portugal, [kraken, bitvavo], draftSale('0.005', 'Bitvavo'), date('2027-04-01'))).toEqual([]);
    expect(
      eligibleUnits(portugal, [kraken, bitvavo], 'BTC' as never, date('2027-04-01'), spainContext, 'Bitvavo'),
    ).toBe('0.01');
  });

  // The Log groups sales by kind and date, so one edited row can hold two sales of a coin in one group: the save matches
  // them one after another, and so does the warning.
  describe('a draft with two sales of a coin in one group', () => {
    const owned = at(buy('BTC', '2024-01-10', '1'), 'Kraken');
    const a = at(sell('BTC', '2026-10-20', '0.6'), 'Kraken');
    const b = at(sell('BTC', '2026-10-20', '0.6'), 'Kraken');
    const day = date('2026-10-20');
    const warns = { sale: b.id, coin: 'BTC', sold: '0.6', eligible: '0.4' };

    it('in Portugal (per venue), warns on the second sale at Kraken, after the first takes 0.6 of the 1.0', () => {
      expect(saleWarning(portugal, [owned, a, b], [a, b], day, perVenue)).toEqual([warns]);
    });

    it('under global scope (Spain’s), warns on the second sale whatever its venue', () => {
      const elsewhere = at(b, 'Bitvavo');
      expect(saleWarning(portugal, [owned, a, elsewhere], [a, elsewhere], day)).toEqual([warns]);
      expect(saleWarning(portugal, [owned, a, elsewhere], [a, elsewhere], day, perVenue)).toEqual([
        { sale: b.id, coin: 'BTC', sold: '0.6', eligible: '0' },
      ]);
    });

    // A sale its group cannot cover takes other groups' lots, so the draft's sales are read together, and each warning
    // names its sale: the Bitvavo sale, logged first, takes Ledger's lot past the rule, and the Ledger sale Kraken's.
    it('names the sale each warning is on, two sales of an edit at two venues read together', () => {
      const ledger = at(buy('BTC', '2024-01-01', '1'), 'Ledger');
      const kraken = at(buy('BTC', '2026-03-01', '1'), 'Kraken');
      const sold = (venue: string, moment: string) => ({
        ...at(sell('BTC', '2026-04-01', '1'), venue),
        createdAt: instant(moment),
      });
      const first = sold('Bitvavo', '2026-04-01T09:00:00Z');
      const second = sold('Ledger', '2026-04-01T10:00:00Z');
      const stored = [ledger, kraken, first, second];
      const replaced = [first.id, second.id];
      expect(saleWarning(portugal, stored, [second, first], date('2026-04-01'), perVenue, replaced)).toEqual([
        { sale: second.id, coin: 'BTC', sold: '1', eligible: '0' },
        { sale: first.id, coin: 'BTC', sold: '1', eligible: '0' },
      ]);
    });

    it('a replaced entry no longer uses up the lot', () => {
      expect(saleWarning(portugal, [owned, a, b], [b], day, perVenue, [a.id, b.id])).toEqual([]);
      expect(saleWarning(portugal, [owned, a, b], [a, b], day, perVenue, [a.id, b.id])).toEqual([warns]);
    });

    // The Log lists a row's sales largest amount first; the save matches same-day sales by when each was logged.
    it('matches the sales in the order the save does: an edited sale when it was logged, a new sale after', () => {
      const recent = at(buy('BTC', '2026-09-01', '1'), 'Kraken');
      const logged = (quantity: string, moment: string) => ({
        ...at(sell('BTC', '2026-10-20', quantity), 'Kraken'),
        createdAt: instant(moment),
      });
      const small = logged('0.3', '2026-10-20T08:00:00Z');
      const large = logged('0.9', '2026-10-20T09:00:00Z');
      const stored = [owned, recent, small, large];
      const replaced = [small.id, large.id];
      expect(saleWarning(portugal, stored, [large, small], day, perVenue, replaced)).toEqual([
        { sale: large.id, coin: 'BTC', sold: '0.9', eligible: '0.7' },
      ]);
      // A new sale is stamped at the save, after the sales logged before it.
      const fresh = { ...small, id: '00000000-0000-4000-8000-999999999999' as never, createdAt: instant(NOW) };
      expect(saleWarning(portugal, stored, [fresh, large], day, perVenue, replaced)).toEqual([
        { sale: fresh.id, coin: 'BTC', sold: '0.3', eligible: '0.1' },
      ]);
    });

    it('without the replaced ids, every entry but the draft’s still counts', () => {
      expect(saleWarning(portugal, [owned, a, b], [b], day, perVenue)).toEqual([warns]);
      expect(saleWarning(portugal, [owned, a, b], [b], day, perVenue, [])).toEqual([warns]);
    });

    // An edit with one row cleared: each other row keeps its own entry and the time it was logged (§6), so the warning
    // names the sale the save stores. The rows come largest amount first, not in the order the sales were logged.
    describe('an edit with one row cleared', () => {
      const recent = at(buy('BTC', '2026-09-01', '1'), 'Kraken');
      const logged = (quantity: string, moment: string) => ({
        ...at(sell('BTC', '2026-10-20', quantity), 'Kraken'),
        createdAt: instant(`2026-10-20T${moment}:00Z`),
      });
      const shortfall = (warnings: readonly SaleWarning[]) =>
        warnings.reduce((total, warning) => plus(total, minus(warning.sold, warning.eligible)), '0' as Units);
      const warned = (stored: readonly Entry[], cleared: Entry) => {
        const rows = stored.filter((entry) => entry.kind === 'sell' && entry !== cleared);
        const { taken } = rowEntries(
          rows.map((entry) => ({ coin: entry.coin, entry: entry.id })),
          stored.filter((entry) => entry.kind === 'sell'),
        );
        const draft = rows.map((row, index) => ({ ...row, id: taken[index]?.id ?? row.id }));
        const editing = stored.filter((entry) => entry.kind === 'sell').map((entry) => entry.id);
        return saleWarning(portugal, stored, draft, day, perVenue, editing);
      };

      it('of three sales, warns on the one logged last of the two kept', () => {
        const first = logged('0.6', '10:00');
        const cleared = logged('0.55', '09:00');
        const last = logged('0.5', '11:00');
        const warnings = warned([owned, recent, first, cleared, last], cleared);
        expect(warnings).toEqual([{ sale: last.id, coin: 'BTC', sold: '0.5', eligible: '0.4' }]);
        expect(shortfall(warnings)).toBe('0.1');
      });

      it('of two sales, the first cleared, warns on the second against the whole lot', () => {
        const cleared = logged('0.9', '08:00');
        const kept = logged('1.2', '09:00');
        const warnings = warned([owned, recent, cleared, kept], cleared);
        expect(warnings).toEqual([{ sale: kept.id, coin: 'BTC', sold: '1.2', eligible: '1' }]);
        expect(shortfall(warnings)).toBe('0.2');
      });

      it('of three sales, none cleared, warns on each the matching gives units inside the rule', () => {
        const stored = [owned, recent, logged('0.6', '10:00'), logged('0.55', '09:00'), logged('0.5', '11:00')];
        const sales = stored.filter((entry) => entry.kind === 'sell');
        expect(
          saleWarning(
            portugal,
            stored,
            sales,
            day,
            perVenue,
            sales.map((sale) => sale.id),
          ),
        ).toEqual([
          { sale: sales[0]!.id, coin: 'BTC', sold: '0.6', eligible: '0.45' },
          { sale: sales[2]!.id, coin: 'BTC', sold: '0.5', eligible: '0' },
        ]);
      });
    });

    // Each draft sale gets the units the lot matching gives it, in the one total order of a coin's entries (date, then
    // createdAt, then id), so the warning never depends on the order of the entries or of the draft.
    describe('read from the lot matching', () => {
      const sold = date('2026-11-01');
      const logged = (quantity: string, moment: string) => ({
        ...sell('BTC', '2026-11-01', quantity),
        createdAt: instant(moment),
        updatedAt: instant(moment),
      });

      it('two sales logged at one moment (the prototype import) are matched by id, as lots and runningHeld match them', () => {
        const first = logged('0.1', '2026-11-01T10:00:00Z');
        const second = logged('0.3', '2026-11-01T11:00:00+01:00');
        const stored = [buy('BTC', '2025-01-01', '0.2'), buy('BTC', '2026-10-01', '1'), second, first];
        const replaced = [first.id, second.id];
        const warnings = [{ sale: second.id, coin: 'BTC', sold: '0.3', eligible: '0.1' }];
        expect(saleWarning(portugal, stored, [second, first], sold, DEFAULT_HOLDING_CONTEXT, replaced)).toEqual(
          warnings,
        );
        expect(saleWarning(portugal, stored, [first, second], sold, DEFAULT_HOLDING_CONTEXT, replaced)).toEqual(
          warnings,
        );
        const held = runningHeld(stored, 'BTC' as never).filter(({ entry }) => entry.kind === 'sell');
        expect(held.map(({ entry }) => entry.units)).toEqual(['0.1', '0.3']);
      });

      it('under LIFO, the earlier sale takes the latest lot, so the later one still finds the old lot past the rule', () => {
        const lifo = { ...DEFAULT_HOLDING_CONTEXT, lotRule: 'lifo' } as const;
        const a = logged('1', '2026-11-01T10:00:00Z');
        const b = logged('0.5', '2026-11-01T11:00:00Z');
        const stored = [buy('BTC', '2025-01-01', '1'), buy('BTC', '2026-10-01', '1'), a, b];
        expect(saleWarning(portugal, stored, [a, b], sold, lifo, [a.id, b.id])).toEqual([
          { sale: a.id, coin: 'BTC', sold: '1', eligible: '0' },
        ]);
        expect(saleWarning(portugal, stored, [a, b], sold, DEFAULT_HOLDING_CONTEXT, [a.id, b.id])).toEqual([
          { sale: b.id, coin: 'BTC', sold: '0.5', eligible: '0' },
        ]);
      });

      it('a sale already stored later that day takes its units after the draft’s, and a later-dated sale none of them', () => {
        const draft = logged('0.5', '2026-11-01T10:00:00Z');
        const after = logged('0.5', '2026-11-01T12:00:00Z');
        const later = { ...sell('BTC', '2026-12-01', '0.5') };
        const stored = [buy('BTC', '2025-01-01', '1'), buy('BTC', '2026-10-01', '1'), after, later];
        expect(saleWarning(portugal, stored, [draft], sold)).toEqual([]);
        expect(saleWarning(portugal, stored, [{ ...draft, units: units('1.5') }], sold)).toEqual([
          { sale: draft.id, coin: 'BTC', sold: '1.5', eligible: '1' },
        ]);
      });
    });
  });

  describe('coins added with no recorded cost', () => {
    const noCost = (day: string, quantity: string) =>
      anEntry({ kind: 'held', slot: null, coin: BTC.id, date: date(day), units: units(quantity), amount: null });
    const today = date('2026-07-01');

    it('sellableNow and eligibility count held units with no recorded cost', () => {
      const list = [at(noCost('2025-01-01', '1'), 'Ledger'), buy('BTC', '2026-06-10', '0.01')];
      expect(sellableNow(portugal, list, BTC.id, today, perVenue)).toEqual({
        now: '1',
        later: [{ from: '2027-06-10', units: '0.01' }],
      });
      const result = eligibility(portugal, list, prices('60000', '2000'), today, perVenue);
      expect(result.coins).toEqual([expect.objectContaining({ coin: 'BTC', units: '1.01', eligibleUnits: '1' })]);
      expect(result.share).toBe(result.coins[0]?.fraction);
      // Without a price the share falls back to the amount invested, where a coin held only at no cost weighs 0.
      const unpriced = eligibility(portugal, [noCost('2025-01-01', '1'), buy('ETH', '2026-03-10', '1')], null, today);
      expect(unpriced.coins.map((coin) => [coin.coin, coin.fraction])).toEqual([
        ['BTC', '1'],
        ['ETH', '0'],
      ]);
      expect(unpriced.share).toBe('0');
    });

    it('the sale warning of a later Ledger sale counts only what a Bitvavo sale’s excess left', () => {
      // The Bitvavo sale in June 2025 takes the January lot, the only one held then, so the Ledger lot left in March
      // 2026 is August's, inside the rule.
      const stored = [
        at(noCost('2025-01-01', '1'), 'Ledger'),
        at(sell('BTC', '2025-06-01', '1'), 'Bitvavo'),
        at(buy('BTC', '2025-08-01', '1'), 'Ledger'),
      ];
      const draft = [
        { ...at(sell('BTC', '2026-03-01', '1'), 'Ledger'), id: '00000000-0000-4000-8000-999999999999' as never },
      ];
      const march = date('2026-03-01');
      const warning = [{ sale: draft[0]!.id, coin: 'BTC', sold: '1', eligible: '0' }];
      expect(saleWarning(portugal, stored, draft, march, perVenue)).toEqual(warning);
      expect(saleWarning(portugal, stored, draft, march)).toEqual(warning);
      expect(eligibleUnits(portugal, stored, BTC.id, march, perVenue, 'Ledger')).toBe('0');
    });
  });

  it('sellableNow never counts more than is held after a sale larger than its venue’s lots, oldest lots first', () => {
    // 0.03 bought, 0.015 sold at Bitvavo, which held 0.01: 0.015 are held, but the Kraken lots keep 0.02.
    const entries = [
      kraken,
      at(buy('BTC', '2026-03-10', '0.01'), 'Bitvavo'),
      at(buy('BTC', '2026-06-10', '0.01'), 'Kraken'),
      at(sell('BTC', '2026-12-01', '0.015'), 'Bitvavo'),
    ];
    expect(sellableNow(portugal, entries, 'BTC' as never, date('2027-04-01'), perVenue)).toEqual({
      now: '0.005',
      later: [{ from: '2027-06-10', units: '0.01' }],
    });
    // A plan coin without entries holds 0; a coin outside the plan without entries has no position at all.
    for (const coin of ['ETH', 'SOL']) {
      expect(sellableNow(portugal, entries, coin as never, date('2027-04-01'), perVenue)).toEqual({
        now: '0',
        later: [],
      });
    }
  });
});
