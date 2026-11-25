import * as core from '@proofofcalm/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fixtureSnapshot } from './fixtures';
import { heldPortfolio } from './held';

vi.mock('@proofofcalm/core', async (original) => {
  const actual = await original<typeof core>();
  return { ...actual, portfolio: vi.fn(actual.portfolio) };
});

const computed = vi.mocked(core.portfolio);

afterEach(() => {
  computed.mockClear();
});

describe('heldPortfolio', () => {
  const { plan: fixturePlan, entries } = fixtureSnapshot();
  if (fixturePlan === null) throw new Error('The fixture has a plan.');
  const plan = fixturePlan;
  const lifo: core.HoldingContext = { overrides: [], lotScope: 'per-venue', lotRule: 'lifo' };

  it('equals the unpriced portfolio, for the default holding context and for another', () => {
    expect(heldPortfolio(plan, entries)).toEqual(core.portfolio(plan, entries, null));
    expect(heldPortfolio(plan, entries, lifo)).toEqual(core.portfolio(plan, entries, null, lifo));
  });

  it('computes once per entries array, plan and lot scope and rule', () => {
    const first = heldPortfolio(plan, [...entries]);
    expect(computed).toHaveBeenCalledTimes(1);
    const same = [...entries];
    const again = heldPortfolio(plan, same);
    expect(heldPortfolio(plan, same)).toBe(again);
    // A context of the same scope and rule is the same question, whatever object carries it.
    expect(heldPortfolio(plan, same, { ...core.DEFAULT_HOLDING_CONTEXT })).toBe(again);
    expect(computed).toHaveBeenCalledTimes(2);
    expect(again).toEqual(first);
  });

  it('computes again for a new entries array, another plan or another lot rule', () => {
    const same = [...entries];
    heldPortfolio(plan, same);
    heldPortfolio(plan, same, lifo);
    heldPortfolio({ ...plan }, same);
    heldPortfolio(plan, [...same]);
    expect(computed).toHaveBeenCalledTimes(4);
  });
});
