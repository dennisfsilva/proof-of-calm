// @vitest-environment jsdom
import { percentJoiner } from '@proofofcalm/content';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { createFormatters } from '../../../lib/format';
import { I18nProvider } from '../../../lib/i18n';
import learn from '../../../messages/en/learn.json';
import { headingId, MODULE_ELEMENTS, moduleElements, moduleJoiner, pageJoiner, withJoiner } from './body-elements';

// A section's id comes from its heading's text, so the compiled module carries no id and a link names the
// section by the words on the page (ADR-0048 Deviations).

afterEach(cleanup);

describe('MODULE_ELEMENTS', () => {
  it('an h2 carries the id of its text', () => {
    render(<MODULE_ELEMENTS.h2>Why some people hold</MODULE_ELEMENTS.h2>);
    const heading = screen.getByRole('heading', { level: 2, name: 'Why some people hold' });
    expect(heading.id).toBe('why-some-people-hold');
    expect(heading.tabIndex).toBe(-1);
  });

  it('PastPerformance sets the sentence and the link to the Risk page as one, in the type of the body', () => {
    render(
      <I18nProvider messages={{ learn }}>
        <p>
          Bitstamp closes. <MODULE_ELEMENTS.PastPerformance />
        </p>
      </I18nProvider>,
    );
    const link = screen.getByRole('link', { name: 'Risk disclosure' });
    expect(link.getAttribute('href')).toBe('/risk');
    expect(link.closest('p')?.textContent).toBe(
      'Bitstamp closes. Past performance is not a reliable indicator of future results. Risk disclosure',
    );
    expect(link.parentElement?.className).toBe('text-16');
  });
});

// A module with a chart shows formatted figures, so its own `N %` takes the page's joiner (docs/CONTENT-STYLE.md §4).
describe('moduleElements', () => {
  const NBSP = ' ';
  const text = (elements: ReturnType<typeof moduleElements>) => {
    const { container } = render(
      <elements.ul>
        <elements.li>
          Bitcoin fell 77 % and <elements.strong>Ether 94 %</elements.strong>.
        </elements.li>
        <elements.li>A share of 5 %</elements.li>
      </elements.ul>,
    );
    return container.textContent;
  };

  it.each([
    ['en', ''],
    ['pt-PT', ''],
    ['de', NBSP],
  ])('%s: the joiner of the profiles, as the page formats a figure', (locale, joiner) => {
    const formatted = pageJoiner(createFormatters(locale, 'en-GB'));
    expect(formatted).toBe(joiner);
    expect(formatted).toBe(percentJoiner(locale));
    expect(text(moduleElements(formatted))).toBe(
      `Bitcoin fell 77${joiner}% and Ether 94${joiner}%.A share of 5${joiner}%`,
    );
  });

  // Risk honestly writes its `N %` with a no-break space, so the sign cannot wrap away before a page joins it.
  it.each([
    ['en', ''],
    ['de', NBSP],
  ])('%s: a no-break space before the sign takes the joiner too', (locale, joiner) => {
    const elements = moduleElements(pageJoiner(createFormatters(locale, 'en-GB')));
    const { container } = render(<elements.p>{`Falls of 94${NBSP}% and 78 %`}</elements.p>);
    expect(container.textContent).toBe(`Falls of 94${joiner}% and 78${joiner}%`);
  });

  // The tax module has no chart, and its lead card shows the profile's percentages, so the joiner alone decides.
  it("a `chart: none` body given a joiner takes it: Taxes' `28 %` reads `28%` in Portugal", () => {
    const elements = moduleElements(pageJoiner(createFormatters('pt-PT', 'en-GB')));
    const { container } = render(<elements.p>{`A rate of 28${NBSP}%`}</elements.p>);
    expect(container.textContent).toBe('A rate of 28%');
  });

  it('with no joiner the text stays as written', () => {
    expect(moduleElements(undefined)).toBe(MODULE_ELEMENTS);
    expect(text(moduleElements(undefined))).toBe('Bitcoin fell 77 % and Ether 94 %.A share of 5 %');
  });

  it('an h2 keeps the id of its text', () => {
    const elements = moduleElements('');
    render(<elements.h2>Falls of 80 %</elements.h2>);
    expect(screen.getByRole('heading', { level: 2, name: 'Falls of 80%' }).id).toBe('falls-of-80');
  });
});

// The one place that decides whether a module takes the page's joiner (docs/CONTENT-STYLE.md §4): a chart, or the tax
// module's country card, shows figures the app formats.
describe('moduleJoiner', () => {
  const pt = createFormatters('pt-PT', 'en-GB');
  const de = createFormatters('de', 'en-GB');

  it.each([
    ['taxes-where-you-live', 'none', pt, ''],
    ['taxes-where-you-live', 'none', de, ' '],
    ['risk-honestly', 'drawdowns-bar', de, ' '],
    ['start-here', 'none', de, undefined],
  ] as const)('%s with chart %s', (slug, chart, format, joiner) => {
    expect(moduleJoiner({ slug, chart }, format)).toBe(joiner);
  });
});

// A module without a chart has no page joiner: Cycles writes `−94.0 %` with a no-break space so the line cannot
// break there, and that space stays.
describe('withJoiner', () => {
  it('with no joiner the text stays as written, its no-break spaces too', () => {
    const text = `fell \u221294.0\u00a0% and 77 %`;
    expect(withJoiner(text, undefined)).toBe(text);
  });

  it('with a joiner both spaces before the sign give way to it', () => {
    expect(withJoiner(`94\u00a0% and 77 %`, '')).toBe('94% and 77%');
  });
});

describe('headingId', () => {
  it.each([
    ['A section', 'a-section'],
    ['What the plan does, and what it does not', 'what-the-plan-does-and-what-it-does-not'],
    ['  Why?  ', 'why'],
    ['Über 4 Jahre', 'über-4-jahre'],
  ])('%s', (text, id) => {
    expect(headingId(text)).toBe(id);
  });
});
