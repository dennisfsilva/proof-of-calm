// @vitest-environment jsdom
import { TEMPLATES, templateById } from '@proofofcalm/content';
import { type CalendarDate, EntityIdSchema, type Plan } from '@proofofcalm/core';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EMPTY_SNAPSHOT, memoryPlanStore } from '../../../lib/adapters';
import { I18nProvider } from '../../../lib/i18n';
import { NavigationProvider, usePathname } from '../../../lib/navigation';
import type { AnalyticsEvent } from '../../../lib/ports';
import { type Services, ServicesProvider } from '../../../lib/services';
import { fixtureSnapshot } from '../../../lib/services/fixtures';
import { createTestServices, preloadLazyModules } from '../../../lib/services/testing';
import errors from '../../../messages/en/errors.json';
import onboarding from '../../../messages/en/onboarding.json';
import plan from '../../../messages/en/plan.json';
import shell from '../../../messages/en/shell.json';
import { OnboardingDraftSchema } from '../model/draft';
import { emptyDraft } from '../model/setup';
import { OnboardingScreen } from './onboarding-screen';

// Under Vitest each import() of a profile is a round trip to the main process, which under load outlasted the
// country's findBy (2026-10-26): the profiles load once, here (lib/services/testing-modules.ts).
vi.mock('@proofofcalm/content', async (original) =>
  (await import('../../../lib/services/testing-modules')).profilesInMemory(
    await original<typeof import('@proofofcalm/content')>(),
  ),
);

afterEach(cleanup);
// The jurisdiction profiles the country step loads with import() load while the file loads, outside any
// test's timeout, so the country's findBy waits on renders, not on Vite's first transform (seconds under load).
await preloadLazyModules();

const LINE = 'A starting point some people use. You choose every setting. Not advice.';
const EXISTING = 'A plan is already set up on this device.';
const LISBON = { languages: ['en-GB'], timeZone: 'Europe/Lisbon' } as const;
const BERLIN = { languages: ['de-DE'], timeZone: 'Europe/Berlin' } as const;
/** Template names are content under review: the tests pick a template by its id. */
const nameOf = (id: string) => templateById(id)?.name ?? id;

function Path() {
  return <output data-testid="path">{usePathname()}</output>;
}

type Device = { languages: readonly string[]; timeZone: string };

/** Renders the screen over `services`, as a reopened screen does over the same session. */
function show(services: Services, device: Device = LISBON) {
  render(
    <NavigationProvider location="memory" initialPath="/onboarding">
      <ServicesProvider services={services}>
        <I18nProvider messages={{ errors, onboarding, plan, shell }}>
          <OnboardingScreen device={device} />
          <Path />
        </I18nProvider>
      </ServicesProvider>
    </NavigationProvider>,
  );
}

async function mount(withPlan = false, device: Device = LISBON, planStore = memoryPlanStore(EMPTY_SNAPSHOT)) {
  const counted: AnalyticsEvent[] = [];
  const services = createTestServices({
    ...(withPlan ? { snapshot: fixtureSnapshot() } : { planStore }),
    analytics: { count: (event) => void counted.push(event) },
  });
  const write = vi.spyOn(services.domain, 'write');
  show(services, device);
  await act(() => services.start());
  return { services, write, counted };
}

const START = 'Accept and start the plan';
const DISCLOSURE = 'is software for a plan you design';
const WHY = 'In one sentence, why are you doing this?';
const REMINDER = 'Where should the monthly reminder go?';
const SUMMARY = 'Check your plan';

const click = (name: string | RegExp) => act(() => fireEvent.click(screen.getByRole('button', { name })));
const pick = (id: string) => act(() => fireEvent.click(screen.getByRole('radio', { name: nameOf(id) })));
const type = (label: RegExp, value: string) =>
  act(() => fireEvent.change(screen.getByLabelText(label), { target: { value } }));
const confirmCountry = async (name: string) =>
  click(await screen.findByText(name).then((node) => node.textContent ?? ''));

/** From Numbers or Dates through the sentence and the reminder (Later) to the summary. */
async function toSummary() {
  await click('Continue');
  await click('Continue');
  await click('Later');
}

