// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { I18nProvider } from '../../../lib/i18n';
import learn from '../../../messages/en/learn.json';
import { headingId, MODULE_ELEMENTS } from './body-elements';

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
