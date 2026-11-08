// @vitest-environment jsdom
import { LEARN_MODULES } from 'virtual:learn-modules';
import type { LearnModuleMeta } from '@proofofcalm/content';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { I18nProvider } from '../../../lib/i18n';
import { ServicesProvider } from '../../../lib/services';
import { createTestServices } from '../../../lib/services/testing';
import learn from '../../../messages/en/learn.json';
import Body from '../fixtures/start-here.mdx';
import { ModuleView } from './module-view';

// One module (docs/CONTENT-STYLE.md §5, ADR-0048): the fixture through the real pipeline, so the metadata
// and the body are what the hosts' build gives. No page chrome here: the route and the sheet hold it.

afterEach(cleanup);

const module = LEARN_MODULES[0] as LearnModuleMeta;

const mount = () =>
  render(
    <ServicesProvider services={createTestServices()}>
      <I18nProvider messages={{ learn }}>
        <ModuleView module={module} Body={Body} />
      </I18nProvider>
    </ServicesProvider>,
  );

describe('ModuleView', () => {
  it('shows the last-reviewed date under the title and the caveat in its box', () => {
    const { container } = mount();
    const title = screen.getByRole('heading', { level: 1, name: 'Start here' });
    const reviewed = title.nextElementSibling;
    expect(reviewed?.textContent).toBe('Last reviewed 30 Oct 2026');
    expect(reviewed?.nextElementSibling?.textContent).toBe('1 min read');
    expect(container.querySelector('[data-slot="card"]')?.textContent).toBe("The fixture's caveat, in its box.");
  });

  it('shows the heading it is given in place of the title', () => {
    render(
      <ServicesProvider services={createTestServices()}>
        <I18nProvider messages={{ learn }}>
          <ModuleView module={module} Body={Body} heading={<h2>The idea</h2>} />
        </I18nProvider>
      </ServicesProvider>,
    );
    expect(screen.queryByRole('heading', { level: 1 })).toBeNull();
    const heading = screen.getByRole('heading', { level: 2, name: 'The idea' });
    expect(heading.nextElementSibling?.textContent).toMatch(/^Last reviewed 30\sOct\s2026$/u);
  });

  it('renders the body through the mapped elements', () => {
    mount();
    expect(screen.getByRole('heading', { level: 2, name: 'A section' }).className).toContain('text-20');
    expect(screen.getByRole('heading', { level: 3, name: 'A part of it' }).className).toContain('text-18');
    expect(screen.getByText('A paragraph under the section.').className).toContain('text-16');
    expect(screen.getByText('strong').className).toContain('font-semibold');
    const [bullets, steps] = screen.getAllByRole('list');
    expect(bullets?.className).toContain('list-disc');
    expect(steps?.className).toContain('list-decimal');
    expect(screen.getByText('A first step').className).toContain('text-16');
  });
});
