// @vitest-environment jsdom
import { LEARN_MODULES } from 'virtual:learn-modules';
import { type LearnModuleMeta, loadRules } from '@proofofcalm/content';
import type { Plan } from '@proofofcalm/core';
import { cleanup, render, screen } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { I18nProvider } from '../../../lib/i18n';
import { ServicesProvider } from '../../../lib/services';
import { fixtureSnapshot } from '../../../lib/services/fixtures';
import { createTestServices } from '../../../lib/services/testing';
import learn from '../../../messages/en/learn.json';
import Body from '../fixtures/start-here.mdx';
import TaxesBody from '../fixtures/taxes-where-you-live.mdx';
import { TAXES_MODULE } from '../lib/taxes';
import { ModuleView } from './module-view';

// One module (docs/CONTENT-STYLE.md §5, ADR-0048): the fixture through the real pipeline, so the metadata
// and the body are what the hosts' build gives. No page chrome here: the route and the sheet hold it.

afterEach(cleanup);

const module = LEARN_MODULES[0] as LearnModuleMeta;

const mount = (shown: LearnModuleMeta = module) =>
  render(
    <ServicesProvider services={createTestServices()}>
      <I18nProvider messages={{ learn }}>
        <ModuleView module={shown} Body={Body} />
      </I18nProvider>
    </ServicesProvider>,
  );

type At = {
  readonly shown: LearnModuleMeta;
  readonly Shown: ComponentProps<typeof ModuleView>['Body'];
  readonly nowMs?: number;
  /** The plan's country, whose number locale the page formats in; null for no plan. */
  readonly country?: string | null;
};

