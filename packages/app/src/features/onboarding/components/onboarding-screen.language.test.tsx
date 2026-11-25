// @vitest-environment jsdom
import { loadProfile, loadProfiles, loadTemplateTexts, TEMPLATES, type TemplateTexts } from '@proofofcalm/content';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EMPTY_SNAPSHOT, memoryPlanStore } from '../../../lib/adapters';
import { I18nProvider, type UiLanguage } from '../../../lib/i18n';
import { NavigationProvider } from '../../../lib/navigation';
import { ServicesProvider } from '../../../lib/services';
import { createTestServices, preloadLazyModules } from '../../../lib/services/testing';
import countriesDe from '../../../messages/de/countries.json';
import errorsDe from '../../../messages/de/errors.json';
import german from '../../../messages/de/onboarding.json';
import planDe from '../../../messages/de/plan.json';
import shellDe from '../../../messages/de/shell.json';
import countries from '../../../messages/en/countries.json';
import errors from '../../../messages/en/errors.json';
import onboarding from '../../../messages/en/onboarding.json';
import plan from '../../../messages/en/plan.json';
import shell from '../../../messages/en/shell.json';
import countriesPt from '../../../messages/pt-PT/countries.json';
import errosPt from '../../../messages/pt-PT/errors.json';
import portuguese from '../../../messages/pt-PT/onboarding.json';
import planoPt from '../../../messages/pt-PT/plan.json';
import shellPt from '../../../messages/pt-PT/shell.json';
import { OnboardingScreen } from './onboarding-screen';

// The profiles load once, as in onboarding-screen.test.tsx; the template texts' loader is the real one, watched.
vi.mock('@proofofcalm/content', async (original) => {
  const content = await (await import('../../../lib/services/testing-modules')).profilesInMemory(
    await original<typeof import('@proofofcalm/content')>(),
  );
  return {
    ...content,
    loadProfiles: vi.fn(content.loadProfiles),
    loadTemplateTexts: vi.fn(content.loadTemplateTexts),
  };
});

afterEach(() => {
  cleanup();
  vi.mocked(loadProfiles).mockClear();
  vi.mocked(loadTemplateTexts).mockClear();
});
await preloadLazyModules();

const LISBON = { languages: ['pt-PT'], timeZone: 'Europe/Lisbon' } as const;
/** German among the languages makes Germany a confident suggestion, preselected, so one tap continues. */
const BERLIN = { languages: ['pt-PT', 'de-DE'], timeZone: 'Europe/Berlin' } as const;
const english = TEMPLATES.map((template) => template.name);

type TestServices = ReturnType<typeof createTestServices>;
type Device = typeof LISBON | typeof BERLIN;

async function mount(
  language: UiLanguage,
  services: TestServices = createTestServices({ planStore: memoryPlanStore(EMPTY_SNAPSHOT), language }),
  device: Device = LISBON,
) {
  const messages =
    language === 'en'
      ? { countries, errors, onboarding, plan, shell }
      : language === 'de'
        ? { countries: countriesDe, errors: errorsDe, onboarding: german, plan: planDe, shell: shellDe }
        : { countries: countriesPt, errors: errosPt, onboarding: portuguese, plan: planoPt, shell: shellPt };
  render(
    <NavigationProvider location="memory" initialPath="/onboarding">
      <ServicesProvider services={services}>
        <I18nProvider locale={language} messages={messages}>
          <OnboardingScreen device={device} />
        </I18nProvider>
      </ServicesProvider>
    </NavigationProvider>,
  );
  await act(() => services.start());
  return services;
}

const confirm = async (name: string) => act(async () => fireEvent.click(await screen.findByRole('button', { name })));
/** The template cards' titles in the order shown, without the own-coins card, the last. */
const cardNames = () =>
  [...document.querySelectorAll('[data-slot="radio-card"] [id$="-title"]')]
    .slice(0, -1)
    .map((title) => title.textContent ?? '');

