import { LEARN_MODULES } from 'virtual:learn-modules';
import type { LearnModuleMeta } from '@proofofcalm/content';
import type { CalendarDate } from '@proofofcalm/core';
import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { PastFall } from '../../../lib/services/red-day-types';
import learn from '../../../messages/en/learn.json';
import type { ModuleViewProps } from '../components/module-view';
import StartHere from '../fixtures/start-here.mdx';
import WhenItDrops from '../fixtures/when-the-market-drops.mdx';
import { loadLearnSite, SiteLearnIndex, type SiteLinks, SiteModulePage, StaticLearn } from './index';

// The Learn modules as script-free static pages (ADR-0048 Deviations of 2026-11-15): rendered to a string as the web
// host's prerender renders them, in Node, with no services, no router and no clock: `today` is passed in.

const TODAY = '2026-11-15' as CalendarDate;

const LINKS: SiteLinks = {
  learn: '/en/learn',
  module: (slug) => `/en/learn/${slug}`,
  countries: '/en/countries',
  country: (code) => `/en/countries/${code.toLowerCase()}`,
  holding: '/en/holding-date',
};

const meta = (slug: string): LearnModuleMeta => {
  const found = LEARN_MODULES.find((module) => module.slug === slug);
  if (found === undefined) throw new Error(`no fixture module ${slug}`);
  return found;
};

const html = (node: ReactNode, today = TODAY) => renderToStaticMarkup(<StaticLearn today={today}>{node}</StaticLearn>);

/** No script, and no style attribute, which the site's CSP refuses (ADR-0045 §3 and §6). */
const expectStatic = (markup: string) => {
  expect(markup).not.toContain('<script');
  expect(markup).not.toContain('style="');
};

const FALLS: readonly PastFall[] = [
  { coin: 'BTC', high: '2017-12-17', low: '2018-12-15', fall: '84', publisher: 'Bitstamp' },
  { coin: 'ETH', high: '2018-01-13', low: '2018-12-15', fall: '94', publisher: 'CoinMarketCap' },
] as unknown as readonly PastFall[];

/** A body that draws the module's chart and nothing else, as a module with `chart: drawdowns-bar` places it. */
const ChartBody: ModuleViewProps['Body'] = ({ components: { Chart } }) => <Chart />;

describe('SiteLearnIndex', () => {
  it('links each module through links.module and the country library through links.countries', () => {
    const markup = html(<SiteLearnIndex modules={LEARN_MODULES} links={LINKS} />);
    expectStatic(markup);
    for (const module of LEARN_MODULES) {
      expect(markup).toContain(`href="/en/learn/${module.slug}"`);
      expect(markup).toContain(module.title);
    }
    expect(markup).toContain('href="/en/countries"');
    expect(markup).toContain(learn.title);
    expect(markup).not.toContain('fall-under-way');
  });
});

describe('SiteModulePage', () => {
  it('renders a module with its back link, its caveat and its body', () => {
    const module = meta('start-here');
    const markup = html(<SiteModulePage module={module} Body={StartHere} falls={FALLS} today={TODAY} links={LINKS} />);
    expectStatic(markup);
    expect(markup).toContain(`href="/en/learn"`);
    expect(markup).toContain(learn.module.back);
    expect(markup).toContain(module.caveat.replaceAll("'", '&#x27;'));
    expect(markup).toContain('href="/risk"');
  });

  it('renders When the market drops without the fall line', () => {
    const markup = html(
      <SiteModulePage
        module={meta('when-the-market-drops')}
        Body={WhenItDrops}
        falls={FALLS}
        today={TODAY}
        links={LINKS}
      />,
    );
    expectStatic(markup);
    expect(markup).toContain('When the market drops');
    expect(markup).not.toContain('fall-under-way');
    expect(markup).not.toContain('A fall of the coins you hold');
  });

  it('draws the chart from the falls passed, with the source line and the past-performance line', () => {
    const module = { ...meta('risk-honestly'), chart: 'drawdowns-bar' } as LearnModuleMeta;
    const markup = html(<SiteModulePage module={module} Body={ChartBody} falls={FALLS} today={TODAY} links={LINKS} />);
    expectStatic(markup);
    expect(markup.match(/data-slot="bar-chart-bar"/g)).toHaveLength(FALLS.length);
    expect(markup).toContain('BTC 2017');
    expect(markup).toContain('Bitstamp and CoinMarketCap');
    expect(markup).toContain(learn.module.pastPerformance);
    expect(markup).toContain('href="/risk"');
  });

  it('dates the review line by the today passed in', () => {
    const module = meta('start-here');
    const page = (today: string) =>
      html(
        <SiteModulePage module={module} Body={StartHere} falls={[]} today={today as CalendarDate} links={LINKS} />,
        today as CalendarDate,
      );
    expect(page(module.nextReviewDue)).not.toContain('review overdue');
    expect(page('2027-10-31')).toContain('review overdue');
  });

  it('puts what the host passes after the module', () => {
    const markup = html(
      <SiteModulePage
        module={meta('start-here')}
        Body={StartHere}
        falls={[]}
        today={TODAY}
        links={LINKS}
        after={<p>After the module</p>}
      />,
    );
    expect(markup.indexOf('After the module')).toBeGreaterThan(markup.indexOf('</article>'));
  });
});

describe('loadLearnSite', () => {
  it('awaits every body and the cycles file', async () => {
    const site = await loadLearnSite();
    expect(site.modules).toBe(LEARN_MODULES);
    expect([...site.bodies.keys()].sort()).toEqual(LEARN_MODULES.map(({ slug }) => slug).sort());
    expect(site.falls.length).toBeGreaterThan(0);
  });
});
