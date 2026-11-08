// @vitest-environment jsdom
import { type CountryProfile, holdingRuleSource, loadedProfile, loadProfile, loadRules } from '@proofofcalm/content';
import type { CountryRules, HoldingRule, Plan } from '@proofofcalm/core';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { I18nProvider } from '../../../lib/i18n';
import { ServicesProvider } from '../../../lib/services';
import { fixtureSnapshot } from '../../../lib/services/fixtures';
import { createTestServices } from '../../../lib/services/testing';
import shell from '../../../messages/en/shell.json';
import { ConditionLines, HoldingConditions } from './holding-conditions';

// What the app cannot verify about a date, beside the first date on a screen (docs/JURISDICTIONS.md §2,
// docs/LEGAL.md §4). The rules come from the generated rules file, as the shell boots (ADR-0049), so no profile
// is loaded before the first test: it proves the Sources link arrives with the profile's load. After it,
// Portugal's profile is loaded and each `null` below comes from its one condition. `ConditionLines` is the
// sentences alone, as the early-opening notice and the country change's last-buy row show them.

const PORTUGAL = (await loadRules('PT')) as CountryRules;
const [FIRST, SECOND] = PORTUGAL.holdingRuleConditions as [string, string];
const MORE = 'Show 3 more conditions';
const portugalSource = async () => holdingRuleSource((await loadProfile('PT')) as CountryProfile);

afterEach(cleanup);

type Options = {
  rules?: CountryRules;
  country?: string;
  holdingRule?: HoldingRule;
  nowMs?: number;
  /** false renders without settling, for an assertion on the first render. */
  settled?: boolean;
};

async function mount({ rules = PORTUGAL, country, holdingRule, nowMs, settled = true }: Options = {}) {
  const snapshot = fixtureSnapshot();
  const plan = snapshot.plan as Plan;
  const services = createTestServices({
    snapshot: {
      ...snapshot,
      plan: {
        ...plan,
        ...(country !== undefined && { country: country as Plan['country'] }),
        ...(holdingRule !== undefined && { holdingRule }),
      },
    },
    rules: async () => rules,
    ...(nowMs !== undefined && { nowMs }),
  });
  await services.start();
  render(
    <ServicesProvider services={services}>
      <I18nProvider messages={{ shell }}>
        <HoldingConditions />
      </I18nProvider>
    </ServicesProvider>,
  );
  if (settled) await act(() => Promise.resolve());
}

describe('HoldingConditions and the profile (ADR-0049)', () => {
  it("the date line's Sources link arrives with the profile's load when nothing booted on it", async () => {
    // The first test of the file, and the harness must not have loaded Portugal's profile before it.
    expect(loadedProfile('PT'), 'Portugal was loaded before this test: the case cannot be proved').toBeNull();
    await mount({ settled: false });
    expect(screen.getByText(FIRST)).toBeDefined();
    expect(screen.queryByRole('link', { name: 'Sources' })).toBeNull();
    const sources = await screen.findByRole('link', { name: 'Sources' });
    expect(sources.getAttribute('href')).toBe(await portugalSource());
  });

  it('shows the Sources link on the first render when a load has read the profile', async () => {
    await loadProfile('PT');
    await mount({ settled: false });
    expect(screen.getByRole('link', { name: 'Sources' }).getAttribute('href')).toBe(await portugalSource());
  });
});