describe('OnboardingScreen: the template texts in the UI language (ADR-0057)', () => {
  it('in English, lists the templates on the first render after the country, with no load', async () => {
    await mount('en');
    await confirm('Continue with Portugal');
    expect(cardNames()).toEqual([...english].sort(new Intl.Collator('en').compare));
    expect(loadTemplateTexts).not.toHaveBeenCalled();
  });

  it('in pt-PT, starts the load at mount and lists the cards once it resolves, never English first', async () => {
    const settlers: ((texts: ReadonlyMap<string, TemplateTexts>) => void)[] = [];
    vi.mocked(loadTemplateTexts).mockReturnValueOnce(new Promise((settle) => void settlers.push(settle)));
    const resolve = (texts: ReadonlyMap<string, TemplateTexts>) => {
      for (const settle of settlers) settle(texts);
    };
    await mount('pt-PT');
    expect(loadTemplateTexts).toHaveBeenCalledWith('pt-PT');
    await confirm('Continuar com Portugal');
    expect(screen.queryAllByRole('radio')).toEqual([]);
    expect(document.body.textContent).not.toContain('no sell window');
    const texts = await vi.mocked(loadTemplateTexts).getMockImplementation()?.('pt-PT');
    if (texts === undefined) throw new Error('no texts');
    await act(async () => resolve(texts));
    const names = TEMPLATES.map((template) => texts.get(template.id)?.name ?? '');
    expect(names.some((name) => english.includes(name))).toBe(false);
    expect(cardNames()).toEqual([...names].sort(new Intl.Collator('pt-PT').compare));
    expect(screen.getByRole('heading', { level: 2, name: portuguese.template.heading })).toBeDefined();
  });

  it('in pt-PT, lists the English texts when the load fails', async () => {
    vi.mocked(loadTemplateTexts).mockRejectedValueOnce(new Error('offline'));
    await mount('pt-PT');
    await confirm('Continuar com Portugal');
    expect(cardNames()).toEqual([...english].sort(new Intl.Collator('pt-PT').compare));
  });
});

describe('OnboardingScreen: a draft reopened on the summary in pt-PT (ADR-0057)', () => {
  const TWO_COINS = 'Two coins, no sell window';
  const click = (name: string) => act(() => fireEvent.click(screen.getByRole('button', { name })));
  const type = (label: RegExp, value: string) =>
    act(() => fireEvent.change(screen.getByLabelText(label), { target: { value } }));
  /** Every pending load that can settle has settled: the profiles are in, the steps rendered. */
  const settle = () => act(() => new Promise<void>((done) => void setTimeout(done, 0)));

  /** The English flow to the summary with Portugal, the two-coin template, Monthly 100 and Last buy 2036-10-01. */
  async function englishDraftOnSummary() {
    const services = await mount('en');
    await confirm('Continue with Portugal');
    await act(() => fireEvent.click(screen.getByRole('radio', { name: TWO_COINS })));
    await click('Continue');
    await type(/^Monthly amount/, '100');
    await type(/^Last buy/, '2036-10-01');
    await click('Continue');
    await click('Continue');
    await click('Later');
    await screen.findByRole('heading', { level: 2, name: 'Check your plan' });
    cleanup();
    return services;
  }
  const reopen = (services: TestServices) =>
    mount('pt-PT', createTestServices({ drafts: services.drafts, language: 'pt-PT' }));
  const startingPoint = () => screen.getByText(portuguese.summary.startingPoint).parentElement?.textContent ?? '';

  it('shows no English template name while the texts load', async () => {
    const services = await englishDraftOnSummary();
    vi.mocked(loadTemplateTexts).mockReturnValueOnce(new Promise(() => {}));
    await reopen(services);
    await settle();
    expect(document.body.textContent).not.toContain(TWO_COINS);
    expect(screen.queryByRole('heading', { level: 2, name: portuguese.summary.heading })).toBeNull();
  });

  it('shows the pt-PT name once the texts resolve', async () => {
    const services = await englishDraftOnSummary();
    await reopen(services);
    await screen.findByRole('heading', { level: 2, name: portuguese.summary.heading });
    expect(startingPoint()).toContain('Duas moedas, sem janela de venda');
    expect(document.body.textContent).not.toContain(TWO_COINS);
    expect(screen.getByText('Duas moedas, sem janela de venda').closest('[lang]')).toBeNull();
  });

  it('shows the English name when the load fails, marked lang=en (WCAG 2.2 SC 3.1.2)', async () => {
    const services = await englishDraftOnSummary();
    vi.mocked(loadTemplateTexts).mockRejectedValueOnce(new Error('offline'));
    await reopen(services);
    await screen.findByRole('heading', { level: 2, name: portuguese.summary.heading });
    expect(startingPoint()).toContain(TWO_COINS);
    expect(screen.getByText(TWO_COINS).closest('[lang]')?.getAttribute('lang')).toBe('en');
  });

  it("marks the country's name lang=en when its translation did not load (WCAG 2.2 SC 3.1.2)", async () => {
    const services = await englishDraftOnSummary();
    // Offline, a jurisdiction chunk that fails gives the English profile, marked English, among the translations.
    const english = await loadProfile('PT', 'en');
    const translated = await loadProfiles('pt-PT');
    vi.mocked(loadProfiles).mockResolvedValueOnce(
      translated.map((profile) => (profile.code === 'PT' && english !== null ? english : profile)),
    );
    await reopen(services);
    await screen.findByRole('heading', { level: 2, name: portuguese.summary.heading });
    const country = screen.getByText(portuguese.summary.country).nextElementSibling;
    expect(country?.querySelector('[lang]')?.getAttribute('lang')).toBe('en');
    expect(country?.textContent).toBe('Portugal');
  });

  it("leaves the country's name unmarked when its translation loaded", async () => {
    const services = await englishDraftOnSummary();
    await reopen(services);
    await screen.findByRole('heading', { level: 2, name: portuguese.summary.heading });
    expect(screen.getByText(portuguese.summary.country).nextElementSibling?.querySelector('[lang]')).toBeNull();
  });
});

