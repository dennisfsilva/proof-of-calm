// @vitest-environment jsdom
import type { Result } from '@proofofcalm/core';
import type { Dataset } from '@proofofcalm/data';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../../../lib/i18n';
import { NavigationProvider } from '../../../lib/navigation';
import { ServicesProvider } from '../../../lib/services';
import { createTestServices, recordingPlatform } from '../../../lib/services/testing';
import learn from '../../../messages/en/learn.json';
import shell from '../../../messages/en/shell.json';
import type { ClosesFailure } from '../lib/reference-closes';
import { SimulatorScreen } from './simulator-screen';

// The simulator's route before its inputs and result (docs/EDUCATION.md §7): the title, then one of the data
// states, worded in learn.simulator. Synthetic figures only (ADR-0036, Reading of 2026-11-27).

const logged = vi.spyOn(console, 'error');
afterEach(() => {
  cleanup();
  const missing = logged.mock.calls.filter((call) => String(call[0]).includes('MISSING_MESSAGE'));
  logged.mockClear();
  expect(missing).toEqual([]);
});

const DATASET = {
  coin: 'BTC',
  currency: 'EUR',
  days: [
    { date: '2026-03-02', close: '100', sources: 2 },
    { date: '2026-03-03', close: '101.25', sources: 2 },
  ],
} as Dataset;

type Loaded = Result<Dataset, ClosesFailure>;

/** A load the test settles by hand, so the loading state can be read before it ends. */
function deferred() {
  let settle: (result: Loaded) => void = () => undefined;
  const promise = new Promise<Loaded>((resolve) => {
    settle = resolve;
  });
  return { load: () => promise, settle };
}

async function mount(load: () => Promise<Loaded>) {
  const platform = recordingPlatform();
  const services = createTestServices({ platform });
  await services.start();
  render(
    <NavigationProvider location="memory" initialPath="/learn/simulator">
      <ServicesProvider services={services}>
        <I18nProvider messages={{ learn, shell }}>
          <SimulatorScreen load={load} />
        </I18nProvider>
      </ServicesProvider>
    </NavigationProvider>,
  );
  return platform;
}

const area = () => screen.getByTestId('simulator-result');

describe('the simulator screen', () => {
  it('shows its title, and the result area is busy while the closes load', async () => {
    const { load, settle } = deferred();
    await mount(load);
    expect(screen.getByRole('heading', { level: 1, name: 'Simulator' })).toBeTruthy();
    expect(area().getAttribute('aria-busy')).toBe('true');
    await act(async () => settle({ ok: true, value: DATASET }));
    expect(area().getAttribute('aria-busy')).toBe('false');
  });

  it('with the dataset: the first day of the data with its reason, then the credit at text-14', async () => {
    await mount(async () => ({ ok: true, value: DATASET }));
    expect(await screen.findByText('Data from 2 Mar 2026, the first day with closes from two exchanges.')).toBeTruthy();
    const credit = screen.getByText(
      'Reference closes derived from Kraken and Bitstamp public data; FX: ECB reference rates',
    );
    expect(credit.classList).toContain('text-14');
    expect(screen.queryByRole('button', { name: 'Reload' })).toBeNull();
  });

  it('with nothing published: says so, offers no reload and shows no credit', async () => {
    await mount(async () => ({ ok: false, error: { kind: 'unpublished' } }));
    expect(await screen.findByText('The price history the simulator runs on is not published yet.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Reload' })).toBeNull();
    expect(screen.queryByText(/^Reference closes derived/)).toBeNull();
    expect(area().getAttribute('aria-busy')).toBe('false');
  });

  it.each(['offline', 'invalid'] as const)('a load that fails (%s) says so and offers Reload', async (kind) => {
    const platform = await mount(async () => ({ ok: false, error: { kind } }));
    expect(await screen.findByText('The price history could not be loaded.')).toBeTruthy();
    expect(screen.queryByText(/^Data from/)).toBeNull();
    expect(platform.calls.reloads).toBe(0);
    fireEvent.click(screen.getByRole('button', { name: 'Reload' }));
    expect(platform.calls.reloads).toBe(1);
  });

  it('a load that rejects is a failure too, never an unhandled error', async () => {
    await mount(() => Promise.reject(new Error('a programmer error in the loader')));
    expect(await screen.findByText('The price history could not be loaded.')).toBeTruthy();
  });
});
