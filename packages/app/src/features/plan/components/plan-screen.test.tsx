// @vitest-environment jsdom
import { countryRules, loadProfile } from '@proofofcalm/content';
import { type CalendarDate, endBuying, type HoldingRule, type Instant, type Plan } from '@proofofcalm/core';
import { act, cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../../../lib/i18n';
import { NavigationProvider } from '../../../lib/navigation';
import { type Services, ServicesProvider } from '../../../lib/services';
import { type FixturePhase, fixtureNowMs, fixtureSnapshot } from '../../../lib/services/fixtures';
import { createTestServices } from '../../../lib/services/testing';
import plan from '../../../messages/en/plan.json';
import shell from '../../../messages/en/shell.json';
import today from '../../../messages/en/today.json';
import { PlanScreen } from './plan-screen';

afterEach(cleanup);

const portugal = async () => {
  const profile = await loadProfile('PT');
  return profile === null ? null : countryRules(profile);
};

async function mount(phase: FixturePhase | null, why = '') {
  const snapshot = fixtureSnapshot();
  const withWhy = snapshot.plan === null ? null : { ...snapshot.plan, why };
  const services = createTestServices(
    phase === null ? {} : { snapshot: { ...snapshot, plan: withWhy }, nowMs: fixtureNowMs(phase), rules: portugal },
  );
  view(services);
  await act(() => services.start());
}

function view(services: Services) {
  render(
    <NavigationProvider location="memory" initialPath="/plan">
      <ServicesProvider services={services}>
        <I18nProvider messages={{ plan, shell, today }}>
          <PlanScreen />
        </I18nProvider>
      </ServicesProvider>
    </NavigationProvider>,
  );
}

describe('PlanScreen', () => {
  it('in the buy phase: the reference, the totals, the holding line once, no sellable lines', async () => {
    await mount('buy');
    expect(screen.getByRole('heading', { level: 1, name: 'Plan' })).toBeDefined();
    expect(screen.getByText(/^Your plan buys until/)).toBeDefined();
    expect(screen.getByText(/invested so far/)).toBeDefined();
    expect(screen.getAllByText('Computed from your dates, not tax advice')).toHaveLength(1);
    expect(screen.queryByText(/sellable now/)).toBeNull();
    expect(screen.getByRole('link', { name: 'Edit plan' }).getAttribute('href')).toBe('/settings');
    expect(screen.getByRole('button', { name: 'Pause from today' })).toBeDefined();
  });

  it('in the sell window: one sellable line per coin, and still the holding line once', async () => {
    await mount('sell');
    expect(screen.getAllByText(/sellable now/)).toHaveLength(2);
    expect(screen.getAllByText('Computed from your dates, not tax advice')).toHaveLength(1);
    expect(screen.queryByRole('button', { name: 'Pause from today' })).toBeNull();
  });

  it('the holding note carries the conditions', async () => {
    await mount('buy');
    const note = screen.getByText('Computed from your dates, not tax advice');
    const first = screen.getByText(/the counterparty is tax-resident/i);
    expect(note.compareDocumentPosition(first) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Show 3 more conditions' })).toBeDefined();
    expect(screen.getByRole('link', { name: 'Sources' })).toBeDefined();
  });

  it('no rule, no conditions', async () => {
    // A country whose rule is none, with conditions in its file: no date, so nothing to stand beside.
    const none: HoldingRule = { kind: 'none' };
    const snapshot = fixtureSnapshot();
    const services = createTestServices({
      snapshot: { ...snapshot, plan: { ...(snapshot.plan as Plan), holdingRule: none } },
      nowMs: fixtureNowMs('buy'),
      rules: async () => {
        const rules = await portugal();
        return rules === null ? null : { ...rules, holdingRule: none };
      },
    });
    view(services);
    await act(() => services.start());
    expect(screen.queryByText('Computed from your dates, not tax advice')).toBeNull();
    expect(screen.queryByText(/the counterparty is tax-resident/i)).toBeNull();
    expect(screen.queryByRole('link', { name: 'Sources' })).toBeNull();
  });

  it('shows no holding date while the rules of a new country load, and shows it again once they have', async () => {
    let arrive: () => void = () => undefined;
    const rules = (country: string) =>
      country === 'PT' ? portugal() : new Promise<null>((resolve) => (arrive = () => resolve(null))).then(portugal);
    const services = createTestServices({ snapshot: fixtureSnapshot(), nowMs: fixtureNowMs('sell'), rules });
    view(services);
    await act(() => services.start());
    const holding = () => screen.queryAllByText(/Tax-free|tax-free|sellable now|not tax advice/);
    expect(holding().length).toBeGreaterThan(0);
    await act(() =>
      services.domain.write((snapshot) => ({ plan: snapshot.plan && { ...snapshot.plan, country: 'DE' } })),
    );
    expect(holding()).toEqual([]);
    await act(async () => arrive());
    await vi.waitFor(() => expect(holding().length).toBeGreaterThan(0));
  });

  it('sets the reason upright: the type has no italics (docs/DESIGN.md §5)', async () => {
    await mount('buy', 'I buy on the 5th and look at nothing else.');
    const why = screen.getByText('In your words: I buy on the 5th and look at nothing else.');
    expect(why.className.split(' ')).not.toContain('italic');
  });

  it('a sell window: the lead links to why it is a window, and the line under the timeline to its parts', async () => {
    await mount('buy');
    const lead = screen.getByText(/^Your plan buys until/);
    expect(within(lead).getByRole('button', { name: 'Why? The sell window' }).textContent).toBe('Why?');
    const timeline = screen.getByRole('region', { name: 'Timeline' });
    const line = within(timeline).getByText(/^The sell window has three parts\./);
    expect(within(line).getByRole('button', { name: 'Why? The three parts' }).textContent).toBe('Why?');
  });

  it('the parts line follows the holding block', async () => {
    // Before the sell phase's clock, where the fixture's Portugal is past its review and links no Sources.
    await mount('buy');
    const line = screen.getByText(/^The sell window has three parts\./);
    const after = (first: Element, second: Element) =>
      first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING;
    expect(after(document.querySelector('[data-slot="timeline"]') as Element, line)).toBeTruthy();
    expect(after(screen.getByText('Computed from your dates, not tax advice'), line)).toBeTruthy();
    expect(after(screen.getByText(/the counterparty is tax-resident/i), line)).toBeTruthy();
    expect(after(screen.getByRole('link', { name: 'Sources' }), line)).toBeTruthy();
  });

  // `cn` joins and never merges (ADR-0043), so the link keeps its Button size and the sentence comes up to it.
  it('the parts line is the size of its link', async () => {
    await mount('buy');
    const line = screen.getByText(/^The sell window has three parts\./);
    const sizes = (element: Element) => element.className.split(' ').filter((name) => /^text-\d+$/.test(name));
    expect(sizes(line)).toEqual(sizes(within(line).getByRole('button', { name: 'Why? The three parts' })));
  });

  it('no sell window, no link', async () => {
    const snapshot = fixtureSnapshot();
    const open = snapshot.plan && { ...snapshot.plan, sellWindow: null };
    const services = createTestServices({
      snapshot: { ...snapshot, plan: open },
      nowMs: fixtureNowMs('buy'),
      rules: portugal,
    });
    view(services);
    await act(() => services.start());
    expect(screen.getByText(/^Your plan buys until/)).toBeDefined();
    expect(screen.queryByRole('button', { name: /^Why\?/ })).toBeNull();
    expect(screen.queryByText(/^The sell window has three parts\./)).toBeNull();
  });

  // #222: End buying and Edit plan sit under a heading of their own, which an ended plan keeps for its line.
  it('puts End buying and Edit plan under Change the plan, and an ended plan’s line there too', async () => {
    await mount('buy');
    const change = screen.getByRole('region', { name: 'Change the plan' });
    expect(within(change).getByRole('heading', { level: 2, name: 'Change the plan' })).toBeDefined();
    expect(within(change).getByRole('button', { name: 'End buying' })).toBeDefined();
    expect(within(change).getByRole('link', { name: 'Edit plan' })).toBeDefined();
    cleanup();
    const snapshot = fixtureSnapshot();
    const ended = endBuying(snapshot.plan as Plan, '2026-10-20' as CalendarDate, '2026-10-20T10:00:00.000Z' as Instant);
    if (!ended.ok) throw new Error(ended.error.code);
    const services = createTestServices({
      snapshot: { ...snapshot, plan: ended.value },
      nowMs: fixtureNowMs('buy'),
      rules: portugal,
    });
    view(services);
    await act(() => services.start());
    const after = screen.getByRole('region', { name: 'Change the plan' });
    expect(within(after).getByText(/^Buying ended on 20\sOct\s2026\.$/)).toBeDefined();
    expect(within(after).queryByRole('button', { name: 'End buying' })).toBeNull();
    expect(within(after).getByRole('link', { name: 'Edit plan' })).toBeDefined();
  });

  // C1: an ended plan's totals say when buying ended, never a share past 100 % of a total it no longer plans.
  it('reads the ended totals for an ended plan: no percentage and no Buys left', async () => {
    const snapshot = fixtureSnapshot();
    const ended = endBuying(snapshot.plan as Plan, '2026-10-20' as CalendarDate, '2026-10-20T10:00:00.000Z' as Instant);
    if (!ended.ok) throw new Error(ended.error.code);
    const services = createTestServices({ snapshot: { ...snapshot, plan: ended.value }, nowMs: fixtureNowMs('buy') });
    view(services);
    await act(() => services.start());
    const totals = screen.getByText(/ invested\. Buying ended on 20\sOct\s2026\.$/);
    expect(totals.textContent).not.toMatch(/%|Buys left|so far/);
  });

  // The totals leave out an extra buy dated before the first buy day (docs/DOMAIN.md §3.10); the next line says so.
  it('the line on extra buys before the first buy day follows the totals line', async () => {
    const snapshot = fixtureSnapshot();
    const extra = snapshot.entries.find((entry) => entry.kind === 'extra');
    if (extra === undefined) throw new Error('the fixture has no extra buy');
    const id = '00000000-0000-4000-8000-000000000991' as typeof extra.id;
    const early = { ...extra, id, date: '2026-03-15' as CalendarDate };
    const services = createTestServices({
      snapshot: { ...snapshot, entries: [...snapshot.entries, early] },
      nowMs: fixtureNowMs('buy'),
      rules: portugal,
    });
    view(services);
    await act(() => services.start());
    const totals = screen.getByText(/invested so far/);
    const line = screen.getByText(
      /^1 extra buy dated before the first buy day, 5\sApr\s2026, is not in the amount invested above\./,
    );
    expect(totals.nextElementSibling).toBe(line);
    expect(line.className.split(' ')).toEqual(expect.arrayContaining(['text-16', 'text-ink-2']));
  });

  it('no extra buy before the first buy day, no line under the totals', async () => {
    await mount('buy');
    expect(screen.queryByText(/before the first buy day/)).toBeNull();
  });

  it('without a plan: the empty state and no timeline', async () => {
    await mount(null);
    expect(screen.queryByRole('heading', { name: 'Change the plan' })).toBeNull();
    expect(screen.getByText('No plan yet')).toBeDefined();
    expect(screen.getByRole('link', { name: 'Set up a plan' }).getAttribute('href')).toBe('/onboarding');
    expect(screen.getByRole('link', { name: 'import a file' }).getAttribute('href')).toBe('/settings');
    expect(document.querySelector('[data-slot="timeline"]')).toBeNull();
  });
});