describe("OnboardingScreen: the early window's conditions in pt-PT (ADR-0057)", () => {
  /** The pt-PT flow to the Cycle plan's numbers in Germany, where its early window shows, under these profiles. */
  async function earlyWindowIn(profiles: Awaited<ReturnType<typeof loadProfiles>>) {
    vi.mocked(loadProfiles).mockResolvedValueOnce(profiles);
    const texts = await loadTemplateTexts('pt-PT');
    await mount('pt-PT', undefined, BERLIN);
    await confirm('Continuar com a Alemanha');
    const cycle = await screen.findByRole('radio', { name: texts.get('cycle-plan')?.name ?? '' });
    await act(() => fireEvent.click(cycle));
    await act(() => fireEvent.click(screen.getByRole('button', { name: portuguese.next })));
    await act(() => fireEvent.change(screen.getByLabelText(/^Montante mensal/), { target: { value: '100' } }));
    expect(screen.getByRole('checkbox')).toBeDefined();
  }

  it("marks the country's conditions lang=en when its translation did not load (WCAG 2.2 SC 3.1.2)", async () => {
    // Offline, a jurisdiction chunk that fails gives the English profile, marked English, among the translations.
    const english = await loadProfile('DE', 'en');
    if (english === null) throw new Error('no DE');
    const translated = await loadProfiles('pt-PT');
    await earlyWindowIn(translated.map((profile) => (profile.code === 'DE' ? english : profile)));
    const [first] = english.holdingRuleConditions;
    expect(
      screen
        .getByText(first ?? '')
        .closest('[lang]')
        ?.getAttribute('lang'),
    ).toBe('en');
  });

  it("leaves the country's conditions unmarked when its translation loaded", async () => {
    const translated = await loadProfiles('pt-PT');
    await earlyWindowIn(translated);
    const [first] = translated.find((profile) => profile.code === 'DE')?.holdingRuleConditions ?? [];
    expect(first).toMatch(/^Uma troca/);
    expect(screen.getByText(first ?? '').closest('[lang]')).toBeNull();
  });
});

describe("OnboardingScreen in German: Germany's German profile (ADR-0057, Corrections of 2026-11-25)", () => {
  const click = (name: string) => act(() => fireEvent.click(screen.getByRole('button', { name })));
  const type = (label: RegExp, value: string) =>
    act(() => fireEvent.change(screen.getByLabelText(label), { target: { value } }));

  it("shows Germany's German conditions unmarked under the early window", async () => {
    const texts = await loadTemplateTexts('de');
    await mount('de', undefined, BERLIN);
    await confirm('Weiter mit Deutschland');
    await act(async () =>
      fireEvent.click(await screen.findByRole('radio', { name: texts.get('cycle-plan')?.name ?? '' })),
    );
    await click(german.next);
    await type(/^Monatsbetrag/, '100');
    const [first] = (await loadProfile('DE', 'de'))?.holdingRuleConditions ?? [];
    expect(first).toMatch(/^Nach einem Tausch/);
    expect(screen.getByText(first ?? '').closest('[lang]')).toBeNull();
  });

  it("names Germany „Deutschland“ on the summary, unmarked, and the rule's sentence is German (#476)", async () => {
    const texts = await loadTemplateTexts('de');
    await mount('de', undefined, BERLIN);
    await confirm('Weiter mit Deutschland');
    await act(async () =>
      fireEvent.click(await screen.findByRole('radio', { name: texts.get('two-coins')?.name ?? '' })),
    );
    await click(german.next);
    await type(/^Monatsbetrag/, '100');
    await type(/^Letzter Kauf/, '2036-10-01');
    await click(german.next);
    await click(german.next);
    await click(german.reminder.later);
    await screen.findByRole('heading', { level: 2, name: german.summary.heading });
    const country = screen.getByText(german.summary.country, { selector: 'dt' }).nextElementSibling;
    expect(country?.textContent).toBe('Deutschland');
    expect(country?.querySelector('[lang]')).toBeNull();
    const rule = screen.getByText(german.summary.holdingRule, { selector: 'dt' }).nextElementSibling;
    expect(rule?.textContent).toMatch(/^Die Regel für Deutschland\. /);
    expect(rule?.querySelector('[lang]')).toBeNull();
  });
});
