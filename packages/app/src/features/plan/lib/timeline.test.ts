import { countryRules, loadProfile } from '@proofofcalm/content';
import type { CalendarDate, CountryRules, Plan } from '@proofofcalm/core';
import { createTranslator } from 'use-intl/core';
import { beforeAll, describe, expect, it } from 'vitest';
import { createFormatters } from '../../../lib/format';
import { FIXTURE_DATES, fixtureSnapshot } from '../../../lib/services/fixtures';
import plan from '../messages/en.json';
import { planSummary, planTimeline } from './timeline';

// The fixture plan (Portugal, 365 days, lastBuy 5 Mar 2027, window Sep 2029 to Aug 2030, out by
// 31 Dec 2030) at the two dates it is meant to be seen at, and the same plan under no holding rule.

let portugal: CountryRules;
beforeAll(async () => {
  const profile = await loadProfile('PT');
  if (profile === null) throw new Error('the Portugal profile is missing');
  portugal = countryRules(profile);
});

const fmt = {
  f: createFormatters('en-GB', 'en-GB'),
  t: createTranslator({ locale: 'en', messages: { plan }, namespace: 'plan' }),
};
const { plan: fixturePlan, entries } = fixtureSnapshot();
const thePlan = fixturePlan as Plan;
const today = (phase: keyof typeof FIXTURE_DATES) => FIXTURE_DATES[phase] as CalendarDate;
const ids = (milestones: readonly { id: string }[]) => milestones.map((milestone) => milestone.id);
/** A date as the timeline writes it: no line break inside it, so its spaces are no-break spaces. */
const kept = (date: string) => date.replaceAll(' ', ' ');

