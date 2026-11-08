// @vitest-environment jsdom
import { countryRules, loadProfile } from '@proofofcalm/content';
import type { CalendarDate, CountryCode, CountryRules, Money, Plan } from '@proofofcalm/core';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
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
import { PlanTab } from './plan-tab';

// Settings' Plan tab (docs/DOMAIN.md §6 "Edit the plan"): the plan's amounts in the number locale at the
// currency's two decimals, tidied on blur (ADR-0034); a save sends the fields the person changed onto the
// plan as stored then, and a refused one shows its issues and moves the focus to the first invalid field.

// Under Vitest each import() of a profile is a round trip to the main process, which under load outlasted a
// test's timeout (2026-10-26): the profiles load once, here (lib/services/testing-modules.ts).
vi.mock('@proofofcalm/content', async (original) =>
  (await import('../../../lib/services/testing-modules')).profilesInMemory(
    await original<typeof import('@proofofcalm/content')>(),
  ),
);

afterEach(cleanup);
// The jurisdiction profiles load while the file loads, outside any test's timeout, so a test's
// loadProfile and the tab's findBy wait on renders, not on Vite's first transform (seconds under load).
await preloadLazyModules();

type Rules = (country: CountryCode) => Promise<CountryRules | null>;

async function mount(snapshot: Snapshot = fixtureSnapshot(), rules?: Rules): Promise<Services> {
  const services = createTestServices({ snapshot, ...(rules === undefined ? {} : { rules }) });
  await services.start();
  render(
    <NavigationProvider location="memory" initialPath="/settings">
      <ServicesProvider services={services}>
        <I18nProvider messages={{ settings, plan, errors, today, shell }}>
          <PlanTab />
        </I18nProvider>
      </ServicesProvider>
    </NavigationProvider>,
  );
  return services;
}

const MONTHLY = 'Monthly amount (EUR)';
const STARTING = 'Starting amount (EUR)';
const field = (label: string) => screen.getByLabelText<HTMLInputElement>(label);
const type = (label: string, text: string) => fireEvent.change(field(label), { target: { value: text } });
type Window = NonNullable<Plan['sellWindow']>;
const stored = (services: Services) => services.domain.store.getState().snapshot.plan as Plan;
const ACCEPT = 'Open the sell window on 1\u00a0Sept\u00a02029, before this last buy passes the holding rule';
const notice = (eligibleOn: string) =>
  `The sell window opens on 1 Sept 2029. This last buy is tax-free from ${eligibleOn} under your own rule. ` +
  'You can also choose an earlier last buy.';
const save = () => act(async () => fireEvent.click(screen.getByRole('button', { name: 'Save changes' })));

