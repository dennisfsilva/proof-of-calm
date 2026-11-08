// @vitest-environment jsdom
import { countryRules, loadProfile } from '@proofofcalm/content';
import type { CountryRules, HoldingRule, Plan } from '@proofofcalm/core';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { userEvent } from 'storybook/test';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../../../lib/i18n';
import { NavigationProvider } from '../../../lib/navigation';
import type { Snapshot } from '../../../lib/ports';
import { type Services, ServicesProvider } from '../../../lib/services';
import { fixtureSnapshot } from '../../../lib/services/fixtures';
import { createTestServices, preloadLazyModules } from '../../../lib/services/testing';
import errors from '../../../messages/en/errors.json';
import plan from '../../../messages/en/plan.json';
import settings from '../../../messages/en/settings.json';
import shell from '../../../messages/en/shell.json';
import today from '../../../messages/en/today.json';
import { HoldSellTab } from './hold-sell-tab';

// Settings' Hold & sell tab (docs/DOMAIN.md §6 "Edit the plan", docs/JURISDICTIONS.md §5): the plan's holding
// rule as the country's or the person's own, and its sell window; a save sends them onto the plan as stored then,
// an own rule equal to the country's stores the country's, a window that opens before the last buy passes the
// rule waits for the person's acceptance, and a rule another browser tab changed since refuses (`plan-changed`).

// Under Vitest each import() of a profile is a round trip to the main process, which under load outlasted a
// findBy (2026-10-26): the profiles load once, here (lib/services/testing-modules.ts).
vi.mock('@proofofcalm/content', async (original) =>
  (await import('../../../lib/services/testing-modules')).profilesInMemory(
    await original<typeof import('@proofofcalm/content')>(),
  ),
);

afterEach(cleanup);
// The jurisdiction profiles the tab loads with import() load while the file loads, outside any test's
// timeout, so a findBy waits on renders, not on Vite's first transform (seconds under load).
await preloadLazyModules();

const portugal = async () => {
  const profile = await loadProfile('PT');
  return profile === null ? null : countryRules(profile);
};
const COUNTRY: HoldingRule = { kind: 'days', days: 365, effect: 'exempt' };
const OWN: HoldingRule = { kind: 'days', days: 730, effect: 'exempt' };

function view(services: Services) {
  render(
    <NavigationProvider location="memory" initialPath="/settings">
      <ServicesProvider services={services}>
        <I18nProvider messages={{ settings, plan, errors, today, shell }}>
          <HoldSellTab />
        </I18nProvider>
      </ServicesProvider>
    </NavigationProvider>,
  );
}

async function mount(snapshot: Snapshot = fixtureSnapshot(), rules = portugal): Promise<Services> {
  const services = createTestServices({ snapshot, rules });
  await services.start();
  view(services);
  await act(() => Promise.resolve());
  return services;
}

const withRule = (holdingRule: HoldingRule): Snapshot => {
  const snapshot = fixtureSnapshot();
  return { ...snapshot, plan: { ...(snapshot.plan as Plan), holdingRule } };
};
type Window = NonNullable<Plan['sellWindow']>;
const stored = (services: Services) => services.domain.store.getState().snapshot.plan as Plan;
const radio = (name: string) => screen.getByRole('radio', { name });
const days = () => screen.getByLabelText<HTMLInputElement>('Days');
const save = () => act(async () => fireEvent.click(screen.getByRole('button', { name: 'Save changes' })));

