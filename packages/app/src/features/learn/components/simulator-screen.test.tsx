// @vitest-environment jsdom
import { addDays, type CalendarDate, type CoinId, type Result } from '@proofofcalm/core';
import type { Dataset } from '@proofofcalm/data';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { memoryPlanStore } from '../../../lib/adapters';
import { I18nProvider } from '../../../lib/i18n';
import { NavigationProvider } from '../../../lib/navigation';
import { ServicesProvider } from '../../../lib/services';
import { fixtureSnapshot } from '../../../lib/services/fixtures';
import { createTestServices, recordingPlatform } from '../../../lib/services/testing';
import errors from '../../../messages/en/errors.json';
import learn from '../../../messages/en/learn.json';
import plan from '../../../messages/en/plan.json';
import shell from '../../../messages/en/shell.json';
import { type ClosesFailure, loadReferenceCloses } from '../lib/reference-closes';
import { SimulatorScreen } from './simulator-screen';

// The simulator's route (docs/EDUCATION.md §7): the title, then BTC's file decides the screen: busy, not
// published yet, failed with Reload, or the form; each coin the form adds has its own file asked once, and a run
// shows the result under its heading. Synthetic figures only (ADR-0036, Reading of 2026-11-27).

const logged = vi.spyOn(console, 'error');
afterEach(() => {
  cleanup();
  const missing = logged.mock.calls.filter((call) => String(call[0]).includes('MISSING_MESSAGE'));
  logged.mockClear();
  expect(missing).toEqual([]);
});

/** Sixty synthetic days of a coin from 2 Mar 2026, rising 1 a day from 100, so a run has a path. */
const dataset = (coin: string, count = 60): Dataset =>
  ({
    coin,
    currency: 'EUR',
    days: Array.from({ length: count }, (_, index) => ({
      date: addDays('2026-03-02' as CalendarDate, index),
      close: String(100 + index),
      sources: 2,
    })),
  }) as Dataset;

const DATASET = dataset('BTC', 2);

type Loaded = Result<Dataset, ClosesFailure>;
type Load = (coin: CoinId) => Promise<Loaded>;

/** A load the test settles by hand, so the loading state can be read before it ends. */
function deferred() {
  let settle: (result: Loaded) => void = () => undefined;
  const promise = new Promise<Loaded>((resolve) => {
    settle = resolve;
  });
  return { load: () => promise, settle };
}

/** Every coin's file a dataset of that coin, but those named, which answer as given. */
const files =
  (answers: Partial<Record<string, Loaded>> = {}): Load =>
  async (coin) =>
    answers[coin] ?? { ok: true, value: dataset(coin) };

async function mount(load: Load, options: { readonly withPlan?: boolean } = {}) {
  const platform = recordingPlatform();
  const planStore = memoryPlanStore(options.withPlan ? fixtureSnapshot() : undefined);
  const write = vi.spyOn(planStore, 'write');
  const services = createTestServices({ platform, planStore });
  await services.start();
  write.mockClear();
  render(
    <NavigationProvider location="memory" initialPath="/learn/simulator">
      <ServicesProvider services={services}>
        <I18nProvider messages={{ learn, shell, plan, errors }}>
          <SimulatorScreen load={load} />
        </I18nProvider>
      </ServicesProvider>
    </NavigationProvider>,
  );
  return { platform, write };
}

const area = () => screen.getByTestId('simulator-result');
const box = (name: string) => screen.getByRole('textbox', { name }) as HTMLInputElement;
const type = (element: HTMLElement, value: string) => fireEvent.change(element, { target: { value } });
const press = (name: string) => fireEvent.click(screen.getByRole('button', { name }));
const run = () => press('Run the simulation');
const result = () => screen.queryByRole('heading', { level: 2, name: 'Result' });

/** Adds the coins by name and types their shares and the amount. */
async function choose(shares: Readonly<Record<string, string>>, amount = '100') {
  await screen.findByRole('button', { name: 'Run the simulation' });
  for (const [name, value] of Object.entries(shares)) {
    await act(async () => press(`Add ${name}`));
    type(box(`${name} share (%)`), value);
  }
  type(box('Monthly amount (EUR)'), amount);
}

/** The failure line names its fix, in the shell's words (docs/CONTENT-STYLE.md §1 rule 8). */
const FAILED = 'The price history could not be loaded. Check your connection, then reload the page.';
const CREDIT = 'Reference closes derived from Kraken and Bitstamp public data; FX: ECB reference rates';
const PORTFOLIO = 'Your own purchases and their value are on Portfolio.';

