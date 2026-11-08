import { EntrySchema, PlanSchema } from '@proofofcalm/core';
import { describe, expect, it } from 'vitest';
import { todayIn } from '../adapters';
import { FIXTURE_DATES, fixtureNowMs, fixtureSnapshot } from './fixtures';

describe('fixtureSnapshot', () => {
  it('holds one valid PT plan with BTC and ETH and a sell window', () => {
    const { plan } = fixtureSnapshot();
    expect(PlanSchema.safeParse(plan).success).toBe(true);
    expect(plan?.country).toBe('PT');
    expect(plan?.coins.map((coin) => coin.id)).toEqual(['BTC', 'ETH']);
    expect(plan?.sellWindow).not.toBeNull();
  });

  it('holds a lump, five dca months, one extra, one sale and one skip, every entry valid', () => {
    const { plan, entries } = fixtureSnapshot();
    for (const entry of entries) expect(EntrySchema.safeParse(entry).success).toBe(true);
    expect(new Set(entries.filter((entry) => entry.kind === 'lump').map((entry) => entry.date)).size).toBe(1);
    expect(new Set(entries.filter((entry) => entry.kind === 'dca').map((entry) => entry.slot)).size).toBe(5);
    expect(entries.filter((entry) => entry.kind === 'extra')).toHaveLength(1);
    expect(entries.filter((entry) => entry.kind === 'sell')).toHaveLength(1);
    expect(plan?.skips).toHaveLength(1);
    expect(entries.map((entry) => entry.id)).toEqual(entries.map((entry) => entry.id).sort());
  });

  it('is seen at two dates: one in the buying phase, one in the sell window', () => {
    const { plan, entries } = fixtureSnapshot();
    const buy = todayIn(fixtureNowMs('buy'), 'Europe/Lisbon');
    const sell = todayIn(fixtureNowMs('sell'), 'Europe/Lisbon');
    expect([buy, sell]).toEqual([FIXTURE_DATES.buy, FIXTURE_DATES.sell]);
    expect(plan !== null && plan.firstBuy <= buy && buy <= plan.lastBuy).toBe(true);
    for (const entry of entries) expect(entry.date <= buy).toBe(true);
    const window = plan?.sellWindow;
    expect(window !== null && window !== undefined && window.opens <= sell && sell <= window.closes).toBe(true);
  });
});
