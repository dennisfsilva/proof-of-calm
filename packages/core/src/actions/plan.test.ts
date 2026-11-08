import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { anEntry, aPlan, date, id, instant, money, month } from '../../test/builders';
import { NOTE_MAX_LENGTH } from '../constants';
import { addDays, compareInstants, stampAfter } from '../dates/calendar';
import { slots } from '../plan/slots';
import { slotStatuses } from '../plan/statuses';
import type { CountryRules } from '../schema/country';
import type { Plan } from '../schema/plan';
import {
  changeCountry,
  changePayCurrency,
  endBuying,
  pausePlan,
  resumePlan,
  skipMonth,
  undoEndBuying,
  unskipMonth,
} from './plan';

const plan = aPlan();
const now = instant('2026-05-10T09:00:00+01:00');
// Written last by another tab on a clock five minutes ahead of this one.
const ahead: Plan = { ...plan, updatedAt: instant('2026-05-10T09:05:00+01:00') };
const value = <T>(result: { ok: true; value: T } | { ok: false }) => (result.ok ? result.value : null);
const failure = (result: { ok: true } | { ok: false; error: { code: string } }) =>
  result.ok ? null : result.error.code;

describe('skipMonth (docs/DOMAIN.md §6)', () => {
  const input = { slot: month('2026-03'), note: 'car repair', id: id(), now };

  it('skips an open month with its note, which takes it out of the late months', () => {
    const skipped = value(skipMonth(plan, [], input)) as Plan;
    expect(skipped.skips).toEqual([{ id: input.id, slot: '2026-03', note: 'car repair', createdAt: now }]);
    expect(skipped.updatedAt).toBe(now);
    const march = slotStatuses(skipped, [], date('2026-05-10')).find((slot) => slot.key === '2026-03');
    expect(march?.status).toBe('skipped');
  });

  it('refuses a month the plan does not have, one already bought and one already skipped', () => {
    expect(failure(skipMonth(plan, [], { ...input, slot: month('2027-03') }))).toBe('unknown-slot');
    expect(failure(skipMonth(plan, [anEntry({ slot: month('2026-03') })], input))).toBe('slot-done');
    const skipped = value(skipMonth(plan, [], input)) as Plan;
    expect(failure(skipMonth(skipped, [], { ...input, id: id() }))).toBe('slot-skipped');
  });

  it('refuses a note longer than NOTE_MAX_LENGTH, which the plan could not store, and takes one that long', () => {
    const long = skipMonth(plan, [], { ...input, note: 'x'.repeat(NOTE_MAX_LENGTH + 1) });
    expect(long).toEqual({ ok: false, error: { code: 'note-too-long', max: NOTE_MAX_LENGTH } });
    expect(skipMonth(plan, [], { ...input, note: 'x'.repeat(NOTE_MAX_LENGTH) }).ok).toBe(true);
  });

  it('counts a deleted purchase as not bought', () => {
    const deleted = anEntry({ slot: month('2026-03'), deletedAt: instant('2026-03-02T10:00:00Z') });
    expect(skipMonth(plan, [deleted], input).ok).toBe(true);
  });
});

describe('unskipMonth (docs/DOMAIN.md §6)', () => {
  const later = instant('2026-05-10T09:00:05+01:00');
  const months = slots(plan).map((slot) => slot.key);

  it('property: skip then unskip restores the skips', () => {
    fc.assert(
      fc.property(fc.subarray(months), fc.nat({ max: months.length - 1 }), fc.string(), (taken, pick, note) => {
        const before: Plan = { ...plan, skips: taken.map((slot) => ({ id: id(), slot, note: '', createdAt: now })) };
        const slot = months[pick]!;
        const skipped = skipMonth(before, [], { slot, note, id: id(), now });
        if (!skipped.ok) return;
        const [added] = skipped.value.skips.filter((skip) => !before.skips.includes(skip));
        const undone = unskipMonth(skipped.value, added!.id, later);
        expect(undone.skips).toEqual(before.skips);
        expect(undone.updatedAt).toBe(later);
      }),
    );
  });

  it('leaves the plan unchanged for an id it does not have', () => {
    const skipped = value(skipMonth(plan, [], { slot: month('2026-03'), note: '', id: id(), now })) as Plan;
    expect(unskipMonth(skipped, id(), later)).toBe(skipped);
  });
});

