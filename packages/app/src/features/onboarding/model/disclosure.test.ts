import { describe, expect, it } from 'vitest';
import { RISK_WORDING_VERSION } from '../../../lib/brand';
import onboarding from '../messages/en.json';

// The plan-creation disclosure is acknowledged with its wording version (docs/LEGAL.md §4, docs/DOMAIN.md
// §2.1): a plan records the version it was started under, so the words of a version never change.

/** Version 1, the text of docs/LEGAL.md §4 with the product's name as the message's `{product}`. */
const VERSION_1 =
  '{product} is software for a plan you design: no orders, no financial or tax advice. You can lose all of it: ' +
  'Bitcoin has fallen more than 75 % from a high four times since 2011; Ethereum fell 94 % in 2018. ' +
  'Use only money you will not need for years.';

describe('the plan-creation disclosure', () => {
  it('is the text of its wording version', () => {
    expect(RISK_WORDING_VERSION).toBe(1);
    expect(
      onboarding.disclosure.text,
      'The acknowledged text changed: raise RISK_WORDING_VERSION, then record the new text here as that version.',
    ).toBe(VERSION_1);
  });
});
