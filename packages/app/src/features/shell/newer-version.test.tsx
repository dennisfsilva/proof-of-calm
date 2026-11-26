// @vitest-environment jsdom
import { anEntry } from '@proofofcalm/core/testing';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { EMPTY_SNAPSHOT } from '../../lib/adapters';
import { I18nProvider } from '../../lib/i18n';
import { NavigationProvider } from '../../lib/navigation';
import { ServicesProvider } from '../../lib/services';
import { createTestServices, recordingPlatform } from '../../lib/services/testing';
import shellDe from '../../messages/de/shell.json';
import shell from '../../messages/en/shell.json';
import { NewerVersion } from './newer-version';

// Rows a newer build wrote (ADR-0019 readings, "Row shape"): a newer plan takes the screen area with
// Reload, so nothing here writes a second plan beside it; newer entries alone are Today's line, not the shell's.

afterEach(cleanup);

async function setup(newer: { plans: number; entries: number }, path = '/today', locale: 'en' | 'de' = 'en') {
  const platform = recordingPlatform();
  const services = createTestServices({ platform, snapshot: { ...EMPTY_SNAPSHOT, entries: [anEntry()], newer } });
  await act(() => services.start());
  render(
    <ServicesProvider services={services}>
      <NavigationProvider location="memory" initialPath={path}>
        <I18nProvider locale={locale} messages={{ shell: locale === 'de' ? shellDe : shell }}>
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
    fireEvent.click(screen.getByRole('button', { name: 'Reload' }));
    expect(platform.calls.reloads).toBe(1);
  });

  // The English says the plan stays "unread"; the German says so too (counsel on #419).
  it('in German, the line after the reload says the plan stays unread', async () => {
    await setup({ plans: 1, entries: 0 }, '/today', 'de');
    expect(screen.getByText(/^Wenn diese Ansicht nach dem Neuladen wieder erscheint/).textContent).toContain(
      'bleibt der Plan ungelesen auf diesem Gerät',
    );
  });

  // Today draws the entries line under its own heading (NewerEntriesLine), so the focus a tab navigation puts
  // on that heading never skips it; the shell adds nothing above any screen.
  it('shows no entries line above the screen', async () => {
    await setup({ plans: 0, entries: 2 });
    expect(screen.getByRole('heading', { level: 1, name: 'The screen' })).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/saved by a newer version/);
    expect(screen.queryByRole('button', { name: 'Reload' })).toBeNull();
    cleanup();
    await setup({ plans: 0, entries: 0 });
    expect(screen.getByRole('heading', { level: 1, name: 'The screen' })).toBeTruthy();
  });
});
