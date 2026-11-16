// @vitest-environment jsdom
import { loadTemplateTexts, TEMPLATES, type TemplateTexts } from '@proofofcalm/content';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EMPTY_SNAPSHOT, memoryPlanStore } from '../../../lib/adapters';
import { I18nProvider, type UiLanguage } from '../../../lib/i18n';
import { NavigationProvider } from '../../../lib/navigation';
import { ServicesProvider } from '../../../lib/services';
import { createTestServices, preloadLazyModules } from '../../../lib/services/testing';
import errors from '../../../messages/en/errors.json';
import onboarding from '../../../messages/en/onboarding.json';
import plan from '../../../messages/en/plan.json';
import shell from '../../../messages/en/shell.json';
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
  return { ...content, loadTemplateTexts: vi.fn(content.loadTemplateTexts) };
});

afterEach(() => {
  cleanup();
  vi.mocked(loadTemplateTexts).mockClear();
});
await preloadLazyModules();

const LISBON = { languages: ['pt-PT'], timeZone: 'Europe/Lisbon' } as const;
const english = TEMPLATES.map((template) => template.name);

type TestServices = ReturnType<typeof createTestServices>;

async function mount(
  language: UiLanguage,
  services: TestServices = createTestServices({ planStore: memoryPlanStore(EMPTY_SNAPSHOT), language }),
) {
  const messages =
    language === 'en'
      ? { errors, onboarding, plan, shell }
      : { errors: errosPt, onboarding: portuguese, plan: planoPt, shell: shellPt };
  render(
    <NavigationProvider location="memory" initialPath="/onboarding">
      <ServicesProvider services={services}>
        <I18nProvider locale={language} messages={messages}>
          <OnboardingScreen device={LISBON} />
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
  });

  it('shows the English name when the load fails', async () => {
    const services = await englishDraftOnSummary();
    vi.mocked(loadTemplateTexts).mockRejectedValueOnce(new Error('offline'));
    await reopen(services);
    await screen.findByRole('heading', { level: 2, name: portuguese.summary.heading });
    expect(startingPoint()).toContain(TWO_COINS);
  });
});
