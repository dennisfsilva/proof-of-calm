// @vitest-environment jsdom
import type { LearnModuleMeta } from '@proofofcalm/content';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { I18nProvider } from '../../../lib/i18n';
import { NavigationProvider } from '../../../lib/navigation';
import learn from '../../../messages/en/learn.json';
import learnPt from '../../../messages/pt-PT/learn.json';
import { ModuleIndex } from './module-index';

// Learn's index (docs/EDUCATION.md): a row per module, then the country library's row, with no site line
// (docs/LEGAL.md §5) and no empty-state copy, so a page with no module keeps the heading and the library.

afterEach(cleanup);

const start: LearnModuleMeta = {
  slug: 'start-here',
  title: 'Start here',
  idea: 'One idea.',
  caveat: 'One caveat.',
  chart: 'none',
  facts: [],
  lastReviewed: '2026-10-30',
  nextReviewDue: '2027-10-30',
  reviewedBy: 'agent-draft',
  words: 300,
  readingMinutes: 2,
};
const COUNTRIES_LINE = learn.countries.line;
const cycles: LearnModuleMeta = { ...start, slug: 'cycles', title: 'Cycles', idea: 'Another idea.', readingMinutes: 3 };

const mount = (modules: readonly LearnModuleMeta[]) =>
  render(
    <NavigationProvider location="memory" initialPath="/learn">
      <I18nProvider messages={{ learn }}>
        <ModuleIndex modules={modules} />
      </I18nProvider>
    </NavigationProvider>,
  );

describe('ModuleIndex', () => {
  it('lists each module with its idea and reading time, in order, then the countries', () => {
    mount([start, cycles]);
    expect(screen.getByRole('heading', { level: 1, name: 'Learn' })).toBeDefined();
    const rows = screen.getAllByRole('link');
    expect(rows.map((row) => row.textContent)).toEqual([
      'Start hereOne idea.2 min read',
      'CyclesAnother idea.3 min read',
      `Countries${COUNTRIES_LINE}`,
    ]);
    expect(rows.map((row) => row.getAttribute('href'))).toEqual(['/start-here', '/cycles', '/countries']);
    for (const row of rows) expect(row.className).toContain('min-h-target');
  });

  it("opens with the fall page's row only when told a fall is under way", () => {
    render(
      <NavigationProvider location="memory" initialPath="/learn">
        <I18nProvider messages={{ learn }}>
          <ModuleIndex modules={[start]} thisFall />
        </I18nProvider>
      </NavigationProvider>,
    );
    const rows = screen.getAllByRole('link');
    expect(rows[0]?.textContent).toBe(`${learn.thisFall.title}${learn.thisFall.row}`);
    expect(rows.map((row) => row.getAttribute('href'))).toEqual(['/fall-under-way', '/start-here', '/countries']);
    cleanup();
    mount([start]);
    expect(screen.queryByRole('link', { name: new RegExp(`^${learn.thisFall.title}`) })).toBeNull();
  });

  it('with no modules shows the heading and the countries row', () => {
    const { container } = mount([]);
    expect(screen.getByRole('heading', { level: 1, name: 'Learn' })).toBeDefined();
    expect(container.children).toHaveLength(2);
    expect(screen.getAllByRole('link').map((row) => row.getAttribute('href'))).toEqual(['/countries']);
  });

  // The modules' front matter is English (ADR-0057, WCAG 2.2 SC 3.1.2), as module-view and module-sheet mark it.
  it("marks each module's English title and idea lang=en on a pt-PT screen, and the app's own lines not", () => {
    const { container } = render(
      <NavigationProvider location="memory" initialPath="/learn">
        <I18nProvider locale="pt-PT" messages={{ learn: learnPt }}>
          <ModuleIndex modules={[start, cycles]} thisFall />
        </I18nProvider>
      </NavigationProvider>,
    );
    const marked = [...container.querySelectorAll('[lang]')];
    expect(marked.map((element) => [element.textContent, element.getAttribute('lang')])).toEqual([
      ['Start here', 'en'],
      ['One idea.', 'en'],
      ['Cycles', 'en'],
      ['Another idea.', 'en'],
    ]);
  });

  it('marks nothing on an English screen', () => {
    const { container } = render(
      <NavigationProvider location="memory" initialPath="/learn">
        <I18nProvider messages={{ learn }}>
          <ModuleIndex modules={[start, cycles]} thisFall />
        </I18nProvider>
      </NavigationProvider>,
    );
    expect(container.querySelector('[lang]')).toBeNull();
  });
});
