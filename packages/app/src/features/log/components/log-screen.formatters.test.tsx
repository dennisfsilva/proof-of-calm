// @vitest-environment jsdom
import { type CalendarDate, type Entry, LOG_WINDOW } from '@proofofcalm/core';
import { Toaster } from '@proofofcalm/ui/components/toast';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../../../lib/i18n';
import { ServicesProvider, useFormatters } from '../../../lib/services';
import { fixtureNowMs, fixtureSnapshot } from '../../../lib/services/fixtures';
import { createTestServices, preloadLazyModules } from '../../../lib/services/testing';
import errors from '../../../messages/en/errors.json';
import log from '../../../messages/en/log.json';
import shell from '../../../messages/en/shell.json';
import { LogScreen } from './log-screen';

// The Log asks for its formatters once for the screen, never once per row (docs/ENGINEERING.md §4, the Log at the
// cap): a profile of Show all at 10,000 entries spent a third of its render in each row's own `useFormatters`.
// The hook's calls count it: `createFormatters` cannot, since the hook shares one set per pair of locales, so a
// row that called the hook again would build nothing new but still pay the hook and the prop change per row.

vi.mock('../../../lib/services', async (original) => {
  const services = await original<typeof import('../../../lib/services')>();
  return { ...services, useFormatters: vi.fn(services.useFormatters) };
});
vi.mock('@proofofcalm/content', async (original) =>
  (await import('../../../lib/services/testing-modules')).profilesInMemory(
    await original<typeof import('@proofofcalm/content')>(),
  ),
);
await preloadLazyModules();

// jsdom has no `scrollIntoView`, which Show all's focus move calls.
beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(cleanup);

/** The fixture with `count` more buys, one a day from 1 Jan 2025, so every row mounts under Show all. */
function withBuys(count: number) {
  const snapshot = fixtureSnapshot();
  const [first] = snapshot.entries as [Entry];
  const start = Date.UTC(2025, 0, 1);
  const more = Array.from(
    { length: count },
    (_, index): Entry => ({
      ...first,
      id: `00000000-0000-4000-8000-${String(700_000 + index).padStart(12, '0')}` as Entry['id'],
      kind: 'extra',
      slot: null,
      date: new Date(start + index * 86_400_000).toISOString().slice(0, 10) as CalendarDate,
      deletedAt: null,
    }),
  );
  return { ...snapshot, entries: [...snapshot.entries, ...more] };
}

describe('LogScreen formatters', () => {
  it('asks for the formatters a constant number of times, not once per row, when Show all mounts a window of 100 rows', async () => {
    const services = createTestServices({ snapshot: withBuys(300), nowMs: fixtureNowMs('buy') });
    await act(() => services.start());
    vi.mocked(useFormatters).mockClear();
    render(
      <ServicesProvider services={services}>
        <I18nProvider messages={{ errors, log, shell }}>
          <Toaster closeLabel="Close" toastManager={services.toasts}>
            <LogScreen />
          </Toaster>
        </I18nProvider>
      </ServicesProvider>,
    );
    await act(async () =>
      fireEvent.click(screen.getByRole('button', { name: /^Show all \d+ entries, 100 at a time$/ })),
    );
    expect(document.querySelectorAll('tbody [data-row]')).toHaveLength(LOG_WINDOW);
    // Once per render of the screen (the first page, then the window); a row of its own makes it over 100.
    expect(vi.mocked(useFormatters).mock.calls.length).toBeLessThanOrEqual(10);
  });
});
