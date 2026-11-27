import { describe, expect, it } from 'vitest';
import { PUBLISH } from './publish';

// The publish switch stays off until Kraken answers each question yes (ADR-0036, Reading of
// 2026-11-27, questions 1 to 4). A pull request that turns a flag on changes this test with the answer
// it rests on.
describe('the publish switch', () => {
  it('has one flag per Kraken question', () => {
    expect(Object.keys(PUBLISH).sort()).toEqual(['csv', 'display', 'krakenOnly', 'repository']);
  });

  it('has every flag off', () => {
    for (const [flag, on] of Object.entries(PUBLISH)) {
      expect({ flag, on }).toEqual({ flag, on: false });
    }
  });

  it('cannot be changed at run time', () => {
    expect(Object.isFrozen(PUBLISH)).toBe(true);
  });
});
