// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react';
import { Suspense } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../../../lib/i18n';
import { ServicesProvider, useServices } from '../../../lib/services';
import { createTestServices, preloadLazyModules } from '../../../lib/services/testing';
import learnPt from '../../../messages/pt-PT/learn.json';
import { ModuleSheet } from '../components/module-sheet';
import { ModuleView } from '../components/module-view';
import { useModuleBody } from './bodies';

// A translated module (ADR-0057, ADR-0048 Deviations): its metadata and body come from its own chunk; English stands
// for a slug without one, and for a chunk that fails or resolves to nothing, and the next mount tries again.
const { translation } = vi.hoisted(() => ({ translation: { load: (): Promise<unknown> => Promise.resolve() } }));
vi.mock('virtual:learn-modules', async (original) => {
  const modules = await original<typeof import('virtual:learn-modules')>();
  // One slug per case: a translation that loaded stays kept for the file's later tests.
  const load = () => translation.load();
  const slugs = ['start-here', 'risk-honestly', 'taxes-where-you-live'];
  return { ...modules, LEARN_TRANSLATIONS: { 'pt-PT': Object.fromEntries(slugs.map((slug) => [slug, load])) } };
});

await preloadLazyModules([
  () =>
    import('virtual:learn-modules').then((modules) =>
      Promise.all(
        ['start-here', 'risk-honestly', 'taxes-where-you-live'].map((slug) => modules.LEARN_BODIES[slug]?.()),
      ),
    ),
]);

const { LEARN_MODULES } = await import('virtual:learn-modules');
const ENGLISH = LEARN_MODULES.find((module) => module.slug === 'start-here');
if (ENGLISH === undefined) throw new Error('the start-here fixture is missing');
const PT = { ...ENGLISH, title: 'Começar aqui', idea: 'Uma ideia traduzida.', caveat: 'Uma ressalva traduzida.' };
const translated = () => Promise.resolve({ meta: PT, default: () => <p>Um parágrafo traduzido.</p> });

function Shown({ slug }: { slug: string }) {
  const shown = useModuleBody(slug, useServices().language);
  return shown === undefined ? null : <ModuleView module={shown.module} Body={shown.Body} language={shown.language} />;
}

// Rendered inside an awaited act, so the retry of a suspended render runs once its chunk resolves.
const mount = async (slug = 'start-here', sheet = false) => {
  let mounted: ReturnType<typeof render> | undefined;
  await act(async () => {
    mounted = render(
      <ServicesProvider services={createTestServices({ language: 'pt-PT' })}>
        <I18nProvider locale="pt-PT" messages={{ learn: learnPt }}>
          <Suspense fallback={null}>
            {sheet ? <ModuleSheet slug={slug as 'start-here'} open onOpenChange={vi.fn()} /> : <Shown slug={slug} />}
          </Suspense>
        </I18nProvider>
      </ServicesProvider>,
    );
  });
  if (mounted === undefined) throw new Error('nothing rendered');
  return mounted;
};

beforeEach(() => {
  translation.load = translated;
});
afterEach(cleanup);

describe('useModuleBody on a pt-PT screen', () => {
  it('renders the translated title, caveat and body with no lang="en"', async () => {
    const { container } = await mount();
    expect(await screen.findByRole('heading', { level: 1, name: PT.title })).toBeTruthy();
    expect(screen.getByText(PT.caveat)).toBeTruthy();
    expect(await screen.findByText('Um parágrafo traduzido.')).toBeTruthy();
    expect(container.querySelector('[lang="en"]')).toBeNull();
  });

  it("names the sheet by the translated idea, with no lang='en'", async () => {
    await mount('start-here', true);
    const dialog = await screen.findByRole('dialog', { name: PT.idea });
    expect(await screen.findByText('Um parágrafo traduzido.')).toBeTruthy();
    expect(dialog.querySelector('[lang="en"]')).toBeNull();
  });

  it('shows English for a slug without a translation, lang="en" on its title, caveat and body only', async () => {
    const { container } = await mount('when-the-market-drops');
    const title = await screen.findByRole('heading', { level: 1 });
    expect(title.getAttribute('lang')).toBe('en');
    expect(container.querySelector('[data-slot="card"] p')?.getAttribute('lang')).toBe('en');
    expect([...container.querySelectorAll('[lang]')].map((element) => element.tagName)).toEqual(['H1', 'P', 'DIV']);
  });

  it.each([
    ['a rejected import', 'risk-honestly', () => Promise.reject(new Error('offline'))],
    ['an import that resolves to undefined', 'taxes-where-you-live', () => Promise.resolve(undefined)],
  ])('renders English after %s, and tries again on the next mount', async (_name, slug, load) => {
    const english = LEARN_MODULES.find((module) => module.slug === slug);
    translation.load = load;
    const first = await mount(slug);
    expect((await screen.findByRole('heading', { level: 1, name: english?.title ?? slug })).getAttribute('lang')).toBe(
      'en',
    );
    expect(first.container.querySelectorAll('[lang="en"]')).toHaveLength(3);
    first.unmount();
    translation.load = translated;
    await mount(slug);
    expect(await screen.findByRole('heading', { level: 1, name: PT.title })).toBeTruthy();
  });
});