describe('pausePlan (docs/DOMAIN.md §6)', () => {
  const pause = (from: string, until: string | null) => ({
    from: date(from),
    until: until === null ? null : date(until),
    note: '',
    id: id(),
    now,
  });

  it('adds a pause in start order without touching the months already bought', () => {
    const summer = value(pausePlan(plan, pause('2026-07-01', '2026-08-31'))) as Plan;
    const paused = value(pausePlan(summer, pause('2026-03-01', '2026-04-30'))) as Plan;
    expect(paused.pauses.map((entry) => entry.from)).toEqual(['2026-03-01', '2026-07-01']);
    const bought = [anEntry({ slot: month('2026-03') })];
    const statuses = slotStatuses(paused, bought, date('2026-05-10'));
    expect(statuses.slice(2, 5).map((slot) => slot.status)).toEqual(['done', 'paused', 'late']);
  });

  it('wants the end on or after the start, and no overlap with another pause', () => {
    expect(failure(pausePlan(plan, pause('2026-05-01', '2026-04-30')))).toBe('pause-order');
    const open = value(pausePlan(plan, pause('2026-09-01', null))) as Plan;
    expect(failure(pausePlan(open, pause('2026-10-01', '2026-10-31')))).toBe('pauses-overlap');
    expect(failure(pausePlan(open, pause('2026-06-01', null)))).toBe('pauses-overlap');
    const closed = value(pausePlan(plan, pause('2026-03-01', '2026-04-30'))) as Plan;
    expect(failure(pausePlan(closed, pause('2026-04-30', '2026-05-31')))).toBe('pauses-overlap');
    expect(pausePlan(closed, pause('2026-05-01', null)).ok).toBe(true);
  });

  it('refuses a note longer than NOTE_MAX_LENGTH, which the plan could not store, and takes one that long', () => {
    const long = pausePlan(plan, { ...pause('2026-07-01', null), note: 'x'.repeat(NOTE_MAX_LENGTH + 1) });
    expect(long).toEqual({ ok: false, error: { code: 'note-too-long', max: NOTE_MAX_LENGTH } });
    expect(pausePlan(plan, { ...pause('2026-07-01', null), note: 'x'.repeat(NOTE_MAX_LENGTH) }).ok).toBe(true);
  });

  it('refuses once buying ended, as resumePlan does, and gives no new plan', () => {
    const ended = value(endBuying(plan, date('2026-05-10'), now)) as Plan;
    expect(pausePlan(ended, pause('2026-05-10', null))).toEqual({ ok: false, error: { code: 'buying-over' } });
    expect(failure(pausePlan(ended, pause('2026-04-01', '2026-04-30')))).toBe('buying-over');
  });
});

describe('resumePlan (docs/DOMAIN.md §6)', () => {
  const withPause = (from: string, until: string | null): Plan => ({
    ...plan,
    pauses: [{ id: id(), from: date(from), until: until === null ? null : date(until), note: '' }],
  });

  it('ends the pause in effect yesterday, so today’s buy day keeps its date', () => {
    const resumed = value(resumePlan(withPause('2026-03-01', null), date('2026-05-01'), now)) as Plan;
    expect(resumed.pauses[0]?.until).toBe('2026-04-30');
    expect(resumed.updatedAt).toBe(now);
    const may = slotStatuses(resumed, [], date('2026-05-01')).find((slot) => slot.key === '2026-05');
    expect(may?.status).toBe('due');
    const closed = value(resumePlan(withPause('2026-03-01', '2026-06-30'), date('2026-05-10'), now)) as Plan;
    expect(closed.pauses[0]?.until).toBe('2026-05-09');
  });

  it('leaves the plan’s other pauses as they were', () => {
    const earlier = { id: id(), from: date('2026-02-01'), until: date('2026-02-28'), note: 'winter' };
    const open = withPause('2026-04-01', null);
    const resumed = value(resumePlan({ ...open, pauses: [earlier, ...open.pauses] }, date('2026-05-10'), now)) as Plan;
    expect(resumed.pauses.map((pause) => [pause.from, pause.until])).toEqual([
      ['2026-02-01', '2026-02-28'],
      ['2026-04-01', '2026-05-09'],
    ]);
  });

  it('removes a pause that has not yet covered a day before today', () => {
    expect((value(resumePlan(withPause('2026-05-10', null), date('2026-05-10'), now)) as Plan).pauses).toEqual([]);
    expect((value(resumePlan(withPause('2026-09-01', null), date('2026-05-10'), now)) as Plan).pauses).toEqual([]);
  });

  it('has nothing to resume without a pause in effect or one waiting', () => {
    expect(failure(resumePlan(plan, date('2026-05-10'), now))).toBe('not-paused');
    expect(failure(resumePlan(withPause('2026-02-01', '2026-02-28'), date('2026-05-10'), now))).toBe('not-paused');
  });

  it('refuses once buying ended, also on the end day under the open pause it ended in', () => {
    const ended = value(endBuying(withPause('2026-03-01', null), date('2026-05-10'), now)) as Plan;
    expect(failure(resumePlan(ended, date('2026-05-10'), now))).toBe('buying-over');
    expect(failure(resumePlan(ended, date('2026-06-10'), now))).toBe('buying-over');
  });
});