describe('ConditionLines', () => {
  const lines = (conditions: readonly string[]) =>
    render(
      <I18nProvider messages={{ shell }}>
        <ConditionLines conditions={conditions} />
      </I18nProvider>,
    );

  it('shows the first sentence, counts the rest on the control and opens them as a list', async () => {
    lines(PORTUGAL.holdingRuleConditions);
    expect(screen.getByText(FIRST)).toBeDefined();
    expect(screen.queryByText(SECOND)).toBeNull();
    expect(screen.queryByRole('link')).toBeNull();
    const more = screen.getByRole('button', { name: MORE });
    expect(more.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(more);
    expect(await screen.findByText(SECOND)).toBeDefined();
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
  });

  it('counts one condition in the singular and shows no control for one alone', () => {
    lines([FIRST, SECOND]);
    expect(screen.getByRole('button', { name: 'Show 1 more condition' })).toBeDefined();
    cleanup();
    lines([FIRST]);
    expect(screen.getByText(FIRST)).toBeDefined();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('renders nothing for an empty list', () => {
    const { container } = lines([]);
    expect(container.innerHTML).toBe('');
  });
});

describe('HoldingConditions', () => {
  it('shows the first sentence and keeps the rest behind the control', async () => {
    await mount();
    expect(screen.getByText(FIRST)).toBeDefined();
    expect(screen.queryByText(SECOND)).toBeNull();
    const more = screen.getByRole('button', { name: MORE });
    expect(more.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(more);
    expect(more.getAttribute('aria-expanded')).toBe('true');
    expect(await screen.findByText(SECOND)).toBeDefined();
    expect(screen.getAllByRole('listitem')).toHaveLength(PORTUGAL.holdingRuleConditions.length - 1);
  });

  it('counts the one condition behind the control', async () => {
    await mount({ rules: { ...PORTUGAL, holdingRuleConditions: [FIRST, SECOND] } });
    expect(screen.getByRole('button', { name: 'Show 1 more condition' })).toBeDefined();
  });

  it('one condition shows no control', async () => {
    await mount({ rules: { ...PORTUGAL, holdingRuleConditions: [FIRST] } });
    expect(screen.getByText(FIRST)).toBeDefined();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it("the person's own rule shows none", async () => {
    await mount({ holdingRule: { kind: 'days', days: 730, effect: 'exempt' } });
    expect(screen.queryByText(FIRST)).toBeNull();
    expect(screen.queryByRole('link', { name: 'Sources' })).toBeNull();
  });

  it('a plan whose country fell back to the generic profile shows none', async () => {
    // `rules.code` is what tells: the rule, the conditions and a source are all there. Japan: no profile and
    // none on the roadmap, so it falls back to the generic profile as the profiles land.
    await mount({ country: 'JP', rules: { ...PORTUGAL, code: 'XX' as CountryRules['code'] } });
    expect(screen.queryByText(FIRST)).toBeNull();
    expect(screen.queryByRole('link', { name: 'Sources' })).toBeNull();
  });

  it('a country with no conditions shows the date line alone', async () => {
    await mount({ rules: { ...PORTUGAL, holdingRuleConditions: [] } });
    expect(screen.queryByText(FIRST)).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByRole('link', { name: 'Sources' }).getAttribute('href')).toBe(await portugalSource());
  });

  it('with no source known it shows the sentence and the plain date line', async () => {
    // No file under this code, so no load ever read its sources (docs/LEGAL.md §6 question 13). Japan: no
    // profile and none on the roadmap, so the code stays unregistered as the profiles land.
    const japan = 'JP' as CountryRules['code'];
    await mount({ country: japan, rules: { ...PORTUGAL, code: japan } });
    expect(screen.getByText(FIRST)).toBeDefined();
    expect(screen.getByRole('button', { name: MORE })).toBeDefined();
    expect(screen.getByText(/^Reviewed on \d+\s\w+\s\d{4} · general information, not advice$/)).toBeDefined();
    expect(screen.queryByRole('link', { name: 'Sources' })).toBeNull();
  });

  it('under review keeps the conditions beside the date, with no Sources', async () => {
    // Past Portugal's nextReviewDue by more than twelve months (docs/JURISDICTIONS.md §1). The date stays on the
    // rows beside this block, so the sentences that can deny it stay too (docs/LEGAL.md §4).
    await mount({ nowMs: Date.parse('2029-01-01T10:00:00Z') });
    expect(screen.getByText(FIRST)).toBeDefined();
    expect(screen.getByRole('button', { name: MORE })).toBeDefined();
    expect(screen.queryByRole('link', { name: 'Sources' })).toBeNull();
    expect(screen.getByText(/^Not reviewed since \d+\s\w+\s\d{4} · general information, not advice$/)).toBeDefined();
  });

  it("its date line links the rule's source", async () => {
    await mount();
    const sources = screen.getByRole('link', { name: 'Sources' });
    expect(sources.getAttribute('href')).toBe(await portugalSource());
    expect(sources.parentElement?.textContent).toMatch(
      /^Reviewed on \d+\s\w+\s\d{4} · general information, not advice · Sources$/,
    );
  });
});