/** The view at a date, under a plan in a country with that country's rules booted, as the shell boots them. */
async function mountAt({ shown, Shown, nowMs, country = null }: At) {
  const snapshot = fixtureSnapshot();
  const services = createTestServices({
    snapshot:
      country === null
        ? { ...snapshot, plan: null, entries: [] }
        : { ...snapshot, plan: { ...(snapshot.plan as Plan), country: country as Plan['country'] } },
    rules: (code) => loadRules(code),
    ...(nowMs !== undefined && { nowMs }),
  });
  await services.start();
  render(
    <ServicesProvider services={services}>
      <I18nProvider messages={{ learn }}>
        <ModuleView module={shown} Body={Shown} />
      </I18nProvider>
    </ServicesProvider>,
  );
}

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

  // The title and the caveat written with a no-break space before the sign, as Risk honestly and Cycles write them.
  const NBSP_TEXT = 'Falls of 94\u00a0% and 78 %';

  it("a module with a chart joins every `N %` with the page's joiner, a no-break one too", () => {
    const { container } = mount({ ...module, chart: 'drawdowns-bar', title: NBSP_TEXT, caveat: NBSP_TEXT });
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Falls of 94% and 78%');
    expect(container.querySelector('[data-slot="card"]')?.textContent).toBe('Falls of 94% and 78%');
  });

  it('a module without a chart keeps its no-break space, so the line cannot break before the sign', () => {
    const { container } = mount({ ...module, chart: 'none', title: NBSP_TEXT, caveat: NBSP_TEXT });
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(NBSP_TEXT);
    expect(container.querySelector('[data-slot="card"]')?.textContent).toBe(NBSP_TEXT);
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

// The line under the title (docs/CONTENT-STYLE.md §5): a module is overdue from the day after its nextReviewDue, and
// only `review overdue` is in ink; the tax module names its next review until then, and overdue adds the sentence,
// which names the module's last-reviewed date as the line does, since the country card below carries a date of its own.
describe('ModuleView: the review line', () => {
  const taxes = LEARN_MODULES.find((known) => known.slug === TAXES_MODULE) as LearnModuleMeta;
  const at = (date: string) => Date.parse(`${date}T10:00:00Z`);
  const SENTENCE = 'Rules may have changed since 9 Nov 2026. Check your tax authority before filing.';
  const SENTENCE_START = /^Rules may have changed since/;
  const plain = (text: string | null | undefined) => text?.replace(/ /g, ' ');

  const lineOf = async (shown: LearnModuleMeta, nowMs: number) => {
    await mountAt({ shown, Shown: shown === taxes ? TaxesBody : Body, nowMs });
    return screen.getByRole('heading', { level: 1 }).nextElementSibling as HTMLElement;
  };

  it.each([
    ['start-here', '2027-10-30', 'Last reviewed 30 Oct 2026'],
    ['start-here', '2027-10-31', 'Last reviewed 30 Oct 2026 · review overdue'],
    [TAXES_MODULE, '2027-01-01', 'Last reviewed 9 Nov 2026 · Next review due 1 Jan 2027'],
    [TAXES_MODULE, '2027-01-02', 'Last reviewed 9 Nov 2026 · review overdue'],
  ])('%s on %s: %s', async (slug, date, text) => {
    const line = await lineOf(slug === TAXES_MODULE ? taxes : module, at(date));
    expect(plain(line.textContent)).toBe(text);
    expect(line.className).toContain('text-ink-2');
    const ink = [...line.querySelectorAll('[class~="text-ink"]')].map((element) => element.textContent);
    expect(ink).toEqual(text.endsWith('review overdue') ? ['review overdue'] : []);
  });

  // Each phrase after the `·` keeps to one line, so a narrow column breaks the line only between its parts.
  it.each([
    [TAXES_MODULE, '2027-01-01', 'Next review due 1 Jan 2027'],
    [TAXES_MODULE, '2027-01-02', 'review overdue'],
    ['start-here', '2027-10-31', 'review overdue'],
  ])('%s on %s keeps "%s" on one line', async (slug, date, phrase) => {
    const line = await lineOf(slug === TAXES_MODULE ? taxes : module, at(date));
    const kept = [...line.querySelectorAll('[class~="whitespace-nowrap"]')].map((element) => plain(element.textContent));
    expect(kept).toEqual([phrase]);
  });

  it('the tax module overdue adds the sentence on its own line, at the line size, in ink', async () => {
    const line = await lineOf(taxes, at('2027-01-02'));
    const sentence = line.nextElementSibling as HTMLElement;
    expect(sentence.tagName).toBe('P');
    expect(plain(sentence.textContent)).toBe(SENTENCE);
    const reviewed = /^Last reviewed (.+) · review overdue$/u.exec(line.textContent ?? '')?.[1];
    expect(sentence.textContent).toContain(`since ${reviewed}.`);
    expect(sentence.className).toBe('text-13 text-ink');
    expect(sentence.nextElementSibling?.textContent).toMatch(/min read$/);
  });

  it.each([
    [TAXES_MODULE, '2027-01-01'],
    ['start-here', '2027-10-31'],
  ])('%s on %s shows no sentence', async (slug, date) => {
    await lineOf(slug === TAXES_MODULE ? taxes : module, at(date));
    expect(screen.queryByText(SENTENCE_START)).toBeNull();
  });
});

// The tax module has no chart, but its lead card shows the profile's percentages, so its body takes the page's
// joiner; through ModuleView, so that a view that stops asking `moduleJoiner` fails here.
describe('ModuleView: the Taxes body', () => {
  const taxes = LEARN_MODULES.find((known) => known.slug === TAXES_MODULE) as LearnModuleMeta;
  const body = () => screen.getByText(/^A rate of 28/).textContent;

  it.each([
    ['PT', 'A rate of 28%'],
    ['DE', 'A rate of 28 %'],
    [null, 'A rate of 28%'],
  ])("a plan in %s: the page's joiner", async (country, rate) => {
    await mountAt({ shown: taxes, Shown: TaxesBody, country });
    expect(body()).toBe(`${rate} in the fixture's text, written with a no-break space.`);
  });

  it('another module without a chart keeps its no-break space under a German plan', async () => {
    await mountAt({ shown: { ...module, title: 'Falls of 94 %' }, Shown: Body, country: 'DE' });
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Falls of 94 %');
  });
});