describe('endBuying (docs/DOMAIN.md §6)', () => {
  const window = { opens: date('2027-06-01'), closes: date('2027-08-31'), exitBy: date('2027-12-31') };

  it('makes today the last buy day and keeps the sell window', () => {
    const ended = value(endBuying({ ...plan, sellWindow: window }, date('2026-05-10'), now)) as Plan;
    expect([ended.lastBuy, ended.endedBuyingOn, ended.sellWindow, ended.updatedAt]).toEqual([
      '2026-05-10',
      '2026-05-10',
      window,
      now,
    ]);
  });

  it('keeps a buy day that falls today', () => {
    const ended = value(endBuying(plan, date('2026-05-01'), now)) as Plan;
    expect(slots(ended).at(-1)?.key).toBe('2026-05');
  });

  it('refuses before the first buy, after the last and when already ended', () => {
    expect(failure(endBuying(plan, date('2025-12-31'), now))).toBe('before-first-buy');
    expect(failure(endBuying(plan, date('2026-12-02'), now))).toBe('buying-over');
    expect(failure(endBuying({ ...plan, endedBuyingOn: date('2026-04-01') }, date('2026-05-10'), now))).toBe(
      'buying-over',
    );
  });
});

describe('undoEndBuying (docs/DOMAIN.md §6)', () => {
  const before = { lastBuy: plan.lastBuy, endedOn: date('2026-05-10') };
  const ended = value(endBuying(plan, date('2026-05-10'), now)) as Plan;
  const later = instant('2026-05-10T09:00:05+01:00');

  it('restores the last buy day and clears the end, stamped after the plan', () => {
    const restored = value(undoEndBuying(ended, before, later)) as Plan;
    expect([restored.lastBuy, restored.endedBuyingOn, restored.updatedAt]).toEqual(['2026-12-01', null, later]);
    expect(value(undoEndBuying({ ...ended, updatedAt: instant('2026-05-10T09:05:00+01:00') }, before, later))).toEqual({
      ...ended,
      lastBuy: plan.lastBuy,
      endedBuyingOn: null,
      updatedAt: stampAfter(later, instant('2026-05-10T09:05:00+01:00')),
    });
  });

  it('refuses once another tab moved the last buy day, or the end was already undone', () => {
    expect(failure(undoEndBuying({ ...ended, lastBuy: date('2026-06-01') }, before, later))).toBe('plan-changed');
    expect(failure(undoEndBuying(plan, before, later))).toBe('plan-changed');
    expect(failure(undoEndBuying({ ...ended, endedBuyingOn: date('2026-05-11') }, before, later))).toBe('plan-changed');
  });

  it('refuses when the plan it restores breaks an invariant (a sell window moved since opens early)', () => {
    // Eligible from 2026-05-11 with the end, from 2027-12-02 with the last buy restored.
    const window = { opens: date('2027-06-01'), closes: date('2027-08-31'), exitBy: date('2027-12-31') };
    expect(failure(undoEndBuying({ ...ended, sellWindow: window }, before, later))).toBe('plan-changed');
  });

  it('gives back the plan it ended, apart from the stamp, for any day of the buy phase', () => {
    const days = fc.integer({ min: 0, max: 334 });
    fc.assert(
      fc.property(days, fc.boolean(), (offset, withWindow) => {
        const window = { opens: date('2028-01-01'), closes: date('2028-03-31'), exitBy: date('2028-06-30') };
        const start = withWindow ? { ...plan, sellWindow: window } : plan;
        const today = addDays(start.firstBuy, offset);
        const end = value(endBuying(start, today, now)) as Plan;
        const restored = value(undoEndBuying(end, { lastBuy: start.lastBuy, endedOn: today }, later)) as Plan;
        expect({ ...restored, updatedAt: start.updatedAt }).toEqual(start);
      }),
    );
  });
});

