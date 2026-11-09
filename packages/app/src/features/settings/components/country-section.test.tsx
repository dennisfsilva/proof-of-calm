// @vitest-environment jsdom
import { countryRules, loadProfile } from '@proofofcalm/content';
import type { CountryCode, Plan } from '@proofofcalm/core';
import { FIXTURE_RULES } from '@proofofcalm/core/testing/country-change';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { userEvent } from 'storybook/test';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { memoryPlanStore } from '../../../lib/adapters/memory-store';
import { I18nProvider } from '../../../lib/i18n';
import { NavigationProvider } from '../../../lib/navigation';
import type { Snapshot } from '../../../lib/ports';
import { type Services, ServicesProvider } from '../../../lib/services';
import { fixtureSnapshot } from '../../../lib/services/fixtures';
import { createTestServices, preloadLazyModules } from '../../../lib/services/testing';
import { crossTabChannel } from '../../../lib/store/channel';
import errors from '../../../messages/en/errors.json';
import plan from '../../../messages/en/plan.json';
import settings from '../../../messages/en/settings.json';
import shell from '../../../messages/en/shell.json';
import today from '../../../messages/en/today.json';
import { changeCountryOf } from '../actions';
import { CountrySection } from './country-section';

// Currency & data's country change (docs/DOMAIN.md §6 "Change country"): the select offers the loaded profiles,
// a choice lists what moves and names the plan's holding rule being replaced, the replacement waits for a tick,
// an early window waits for its acceptance, and another tab's change refuses the change.

// Base UI names the Country select a render after the section shows: the label registers its id in an effect,
// and CI under load ran a query before that render (run 39801318450). The label here arrives 30 ms late, so a
// query that does not wait for the name fails every time.
vi.mock('@proofofcalm/ui/components/select', async (importOriginal) => {
  const select = await importOriginal<typeof import('@proofofcalm/ui/components/select')>();
  const { createElement, useEffect, useState } = await import('react');
  function LateLabel(props: ComponentProps<typeof select.SelectLabel>) {
    const [shown, setShown] = useState(false);
    useEffect(() => {
      const timer = setTimeout(() => setShown(true), 30);
      return () => clearTimeout(timer);
    }, []);
    return shown ? createElement(select.SelectLabel, props) : null;
  }
  return { ...select, SelectLabel: LateLabel };
});

// Every mount loads the three profiles; under Vitest each import() is a round trip to the main process,
// which under load outlasted the heading's findBy (CI and local runs, 2026-10-26). They load once, here.
vi.mock('@proofofcalm/content', async (original) =>
  (await import('../../../lib/services/testing-modules')).profilesInMemory(
    await original<typeof import('@proofofcalm/content')>(),
  ),
);

afterEach(cleanup);
// jsdom has no `scrollIntoView`: the focus move onto the result line calls it.
Element.prototype.scrollIntoView = vi.fn();
// The jurisdiction profiles the section loads with import() load while the file loads, outside any
// timeout, so the select's findBy waits on renders, not on Vite's first transform of the JSON.
await preloadLazyModules();

// The profiles without fixture rules (packages/core/test/country-change/fixture.ts), France, Ireland, Italy,
// the Netherlands, Spain, the United Kingdom and the United States: their rules come from their profiles.
const rules = async (code: CountryCode) => {
  if (code in FIXTURE_RULES) return FIXTURE_RULES[code as 'PT' | 'DE' | 'XX'];
  const profile = await loadProfile(code);
  return profile === null ? null : countryRules(profile);
};
const withPlan = (patch: Partial<Plan>): Snapshot => {
  const snapshot = fixtureSnapshot();
  return { ...snapshot, plan: { ...(snapshot.plan as Plan), ...patch } };
};
const stored = (services: Services) => services.domain.store.getState().snapshot.plan as Plan;

async function mount(
  snapshot: Snapshot = fixtureSnapshot(),
  load = rules,
  services = createTestServices({ snapshot, rules: load }),
): Promise<Services> {
  await services.start();
  render(
    <NavigationProvider location="memory" initialPath="/settings">
      <ServicesProvider services={services}>
        <I18nProvider messages={{ settings, plan, errors, today, shell }}>
          <CountrySection />
        </I18nProvider>
      </ServicesProvider>
    </NavigationProvider>,
  );
  await screen.findByRole('heading', { name: 'Country' });
  return services;
}

