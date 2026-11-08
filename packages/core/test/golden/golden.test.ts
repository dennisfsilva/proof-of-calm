// Golden tests (docs/DOMAIN.md §7): each fixture holds a prototype state and what the prototype's own
// functions returned for it on a fixed day (tools/golden). The core imports the state and must agree:
// money at 2 dp, units at 8 dp, dates and statuses exactly. Regenerate with `node tools/golden/generate.ts`.
import { describe, expect, it } from 'vitest';
import type { CalendarDate, Instant } from '../../src/dates/calendar';
import { importPrototype } from '../../src/import/prototype';
import { transactions } from '../../src/log/transactions';
import { abs, compare, type Decimal, fromFloat, minus } from '../../src/money/decimal';
import { leadAction, phase } from '../../src/plan/phase';
import { actionsNow, slotStatuses } from '../../src/plan/statuses';
import { planTotals } from '../../src/plan/totals';
import { sellTranches } from '../../src/plan/tranches';
import { eligibility } from '../../src/portfolio/eligibility';
import { portfolio } from '../../src/portfolio/portfolio';
import type { EntityId } from '../../src/schema/ids';
import type { PriceSnapshot } from '../../src/schema/prices';
import cyclePlan from './cycle-plan.json';
import lateInSell from './late-in-sell.json';
import sellWindow from './sell-window.json';
import twoCoins from './two-coins.json';

type Amount = number | null;
type Outputs = {
  slots: { key: string; due: string; done: boolean; late: boolean }[];
  actions: { type: string; slot: string | null; due: string; eur: number; late: boolean; done: boolean }[];
  phase: string;
  totals: { initial: number; dca: number; n: number; total: number };
  portfolio: {
    per: {
      id: string;
      units: number;
      bought: number;
      sold: number;
      invested: number;
      proceeds: number;
      fees: number;
      price: Amount;
      value: Amount;
      avg: Amount;
      pnl: Amount;
      pnlPct: Amount;
      buys: number;
      sells: number;
    }[];
    invested: number;
    proceeds: number;
    value: Amount;
    pnl: Amount;
    pnlPct: Amount;
    fees: number;
    buys: number;
    sells: number;
    priced: boolean;
  };
  eligibility: { share: Amount; allBy: string | null };
  transactions: {
    key: string;
    kind: string;
    date: string;
    total: number;
    fees: number;
    elig: string | null;
    items: { coin: string; eur: number; units: number }[];
  }[];
  tranches: { k: string; when: string | null }[];
};
type Fixture = { name: string; today: string; prices: Record<string, string>; state: unknown; prototype: Outputs };

const FIXTURES = [twoCoins, cyclePlan, sellWindow, lateInSell] as unknown as Fixture[];

/** Agreement at `dp` places: within half a unit of the last place, whatever the prototype's float noise. */
function agrees(core: Decimal | null, prototype: Amount, dp: number): boolean {
  if (core === null || prototype === null) return core === null && prototype === null;
  const half = `0.${'0'.repeat(dp)}5` as Decimal;
  return compare(abs(minus(core, fromFloat(prototype, 12))), half) <= 0;
}

function expectAgreement(label: string, core: Decimal | null, prototype: Amount, dp: number) {
  expect(agrees(core, prototype, dp), `${label}: core ${core}, prototype ${prototype}`).toBe(true);
}

