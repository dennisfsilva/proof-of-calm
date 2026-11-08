import { DEFAULT_HOLDING_CONTEXT, type HoldingContext, type SaleWarning, saleWarning } from '@proofofcalm/core';
import { anEntry, aPlan, date, instant, units } from '@proofofcalm/core/testing';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { namedWarnings } from './warning';

// DOMAIN §3.7: the save matches every sale of an edit together, a sale its venue cannot cover taking other venues' lots,
// so the entry form's warning reads the draft's sales in one `saleWarning` call, whatever venues they name.

const plan = aPlan();
const perVenue: HoldingContext = { ...DEFAULT_HOLDING_CONTEXT, lotScope: 'per-venue' };
const day = date('2026-10-20');
const VENUES = ['Kraken', 'Bitvavo', 'Ledger', null];
const QUANTITIES = ['0.2', '0.5', '1'];
const venue = fc.constantFrom(...VENUES);
const quantity = fc.constantFrom(...QUANTITIES);
const buys = fc.array(fc.record({ on: fc.constantFrom('2024-01-10', '2025-06-10', '2026-09-01'), quantity, venue }), {
  minLength: 1,
  maxLength: 5,
});
const sales = fc.array(fc.record({ quantity, venue }), { minLength: 2, maxLength: 3 });
const figures = (warnings: readonly SaleWarning[]) =>
  warnings.map(({ coin, sold, eligible }) => ({ coin, sold, eligible }));

describe('namedWarnings (property)', () => {
  it('under per-venue lots, gives the coins, units sold and units past the rule of one read of the whole draft', () => {
    fc.assert(
      fc.property(buys, sales, (bought, sold) => {
        const lots = bought.map(({ on, quantity, venue }) =>
          anEntry({ kind: 'extra', date: date(on), slot: null, units: units(quantity), venue }),
        );
        const edited = sold.map(({ quantity, venue }, at) =>
          anEntry({
            kind: 'sell',
            date: day,
            slot: null,
            units: units(quantity),
            venue,
            createdAt: instant(`2026-10-20T0${at}:00:00Z`),
          }),
        );
        const draft = edited.map(({ id, coin, units, venue, createdAt }) => ({ id, coin, units, venue, createdAt }));
        const entries = [...lots, ...edited];
        const replaced = edited.map((sale) => sale.id);
        expect(figures(namedWarnings(plan, entries, draft, day, perVenue, replaced))).toEqual(
          figures(saleWarning(plan, entries, draft, day, perVenue, replaced)),
        );
      }),
    );
  });
});