describe('changeCountry (docs/DOMAIN.md §6)', () => {
  const rules = (overrides: Partial<CountryRules>): CountryRules => ({
    code: 'DE',
    name: 'Germany',
    currency: 'EUR',
    locales: ['de-DE'],
    numberFormatLocale: 'de-DE',
    dateFormatLocale: 'de-DE',
    timezones: ['Europe/Berlin'],
    taxYear: { start: '01-01', end: '12-31' },
    computationModel: { kind: 'per-lot' },
    holdingRule: { kind: 'years', years: 1, effect: 'exempt' },
    holdingRuleOverrides: [],
    holdingRuleConditions: [],
    lotRule: 'fifo',
    lotScope: 'per-venue',
    status: {
      version: 3,
      changedOn: date('2026-01-01'),
      changeNotice: null,
      lastReviewed: date('2026-10-01'),
      nextReviewDue: date('2027-10-01'),
    },
    ...overrides,
  });

  it('re-derives the rule, the currency and the rule version, listing what changed for the user to confirm', () => {
    const germany = changeCountry(plan, rules({}), now);
    expect(germany.plan).toEqual({
      ...plan,
      country: 'DE',
      holdingRule: { kind: 'years', years: 1, effect: 'exempt' },
      countryRuleVersion: 3,
      updatedAt: now,
    });
    expect(germany.changes).toEqual([
      { field: 'country', from: 'PT', to: 'DE' },
      {
        field: 'holdingRule',
        from: { kind: 'days', days: 365, effect: 'exempt' },
        to: { kind: 'years', years: 1, effect: 'exempt' },
      },
    ]);
    expect(germany.issues).toEqual([]);
  });

  it('moves amounts from now on to the country’s currency, never converting logged ones', () => {
    const us = changeCountry(
      plan,
      rules({ code: 'US', currency: 'USD', holdingRule: { kind: 'years', years: 1, effect: 'lower-rate' } }),
      now,
    );
    expect(us.plan).toEqual(
      expect.objectContaining({ payCurrency: 'USD', displayCurrency: 'USD', monthlyAmount: '100' }),
    );
    expect(us.changes.map((change) => change.field)).toEqual([
      'country',
      'payCurrency',
      'displayCurrency',
      'holdingRule',
    ]);
  });

  it('says nothing changed when the rule is the same, whatever the order of its fields', () => {
    const same = { effect: 'exempt', days: 365, kind: 'days' } as const;
    expect(changeCountry(plan, rules({ code: 'PT', holdingRule: same }), now).changes).toEqual([]);
  });

  it('reports a sell window that the new rule makes early, for the user to accept or move', () => {
    const window = { opens: date('2027-06-01'), closes: date('2027-08-31'), exitBy: date('2027-12-31') };
    const twoYears = rules({ holdingRule: { kind: 'years', years: 2, effect: 'exempt' } });
    expect(changeCountry({ ...plan, sellWindow: window }, twoYears, now).issues).toEqual([
      'sell-window-before-eligibility',
    ]);
  });

  it('drops an early window’s acceptance under a new rule and keeps it under the same one', () => {
    const accepted = {
      opens: date('2027-06-01'),
      closes: date('2027-08-31'),
      exitBy: date('2027-12-31'),
      acceptedEarlyOpen: true,
    } as const;
    const early = { ...plan, sellWindow: accepted };
    const twoYears = rules({ holdingRule: { kind: 'years', years: 2, effect: 'exempt' } });
    const moved = changeCountry(early, twoYears, now);
    expect(moved.plan.sellWindow).toEqual({ opens: accepted.opens, closes: accepted.closes, exitBy: accepted.exitBy });
    expect(moved.issues).toEqual(['sell-window-before-eligibility']);
    const same = changeCountry(early, rules({ holdingRule: plan.holdingRule }), now);
    expect(same.plan.sellWindow).toBe(accepted);
  });

  it('never changes an amount, a date or anything else it does not re-derive', () => {
    const holdingRule = fc.oneof(
      fc.constant({ kind: 'none' } as const),
      fc.record({
        kind: fc.constant('days' as const),
        days: fc.integer({ min: 1, max: 3650 }),
        effect: fc.constant('exempt' as const),
      }),
      fc.record({
        kind: fc.constant('years' as const),
        years: fc.integer({ min: 1, max: 10 }),
        effect: fc.constantFrom('exempt' as const, 'lower-rate' as const),
      }),
    );
    const amount = fc.stringMatching(/^(0|[1-9]\d{0,6})(\.\d{1,2})?$/).map(money);
    fc.assert(
      fc.property(
        fc.constantFrom('PT', 'DE', 'XX', 'US'),
        fc.constantFrom('EUR', 'USD', 'CHF'),
        holdingRule,
        amount,
        amount,
        (code, currency, rule, monthlyAmount, startingAmount) => {
          const before = { ...plan, monthlyAmount, startingAmount };
          const { plan: after } = changeCountry(before, rules({ code, currency, holdingRule: rule }), now);
          const rederived = [
            'country',
            'payCurrency',
            'displayCurrency',
            'holdingRule',
            'countryRuleVersion',
            'updatedAt',
          ];
          for (const key of Object.keys(before) as (keyof Plan)[]) {
            if (!rederived.includes(key)) expect(after[key]).toEqual(before[key]);
          }
        },
      ),
    );
  });

  it('stamps after the stored plan on a clock behind it (docs/DOMAIN.md §3.15)', () => {
    const stamp = changeCountry(ahead, rules({}), now).plan.updatedAt;
    expect(compareInstants(stamp, ahead.updatedAt)).toBe(1);
    expect(stamp).toBe(stampAfter(now, ahead.updatedAt));
  });
});