describe.each(FIXTURES)('golden: $name', (fixture) => {
  const today = fixture.today as CalendarDate;
  const now = `${today}T12:00:00Z` as Instant;
  const imported = importPrototype(fixture.state, {
    planId: 'p0golden' as EntityId,
    country: 'PT',
    countryRuleVersion: 1,
    ids: [],
    now,
    today,
  });
  if (!imported.ok) throw new Error(`${fixture.name} did not import: ${JSON.stringify(imported.error)}`);
  const { plan, entries, report } = imported.value;
  const prices = {
    at: now,
    prices: Object.fromEntries(Object.entries(fixture.prices).map(([coin, price]) => [coin, { EUR: price }])),
  } as unknown as PriceSnapshot;
  const expected = fixture.prototype;

  it('imports without adjustments', () => {
    expect(report).toEqual([]);
  });

  it('has the same slots, statuses, actions and phase', () => {
    const statuses = slotStatuses(plan, entries, today).map((slot) => ({
      key: slot.key,
      due: slot.due,
      done: slot.status === 'done',
      late: slot.status === 'late',
    }));
    expect(statuses).toEqual(expected.slots);
    const actions = actionsNow(plan, entries, today);
    expect(
      actions.map((action) => ({
        type: action.kind,
        slot: action.slot,
        due: action.due,
        late: action.status === 'late',
        done: action.status === 'done',
      })),
    ).toEqual(expected.actions.map(({ eur: _, ...action }) => action));
    actions.forEach((action, index) => {
      expectAgreement(`action ${index}`, action.plannedAmount, expected.actions[index]?.eur ?? null, 2);
    });
    expect(phase(plan, today).kind).toBe(expected.phase);
  });

  it('leads Today with the same action (§3.3)', () => {
    // heroMain in DCA-Plan.html: the first action not done leads before and during the buying phase;
    // the hold, sell and later phases lead with the phase itself.
    const buying = expected.phase === 'before' || expected.phase === 'buy';
    const theirs = buying ? (expected.actions.find((action) => !action.done) ?? null) : null;
    const ours = leadAction(actionsNow(plan, entries, today), phase(plan, today));
    expect(ours === null ? null : { type: ours.kind, slot: ours.slot, due: ours.due }).toEqual(
      theirs === null ? null : { type: theirs.type, slot: theirs.slot, due: theirs.due },
    );
  });

  it('has the same plan totals', () => {
    const totals = planTotals(plan, entries, today);
    expect(totals.activeSlots).toBe(expected.totals.n);
    expectAgreement('starting', totals.plannedStarting, expected.totals.initial, 2);
    expectAgreement('monthly total', totals.plannedDca, expected.totals.dca, 2);
    expectAgreement('total', totals.plannedTotal, expected.totals.total, 2);
  });

  it('has the same portfolio, per coin and in total', () => {
    const result = portfolio(plan, entries, prices);
    expect(result.positions.map((position) => position.coin)).toEqual(expected.portfolio.per.map((coin) => coin.id));
    result.positions.forEach((position, index) => {
      const coin = expected.portfolio.per[index];
      if (coin === undefined) throw new Error('missing coin');
      for (const [name, core, theirs] of [
        ['units', position.units, coin.units],
        ['bought', position.boughtUnits, coin.bought],
        ['sold', position.soldUnits, coin.sold],
      ] as const) {
        expectAgreement(`${coin.id} ${name}`, core, theirs, 8);
      }
      for (const [name, core, theirs] of [
        ['invested', position.invested, coin.invested],
        ['proceeds', position.proceeds, coin.proceeds],
        ['fees', position.fees, coin.fees],
        ['price', position.price, coin.price],
        ['value', position.value, coin.value],
        ['average', position.average, coin.avg],
        ['pnl', position.pnl, coin.pnl],
        ['pnl %', position.pnlPct, coin.pnlPct],
      ] as const) {
        expectAgreement(`${coin.id} ${name}`, core, theirs, 2);
      }
      expect([position.buys, position.sells]).toEqual([coin.buys, coin.sells]);
    });
    for (const [name, core, theirs] of [
      ['invested', result.invested, expected.portfolio.invested],
      ['proceeds', result.proceeds, expected.portfolio.proceeds],
      ['fees', result.fees, expected.portfolio.fees],
      ['value', result.value, expected.portfolio.value],
      ['pnl', result.pnl, expected.portfolio.pnl],
      ['pnl %', result.pnlPct, expected.portfolio.pnlPct],
    ] as const) {
      expectAgreement(`portfolio ${name}`, core, theirs, 2);
    }
    expect([result.buys, result.sells, result.priced]).toEqual([
      expected.portfolio.buys,
      expected.portfolio.sells,
      expected.portfolio.priced,
    ]);
  });

  it('has the same holding eligibility', () => {
    const result = eligibility(plan, entries, prices, today);
    expectAgreement('share', result.share, expected.eligibility.share, 8);
    expect(result.allEligibleBy).toBe(expected.eligibility.allBy);
  });

  it('has the same Log transactions, in the same order', () => {
    const rows = transactions(plan, entries).rows.flatMap((row) => (row.type === 'transaction' ? [row] : []));
    expect(
      rows.map((row) => ({
        key: row.key,
        kind: row.kind,
        date: row.date,
        elig: row.holding?.kind === 'dated' ? row.holding.from : null,
        items: row.items.map((item) => item.coin),
      })),
    ).toEqual(
      expected.transactions.map((tx) => ({
        key: tx.key,
        kind: tx.kind,
        date: tx.date,
        elig: tx.elig,
        items: tx.items.map((item) => item.coin),
      })),
    );
    rows.forEach((row, index) => {
      const tx = expected.transactions[index];
      if (tx === undefined) throw new Error('missing transaction');
      expectAgreement(`${row.key} total`, row.total, tx.total, 2);
      expectAgreement(`${row.key} fees`, row.fees, tx.fees, 2);
      row.items.forEach((item, position) => {
        expectAgreement(`${row.key} ${item.coin} amount`, item.amount, tx.items[position]?.eur ?? null, 2);
        expectAgreement(`${row.key} ${item.coin} units`, item.units, tx.items[position]?.units ?? null, 8);
      });
    });
  });

  it('has the same sell tranches', () => {
    const months = sellTranches(plan).map((tranche) => tranche.month);
    const theirs = expected.tranches.flatMap((tranche) => (tranche.when === null ? [] : [tranche.when.slice(0, 7)]));
    expect(months).toEqual(theirs);
  });
});
