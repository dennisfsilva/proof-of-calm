// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { EMPTY_SNAPSHOT } from '../../../lib/adapters';
import { I18nProvider } from '../../../lib/i18n';
import { ServicesProvider } from '../../../lib/services';
import { createTestServices } from '../../../lib/services/testing';
import todayDe from '../../../messages/de/today.json';
import today from '../../../messages/en/today.json';
import { NewerEntriesLine } from './newer-entries-line';

// Entries a newer build wrote, left unread (ADR-0019 Readings, "Row shape"): one plain line on Today, counted
// as a figure in the plan's number format (docs/CONTENT-STYLE.md §4), never ICU's `#`.

afterEach(cleanup);

async function setup(entries: number, locale: 'en' | 'de' = 'en') {
  const services = createTestServices({ snapshot: { ...EMPTY_SNAPSHOT, newer: { plans: 0, entries } } });
  await act(() => services.start());
  render(
    <ServicesProvider services={services}>
      <I18nProvider locale={locale} messages={{ today: locale === 'de' ? todayDe : today }}>
        <NewerEntriesLine />
      </I18nProvider>
    </ServicesProvider>,
  );
}

describe('NewerEntriesLine', () => {
  it('counts the newer entries, one or many, as a grouped figure', async () => {
    await setup(1);
    expect(
      screen.getByText(
        '1 entry was saved by a newer version of Proof of Calm, so it is not shown here. Reload the page to see it.',
      ),
    ).toBeTruthy();
    cleanup();
    await setup(1234);
    expect(screen.getByText(/^1,234 entries were saved by a newer version of Proof of Calm, so they are/)).toBeTruthy();
  });

  it('keeps its words in German', async () => {
    await setup(2, 'de');
    expect(screen.getByText(/^2 Einträge wurden von einer neueren Version von Proof of Calm gespeichert/)).toBeTruthy();
  });

  it('shows nothing without newer entries', async () => {
    await setup(0);
    expect(document.body.textContent).toBe('');
  });
});
