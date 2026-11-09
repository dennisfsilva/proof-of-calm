// @vitest-environment jsdom
import { percentJoiner } from '@proofofcalm/content';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { createFormatters } from '../../../lib/format';
import { I18nProvider } from '../../../lib/i18n';
import learn from '../../../messages/en/learn.json';
import { headingId, MODULE_ELEMENTS, moduleElements, pageJoiner } from './body-elements';

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
    expect(text(moduleElements('drawdowns-bar', formatted))).toBe(
      `Bitcoin fell 77${joiner}% and Ether 94${joiner}%.A share of 5${joiner}%`,
    );
  });

  it('a module without a chart keeps its text as written', () => {
    expect(moduleElements('none', NBSP)).toBe(MODULE_ELEMENTS);
    expect(text(moduleElements('none', ''))).toBe('Bitcoin fell 77 % and Ether 94 %.A share of 5 %');
  });

  it('an h2 keeps the id of its text', () => {
    const elements = moduleElements('drawdowns-bar', '');
    render(<elements.h2>Falls of 80 %</elements.h2>);
    expect(screen.getByRole('heading', { level: 2, name: 'Falls of 80%' }).id).toBe('falls-of-80');
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