describe('the simulator screen', () => {
  it('shows its title, and the result area is busy while the closes load', async () => {
    const { load, settle } = deferred();
    await mount(load);
    expect(screen.getByRole('heading', { level: 1, name: 'Simulator' })).toBeTruthy();
    expect(area().getAttribute('aria-busy')).toBe('true');
    await act(async () => settle({ ok: true, value: DATASET }));
    expect(area().getAttribute('aria-busy')).toBe('false');
  });

  it("with BTC's dataset: the form, the data-from line as the start's description, and no credit before a run", async () => {
    await mount(async () => ({ ok: true, value: DATASET }));
    const start = await screen.findByLabelText('Start');
    const line = screen.getByText('Data from 2 Mar 2026, the first day with closes from two exchanges.');
    expect(start.getAttribute('aria-describedby')?.split(' ')).toContain(line.id);
    expect(screen.queryByText(CREDIT)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Reload' })).toBeNull();
  });

  it('with nothing published: says so, offers no reload, no form and no credit', async () => {
    await mount(async () => ({ ok: false, error: { kind: 'unpublished' } }));
    expect(await screen.findByText('The price history the simulator runs on is not published yet.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Reload' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Run the simulation' })).toBeNull();
    expect(screen.queryByText(/^Reference closes derived/)).toBeNull();
    expect(area().getAttribute('aria-busy')).toBe('false');
  });

  it.each(['offline', 'invalid'] as const)(
    'a load that fails (%s) says so, names the fix and offers Reload, with the gap of the other failures',
    async (kind) => {
      const { platform } = await mount(async () => ({ ok: false, error: { kind } }));
      const line = await screen.findByText(FAILED);
      expect(line.parentElement?.classList).toContain('gap-stack-lg');
      expect(screen.queryByText(/^Data from/)).toBeNull();
      expect(screen.queryByRole('button', { name: 'Run the simulation' })).toBeNull();
      expect(platform.calls.reloads).toBe(0);
      fireEvent.click(screen.getByRole('button', { name: 'Reload' }));
      expect(platform.calls.reloads).toBe(1);
    },
  );

  it('a load whose connection stalls ends busy with the failed line and Reload once the timeout passes', async () => {
    // The real loader over a fetch that answers only its signal's abort, with a 20 ms timeout for the test.
    const stalling: typeof fetch = (_, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(init.signal?.reason));
      });
    await mount((coin) => loadReferenceCloses(coin, stalling, 20));
    expect(area().getAttribute('aria-busy')).toBe('true');
    expect(await screen.findByText(FAILED)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Reload' })).toBeTruthy();
    expect(area().getAttribute('aria-busy')).toBe('false');
  });

  it('a load that rejects is a failure too, never an unhandled error', async () => {
    await mount(() => Promise.reject(new Error('a programmer error in the loader')));
    expect(await screen.findByText(FAILED)).toBeTruthy();
  });

  it("asks each coin's file once, BTC's from the first load, however often the coin is added", async () => {
    const load = vi.fn(files());
    await mount(load);
    await choose({ Bitcoin: '50', Ethereum: '50' });
    await act(async () => press('Remove Ethereum'));
    await act(async () => press('Add Ethereum'));
    expect(load.mock.calls.map(([coin]) => coin)).toEqual(['BTC', 'ETH']);
  });

  it("an added coin's 404 marks its row and refuses the run with the focus on its share", async () => {
    await mount(files({ ETH: { ok: false, error: { kind: 'unpublished' } } }));
    await choose({ Bitcoin: '50', Ethereum: '50' });
    expect(screen.getByText(/^No reference closes for Ethereum yet\./)).toBeTruthy();
    await act(async () => run());
    expect(document.activeElement).toBe(box('Ethereum share (%)'));
    expect(result()).toBeNull();
  });

  it.each(['offline', 'invalid'] as const)(
    "an added coin's file that fails (%s) shows the failed state with Reload, as BTC's does",
    async (kind) => {
      await mount(files({ ETH: { ok: false, error: { kind } } }));
      await screen.findByRole('button', { name: 'Run the simulation' });
      await act(async () => press('Add Ethereum'));
      expect(await screen.findByText(FAILED)).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Reload' })).toBeTruthy();
      expect(screen.queryByRole('button', { name: 'Run the simulation' })).toBeNull();
    },
  );

  it("a run shows the result with the run's fee under its heading, which takes the focus, with one credit", async () => {
    await mount(files());
    await choose({ Bitcoin: '100' });
    type(box('Fee (%)'), '0.5');
    await act(async () => run());
    const heading = result();
    expect(heading?.getAttribute('tabindex')).toBe('-1');
    expect(document.activeElement).toBe(heading);
    expect(screen.getByText(/fees are in it only as the flat 0\.5% you set\.$/)).toBeTruthy();
    expect(screen.getAllByText(CREDIT)).toHaveLength(1);
    expect(screen.queryByText(PORTFOLIO)).toBeNull();
  });

  it('an edit after a run removes the result', async () => {
    await mount(files());
    await choose({ Bitcoin: '100' });
    await act(async () => run());
    expect(result()).toBeTruthy();
    type(box('Monthly amount (EUR)'), '200');
    expect(result()).toBeNull();
    expect(screen.queryByText(CREDIT)).toBeNull();
  });

  it('after a fill, the Portfolio line stands under the result, goes with it on an edit, and nothing is written', async () => {
    const { write } = await mount(files(), { withPlan: true });
    await screen.findByRole('button', { name: 'Run the simulation' });
    await act(async () => press('Fill in from your plan'));
    await act(async () => run());
    const shown = area();
    expect(within(shown).getByText(PORTFOLIO)).toBeTruthy();
    expect(result()).toBeTruthy();
    type(box('Fee (%)'), '1');
    expect(screen.queryByText(PORTFOLIO)).toBeNull();
    expect(write).not.toHaveBeenCalled();
  });
});
