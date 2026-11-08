// The Portuguese tax-year fixture (docs/DOMAIN.md §3.13), derived by hand: FIFO per venue, 365 days. Each row of
// pt-2026.csv and pt-2027.csv is worked out in the comments below, not by running the code.
//
// BTC, matched per venue in one global order (date, purchases before sales):
// - L2 extra 2025-08-01 Ledger 0.3 for 10000, fee 10 (past the rule from 2026-08-01)
// - B1 dca 2025-10-01 Bitvavo 0.05 for 3000, fee 1.5 (from 2026-10-01)
// - H1 held 2026-01-10, no venue, 0.02 with no recorded cost (from 2027-01-10)
// - H2 held 2026-02-01 Ledger 0.01 at cost 0 (from 2027-02-01)
// - S1 sell 2026-03-01 Bitvavo 0.15 for 9000, fee 4.5: B1's 0.05, then 0.1 of the Ledger lot L2 (cross-venue)
// - S2 sell 2026-06-01 Ledger 0.1 for 7000, fee 3.5: 0.1 of L2, before L2 passes the rule
// - S3 sell 2027-03-01 Ledger 0.05 for 4000, fee 2: 0.05 of L2, after the 2026 year end
// L2 is consumed 0.1, 0.1, 0.05, then holds 0.05: running costs 3333.33, 6666.67, 8333.33, 10000 and fees 3.33,
// 6.67, 8.33, 10, so its pieces cost 3333.33, 3333.34, 1666.66, 1666.67 with fees 3.33, 3.34, 1.66, 1.67; in the
// 2026 file it holds 0.1 at 3333.33 and 3.33, the sum of its two 2027 pieces.
// S1's 9000 and 4.5 go 3000 and 1.50 to B1's piece, 6000 and 3.00 to L2's.
//
// ETH:
// - U1 sell 2026-02-15, imported, 0.02 for 50, fee 0.5: no lot dated on or before it, so all 0.02 are unmatched
// - T1 dca 2026-04-01 one tap 0.05 for 30, no fee (from 2027-04-01): later than U1, so it holds all 0.05
import type { CountryRules } from '../../src/schema/country';
import type { Entry } from '../../src/schema/entry';
import type { Plan } from '../../src/schema/plan';
import { anEntry, aPlan, BTC, date, ETH, instant, money, month, units } from '../builders';
import { FIXTURE_RULES } from '../country-change/fixture';

export const PT_RULES: CountryRules = FIXTURE_RULES.PT;
export const PT_PLAN: Plan = aPlan({ coins: [BTC, ETH], holdingRule: PT_RULES.holdingRule });

const at = (day: string) => instant(`${day}T09:00:00+00:00`);
const purchase = (kind: Entry['kind'], day: string, coin: Entry['coin'], fields: Partial<Entry>): Entry =>
  anEntry({
    kind,
    date: date(day),
    coin,
    slot: kind === 'dca' ? month(day.slice(0, 7)) : null,
    createdAt: at(day),
    ...fields,
  });
const sale = (day: string, coin: Entry['coin'], fields: Partial<Entry>): Entry =>
  anEntry({ kind: 'sell', date: date(day), coin, slot: null, createdAt: at(day), ...fields });

export const PT_ENTRIES: readonly Entry[] = [
  purchase('extra', '2025-08-01', BTC.id, {
    venue: 'Ledger',
    units: units('0.3'),
    amount: money('10000'),
    fee: money('10'),
  }),
  purchase('dca', '2025-10-01', BTC.id, {
    venue: 'Bitvavo',
    units: units('0.05'),
    amount: money('3000'),
    fee: money('1.5'),
  }),
  purchase('held', '2026-01-10', BTC.id, { units: units('0.02'), amount: null }),
  purchase('held', '2026-02-01', BTC.id, { venue: 'Ledger', units: units('0.01'), amount: money('0') }),
  sale('2026-03-01', BTC.id, { venue: 'Bitvavo', units: units('0.15'), amount: money('9000'), fee: money('4.5') }),
  sale('2026-06-01', BTC.id, { venue: 'Ledger', units: units('0.1'), amount: money('7000'), fee: money('3.5') }),
  sale('2027-03-01', BTC.id, { venue: 'Ledger', units: units('0.05'), amount: money('4000'), fee: money('2') }),
  sale('2026-02-15', ETH.id, { units: units('0.02'), amount: money('50'), fee: money('0.5'), source: 'import-json' }),
  purchase('dca', '2026-04-01', ETH.id, { units: units('0.05'), amount: money('30'), source: 'one-tap' }),
];

/** The header lines the shell would pass; their wording is not the core's. */
export const PT_HEADER = ['Header line one', '=a second line'];