describe('changePayCurrency (docs/DOMAIN.md §6)', () => {
  it('changes the currency of amounts from now on and leaves every amount as typed', () => {
    expect(changePayCurrency(plan, 'CHF', now)).toEqual({ ...plan, payCurrency: 'CHF', updatedAt: now });
    expect(changePayCurrency({ ...plan, monthlyAmount: money('80') }, 'EUR', now).updatedAt).toBe(plan.updatedAt);
  });
});

describe('plan actions stamp after the stored plan (docs/DOMAIN.md §3.15)', () => {
  // The plan they get is the stored one; on a clock behind its stamp the write is still strictly later.
  const withSkipAndPause: Plan = {
    ...ahead,
    skips: [{ id: id(), slot: month('2026-02'), note: '', createdAt: now }],
    pauses: [{ id: id(), from: date('2026-04-01'), until: null, note: '' }],
  };
  const writes: [string, () => Plan | null][] = [
    ['skipMonth', () => value(skipMonth(ahead, [], { slot: month('2026-03'), note: '', id: id(), now }))],
    ['unskipMonth', () => unskipMonth(withSkipAndPause, withSkipAndPause.skips[0]?.id ?? id(), now)],
    ['pausePlan', () => value(pausePlan(ahead, { from: date('2026-06-01'), until: null, note: '', id: id(), now }))],
    ['resumePlan', () => value(resumePlan(withSkipAndPause, date('2026-05-10'), now))],
    ['endBuying', () => value(endBuying(ahead, date('2026-05-10'), now))],
    [
      'undoEndBuying',
      () =>
        value(
          undoEndBuying(
            { ...ahead, lastBuy: date('2026-05-10'), endedBuyingOn: date('2026-05-10') },
            { lastBuy: ahead.lastBuy, endedOn: date('2026-05-10') },
            now,
          ),
        ),
    ],
    ['changePayCurrency', () => changePayCurrency(ahead, 'CHF', now)],
  ];

  it.each(writes)('%s stamps one millisecond after the stored plan', (_, write) => {
    const next = write();
    expect(next).not.toBeNull();
    const stamp = next?.updatedAt ?? now;
    expect(compareInstants(stamp, ahead.updatedAt)).toBe(1);
    expect(stamp).toBe(stampAfter(now, ahead.updatedAt));
  });
});