// The select is named a render after it shows (the late label above): every query waits for the name.
const countrySelect = () => screen.findByRole('combobox', { name: 'Country' });
async function choose(name: string) {
  const user = userEvent.setup({ document });
  await user.click(await countrySelect());
  await user.click(await screen.findByRole('option', { name }));
}
const confirm = (name: string) =>
  act(async () => fireEvent.click(screen.getByRole('button', { name: `Change country to ${name}` })));
const items = () => screen.getAllByRole('listitem').map((item) => item.textContent);
// The holding-rule rows, one item per rule and one paragraph per line: the rule, then its country's date line.
const ruleLines = () =>
  screen
    .getAllByRole('listitem')
    .slice(1, 3)
    .flatMap((item) => Array.from(item.querySelectorAll('p'), (p) => p.textContent));
const NOTE = 'Computed from your dates, not tax advice';
const [DE_FIRST, DE_SECOND] = FIXTURE_RULES.DE.holdingRuleConditions as [string, string];
const dated = (date: string) => `Reviewed on ${date} · general information, not advice · Sources`;
// The line that reports the result, always there and empty until a change ends (docs/DESIGN.md §6).
const resultLine = () => screen.getByRole('status');

describe('CountrySection', () => {
  it('offers the profiles by name, the general one last, with the plan country chosen', async () => {
    await mount();
    expect((await countrySelect()).textContent).toContain('Portugal');
    const user = userEvent.setup({ document });
    await user.click(await countrySelect());
    const options = await screen.findAllByRole('option');
    expect(options.map((option) => option.textContent)).toEqual([
      'France',
      'Germany',
      'Ireland',
      'Italy',
      'Netherlands',
      'Portugal',
      'Spain',
      'United Kingdom',
      'United States',
      'Other country',
    ]);
  });

  it("lists the change, names Portugal's rule being replaced, and waits for the tick", async () => {
    const services = await mount();
    await choose('Germany');
    expect(items()[0]).toBe('Country: Portugal to Germany');
    expect(ruleLines()).toEqual([
      "Holding rule now: Portugal's rule. 365 days, then tax-free.",
      dated('5\u00a0Nov\u00a02026'),
      "After the change: Germany's rule. 1 year, then tax-free.",
      dated('5\u00a0Nov\u00a02026'),
    ]);
    // Each rule in its own item; then the day the last buy (5 Mar 2027) passes each rule, with the note once.
    const [, now, after, lastBuy] = screen.getAllByRole('listitem');
    expect(now?.textContent).toMatch(/^Holding rule now: Portugal's rule\./);
    expect(after?.textContent).toMatch(/^After the change: Germany's rule\./);
    // Under the note, the new country's first condition, the rest behind one control (docs/LEGAL.md \u00a74).
    expect(Array.from(lastBuy?.querySelectorAll('p') ?? [], (p) => p.textContent)).toEqual([
      'Last buy tax-free from 4\u00a0Mar\u00a02028 now, from 6\u00a0Mar\u00a02028 after the change',
      NOTE,
      DE_FIRST,
    ]);
    expect(screen.getByRole('button', { name: 'Show 1 more condition' }).closest('li')).toBe(lastBuy);
    expect(screen.queryByText(DE_SECOND)).toBeNull();
    expect(screen.getAllByText(NOTE)).toHaveLength(1);
    const sources = screen.getAllByRole('link', { name: 'Sources' }).map((link) => link.getAttribute('href'));
    expect(sources).toEqual([expect.stringContaining('portaldasfinancas'), expect.stringContaining('estg/__23')]);
    expect(screen.getByText('Amounts you already logged stay as typed; nothing is converted.')).toBeTruthy();
    await confirm('Germany');
    expect(screen.getByRole('alert').textContent).toBe('Tick the box to replace the holding rule.');
    expect(stored(services).country).toBe('PT');
    const tick = screen.getByRole('checkbox', { name: "Replace Portugal's rule with Germany's rule" });
    expect(document.activeElement).toBe(tick);
    fireEvent.click(tick);
    await confirm('Germany');
    expect(stored(services)).toMatchObject({ country: 'DE', holdingRule: FIXTURE_RULES.DE.holdingRule });
    expect(screen.queryByRole('list')).toBeNull();
  });

  it('focus moves to the result line after a change', async () => {
    const services = await mount();
    await choose('Germany');
    fireEvent.click(screen.getByRole('checkbox', { name: "Replace Portugal's rule with Germany's rule" }));
    screen.getByRole('button', { name: 'Change country to Germany' }).focus();
    await confirm('Germany');
    expect(stored(services).country).toBe('DE');
    expect(resultLine().textContent).toBe('Country changed to Germany.');
    expect(document.activeElement).toBe(resultLine());
    expect(services.toasts.getSnapshot()).toBeNull();
  });

  // The line the script focus move lands on carries the scroll margin, so the least scroll leaves room above it
  // (docs/DESIGN.md §6): flush with the window's top edge it read without context (session 12).
  it('the result line carries the scroll margin of a line a script focus move lands on', async () => {
    await mount();
    expect(resultLine().classList.contains('scroll-mt-result')).toBe(true);
  });

  // The line is focused once React has committed the confirmation's unmount: focused before it, the document
  // shrinks under the line and a browser leaves it above the viewport (android-small and zoom-125, session 11).
  it('focuses the result line only once the confirmation has left the document', async () => {
    await mount();
    await choose('Germany');
    fireEvent.click(screen.getByRole('checkbox', { name: "Replace Portugal's rule with Germany's rule" }));
    const button = screen.getByRole('button', { name: 'Change country to Germany' });
    button.focus();
    const focus = HTMLElement.prototype.focus;
    const buttonPresent: boolean[] = [];
    const spy = vi.spyOn(HTMLElement.prototype, 'focus').mockImplementation(function (this: HTMLElement, options) {
      if (this.getAttribute('role') === 'status') buttonPresent.push(document.body.contains(button));
      focus.call(this, options);
    });
    try {
      await confirm('Germany');
    } finally {
      spy.mockRestore();
    }
    expect(buttonPresent).toEqual([false]);
    expect(document.activeElement).toBe(resultLine());
  });

  it('a second activation while the change is written does nothing and the line reports the change', async () => {
    const services = await mount();
    await choose('Germany');
    fireEvent.click(screen.getByRole('checkbox', { name: "Replace Portugal's rule with Germany's rule" }));
    const button = screen.getByRole('button', { name: 'Change country to Germany' });
    await act(async () => {
      fireEvent.click(button);
      fireEvent.click(button);
    });
    expect(stored(services).country).toBe('DE');
    expect(resultLine().textContent).toBe('Country changed to Germany.');
    expect(document.activeElement).toBe(resultLine());
  });

  // A native `disabled` on the focused button makes browsers drop the focus to `body` (jsdom does not), so the
  // button only says it is busy while the change is written and keeps the focus.
  it('keeps the focus on the button while the change is written, aria-disabled and not disabled', async () => {
    const services = await mount();
    await choose('Germany');
    fireEvent.click(screen.getByRole('checkbox', { name: "Replace Portugal's rule with Germany's rule" }));
    const write = services.domain.write.bind(services.domain);
    let release = () => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    vi.spyOn(services.domain, 'write').mockImplementationOnce(async (changes) => {
      await held;
      return write(changes);
    });
    const button = screen.getByRole('button', { name: 'Change country to Germany' });
    button.focus();
    await act(async () => fireEvent.click(button));
    expect(button.hasAttribute('disabled')).toBe(false);
    expect(button.getAttribute('aria-disabled')).toBe('true');
    expect(document.activeElement).toBe(button);
    await act(async () => release());
    expect(stored(services).country).toBe('DE');
    expect(document.activeElement).toBe(resultLine());
  });

  it('choosing another country empties the result line', async () => {
    await mount();
    await choose('Germany');
    fireEvent.click(screen.getByRole('checkbox', { name: "Replace Portugal's rule with Germany's rule" }));
    await confirm('Germany');
    expect(resultLine().textContent).toBe('Country changed to Germany.');
    await choose('Portugal');
    expect(resultLine().textContent).toBe('');
  });

  it("names the person's own rule as the one replaced, with no date line, and the general profile's in its words", async () => {
    await mount(withPlan({ holdingRule: { kind: 'days', days: 730, effect: 'exempt' } }));
    await choose('Other country');
    expect(
      screen.getByRole('checkbox', { name: "Replace your own rule with the general profile's rule" }),
    ).toBeTruthy();
    expect(ruleLines()).toEqual([
      'Holding rule now: your own rule. 730 days, then tax-free.',
      "After the change: the general profile's rule. No holding exemption is applied: treat every sale as a " +
        'possibly taxable event.',
      'Reviewed on 17\u00a0Oct\u00a02026: the general profile, not a rule for your country · general information, not advice',
    ]);
    expect(screen.queryByRole('link', { name: 'Sources' })).toBeNull();
    expect(screen.queryByText(/No holding rule/)).toBeNull();
  });

  // Both cards are past their review on this day (docs/JURISDICTIONS.md §1): as with an unknown source, no words.
  it('a country under review keeps its rule by name alone', async () => {
    const snapshot = fixtureSnapshot();
    const nowMs = Date.parse('2029-01-01T10:00:00Z');
    await mount(snapshot, rules, createTestServices({ snapshot, rules, nowMs }));
    await choose('Germany');
    expect(ruleLines()).toEqual([
      "Holding rule now: Portugal's rule. ",
      'Not reviewed since 5 Nov 2026 · general information, not advice',
      "After the change: Germany's rule. ",
      'Not reviewed since 5 Nov 2026 · general information, not advice',
    ]);
    expect(screen.queryByRole('link', { name: 'Sources' })).toBeNull();
    expect(screen.getByRole('checkbox', { name: "Replace Portugal's rule with Germany's rule" })).toBeTruthy();
  });

  // A count in the rule's words is a figure in the plan's number locale (docs/CONTENT-STYLE.md §4).
  it("groups the days of a German plan's own rule", async () => {
    await mount(
      withPlan({ country: 'DE' as Plan['country'], holdingRule: { kind: 'days', days: 1000, effect: 'exempt' } }),
    );
    await choose('Portugal');
    expect(ruleLines()[0]).toBe('Holding rule now: your own rule. 1.000 days, then tax-free.');
  });

  // ADR-0053: until the section asks the currency question, a change that would relabel logged amounts keeps the
  // plan's currencies. The fixture plan pays in EUR and its live entries hold amounts; the United Kingdom's is GBP.
  it("keeps the plan's currencies on a move to the United Kingdom with amounts logged, and lists no currency row", async () => {
    const services = await mount();
    await choose('United Kingdom');
    expect(items().filter((item) => item?.startsWith('Currency'))).toEqual([]);
    for (const box of screen.getAllByRole('checkbox')) fireEvent.click(box);
    await confirm('United Kingdom');
    expect(stored(services)).toMatchObject({ country: 'GB', payCurrency: 'EUR', displayCurrency: 'EUR' });
  });

  it('lets the currencies follow the country when no entry holds an amount, and lists both rows', async () => {
    const services = await mount({ ...fixtureSnapshot(), entries: [] });
    await choose('United Kingdom');
    expect(items().filter((item) => item?.startsWith('Currency'))).toEqual([
      'Currency for new amounts: EUR to GBP',
      'Currency shown: EUR to GBP',
    ]);
    for (const box of screen.getAllByRole('checkbox')) fireEvent.click(box);
    await confirm('United Kingdom');
    expect(stored(services)).toMatchObject({ country: 'GB', payCurrency: 'GBP', displayCurrency: 'GBP' });
  });

  // #165's round-2 review (docs/CONTENT-STYLE.md §1 rule 8): nothing is refused before the person has tried.
  it('marks nothing invalid and shows no refusal line for an early window before the first change', async () => {
    const early = { opens: '2028-03-05', closes: '2028-08-31', exitBy: '2028-12-31' } as NonNullable<
      Plan['sellWindow']
    >;
    await mount(withPlan({ sellWindow: early }));
    await choose('Germany');
    fireEvent.click(screen.getByRole('checkbox', { name: "Replace Portugal's rule with Germany's rule" }));
    expect(document.querySelector('[aria-invalid="true"]')).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByText(/^Tick the box/)).toBeNull();
  });

  it('waits for the acceptance of a window the new rule opens early, then stores it', async () => {
    const early = { opens: '2028-03-05', closes: '2028-08-31', exitBy: '2028-12-31' } as NonNullable<
      Plan['sellWindow']
    >;
    const services = await mount(withPlan({ sellWindow: early }));
    await choose('Germany');
    fireEvent.click(screen.getByRole('checkbox', { name: "Replace Portugal's rule with Germany's rule" }));
    await confirm('Germany');
    expect(stored(services).country).toBe('PT');
    const accept = screen.getByRole('checkbox', { name: /^Open the sell window on/ });
    expect(accept.getAttribute('aria-invalid')).toBe('true');
    expect(
      screen.getByText(
        /under Germany's rule\. You can also cancel this change and choose a later opening date on Hold & sell\.$/,
      ),
    ).toBeTruthy();
    // The last-buy row and the notice both show the dates: the note shows once, under the row, and the new
    // country's conditions with it, so the notice shows neither.
    expect(screen.getAllByText(NOTE)).toHaveLength(1);
    expect(screen.getByText(NOTE).closest('li')?.textContent).toMatch(
      /^Last buy tax-free from .* now, from .* after the change/,
    );
    expect(screen.getAllByText(DE_FIRST)).toHaveLength(1);
    expect(screen.getByText(DE_FIRST).closest('li')).toBe(screen.getByText(NOTE).closest('li'));
    fireEvent.click(accept);
    await confirm('Germany');
    expect(stored(services)).toMatchObject({ country: 'DE', sellWindow: { ...early, acceptedEarlyOpen: true } });
  });

  it('names a fix the country change cannot make here, cancelling it for Hold & sell', async () => {
    const early = { opens: '2028-03-05', closes: '2028-08-31', exitBy: '2028-12-31' } as NonNullable<
      Plan['sellWindow']
    >;
    const services = await mount(withPlan({ sellWindow: early }));
    await choose('Germany');
    fireEvent.click(screen.getByRole('checkbox', { name: "Replace Portugal's rule with Germany's rule" }));
    await confirm('Germany');
    expect(stored(services).country).toBe('PT');
    const refusal = screen.getByRole('alert');
    expect(refusal.textContent).toBe(
      'Tick the box to open the sell window early, or cancel this change and choose a later opening date on Hold & sell.',
    );
    const accept = screen.getByRole('checkbox', { name: /^Open the sell window on/ });
    expect(accept.getAttribute('aria-describedby')).toContain(refusal.id);
  });

  it('refuses a change once another tab moved the plan, and shows the plan as stored', async () => {
    const services = await mount();
    await choose('Other country');
    await act(() => services.domain.write({ plan: { ...stored(services), holdingRule: { kind: 'none' } } }));
    fireEvent.click(screen.getByRole('checkbox', { name: /^Replace Portugal's rule with/ }));
    await confirm('Other country');
    expect(screen.getByRole('alert').textContent).toContain('Your plan changed in another browser tab');
    expect(stored(services).country).toBe('PT');
    expect(screen.queryByRole('checkbox')).toBeNull();
    await confirm('Other country');
    expect(stored(services)).toMatchObject({ country: 'XX', holdingRule: { kind: 'none' } });
  });

  it('asks for the tick again once another tab set the plan an own rule', async () => {
    const services = await mount();
    await choose('Germany');
    fireEvent.click(screen.getByRole('checkbox', { name: "Replace Portugal's rule with Germany's rule" }));
    const own = { kind: 'days', days: 730, effect: 'exempt' } as const;
    await act(() => services.domain.write({ plan: { ...stored(services), holdingRule: own } }));
    await confirm('Germany');
    expect(screen.getByRole('alert').textContent).toContain('Your plan changed in another browser tab');
    const tick = screen.getByRole('checkbox', { name: "Replace your own rule with Germany's rule" });
    expect(tick.getAttribute('aria-checked')).toBe('false');
    await confirm('Germany');
    expect(screen.getByText('Tick the box to replace the holding rule.')).toBeTruthy();
    expect(stored(services)).toMatchObject({ country: 'PT', holdingRule: own });
  });

  it('shows the early-window notice once another tab moved the last buy, then saves with it accepted', async () => {
    const services = await mount();
    await choose('Germany');
    fireEvent.click(screen.getByRole('checkbox', { name: "Replace Portugal's rule with Germany's rule" }));
    await act(() => services.domain.write({ plan: { ...stored(services), lastBuy: '2028-09-01' as Plan['lastBuy'] } }));
    await confirm('Germany');
    expect(screen.getByRole('alert').textContent).toContain('Your plan changed in another browser tab');
    const accept = screen.getByRole('checkbox', { name: /^Open the sell window on/ });
    expect(accept.getAttribute('aria-checked')).toBe('false');
    fireEvent.click(screen.getByRole('checkbox', { name: "Replace Portugal's rule with Germany's rule" }));
    fireEvent.click(accept);
    await confirm('Germany');
    expect(stored(services)).toMatchObject({
      country: 'DE',
      lastBuy: '2028-09-01',
      sellWindow: { acceptedEarlyOpen: true },
    });
  });

  it('clears the plan-changed line once the change saves on the second try', async () => {
    const services = await mount();
    await choose('Germany');
    const tick = () =>
      fireEvent.click(screen.getByRole('checkbox', { name: "Replace Portugal's rule with Germany's rule" }));
    tick();
    await act(() => services.domain.write({ plan: { ...stored(services), payCurrency: 'USD' } }));
    await confirm('Germany');
    expect(screen.getByRole('alert').textContent).toContain('Your plan changed in another browser tab');
    tick();
    await confirm('Germany');
    expect(stored(services).country).toBe('DE');
    expect(resultLine().textContent).toBe('Country changed to Germany.');
    expect(screen.queryByRole('alert')?.textContent ?? null).toBeNull();
  });

  it('focus moves to the plan-changed line when another tab moved the plan', async () => {
    const services = await mount();
    await choose('Germany');
    fireEvent.click(screen.getByRole('checkbox', { name: "Replace Portugal's rule with Germany's rule" }));
    await act(() => services.domain.write({ plan: { ...stored(services), payCurrency: 'USD' } }));
    screen.getByRole('button', { name: 'Change country to Germany' }).focus();
    await confirm('Germany');
    const line = screen.getByRole('alert');
    expect(line.textContent).toContain('Your plan changed in another browser tab');
    expect(document.activeElement).toBe(line);
  });

  it('focus moves to the not-saved line when the change is not saved', async () => {
    const services = await mount();
    await choose('Germany');
    fireEvent.click(screen.getByRole('checkbox', { name: "Replace Portugal's rule with Germany's rule" }));
    const write = services.domain.write.bind(services.domain);
    vi.spyOn(services.domain, 'write').mockImplementationOnce((changes) =>
      write(typeof changes === 'function' ? (snapshot) => changes({ ...snapshot, plan: null }) : changes),
    );
    screen.getByRole('button', { name: 'Change country to Germany' }).focus();
    await confirm('Germany');
    const line = screen.getByRole('alert');
    expect(line.textContent).toBe(settings.notSaved);
    expect(document.activeElement).toBe(line);
  });

  it('clears the not-saved line once the change saves on the second try', async () => {
    const services = await mount();
    await choose('Germany');
    fireEvent.click(screen.getByRole('checkbox', { name: "Replace Portugal's rule with Germany's rule" }));
    // The first write's turn finds no plan stored, as when another tab's wipe lands in that turn.
    const write = services.domain.write.bind(services.domain);
    vi.spyOn(services.domain, 'write').mockImplementationOnce((changes) =>
      write(typeof changes === 'function' ? (snapshot) => changes({ ...snapshot, plan: null }) : changes),
    );
    await confirm('Germany');
    expect(screen.getByRole('alert').textContent).toBe(settings.notSaved);
    await confirm('Germany');
    expect(stored(services).country).toBe('DE');
    expect(resultLine().textContent).toBe('Country changed to Germany.');
    expect(screen.queryByRole('alert')?.textContent ?? null).toBeNull();
  });

  it('names the fix when the core refuses the changed plan, and focuses that line', async () => {
    const services = await mount();
    await choose('Germany');
    fireEvent.click(screen.getByRole('checkbox', { name: "Replace Portugal's rule with Germany's rule" }));
    // An amount the new currency cannot hold: an invariant of the plan the change re-derives (docs/DOMAIN.md §6).
    const write = services.domain.write.bind(services.domain);
    vi.spyOn(services.domain, 'write').mockImplementationOnce((changes) =>
      write(
        typeof changes === 'function'
          ? (snapshot) =>
              changes({
                ...snapshot,
                plan: { ...(snapshot.plan as Plan), monthlyAmount: '100.001' as Plan['monthlyAmount'] },
              })
          : changes,
      ),
    );
    await confirm('Germany');
    const line = screen.getByRole('alert');
    expect(line.textContent).toBe(
      'Not saved: this change conflicts with another part of your plan. Check Plan and Hold & sell, then change the ' +
        'country again.',
    );
    expect(document.activeElement).toBe(line);
    expect(stored(services).country).toBe('PT');
  });

  it('closes on a plan another tab already moved to the chosen country with an own rule', async () => {
    const services = await mount();
    await choose('Germany');
    fireEvent.click(screen.getByRole('checkbox', { name: "Replace Portugal's rule with Germany's rule" }));
    const own = { kind: 'days', days: 730, effect: 'exempt' } as const;
    await act(() => services.domain.write({ plan: { ...stored(services), country: 'DE', holdingRule: own } }));
    await confirm('Germany');
    expect(screen.queryByRole('alert')).toBeNull();
    expect(resultLine().textContent).toBe('Your plan was changed to Germany in another browser tab.');
    expect(document.activeElement).toBe(resultLine());
    expect(screen.queryByRole('button', { name: 'Change country to Germany' })).toBeNull();
    expect((await countrySelect()).textContent).toContain('Germany');
    expect(stored(services)).toMatchObject({ country: 'DE', holdingRule: own });
  });

  it("offers no change while the plan's country's rule is not loaded, as Hold & sell does", async () => {
    await mount(fixtureSnapshot(), async (code) => (code === 'PT' ? null : rules(code)));
    expect(
      screen.getByText(
        "Your country's rule is not loaded on this device. Reload the page when you are online to change the country.",
      ),
    ).toBeTruthy();
    expect(screen.queryByRole('combobox')).toBeNull();
    expect(screen.queryByText(/your own rule/)).toBeNull();
    expect(screen.queryByText(/\bPT\b/)).toBeNull();
  });

  it('focus moves to the result line when another tab already moved the plan, with no toast and no write', async () => {
    const shared = memoryPlanStore(fixtureSnapshot());
    const tab = () =>
      createTestServices({
        planStore: shared,
        rules,
        channel: crossTabChannel({ name: 'country-section-test', tabId: crypto.randomUUID() }),
      });
    const other = tab();
    await other.start();
    const services = await mount(undefined, rules, tab());
    await choose('Germany');
    fireEvent.click(screen.getByRole('checkbox', { name: "Replace Portugal's rule with Germany's rule" }));
    await act(async () => void (await changeCountryOf(other, FIXTURE_RULES.DE, stored(other), false, null)));
    await waitFor(() => expect(stored(services).country).toBe('DE'));
    const updatedAt = shared.current().plan?.updatedAt;
    screen.getByRole('button', { name: 'Change country to Germany' }).focus();
    await confirm('Germany');
    expect(screen.queryByRole('button', { name: 'Change country to Germany' })).toBeNull();
    expect(screen.queryByRole('list')).toBeNull();
    expect(resultLine().textContent).toBe('Your plan was changed to Germany in another browser tab.');
    expect(document.activeElement).toBe(resultLine());
    expect(screen.queryByRole('alert')).toBeNull();
    expect((await countrySelect()).textContent).toContain('Germany');
    expect(services.toasts.getSnapshot()).toBeNull();
    expect(shared.current().plan?.updatedAt).toBe(updatedAt);
    other.dispose();
    services.dispose();
  });

  it('says so when no profile loaded', async () => {
    await mount(fixtureSnapshot(), async () => null);
    expect(screen.getByText('The country profiles are not loaded on this device.')).toBeTruthy();
    expect(screen.queryByRole('combobox')).toBeNull();
  });
});