describe('PlanTab', () => {
  it("shows the plan's amounts at two decimals and its dates", async () => {
    await mount();
    expect(field(MONTHLY).value).toBe('100.00');
    expect(field(STARTING).value).toBe('1,000.00');
    expect(field('First buy').value).toBe('2026-04-05');
    expect(field('Last buy').value).toBe('2027-03-05');
  });

  // D2: an ended plan says so under Last buy, which describes the field, and names the way back to buy days.
  it('describes Last buy with the ended line on an ended plan only', async () => {
    // The matcher meets the text after its whitespace, the date's no-break spaces too, is collapsed.
    const line = 'Buying ended on 15 Oct 2026. Saving a later last buy adds buy days again.';
    await mount();
    expect(screen.queryByText(line)).toBeNull();
    cleanup();
    const snapshot = fixtureSnapshot();
    const ended = '2026-10-15' as CalendarDate;
    await mount({ ...snapshot, plan: { ...(snapshot.plan as Plan), lastBuy: ended, endedBuyingOn: ended } });
    const description = screen.getByText(line);
    expect(field('Last buy').getAttribute('aria-describedby')?.split(' ')).toContain(description.id);
  });

  it('tidies a readable amount on blur and leaves one that cannot be read as typed', async () => {
    await mount();
    type(MONTHLY, '1250.5');
    fireEvent.blur(field(MONTHLY));
    expect(field(MONTHLY).value).toBe('1,250.50');
    type(STARTING, 'ten');
    fireEvent.blur(field(STARTING));
    expect(field(STARTING).value).toBe('ten');
  });

  it('saves the changed amount onto the plan', async () => {
    const services = await mount();
    type(MONTHLY, '250');
    await save();
    expect(stored(services).monthlyAmount).toBe('250');
    expect(stored(services).startingAmount).toBe('1000');
    expect(field(MONTHLY).value).toBe('250.00');
    services.dispose();
  });

  it('refuses a save with its issue under the field and moves the focus to the first invalid field', async () => {
    const services = await mount();
    const before = stored(services);
    type(MONTHLY, '0');
    type(STARTING, '');
    type('Last buy', '2026-01-05');
    await save();
    expect(screen.getByText('Enter a monthly amount, a starting amount, or both.')).toBeDefined();
    expect(screen.getByText('Choose a last buy on or after the first buy.')).toBeDefined();
    expect(document.activeElement).toBe(field(MONTHLY));
    expect(stored(services)).toBe(before);
    services.dispose();
  });

  it('keeps what another tab changed meanwhile: only the changed fields are saved', async () => {
    const services = await mount();
    await act(() =>
      services.domain.write(({ plan }) => ({ plan: { ...(plan as Plan), monthlyAmount: '300' as Money } })),
    );
    type('Last buy', '2027-06-05');
    await save();
    expect(stored(services).monthlyAmount).toBe('300');
    expect(stored(services).lastBuy).toBe('2027-06-05');
    expect(field(MONTHLY).value).toBe('300.00');
    services.dispose();
  });

  it('saves its own field after another tab moved the sell window, which it never sends unaccepted', async () => {
    const services = await mount();
    await act(() =>
      services.domain.write(({ plan }) => {
        const current = plan as Plan;
        const opens = '2029-10-01' as CalendarDate;
        return { plan: { ...current, sellWindow: { ...(current.sellWindow as Window), opens } } };
      }),
    );
    type(MONTHLY, '250');
    await save();
    expect(stored(services).monthlyAmount).toBe('250');
    expect(stored(services).sellWindow?.opens).toBe('2029-10-01');
    expect(screen.queryByRole('alert')).toBeNull();
    services.dispose();
  });

  it('saves a later last buy that opens the sell window early once accepted, and asks again for another', async () => {
    const services = await mount();
    const window = stored(services).sellWindow as Window;
    // The fixture's sell window opens in 2029: a last buy in 2030 passes the 365 days on 5 Jan 2031.
    type('Last buy', '2030-01-05');
    expect(screen.getByText(notice('5 Jan 2031'))).toBeDefined();
    fireEvent.click(screen.getByRole('checkbox', { name: ACCEPT }));
    await save();
    expect(stored(services).lastBuy).toBe('2030-01-05');
    expect(stored(services).sellWindow).toEqual({ ...window, acceptedEarlyOpen: true });
    // The stored acceptance holds for its own last buy and asks nothing; another one asks again, unticked.
    expect(screen.queryByRole('checkbox')).toBeNull();
    type(MONTHLY, '250');
    await save();
    expect(stored(services).sellWindow).toEqual({ ...window, acceptedEarlyOpen: true });
    type('Last buy', '2030-02-05');
    expect(screen.getByText(notice('5 Feb 2031'))).toBeDefined();
    expect(screen.getByRole('checkbox', { name: ACCEPT }).getAttribute('aria-checked')).toBe('false');
    services.dispose();
  });

  it("names Portugal's rule for an early last buy, with the note and Portugal's date line and its Sources", async () => {
    const pt = await loadProfile('PT');
    const services = await mount(fixtureSnapshot(), async () => (pt === null ? null : countryRules(pt)));
    type('Last buy', '2030-01-05');
    expect(
      screen.getByText(
        "The sell window opens on 1 Sept 2029. This last buy is tax-free from 5 Jan 2031 under Portugal's rule. " +
          'You can also choose an earlier last buy.',
      ),
    ).toBeDefined();
    expect(screen.getByText('Computed from your dates, not tax advice')).toBeDefined();
    const sources = await screen.findByRole('link', { name: 'Sources' });
    expect(sources.getAttribute('href')).toBe(pt?.sources[0]?.url);
    expect(sources.parentElement?.textContent).toMatch(
      /^Reviewed on \d+\s\w+\s\d{4} · general information, not advice · Sources$/,
    );
    services.dispose();
  });

  // #165's round-2 review (docs/CONTENT-STYLE.md §1 rule 8): nothing is refused before the person has tried.
  it('marks nothing invalid and shows no refusal line for an early last buy before the first save', async () => {
    const services = await mount();
    type('Last buy', '2030-01-05');
    expect(screen.getByText(notice('5 Jan 2031'))).toBeDefined();
    expect(screen.getByRole('checkbox', { name: ACCEPT }).getAttribute('aria-invalid')).toBeNull();
    expect(document.querySelector('[aria-invalid="true"]')).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByText(/^Tick the box/)).toBeNull();
    services.dispose();
  });

  it('writes nothing for a last buy that opens the sell window early until accepted, and moves the focus there', async () => {
    const services = await mount();
    const before = stored(services);
    type('Last buy', '2030-01-05');
    await save();
    const box = screen.getByRole('checkbox', { name: ACCEPT });
    expect(box.getAttribute('aria-invalid')).toBe('true');
    expect(document.activeElement).toBe(box);
    expect(field('Last buy').getAttribute('aria-invalid')).toBeNull();
    // The one alert is the notice's refusal line, which names the fix; no other line says why.
    expect(screen.getByRole('alert').textContent).toBe(
      'Tick the box to open the sell window early, or choose an earlier last buy.',
    );
    expect(stored(services)).toBe(before);
    services.dispose();
  });

  it('says why under the editor when the plan refuses the change on a field outside this tab', async () => {
    const services = await mount();
    const before = stored(services);
    type('Last buy', '2027-06-05');
    // Another tab moves the sell window earlier between this tab's read and its save: the window it moved is
    // not on this tab, so no field here can carry the refusal.
    const opens = '2028-04-01' as CalendarDate;
    await act(async () => {
      void services.domain.write(({ plan }) => {
        const current = plan as Plan;
        return { plan: { ...current, sellWindow: { ...(current.sellWindow as Window), opens } } };
      });
      fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    });
    expect(screen.getByRole('alert').textContent).toBe(
      'Not saved: this change conflicts with another part of your plan.',
    );
    expect(stored(services).lastBuy).toBe(before.lastBuy);
    services.dispose();
  });

  it("reads numbers in the new country's locale, once its rules load, after the plan moves there (#104)", async () => {
    // The plan opens in Germany, whose rules this test leaves out (en-GB numbers); Portugal's arrive on release.
    let release: () => void = () => undefined;
    const arrived = new Promise<void>((resolve) => {
      release = resolve;
    });
    const rules: Rules = async (country) => {
      if (country !== 'PT') return null;
      await arrived;
      const profile = await loadProfile('PT');
      return profile === null ? null : countryRules(profile);
    };
    const opened = fixtureSnapshot();
    const services = await mount({ ...opened, plan: { ...(opened.plan as Plan), country: 'DE' } }, rules);
    expect(field(MONTHLY).value).toBe('100.00');
    // Written as another tab would, not through the country section.
    await act(() => services.domain.write(({ plan }) => ({ plan: { ...(plan as Plan), country: 'PT' } })));
    expect(screen.queryByLabelText(MONTHLY)).toBeNull();
    release();
    expect((await screen.findByLabelText<HTMLInputElement>(MONTHLY)).value).toBe('100,00');
    type(MONTHLY, '1,500');
    fireEvent.blur(field(MONTHLY));
    expect(field(MONTHLY).value).toBe('1,50');
    services.dispose();
  });

  it('shows the empty state without a plan', async () => {
    await mount({ ...fixtureSnapshot(), plan: null, entries: [] });
    expect(screen.getByText('No plan yet')).toBeDefined();
  });
});