/** Portugal, the two-coin template, Monthly 100 and Last buy 2036-10-01, on the summary: one tap from a plan. */
async function numbers(planStore?: ReturnType<typeof memoryPlanStore>) {
  const mounted = await mount(false, LISBON, planStore);
  await confirmCountry('Continue with Portugal');
  await pick('two-coins');
  await click('Continue');
  await type(/^Monthly amount/, '100');
  await type(/^Last buy/, '2036-10-01');
  await toSummary();
  return mounted;
}

describe('OnboardingScreen', () => {
  it('confirms the suggested country with one tap', async () => {
    await mount();
    expect(await screen.findByText('This device suggests Portugal.')).toBeDefined();
    await click('Continue with Portugal');
    expect(screen.getByRole('heading', { level: 2, name: 'Choose a starting point' })).toBeDefined();
  });

  it('leads each template with its risk label, then the template line once with its Risk link', async () => {
    await mount();
    await confirmCountry('Continue with Portugal');
    const link = screen.getByRole('link', { name: 'Risk disclosure' });
    expect(link.getAttribute('href')).toBe('/risk');
    const line = link.parentElement;
    if (line === null) throw new Error('the link sits in the template line');
    expect(line.textContent).toBe(`${LINE} Risk disclosure`);
    expect(screen.getAllByText(LINE, { exact: false })).toHaveLength(1);
    for (const template of TEMPLATES) {
      const label = screen.getByText(template.riskLabel);
      const name = screen.getByText(template.name);
      expect(label.compareDocumentPosition(name) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      expect(name.compareDocumentPosition(line) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
    expect(document.body.textContent).not.toMatch(/recommend|best|top|popular|default/i);
  });

  it('starts the plan with one write, counts it and opens Today', async () => {
    const { services, write, counted } = await mount();
    await confirmCountry('Continue with Portugal');
    await pick('two-coins');
    await click('Continue');
    await click('Continue');
    expect(screen.getByText('Enter a number.')).toBeDefined();
    expect(document.activeElement).toBe(screen.getByLabelText(/^Monthly amount/));
    await type(/^Monthly amount/, '100');
    await type(/^Last buy/, '2036-10-01');
    await toSummary();
    expect(write).not.toHaveBeenCalled();
    await click(START);
    expect(write).toHaveBeenCalledTimes(1);
    const stored = services.domain.store.getState().snapshot.plan;
    expect([stored?.country, stored?.templateId, stored?.monthlyAmount, stored?.buyDay]).toEqual([
      'PT',
      'two-coins',
      '100',
      20,
    ]);
    expect(counted).toEqual(['plan_created']);
    expect(screen.getByTestId('path').textContent).toBe('/today');
  });

  it('records the acknowledgement: the clock’s now at the tap and wording version 1', async () => {
    const { services } = await numbers();
    const before = services.clock.now();
    await click(START);
    const after = services.clock.now();
    const stored = services.domain.store.getState().snapshot.plan;
    const at = stored?.riskAcknowledgedAt ?? '';
    expect(before <= at && at <= after, `${before} <= ${at} <= ${after}`).toBe(true);
    expect(stored?.riskWordingVersion).toBe(1);
  });

  it('after Start, never renders the already-set-up notice and never moves the focus to it (#101)', async () => {
    await numbers();
    const added: string[] = [];
    const observer = new MutationObserver((records) => {
      for (const record of records) for (const node of record.addedNodes) added.push(node.textContent ?? '');
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    const focused: string[] = [];
    const onFocus = (event: FocusEvent) => focused.push((event.target as HTMLElement).textContent ?? '');
    document.addEventListener('focusin', onFocus);
    await click(START);
    observer.disconnect();
    document.removeEventListener('focusin', onFocus);
    expect(added.join('\n')).not.toContain(EXISTING);
    expect(screen.queryByText(EXISTING)).toBeNull();
    expect(focused).not.toContain('Open the plan');
  });

  it('writes one plan for two taps on Start, and disables Start while the write is pending', async () => {
    const { write, counted } = await numbers();
    const start = screen.getByRole('button', { name: START });
    await act(() => {
      fireEvent.click(start);
      fireEvent.click(start);
    });
    expect(write).toHaveBeenCalledTimes(1);
    expect(counted).toEqual(['plan_created']);
    cleanup();

    const held = await numbers();
    let release = () => {};
    held.write.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
    await click(START);
    expect(screen.getByRole('button', { name: START }).getAttribute('aria-disabled')).toBe('true');
    await act(async () => release());
    expect(held.counted).toEqual(['plan_created']);
  });

  it('keeps a plan another tab stored while the steps were open, says so and writes nothing', async () => {
    const shared = memoryPlanStore(EMPTY_SNAPSHOT);
    const { services, counted } = await numbers(shared);
    const theirs: Plan | null = fixtureSnapshot().plan;
    // The other tab writes to the same rows; this tab's snapshot has not seen it when Start is tapped.
    await shared.write({ plan: theirs });
    expect(services.domain.store.getState().snapshot.plan).toBeNull();
    await click(START);
    expect(screen.getByText(EXISTING)).toBeDefined();
    expect(screen.getByRole('link', { name: 'Open the plan' }).getAttribute('href')).toBe('/plan');
    expect(shared.current().plan).toEqual(theirs);
    expect(counted).toEqual([]);
    expect(screen.getByTestId('path').textContent).toBe('/onboarding');
  });

  it('asks to accept the Cycle plan’s early window in Germany, and goes on only once it is accepted', async () => {
    const { services, write } = await mount(false, BERLIN);
    await confirmCountry('Continue with Germany');
    await pick('cycle-plan');
    await click('Continue');
    await type(/^Monthly amount/, '100');
    expect(
      screen.getByText(
        "The sell window opens on 1 Jun 2029. The template's last buy is tax-free from 2 Jun 2029 under " +
          "Germany's rule. You can also choose another starting point.",
      ),
    ).toBeDefined();
    // Under the notice, the template's note and Germany's date line with its source (docs/LEGAL.md §6 question 13).
    expect(screen.getByText("Computed from the template's dates, not tax advice")).toBeDefined();
    expect(screen.queryByText('Computed from your dates, not tax advice')).toBeNull();
    const sources = screen.getByRole('link', { name: 'Sources' });
    expect(sources.getAttribute('href')).toContain('estg/__23');
    expect(sources.parentElement?.textContent).toMatch(
      /^Reviewed on \d+\s\w+\s\d{4} · general information, not advice · Sources$/,
    );
    const accept = () => screen.getByRole('checkbox', { name: /^Open the sell window on 1\u00a0Jun\u00a02029/ });
    expect(accept().getAttribute('aria-checked')).toBe('false');
    await click('Continue');
    expect(screen.queryByRole('heading', { level: 2, name: WHY })).toBeNull();
    expect(accept().getAttribute('aria-invalid')).toBe('true');
    expect(document.activeElement).toBe(accept());
    await act(() => fireEvent.click(accept()));
    await toSummary();
    expect(write).not.toHaveBeenCalled();
    await click(START);
    expect(services.domain.store.getState().snapshot.plan?.sellWindow?.acceptedEarlyOpen).toBe(true);
  });

  // #165's round-2 review (docs/CONTENT-STYLE.md §1 rule 8): nothing is refused before the person has tried.
  it('marks nothing invalid and shows no refusal line before the first Continue', async () => {
    await mount(false, BERLIN);
    await confirmCountry('Continue with Germany');
    await pick('cycle-plan');
    await click('Continue');
    await type(/^Monthly amount/, '100');
    const accept = screen.getByRole('checkbox', { name: /^Open the sell window on 1\u00a0Jun\u00a02029/ });
    expect(accept.getAttribute('aria-invalid')).toBeNull();
    expect(document.querySelector('[aria-invalid="true"]')).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByText(/^Tick the box/)).toBeNull();
  });

  it('says why a Continue without the tick is refused, beside the marked box; the summary names the rule', async () => {
    await mount(false, BERLIN);
    await confirmCountry('Continue with Germany');
    await pick('cycle-plan');
    await click('Continue');
    await type(/^Monthly amount/, '100');
    await click('Continue');
    const accept = screen.getByRole('checkbox', { name: /^Open the sell window/ });
    expect(document.activeElement).toBe(accept);
    const refusal = screen.getByText('Tick the box to open the sell window early, or choose another starting point.');
    expect(refusal.getAttribute('role')).toBe('alert');
    expect(accept.getAttribute('aria-describedby')).toContain(refusal.id);
    await act(() => fireEvent.click(accept));
    expect(screen.queryByRole('alert')).toBeNull();
    await toSummary();
    expect(screen.getByText("Germany's rule. 1 year, then tax-free.")).toBeDefined();
    expect(screen.getByRole('link', { name: 'Sources' }).getAttribute('href')).toContain('estg/__23');
    expect(
      screen.getByText(/^1 Jun 2029 to .+, opening before the last buy passes the holding rule, as you accepted$/),
    ).toBeDefined();
  });

  it('drops the acceptance when the template or the country changes', async () => {
    await mount(false, BERLIN);
    await confirmCountry('Continue with Germany');
    const accept = () => screen.getByRole('checkbox', { name: /^Open the sell window/ });
    await pick('cycle-plan');
    await click('Continue');
    await act(() => fireEvent.click(accept()));
    expect(accept().getAttribute('aria-checked')).toBe('true');
    await click('Back');
    await pick('two-coins');
    await click('Continue');
    expect(screen.queryByRole('checkbox')).toBeNull();
    await click('Back');
    await pick('cycle-plan');
    await click('Continue');
    expect(accept().getAttribute('aria-checked')).toBe('false');

    await act(() => fireEvent.click(accept()));
    await click('Back');
    await click('Back');
    await click('Continue with Germany');
    await click('Continue');
    expect(accept().getAttribute('aria-checked')).toBe('false');
  });

  it("asks for the last buy once the first buy is after the template's last buy", async () => {
    await mount();
    await confirmCountry('Continue with Portugal');
    await pick('cycle-plan');
    await click('Continue');
    expect(screen.queryByLabelText(/^Last buy/)).toBeNull();
    await type(/^First buy/, '2028-07-01');
    expect(screen.getByLabelText(/^Last buy/)).toBeDefined();
    expect(screen.queryByRole('checkbox')).toBeNull();
  });

  it("moves the focus to each new step's heading, never to the body", async () => {
    await mount();
    const focused = () => {
      expect(document.activeElement).not.toBe(document.body);
      return document.activeElement === screen.getByRole('heading', { level: 2 }) && document.activeElement.textContent;
    };
    await confirmCountry('Continue with Portugal');
    expect(focused()).toBe('Choose a starting point');
    await pick('two-coins');
    await click('Continue');
    expect(focused()).toBe('Amounts and dates');
    await click('Back');
    expect(focused()).toBe('Choose a starting point');
    await act(() => fireEvent.click(screen.getByRole('radio', { name: 'Your own coins' })));
    await click('Continue');
    expect(focused()).toBe('Choose your coins and their split');
    await click('Add Bitcoin');
    await type(/^Bitcoin share/, '100');
    await click('Continue');
    expect(focused()).toBe('Choose the amounts and dates');
  });

  it('moves the focus to the sentence, reminder and summary headings; the disclosure shows on the summary only', async () => {
    await mount();
    const focused = () =>
      document.activeElement === screen.getByRole('heading', { level: 2 }) && document.activeElement.textContent;
    const disclosed = () => document.body.textContent?.includes(DISCLOSURE) ?? false;
    await confirmCountry('Continue with Portugal');
    expect(disclosed()).toBe(false);
    await pick('two-coins');
    await click('Continue');
    expect(disclosed()).toBe(false);
    await type(/^Monthly amount/, '100');
    await type(/^Last buy/, '2036-10-01');
    await click('Continue');
    expect([focused(), disclosed()]).toEqual([WHY, false]);
    await click('Continue');
    expect([focused(), disclosed()]).toEqual([REMINDER, false]);
    await click('Later');
    expect([focused(), disclosed()]).toEqual([SUMMARY, true]);
    expect(screen.getAllByRole('button', { name: START })).toHaveLength(1);
    await click('Back');
    expect(focused()).toBe(REMINDER);
    await click('Back');
    await click('Back');
    expect(focused()).toBe('Amounts and dates');
  });

  it('starts a plan of your own coins with one write: coins and split, amounts and dates, then the sentence', async () => {
    const { services, write } = await mount();
    await confirmCountry('Continue with Portugal');
    await act(() => fireEvent.click(screen.getByRole('radio', { name: 'Your own coins' })));
    await click('Continue');
    await click('Add Bitcoin');
    await click('Add Ethereum');
    await type(/^Bitcoin share/, '60');
    await type(/^Ethereum share/, '30');
    await click('Continue');
    expect(screen.getByText('Make the shares add up to 100 %.')).toBeDefined();
    expect(document.activeElement).toBe(screen.getByLabelText(/^Bitcoin share/));
    await type(/^Ethereum share/, '40');
    await click('Continue');
    await type(/^Monthly amount/, '100');
    await type(/^Last buy/, '2036-10-01');
    await click('Continue');
    await act(() => fireEvent.change(screen.getByRole('textbox', { name: WHY }), { target: { value: ' Calm. ' } }));
    await click('Continue');
    await click('Later');
    expect(write).not.toHaveBeenCalled();
    await click(START);
    expect(write).toHaveBeenCalledTimes(1);
    const stored = services.domain.store.getState().snapshot.plan;
    expect(stored?.why).toBe('Calm.');
    expect(stored?.coins.map((coin) => coin.id)).toEqual(['BTC', 'ETH']);
    expect([stored?.split, stored?.templateId, stored?.sellWindow, stored?.buyDay]).toEqual([
      { BTC: '60', ETH: '40' },
      null,
      null,
      20,
    ]);
    expect(stored?.riskWordingVersion).toBe(1);
    expect(screen.getByTestId('path').textContent).toBe('/today');
  });

  it('leaves a stored plan untouched and links to it', async () => {
    const { write } = await mount(true);
    expect(screen.getByText(EXISTING)).toBeDefined();
    expect(screen.getByRole('link', { name: 'Open the plan' }).getAttribute('href')).toBe('/plan');
    expect(screen.queryByRole('button', { name: START })).toBeNull();
    expect(write).not.toHaveBeenCalled();
  });
});

describe('OnboardingScreen: the session draft', () => {
  const saved = (services: Services) => services.drafts.read('onboarding', 'new', OnboardingDraftSchema);
  const heading = () => screen.getByRole('heading', { level: 2 });
  /** Leaves the screen and opens it again in the same session, as going to /plan and back does. */
  async function reopen(services: Services, name: string, device: Device = LISBON) {
    cleanup();
    show(services, device);
    await screen.findByRole('heading', { level: 2, name });
  }

  it('reopens on the step it was left on with the values typed, and moves no focus', async () => {
    const { services } = await mount();
    await confirmCountry('Continue with Portugal');
    await pick('two-coins');
    await click('Continue');
    await type(/^Monthly amount/, '100');
    await type(/^Last buy/, '2036-10-01');
    await reopen(services, 'Amounts and dates');
    expect((screen.getByLabelText(/^Monthly amount/) as HTMLInputElement).value).toBe('100');
    expect((screen.getByLabelText(/^Last buy/) as HTMLInputElement).value).toBe('2036-10-01');
    expect(document.activeElement).not.toBe(heading());
    await click('Continue');
    expect(document.activeElement).toBe(screen.getByRole('heading', { level: 2, name: WHY }));
  });

  it('keeps the sentence, the reminder and the plan’s id across a reopening of the custom path', async () => {
    const { services } = await mount();
    await confirmCountry('Continue with Portugal');
    await act(() => fireEvent.click(screen.getByRole('radio', { name: 'Your own coins' })));
    await click('Continue');
    await click('Add Bitcoin');
    await type(/^Bitcoin share/, '100');
    await click('Continue');
    await type(/^Monthly amount/, '100');
    await type(/^Last buy/, '2036-10-01');
    await click('Continue');
    await act(() => fireEvent.change(screen.getByRole('textbox', { name: WHY }), { target: { value: 'Calm.' } }));
    await click('Continue');
    await click('Later');
    const id = saved(services)?.draft.id;
    await reopen(services, SUMMARY);
    expect(saved(services)?.draft.reminder).toBe('later');
    await click(START);
    const stored = services.domain.store.getState().snapshot.plan;
    expect([stored?.id, stored?.why]).toEqual([id, 'Calm.']);
  });

  it('never restores the early window’s acceptance: a draft past the numbers reopens on them', async () => {
    const { services } = await mount(false, BERLIN);
    await confirmCountry('Continue with Germany');
    await pick('cycle-plan');
    await click('Continue');
    await type(/^Monthly amount/, '100');
    await act(() => fireEvent.click(screen.getByRole('checkbox', { name: /^Open the sell window/ })));
    await toSummary();
    await reopen(services, 'Amounts and dates', BERLIN);
    expect((screen.getByLabelText(/^Monthly amount/) as HTMLInputElement).value).toBe('100');
    expect(screen.getByRole('checkbox', { name: /^Open the sell window/ }).getAttribute('aria-checked')).toBe('false');
  });

  it('keeps the saved draft as it was when the screen is left before its restore resolves', async () => {
    const { services } = await mount(false, BERLIN);
    await confirmCountry('Continue with Germany');
    await pick('cycle-plan');
    await click('Continue');
    await type(/^Monthly amount/, '100');
    await act(() => fireEvent.click(screen.getByRole('checkbox', { name: /^Open the sell window/ })));
    await toSummary();
    cleanup();
    show(services, BERLIN);
    cleanup();
    expect([saved(services)?.step, saved(services)?.draft.acceptEarlyOpen]).toEqual(['summary', true]);
    show(services, BERLIN);
    await screen.findByRole('heading', { level: 2, name: 'Amounts and dates' });
    expect((screen.getByLabelText(/^Monthly amount/) as HTMLInputElement).value).toBe('100');
  });

  it('reopens on the numbers when the saved plan no longer passes its dry run (2028-06-02)', async () => {
    const { services } = await mount();
    await confirmCountry('Continue with Portugal');
    await pick('cycle-plan');
    await click('Continue');
    await type(/^Monthly amount/, '100');
    await toSummary();
    expect(saved(services)?.step).toBe('summary');
    const later = createTestServices({ nowMs: Date.parse('2028-06-02T12:00:00Z'), drafts: services.drafts });
    for (const _round of [1, 2]) {
      await reopen(later, 'Amounts and dates');
      expect(screen.getByLabelText(/^Last buy/)).toBeDefined();
      expect(document.activeElement).not.toBe(heading());
    }
    await click('Continue');
    expect(screen.queryByRole('heading', { level: 2, name: WHY })).toBeNull();
  });

  it('shows the numbers, never an empty step, when the plan on the summary can no longer be built', async () => {
    const { services } = await mount();
    await confirmCountry('Continue with Portugal');
    await pick('cycle-plan');
    await click('Continue');
    await type(/^Monthly amount/, '100');
    await toSummary();
    await act(() => services.ui.getState().setToday('2028-06-02' as CalendarDate));
    expect(heading().textContent).toBe('Amounts and dates');
    expect(screen.getByLabelText(/^Last buy/)).toBeDefined();
  });

  it('goes back to the numbers when the summary’s plan can no longer be built, and asks the later steps again', async () => {
    const { services } = await mount();
    await confirmCountry('Continue with Portugal');
    await pick('cycle-plan');
    await click('Continue');
    await type(/^Monthly amount/, '100');
    await toSummary();
    await act(() => services.ui.getState().setToday('2028-06-02' as CalendarDate));
    expect(document.activeElement).toBe(heading());
    expect([saved(services)?.step, saved(services)?.draft.reminder]).toEqual(['numbers', null]);
    await type(/^Last buy/, '2036-10-01');
    expect(heading().textContent).toBe('Amounts and dates');
    await click('Continue');
    expect([heading().textContent, document.activeElement]).toEqual([WHY, heading()]);
    await click('Continue');
    expect(heading().textContent).toBe(REMINDER);
    await click('Later');
    expect([heading().textContent, saved(services)?.step, saved(services)?.draft.reminder]).toEqual([
      SUMMARY,
      'summary',
      'later',
    ]);
  });

  it('clears the draft once Start writes the plan', async () => {
    const { services } = await numbers();
    expect(saved(services)?.step).toBe('summary');
    await click(START);
    expect(saved(services)).toBeNull();
  });

  it('clears the draft when it finds a plan stored', async () => {
    const services = createTestServices({ snapshot: fixtureSnapshot() });
    const draft = emptyDraft('2026-10-20' as CalendarDate, EntityIdSchema.parse(crypto.randomUUID()), 'PT');
    services.drafts.write('onboarding', 'new', { step: 'template', draft });
    expect(saved(services)?.step).toBe('template');
    show(services);
    await act(() => services.start());
    expect(screen.getByText(EXISTING)).toBeDefined();
    expect(saved(services)).toBeNull();
  });
});