describe('HoldSellTab', () => {
  it("shows the country's rule chosen, in words with its review date", async () => {
    await mount();
    expect(radio("Portugal's rule").getAttribute('aria-checked')).toBe('true');
    // The rule in words shows with its source, once the profile is loaded.
    const sources = await screen.findByRole('link', { name: 'Sources' });
    expect(radio("Portugal's rule").textContent).toContain('365 days, then tax-free.');
    expect(sources.parentElement?.textContent).toMatch(
      /^Reviewed on \d+\s\w+\s\d{4} · general information, not advice · Sources$/,
    );
    // The law that sets Portugal's 365 days, the profile's first source (art. 10 CIRS).
    expect(sources.getAttribute('href')).toBe((await loadProfile('PT'))?.sources[0]?.url);
    expect(sources.getAttribute('href')).toMatch(/irs10\.aspx$/);
  });

  it('Sources is there on the first render once the profile is loaded', async () => {
    const services = createTestServices({ snapshot: fixtureSnapshot(), rules: portugal });
    await services.start();
    // No await between the render and the look: the hook's effect answers on a later microtask.
    view(services);
    expect(screen.getByRole('link', { name: 'Sources' }).getAttribute('href')).toMatch(/^https:/);
    expect(radio("Portugal's rule").textContent).toContain('365 days, then tax-free.');
    services.dispose();
  });

  it("shows no reviewed country's rule in words while its profile, and so its source, is not known", async () => {
    // Portugal's rules under a code with no profile on the device: loadProfile resolves null, so no source.
    // Japan: no profile and none on the roadmap, so the code stays unregistered as the profiles land.
    const services = await mount(fixtureSnapshot(), async () => {
      const rules = await portugal();
      return rules === null ? null : { ...rules, code: 'JP' as CountryRules['code'] };
    });
    await act(() => Promise.resolve());
    const country = radio("Portugal's rule");
    expect(country.getAttribute('aria-checked')).toBe('true');
    expect(country.textContent).not.toContain('365 days, then tax-free.');
    expect(screen.queryByRole('link', { name: 'Sources' })).toBeNull();
    services.dispose();
  });

  it("words a country with no reviewed rule by its profile's status and holding text, with no source", async () => {
    const generic = await loadProfile('XX');
    const snapshot = withRule({ kind: 'none' });
    const services = createTestServices({
      snapshot: { ...snapshot, plan: { ...(snapshot.plan as Plan), country: 'XX' as Plan['country'] } },
      rules: async () => (generic === null ? null : countryRules(generic)),
    });
    await services.start();
    render(
      <NavigationProvider location="memory" initialPath="/settings">
        <ServicesProvider services={services}>
          <I18nProvider messages={{ settings, plan, errors, today, shell }}>
            <HoldSellTab />
          </I18nProvider>
        </ServicesProvider>
      </NavigationProvider>,
    );
    const country = radio("The general profile's rule");
    expect(country.getAttribute('aria-checked')).toBe('true');
    // The profile's own words (packages/content/jurisdictions/xx.json), not "No holding rule.".
    expect(await screen.findByText(`${generic?.card.classification} ${generic?.card.holdingRuleText}`)).toBeDefined();
    expect(country.textContent).not.toContain('No holding rule.');
    // Its first source is DAC8, a reporting directive, not the source of a holding rule.
    expect(screen.queryByRole('link', { name: 'Sources' })).toBeNull();
    expect(
      screen.getByText(
        /^Reviewed on \d+ \w+ \d{4}: the general profile, not a rule for your country · general information, not advice$/,
      ),
    ).toBeDefined();
    services.dispose();
  });

  it('saves an own rule onto the plan', async () => {
    const services = await mount();
    const user = userEvent.setup({ document });
    await user.click(radio('Your own rule'));
    fireEvent.change(days(), { target: { value: '730' } });
    await save();
    expect(stored(services).holdingRule).toEqual(OWN);
    expect(radio('Your own rule').getAttribute('aria-checked')).toBe('true');
    services.dispose();
  });

  it("stores the country's rule for an own rule equal to it, and goes back to the country's", async () => {
    const services = await mount(withRule(OWN));
    expect(days().value).toBe('730');
    fireEvent.change(days(), { target: { value: '365' } });
    await save();
    expect(stored(services).holdingRule).toEqual(COUNTRY);
    expect(radio("Portugal's rule").getAttribute('aria-checked')).toBe('true');
    services.dispose();
  });

  it("saves the country's rule chosen over an own rule", async () => {
    const services = await mount(withRule(OWN));
    const user = userEvent.setup({ document });
    await user.click(radio("Portugal's rule"));
    await save();
    expect(stored(services).holdingRule).toEqual(COUNTRY);
    services.dispose();
  });

  it('refuses a rule another browser tab changed since, says so, and shows the rule as stored', async () => {
    const services = await mount();
    await act(() => services.domain.write(({ plan }) => ({ plan: { ...(plan as Plan), holdingRule: OWN } })));
    const user = userEvent.setup({ document });
    await user.click(radio('Your own rule'));
    fireEvent.change(days(), { target: { value: '400' } });
    await save();
    expect(screen.getByRole('alert').textContent).toBe(
      'Your plan changed in another browser tab, so this change was not saved. The form now shows the saved plan; make your change again.',
    );
    expect(stored(services).holdingRule).toEqual(OWN);
    expect(days().value).toBe('730');
    services.dispose();
  });

  it('saves the sell window moved', async () => {
    const services = await mount();
    const window = stored(services).sellWindow as Window;
    fireEvent.change(screen.getByLabelText('Opens'), { target: { value: '2029-10-01' } });
    await save();
    expect(stored(services).sellWindow).toEqual({ ...window, opens: '2029-10-01' });
    services.dispose();
  });

  it('saves no sell window', async () => {
    const services = await mount();
    await userEvent.setup({ document }).click(radio('No sell window'));
    await save();
    expect(stored(services).sellWindow).toBeNull();
    services.dispose();
  });

  it('saves a rule that opens the sell window early once accepted, and drops the acceptance when the rule moves', async () => {
    const services = await mount(withRule(OWN));
    const before = stored(services);
    // The fixture's last buy is 5 Mar 2027 and its sell window opens on 1 Sep 2029: 1,100 days pass in 2030.
    fireEvent.change(days(), { target: { value: '1100' } });
    expect(
      screen.getByText(
        'The sell window opens on 1 Sept 2029. Your last buy is tax-free from 9 Mar 2030 under your own rule. ' +
          'You can also choose a later opening date.',
      ),
    ).toBeDefined();
    const box = screen.getByRole('checkbox', {
      name: 'Open the sell window on 1\u00a0Sept\u00a02029, before your last buy passes the holding rule',
    });
    // Before any save the box only awaits the acceptance: not marked, and no refusal line.
    expect(box.getAttribute('aria-invalid')).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
    await save();
    expect(document.activeElement).toBe(box);
    expect(box.getAttribute('aria-invalid')).toBe('true');
    expect(days().getAttribute('aria-invalid')).toBeNull();
    expect(screen.getByRole('alert').textContent).toBe(
      'Tick the box to open the sell window early, or choose a later opening date.',
    );
    expect(stored(services)).toBe(before);
    fireEvent.click(box);
    await save();
    expect(stored(services).holdingRule).toEqual({ ...OWN, days: 1100 });
    expect(stored(services).sellWindow).toEqual({ ...(before.sellWindow as Window), acceptedEarlyOpen: true });
    // The stored acceptance holds for its own rule and dates and asks nothing; a change asks again, unticked.
    expect(screen.queryByRole('checkbox')).toBeNull();
    fireEvent.change(days(), { target: { value: '1200' } });
    expect(screen.getByRole('checkbox').getAttribute('aria-checked')).toBe('false');
    services.dispose();
  });

  it('starts the acceptance unticked for dates other than the ones the stored plan accepted', async () => {
    const snapshot = withRule(OWN);
    const opened = snapshot.plan as Plan;
    const sellWindow = { opens: '2028-06-01', closes: '2030-08-31', exitBy: '2030-12-31', acceptedEarlyOpen: true };
    const services = await mount({ ...snapshot, plan: { ...opened, sellWindow: sellWindow as Window } });
    expect(screen.queryByRole('checkbox')).toBeNull();
    fireEvent.change(screen.getByLabelText('Opens'), { target: { value: '2028-07-01' } });
    expect(screen.getByRole('checkbox').getAttribute('aria-checked')).toBe('false');
    services.dispose();
  });

  it("asks for the acceptance, not another rule, when the country's rule opens the sell window early", async () => {
    const snapshot = withRule({ kind: 'days', days: 30, effect: 'exempt' });
    const opened = snapshot.plan as Plan;
    const sellWindow = { opens: '2027-06-01', closes: '2028-05-31', exitBy: '2028-12-31' } as Window;
    const services = await mount({ ...snapshot, plan: { ...opened, sellWindow } });
    const user = userEvent.setup({ document });
    await user.click(radio("Portugal's rule"));
    // The notice names Portugal's rule, then the note and Portugal's date line, its Sources as on the card.
    expect(await screen.findByText(/ under Portugal's rule\. /)).toBeDefined();
    expect(screen.getByText('Computed from your dates, not tax advice')).toBeDefined();
    const [card, notice] = await screen.findAllByRole('link', { name: 'Sources' });
    expect(notice?.getAttribute('href')).toBe(card?.getAttribute('href'));
    await save();
    expect(screen.getByRole('radiogroup', { name: 'Holding rule' }).getAttribute('aria-invalid')).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('checkbox'));
    await save();
    expect(stored(services).holdingRule).toEqual(COUNTRY);
    expect(stored(services).sellWindow).toEqual({ ...sellWindow, acceptedEarlyOpen: true });
    services.dispose();
  });

  it('refuses a count that is not whole under the count', async () => {
    const services = await mount(withRule(OWN));
    const before = stored(services);
    fireEvent.change(days(), { target: { value: '1.5' } });
    await save();
    expect(screen.getByText('Enter a whole number of days.')).toBeDefined();
    expect(stored(services)).toBe(before);
    services.dispose();
  });

  it('shows the empty state without a plan', async () => {
    await mount({ ...fixtureSnapshot(), plan: null, entries: [] });
    expect(screen.getByText('No plan yet')).toBeDefined();
  });
});
