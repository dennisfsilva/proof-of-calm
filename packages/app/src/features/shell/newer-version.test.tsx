// @vitest-environment jsdom
import { anEntry } from '@proofofcalm/core/testing';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { EMPTY_SNAPSHOT } from '../../lib/adapters';
import { I18nProvider } from '../../lib/i18n';
import { NavigationProvider } from '../../lib/navigation';
import { ServicesProvider } from '../../lib/services';
import { createTestServices, recordingPlatform } from '../../lib/services/testing';
import shell from '../../messages/en/shell.json';
import { NewerVersion } from './newer-version';

// Rows a newer build wrote (ADR-0019 readings, "Row shape"): a newer plan takes the screen area with
// Reload, so nothing here writes a second plan beside it; newer entries alone are one line on Today.

afterEach(cleanup);

const LINE =
  '2 entries were saved by a newer version of Proof of Calm, so they are not shown here. Reload the page to see them.';

async function setup(newer: { plans: number; entries: number }, path = '/today') {
  const platform = recordingPlatform();
  const services = createTestServices({ platform, snapshot: { ...EMPTY_SNAPSHOT, entries: [anEntry()], newer } });
  await act(() => services.start());
  render(
    <ServicesProvider services={services}>
      <NavigationProvider location="memory" initialPath={path}>
        <I18nProvider messages={{ shell }}>
          <NewerVersion>
            <h1>The screen</h1>
          </NewerVersion>
        </I18nProvider>
      </NavigationProvider>
    </ServicesProvider>,
  );
  return platform;
}

describe('NewerVersion (ADR-0019 readings)', () => {
  it('screen with Reload when a newer plan row exists', async () => {
    const platform = await setup({ plans: 1, entries: 2 });
    const heading = screen.getByRole('heading', {
      level: 1,
      name: 'Your plan was saved by a newer version of Proof of Calm.',
    });
    expect(heading.tabIndex).toBe(-1);
    expect(
      screen.getByText(
        'This version cannot open it, so it stays as it was saved. Reload the page to open it in the newer version.',
      ),
    ).toBeTruthy();
    // A rolled-back build loads itself again on Reload, so the screen names the step after that too.
    expect(
      screen.getByText(
        'If this screen comes back after the reload, your plan stays on this device, unread; a newer version of Proof of Calm can open it.',
      ),
    ).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'The screen' })).toBeNull();
    expect(screen.queryByText(LINE)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Reload' }));
    expect(platform.calls.reloads).toBe(1);
  });

  it('one line on Today, above the screen, when only entries are newer', async () => {
    await setup({ plans: 0, entries: 2 });
    expect(screen.getByText(LINE)).toBeTruthy();
    expect(screen.getByRole('heading', { level: 1, name: 'The screen' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Reload' })).toBeNull();
  });

  // docs/CONTENT-STYLE.md §4: the count is a figure in the country's number format, never ICU's `#`.
  it('counts the newer entries, one or many, as a grouped figure', async () => {
    await setup({ plans: 0, entries: 1 });
    expect(
      screen.getByText(
        '1 entry was saved by a newer version of Proof of Calm, so it is not shown here. Reload the page to see it.',
      ),
    ).toBeTruthy();
    cleanup();
    await setup({ plans: 0, entries: 1234 });
    expect(screen.getByText(/^1,234 entries were saved by a newer version of Proof of Calm, so they are/)).toBeTruthy();
  });

  it('no line on the other screens, and nothing at all without newer rows', async () => {
    await setup({ plans: 0, entries: 2 }, '/log');
    expect(screen.queryByText(LINE)).toBeNull();
    cleanup();
    await setup({ plans: 0, entries: 0 });
    expect(screen.queryByText(LINE)).toBeNull();
    expect(screen.getByRole('heading', { level: 1, name: 'The screen' })).toBeTruthy();
  });
});