describe('planTimeline on the fixture', () => {
  it('in the buy phase: four phases, today after the first buy, the holding date from the last buy', () => {
    const timeline = planTimeline(thePlan, entries, today('buy'), portugal, fmt);
    expect(timeline.phases.map((phase) => phase.kind)).toEqual(['buy', 'hold', 'sell', 'exit']);
    expect(timeline.phases[1]?.detail).toBe(`Tax-free from ${kept('4\u00a0Mar\u00a02028')}`);
    expect(timeline.phases[1]?.marks).toEqual([{ at: expect.any(Number), done: false }]);
    expect(ids(timeline.milestones)).toEqual(['first', 'today', 'last', 'free', 'part1', 'part2', 'part3', 'out']);
    expect(timeline.milestones.map((milestone) => milestone.when)).toEqual([
      'past',
      'today',
      'future',
      'future',
      'future',
      'future',
      'future',
      'future',
    ]);
    expect(timeline.today).not.toBeNull();
    expect(timeline.elapsed).toBeGreaterThan(0);
    expect(timeline.elapsed).toBe(timeline.today);
    expect(timeline.todayLabel).toBe(`Today, ${kept('20\u00a0Oct\u00a02026')}`);
    expect(timeline.label).toBe(
      `Plan from ${kept('5\u00a0Apr\u00a02026')} to ${kept('31\u00a0Dec\u00a02030')}. Today, ${kept('20\u00a0Oct\u00a02026')}, is in the buy phase.`,
    );
    expect(timeline.table.rows).toEqual(timeline.milestones.map((milestone) => [milestone.date, milestone.label]));
  });

  it("states the holding milestone's date once: the date in its column, a label without it", () => {
    const timeline = planTimeline(thePlan, entries, today('buy'), portugal, fmt);
    const free = timeline.milestones.find((milestone) => milestone.id === 'free');
    expect(free).toEqual(expect.objectContaining({ date: kept('4\u00a0Mar\u00a02028'), label: 'Last buy tax-free' }));
    expect(timeline.table.rows).toContainEqual([kept('4\u00a0Mar\u00a02028'), 'Last buy tax-free']);
    const lower: Plan = { ...thePlan, holdingRule: { kind: 'days', days: 365, effect: 'lower-rate' } };
    const longTerm = planTimeline(lower, entries, today('buy'), portugal, fmt);
    expect(longTerm.milestones.find((milestone) => milestone.id === 'free')?.label).toBe(
      'Last buy at the long-term rate',
    );
    expect(longTerm.phases[1]?.detail).toBe(`Long-term rate from ${kept('4\u00a0Mar\u00a02028')}`);
  });

  it('keeps each date on one line, while a range still breaks around its "to"', () => {
    const timeline = planTimeline(thePlan, entries, today('buy'), portugal, fmt);
    expect(timeline.phases[0]?.detail).toBe(`${kept('5\u00a0Apr\u00a02026')} to ${kept('5\u00a0Mar\u00a02027')}`);
    expect(timeline.milestones.find((milestone) => milestone.id === 'part1')?.date).toBe(kept('September\u00a02029'));
    expect(timeline.axis).toEqual({ start: kept('5\u00a0Apr\u00a02026'), end: kept('31\u00a0Dec\u00a02030') });
  });

  it('in the sell window: the first two parts behind today, the last part and the exit ahead', () => {
    const timeline = planTimeline(thePlan, entries, today('sell'), portugal, fmt);
    expect(ids(timeline.milestones)).toEqual(['first', 'last', 'free', 'part1', 'part2', 'today', 'part3', 'out']);
    expect(timeline.milestones.find((milestone) => milestone.id === 'part2')?.date).toBe(kept('November\u00a02029'));
    expect(timeline.phases[1]?.marks).toEqual([{ at: expect.any(Number), done: true }]);
    expect(timeline.phases[2]?.marks).toHaveLength(3);
    // The sell parts in the plan's own words, never as orders (docs/LEGAL.md §3.5).
    expect(timeline.phases[2]?.label).toBe('Selling');
    expect(timeline.milestones.filter((milestone) => milestone.id.startsWith('part')).map((m) => m.label)).toEqual([
      'Part 1 of 3: a third of your holding',
      'Part 2 of 3: a third of your holding',
      'Part 3 of 3: the rest of your holding',
    ]);
    expect(timeline.label).toContain('is in the sell window.');
  });

  it('shows no holding milestone and no holding date under the `none` rule', () => {
    const none: Plan = { ...thePlan, holdingRule: { kind: 'none' } };
    const timeline = planTimeline(none, entries, today('buy'), null, fmt);
    expect(ids(timeline.milestones)).not.toContain('free');
    expect(timeline.phases[1]?.detail).toBe(`${kept('5\u00a0Mar\u00a02027')} to ${kept('1\u00a0Sept\u00a02029')}`);
    expect(timeline.phases[1]?.marks).toBeUndefined();
  });

  // The phases are nouns, never an imperative about buying or holding (docs/LEGAL.md §6).
  it('names the phases as nouns', () => {
    const timeline = planTimeline(thePlan, entries, today('buy'), portugal, fmt);
    expect(timeline.phases.map((phase) => phase.label)).toEqual(['Buying', 'Holding', 'Selling', 'Out by']);
  });

  // An open-ended hold has no end date: the axis and the chart's name never give one the plan does not hold.
  it('without a sell window, ends the axis on No end set and the name with no end set', () => {
    const open: Plan = { ...thePlan, sellWindow: null };
    const buying = planTimeline(open, entries, today('buy'), portugal, fmt);
    expect(buying.axis).toEqual({ start: kept('5 Apr 2026'), end: 'No end set' });
    expect(buying.label).toBe(
      `Plan from ${kept('5 Apr 2026')}, with no end set. Today, ${kept('20 Oct 2026')}, is in the buy phase.`,
    );
    const before = planTimeline(open, entries, '2026-01-01' as CalendarDate, portugal, fmt);
    expect(before.label).toBe(`Plan from ${kept('5 Apr 2026')}, with no end set.`);
  });

  it('draws the references as rows and milestones when the plan sets them', () => {
    const referenced: Plan = {
      ...thePlan,
      templateId: 'cycle-plan',
      references: { halving: '2028-04-15', peakFrom: '2029-09-01', peakTo: '2029-10-31' } as Plan['references'],
    };
    const timeline = planTimeline(referenced, entries, today('buy'), portugal, fmt);
    expect(timeline.references?.map((reference) => [reference.id, reference.detail])).toEqual([
      ['halving', `Around ${kept('April\u00a02028')}`],
      ['peak', `${kept('1\u00a0Sept\u00a02029')} to ${kept('31\u00a0Oct\u00a02029')}`],
    ]);
    expect(timeline.references?.map((reference) => reference.label)).toEqual([
      'Halving',
      'Cycle high the template assumes',
    ]);
    expect(ids(timeline.milestones)).toEqual(expect.arrayContaining(['halving', 'peak']));
  });

  // A file from the DCA plan page carries its own peak dates with no template (docs/DOMAIN.md \u00a73.13).
  it('names the cycle high as the DCA plan page\u2019s when no template set it', () => {
    const imported: Plan = {
      ...thePlan,
      templateId: null,
      references: { peakFrom: '2029-09-01', peakTo: '2029-10-31' } as Plan['references'],
    };
    const timeline = planTimeline(imported, entries, today('buy'), portugal, fmt);
    expect(timeline.references?.map((reference) => reference.label)).toEqual(['Cycle high the DCA plan page assumes']);
  });
});

