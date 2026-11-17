// @vitest-environment jsdom
import type { LearnModuleMeta } from '@proofofcalm/content';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../../../lib/i18n';
import { NavigationProvider } from '../../../lib/navigation';
import { ServicesProvider } from '../../../lib/services';
import { createTestServices, preloadLazyModules } from '../../../lib/services/testing';
import shellPt from '../../../messages/pt-PT/shell.json';
import todayPt from '../../../messages/pt-PT/today.json';
import type { BodyElements } from '../lib/body-elements';
// Imported here, as bodies.test.tsx imports it: loaded only by WhyLink's own import(), the sheet read the unmocked
// virtual module (Vitest 5, 2026-11-17).
import './module-sheet';
import { WhyLink } from './why-link';

// A translated module keeps its sections where English links name them (ADR-0048, 2026-11-17): the compiler gives each
// translated h2 the English h2 text at its position as `sourceHeading` (learnPlugins' `sourceHeadings`, proven in
// packages/config through a build), and the page's h2 makes its id from it. The body here is what that compile emits
// for pt-PT start-here's section on the hold phase: the h2 element with the prop and the translated words.
const { PT_HEADING, SOURCE_HEADING, PT_IDEA } = vi.hoisted(() => ({
  PT_HEADING: 'Porque há quem defina uma fase de detenção',
  SOURCE_HEADING: 'Why some people hold',
  PT_IDEA: 'Uma ideia traduzida.',
}));

vi.mock('../../../lib/i18n/namespaces', async (original) => {
  const { namespacesInMemory } = await import('../../../lib/services/testing-modules');
  return namespacesInMemory(await original<typeof import('../../../lib/i18n/namespaces')>());
});

vi.mock('virtual:learn-modules', async (original) => {
  const modules = await original<typeof import('virtual:learn-modules')>();
  const english = modules.LEARN_MODULES.find((module) => module.slug === 'start-here');
  if (english === undefined) throw new Error('the start-here fixture is missing');
  const meta: LearnModuleMeta = { ...english, idea: PT_IDEA };
  const Body = ({ components }: { components: BodyElements }) => (
    <>
      <components.p>Um parágrafo antes da secção.</components.p>
      <components.h2 sourceHeading={SOURCE_HEADING}>{PT_HEADING}</components.h2>
    </>
  );
  const load = () => Promise.resolve({ default: Body });
  const metas = () => Promise.resolve({ default: { 'start-here': meta } });
  return {
    ...modules,
    LEARN_TRANSLATIONS: { 'pt-PT': { 'start-here': load } },
    LEARN_META: { 'pt-PT': metas },
  };
});

await preloadLazyModules([
  () => import('virtual:learn-modules').then((modules) => modules.LEARN_TRANSLATIONS['pt-PT']?.['start-here']?.()),
]);

afterEach(cleanup);

describe('WhyLink on a translated module', () => {
  it("Today's hold-phase Why? on pt-PT focuses the translated section under its English id", async () => {
    render(
      <NavigationProvider location="memory" initialPath="/today">
        <ServicesProvider services={createTestServices({ language: 'pt-PT' })}>
          <I18nProvider locale="pt-PT" messages={{ shell: shellPt }}>
            {/* As primary-action.tsx names it. */}
            <WhyLink module="start-here" section="why-some-people-hold" name={todayPt.why.hold} />
          </I18nProvider>
        </ServicesProvider>
      </NavigationProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: todayPt.why.hold }));
    const heading = await screen.findByRole('heading', { level: 2, name: PT_HEADING });
    expect(heading.id).toBe('why-some-people-hold');
    expect(heading.hasAttribute('sourceHeading')).toBe(false);
    expect(heading.hasAttribute('sourceheading')).toBe(false);
    await waitFor(() => expect(document.activeElement).toBe(heading));
  });
});
