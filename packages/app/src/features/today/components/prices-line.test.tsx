// @vitest-environment jsdom
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { I18nProvider } from '../../../lib/i18n';
import type { PricesState } from '../../../lib/ports';
import { ServicesProvider } from '../../../lib/services';
import { createTestServices, pricesAt, TEST_NOW_MS, TEST_PRICES } from '../../../lib/services/testing';
import shell from '../../../messages/en/shell.json';
import today from '../../../messages/en/today.json';
import { PricesSlot } from './prices-line';

// The prices line's slot (docs/ENGINEERING.md §4): its widest forms, unseen and unread, in one grid cell with
// the drawn line, so the slot is as tall before the prices arrive as after.

afterEach(cleanup);

async function mount(prices: PricesState | null) {
  const services = createTestServices();
  await act(() => services.start());
  const view = await act(async () =>
    render(
      <ServicesProvider services={services}>
        <I18nProvider messages={{ shell, today }}>
          <PricesSlot prices={prices} online failure={null} />
        </I18nProvider>
      </ServicesProvider>,
    ),
  );
  return view.container;
}

const cell = 'col-start-1 row-start-1';

describe('PricesSlot', () => {
  it('holds the hidden widest forms in the drawn line’s cell', async () => {
    const container = await mount(pricesAt(TEST_PRICES, TEST_NOW_MS));
    const hidden = [...container.querySelectorAll('[aria-hidden="true"]')];
    expect(hidden.length).toBeGreaterThan(1);
    for (const form of hidden) {
      expect(form.className).toContain('invisible');
      expect(form.className).toContain(cell);
      // Drawn from the attribute: the page's text holds the drawn line once.
      expect(form.getAttribute('data-line')).toMatch(/^Prices (as of|from) /u);
      expect(form.textContent).toBe('');
    }
    const drawn = [...container.querySelectorAll('p:not([aria-hidden])')];
    expect(drawn).toHaveLength(1);
    expect(drawn[0]?.className).toContain(cell);
    expect(drawn[0]?.className).not.toContain('invisible');
    expect(drawn[0]?.textContent).toMatch(/^Prices as of /u);
  });

  it('keeps only the hidden forms before the prices arrive', async () => {
    const container = await mount(null);
    expect(container.querySelectorAll('[aria-hidden="true"]').length).toBeGreaterThan(1);
    expect(container.querySelectorAll('p:not([aria-hidden])')).toHaveLength(0);
  });
});