describe('planSummary on the fixture', () => {
  it('states the plan in its own words, and the reason only when one is set', () => {
    const summary = planSummary(thePlan, entries, today('buy'), portugal, fmt);
    expect(summary.reference).toEqual([
      'Your plan buys until 5\u00a0Mar\u00a02027, holds, then sells in three parts between 1\u00a0Sept\u00a02029 and 31\u00a0Aug\u00a02030, out by 31\u00a0Dec\u00a02030.',
      '€1,000.00 to start, then €100.00 a month on day 5: BTC 70%, ETH 30%.',
    ]);
    expect(summary.why).toBeNull();
    const why = planSummary(
      { ...thePlan, why: 'I buy on the 5th and look at nothing else.' },
      entries,
      today('buy'),
      portugal,
      fmt,
    );
    expect(why.why).toBe('In your words: I buy on the 5th and look at nothing else.');
  });

  it('gives the totals line and the sellable lines only in the sell phase', () => {
    const buying = planSummary(thePlan, entries, today('buy'), portugal, fmt);
    expect(buying.totals).toBe('€1,700.00 of €2,100.00 invested so far (81%). Buys left: 6.');
    expect(buying.sellable).toEqual([]);
    expect(buying.holdingNote).toBe(true);
    const selling = planSummary(thePlan, entries, today('sell'), portugal, fmt);
    // The units formatter puts a no-break space before the code.
    expect(selling.sellable).toEqual(['0.02215000 BTC sellable now', '0.119000 ETH sellable now']);
  });

  it('drops "Buys left" from the totals line once the sell window opens', () => {
    const selling = planSummary(thePlan, entries, today('sell'), portugal, fmt);
    expect(selling.totals).toMatch(/^€[\d,.]+ of €2,100\.00 invested \(\d+(\.\d)?%\)\.$/);
  });

  it('gives the share bought with no decimals over 10 % and one decimal at or below (docs/DESIGN.md §5)', () => {
    // One buy of €157.50 against the €2,100.00 the plan sets: 7.5 %.
    const first = entries.find((entry) => entry.kind === 'dca');
    if (first === undefined) throw new Error('the fixture has no monthly buy');
    const small = planSummary(
      thePlan,
      [{ ...first, amount: '157.5' as typeof first.amount }],
      today('buy'),
      portugal,
      fmt,
    );
    expect(small.totals).toContain('€157.50 of €2,100.00 invested so far (7.5%).');
  });

  // C1: after End buying the planned total is no longer the plan's, so the line drops the share and Buys left.
  it('says when buying ended, with no share and no Buys left, in the buy and the sell phase', () => {
    const ended: Plan = {
      ...thePlan,
      lastBuy: '2026-10-15' as CalendarDate,
      endedBuyingOn: '2026-10-15' as CalendarDate,
    };
    const buying = planSummary(ended, entries, today('buy'), portugal, fmt);
    expect(buying.totals).toBe(`€1,700.00 invested. Buying ended on ${kept('15 Oct 2026')}.`);
    const selling = planSummary(ended, entries, today('sell'), portugal, fmt);
    expect(selling.totals).toMatch(/^€[\d,.]+ invested\. Buying ended on 15 Oct 2026\.$/);
  });

  it('leaves an extra buy dated before the first buy day out of the totals line', () => {
    const extra = entries.find((entry) => entry.kind === 'extra');
    if (extra === undefined) throw new Error('the fixture has no extra buy');
    const held = [
      ...entries,
      {
        ...extra,
        id: '00000000-0000-4000-8000-000000000999' as typeof extra.id,
        date: '2025-05-01' as CalendarDate,
        amount: '5000' as typeof extra.amount,
      },
    ];
    const buying = planSummary(thePlan, held, today('buy'), portugal, fmt);
    expect(buying.totals).toBe('€1,700.00 of €2,100.00 invested so far (81%). Buys left: 6.');
    const ended: Plan = {
      ...thePlan,
      lastBuy: '2026-10-15' as CalendarDate,
      endedBuyingOn: '2026-10-15' as CalendarDate,
    };
    const endedSummary = planSummary(ended, held, today('buy'), portugal, fmt);
    expect(endedSummary.totals).toBe(`€1,700.00 invested. Buying ended on ${kept('15 Oct 2026')}.`);
  });

  describe('the line under the totals for extra buys dated before the first buy day', () => {
    const extra = entries.find((entry) => entry.kind === 'extra');
    if (extra === undefined) throw new Error('the fixture has no extra buy');
    const early = (n: number, date: string, deletedAt: string | null = null) => ({
      ...extra,
      id: `00000000-0000-4000-8000-00000000099${n}` as typeof extra.id,
      date: date as CalendarDate,
      deletedAt: deletedAt as typeof extra.deletedAt,
    });
    const one = `1 extra buy dated before the first buy day, ${kept('5 Apr 2026')}, is not in the amount invested above. Portfolio's Invested counts it.`;
    const many = `2 extra buys dated before the first buy day, ${kept('5 Apr 2026')}, are not in the amount invested above. Portfolio's Invested counts them.`;

    it('names one extra buy, and more than one, dated before the first buy day', () => {
      const single = planSummary(thePlan, [...entries, early(1, '2026-03-15')], today('buy'), portugal, fmt);
      expect(single.beforeFirstBuy).toBe(one);
      const plural = [...entries, early(1, '2026-03-15'), early(2, '2025-05-01')];
      expect(planSummary(thePlan, plural, today('buy'), portugal, fmt).beforeFirstBuy).toBe(many);
    });

    // A count in copy is a figure in the country's number format, never ICU's `#` (docs/CONTENT-STYLE.md §4).
    it("gives the count of more than one as a figure in the country's number format", () => {
      const many = Array.from({ length: 1234 }, (_, n) => ({
        ...early(0, '2026-03-15'),
        id: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}` as typeof extra.id,
      }));
      const held = [...entries, ...many];
      const english = planSummary(thePlan, held, today('buy'), portugal, fmt).beforeFirstBuy;
      expect(english).toMatch(/^1,234 extra buys dated before the first buy day, /);
      const german = { ...fmt, f: createFormatters('de-DE', 'en-GB') };
      expect(planSummary(thePlan, held, today('buy'), portugal, german).beforeFirstBuy).toMatch(/^1\.234 extra buys /);
    });

    it('has no line when every extra buy is on or after the first buy day, or the early one is deleted', () => {
      expect(planSummary(thePlan, entries, today('buy'), portugal, fmt).beforeFirstBuy).toBeNull();
      const onTheDay = [...entries, early(1, '2026-04-05')];
      expect(planSummary(thePlan, onTheDay, today('buy'), portugal, fmt).beforeFirstBuy).toBeNull();
      const deleted = [...entries, early(1, '2026-03-15', '2026-10-01T10:00:00+01:00')];
      expect(planSummary(thePlan, deleted, today('buy'), portugal, fmt).beforeFirstBuy).toBeNull();
    });

    // A `held` entry with a cost: Portfolio's Invested counts it and the Plan's figure does not, whatever its date.
    const held = (n: number, amount: string | null) => ({
      ...early(n, '2026-06-01'),
      kind: 'held' as const,
      slot: null,
      fee: null,
      amount: amount as typeof extra.amount,
    });
    const heldOne = `1 entry of coins added with a recorded cost is not in the amount invested above. Portfolio's Invested counts it.`;
    const heldMany = `2 entries of coins added with a recorded cost are not in the amount invested above. Portfolio's Invested counts them.`;

    it('names a held entry with a cost, and more than one, at cost 0 too', () => {
      const single = planSummary(thePlan, [...entries, held(1, '40')], today('buy'), portugal, fmt);
      expect(single.beforeFirstBuy).toBe(heldOne);
      const plural = [...entries, held(1, '40'), held(2, '0')];
      expect(planSummary(thePlan, plural, today('buy'), portugal, fmt).beforeFirstBuy).toBe(heldMany);
    });

    it('names no held entry without a cost', () => {
      expect(planSummary(thePlan, [...entries, held(1, null)], today('buy'), portugal, fmt).beforeFirstBuy).toBeNull();
    });

    // With both kinds, three sentences: the extra buys' first sentence, the entries', and one close.
    const leadOne = one.replace(" Portfolio's Invested counts it.", '');
    const leadMany = many.replace(" Portfolio's Invested counts them.", '');
    const eitherOne = '1 entry of coins added with a recorded cost is not in it either.';
    const eitherMany = '2 entries of coins added with a recorded cost are not in it either.';
    const close = "Portfolio's Invested counts all of them.";

    it('closes once when both kinds show, with one and more than one of each', () => {
      const line = (extras: number, helds: number) => {
        const added = [
          ...Array.from({ length: extras }, (_, n) => early(n + 1, '2026-03-15')),
          ...Array.from({ length: helds }, (_, n) => held(n + 5, n === 0 ? '40' : '0')),
          held(9, null),
        ];
        return planSummary(thePlan, [...entries, ...added], today('buy'), portugal, fmt).beforeFirstBuy;
      };
      expect(line(1, 1)).toBe(`${leadOne} ${eitherOne} ${close}`);
      expect(line(1, 2)).toBe(`${leadOne} ${eitherMany} ${close}`);
      expect(line(2, 1)).toBe(`${leadMany} ${eitherOne} ${close}`);
      expect(line(2, 2)).toBe(`${leadMany} ${eitherMany} ${close}`);
      expect(line(2, 2)?.match(/Portfolio's Invested/g)).toHaveLength(1);
    });

    it('keeps the line after End buying, in the sell phase and with nothing planned', () => {
      const held = [...entries, early(1, '2026-03-15')];
      const ended: Plan = {
        ...thePlan,
        lastBuy: '2026-10-15' as CalendarDate,
        endedBuyingOn: '2026-10-15' as CalendarDate,
      };
      expect(planSummary(ended, held, today('buy'), portugal, fmt).beforeFirstBuy).toBe(one);
      expect(planSummary(thePlan, held, today('sell'), portugal, fmt).beforeFirstBuy).toBe(one);
      const nothing: Plan = {
        ...thePlan,
        monthlyAmount: '0' as Plan['monthlyAmount'],
        startingAmount: '0' as Plan['startingAmount'],
      };
      // No starting amount, no lump and nothing a month: the plan's total is zero.
      const noLump = held.filter((entry) => entry.kind !== 'lump');
      const summary = planSummary(nothing, noLump, today('buy'), portugal, fmt);
      expect(summary.totals).toMatch(/ invested so far\.$/);
      expect(summary.beforeFirstBuy).toBe(one);
    });
  });

  it('has no sellable lines and no holding note under the `none` rule', () => {
    const none: Plan = { ...thePlan, holdingRule: { kind: 'none' } };
    const selling = planSummary(none, entries, today('sell'), null, fmt);
    expect(selling.sellable).toEqual([]);
    expect(selling.holdingNote).toBe(false);
  });
});
