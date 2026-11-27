// @vitest-environment jsdom
import type { CalendarDate, CoinId, CurrencyCode, Money, Plan } from '@proofofcalm/core';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { userEvent } from 'storybook/test';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../../../lib/i18n';
import { type Services, ServicesProvider } from '../../../lib/services';
import { fixtureSnapshot } from '../../../lib/services/fixtures';
import { createTestServices } from '../../../lib/services/testing';
import errors from '../../../messages/en/errors.json';
import learn from '../../../messages/en/learn.json';
import plan from '../../../messages/en/plan.json';
import { type DefaultWindow, defaultWindow } from '../lib/simulator-dates';
import type { ClosesByCoin } from '../lib/simulator-form';
import { SimulatorForm } from './simulator-form';

// The simulator's form (docs/EDUCATION.md §7, #14's V1 to V3): it opens empty, follows the closes' window and
// the start's buy day until the person sets them, fills from the plan without touching the dates, and runs only
// on its button, focusing the first field it refuses.

const logged = vi.spyOn(console, 'error');
afterEach(() => {
  cleanup();
  const missing = logged.mock.calls.filter((call) => String(call[0]).includes('MISSING_MESSAGE'));
  logged.mockClear();
  expect(missing).toEqual([]);
});

const id = (symbol: string) => symbol as CoinId;
const day = (date: string) => date as CalendarDate;
const thePlan = fixtureSnapshot().plan as Plan;
const RANGE = { first: day('2023-01-01'), last: day('2026-11-26') };
const CLOSES: ClosesByCoin = { [id('BTC')]: RANGE, [id('ETH')]: RANGE };
const WINDOW = defaultWindow([RANGE]) as DefaultWindow;

let services: Services;
beforeAll(async () => {
  services = createTestServices();
  await services.start();
});

type Props = Parameters<typeof SimulatorForm>[0];

function mount(overrides: Partial<Props> = {}) {
  const props: Props = {
    closes: CLOSES,
    window: WINDOW,
    plan: thePlan,
    onCoins: vi.fn(),
    onRun: vi.fn(),
    onEdit: vi.fn(),
    ...overrides,
  };
  const tree = (next: Props) => (
    <ServicesProvider services={services}>
      <I18nProvider messages={{ learn, plan, errors }}>
        <SimulatorForm {...next} />
      </I18nProvider>
    </ServicesProvider>
  );
  const view = render(tree(props));
  return { props, rerender: (next: Partial<Props>) => view.rerender(tree({ ...props, ...next })) };
}

const box = (name: string) => screen.getByRole('textbox', { name }) as HTMLInputElement;
const share = (coin: string) => box(`${coin} share (%)`);
const date = (name: 'Start' | 'End') => screen.getByLabelText(name) as HTMLInputElement;
const buyDay = () => screen.getByRole('combobox', { name: 'Buy day' }).textContent?.match(/^\d+/)?.[0];
const type = (element: HTMLElement, value: string) => fireEvent.change(element, { target: { value } });
const fill = () => fireEvent.click(screen.getByRole('button', { name: 'Fill in from your plan' }));
const run = () => fireEvent.click(screen.getByRole('button', { name: 'Run the simulation' }));
const MONTHLY = 'Monthly amount (EUR)';

describe('SimulatorForm', () => {
  it('opens empty, over the whole catalogue sorted by name, with the fee at 0 and the window as dates', () => {
    mount();
    expect(screen.queryByRole('textbox', { name: /share \(%\)$/ })).toBeNull();
    const adds = screen.getAllByRole('button', { name: /^Add / }).map((button) => button.textContent);
    expect(adds.slice(0, 4)).toEqual(['Add Aave', 'Add Arbitrum', 'Add Avalanche', 'Add Bitcoin']);
    expect(adds).toHaveLength(26);
    expect(box(MONTHLY).value).toBe('');
    expect(box('Fee (%)').value).toBe('0');
    expect([date('Start').value, date('End').value]).toEqual([WINDOW.start, WINDOW.end]);
    expect([date('Start').min, date('Start').max]).toEqual([WINDOW.first, WINDOW.last]);
  });

  it('writes its labels and lines in English word for word', () => {
    mount();
    for (const label of ['Coins & split', MONTHLY, 'Buy day', 'Start', 'End', 'Fee (%)']) {
      expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    }
    expect(screen.getByText('A flat percentage of each buy. Enter 0 for none.')).toBeDefined();
    const button = screen.getByRole('button', { name: 'Fill in from your plan' });
    expect(button.getAttribute('aria-describedby')).toBe(
      screen.getByText('€100.00 a month on day 5: BTC 70%, ETH 30%.').id,
    );
    expect(screen.getByRole('button', { name: 'Run the simulation' })).toBeDefined();
  });

  it('shows no fill without a plan', () => {
    mount({ plan: null });
    expect(screen.queryByRole('button', { name: 'Fill in from your plan' })).toBeNull();
  });

  it('follows the start with its buy day until one is picked', () => {
    mount();
    for (const [start, expected] of [
      ['2025-03-27', '27'],
      ['2025-03-28', '28'],
      ['2025-03-29', '28'],
      ['2025-03-31', '28'],
    ] as const) {
      type(date('Start'), start);
      expect(buyDay()).toBe(expected);
    }
  });

  it('keeps a picked buy day when the start changes', async () => {
    mount();
    const user = userEvent.setup({ document });
    await user.click(screen.getByRole('combobox', { name: 'Buy day' }));
    await user.click(await screen.findByRole('option', { name: '10' }));
    type(date('Start'), '2025-03-27');
    expect(buyDay()).toBe('10');
  });

  it('follows the window until a date is set, and a fill leaves the dates as they are', () => {
    const { rerender } = mount({ window: null });
    expect([date('Start').value, date('End').value]).toEqual(['', '']);
    rerender({ window: WINDOW });
    expect([date('Start').value, date('End').value]).toEqual([WINDOW.start, WINDOW.end]);
    type(date('End'), '2025-06-30');
    fill();
    rerender({ window: { ...WINDOW, start: day('2024-01-01'), end: day('2024-12-01') } });
    expect([date('Start').value, date('End').value]).toEqual(['2024-01-01', '2025-06-30']);
  });

  it('fills the split in the plan order, the buy day and the amount of a euro plan', () => {
    const { props } = mount();
    type(date('Start'), '2025-03-29');
    type(box('Fee (%)'), '0.5');
    fill();
    expect([share('Bitcoin').value, share('Ethereum').value]).toEqual(['70', '30']);
    expect(box(MONTHLY).value).toBe('100.00');
    expect(buyDay()).toBe('5');
    expect(box('Fee (%)').value).toBe('0.5');
    expect(date('Start').value).toBe('2025-03-29');
    expect(props.onCoins).toHaveBeenLastCalledWith([id('BTC'), id('ETH')]);
    type(share('Bitcoin'), '60');
    expect(props.onCoins).toHaveBeenCalledTimes(1);
  });

  it('leaves the amount of a plan in another currency or with no monthly amount, saying why', () => {
    for (const [patch, line] of [
      [{ payCurrency: 'USD' as CurrencyCode }, 'The simulator works in euros for now; enter the amount in euros.'],
      [{ monthlyAmount: '0' as Money }, 'Your plan has no monthly amount; enter one.'],
    ] as const) {
      mount({ plan: { ...thePlan, ...patch } });
      type(box(MONTHLY), '50');
      fill();
      expect(box(MONTHLY).value).toBe('50');
      expect(screen.getByText(line)).toBeDefined();
      cleanup();
    }
  });

  it('runs only on its button, with the inputs read from the fields', () => {
    const { props } = mount();
    fill();
    expect(props.onRun).not.toHaveBeenCalled();
    run();
    expect(props.onRun).toHaveBeenCalledWith({
      split: { BTC: '70', ETH: '30' },
      monthlyAmount: '100',
      startDate: WINDOW.start,
      endDate: WINDOW.end,
      buyDay: 5,
      feePercent: '0',
    });
  });

  it('calls onEdit on the first change after a run, and not before one', () => {
    const { props } = mount();
    fill();
    type(box(MONTHLY), '80');
    expect(props.onEdit).not.toHaveBeenCalled();
    run();
    type(box('Fee (%)'), '0.5');
    type(box('Fee (%)'), '0.6');
    expect(props.onEdit).toHaveBeenCalledTimes(1);
    run();
    expect(props.onRun).toHaveBeenLastCalledWith(expect.objectContaining({ feePercent: '0.6' }));
  });

  it('shows each refusal by its field and focuses the first invalid share', async () => {
    const { props } = mount();
    fill();
    type(share('Ethereum'), 'x');
    type(box(MONTHLY), '');
    type(box('Fee (%)'), '100');
    run();
    await act(async () => undefined);
    expect(props.onRun).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(share('Ethereum'));
    expect(screen.getByText('Enter an amount above 0 with at most 2 decimal places.')).toBeDefined();
    expect(screen.getByText('Enter a fee below 100 % with at most 4 decimal places.')).toBeDefined();
    type(box(MONTHLY), '100');
    expect(screen.queryByText('Enter an amount above 0 with at most 2 decimal places.')).toBeNull();
  });

  it('focuses the row of a coin with no closes, which carries its line', async () => {
    const { props } = mount({ closes: { [id('BTC')]: RANGE, [id('ETH')]: 'none' } });
    fill();
    const line = 'No reference closes for Ethereum yet. Set its share to 0 to simulate the other coins.';
    expect(share('Ethereum').getAttribute('aria-describedby')).toContain(screen.getByText(line).id);
    run();
    await act(async () => undefined);
    expect(props.onRun).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(share('Ethereum'));
  });

  it('notes a coin whose closes still load, focuses its row on a refused run, and drops the note on arrival', async () => {
    const { props, rerender } = mount({ closes: { [id('BTC')]: RANGE } });
    fill();
    run();
    await act(async () => undefined);
    expect(props.onRun).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(share('Ethereum'));
    const loading = 'The reference closes for Ethereum are still loading.';
    expect(share('Ethereum').getAttribute('aria-describedby')).toContain(screen.getByText(loading).id);
    rerender({ closes: { [id('BTC')]: RANGE, [id('ETH')]: 'none' } });
    expect(screen.queryByText(loading)).toBeNull();
    expect(screen.getByText(/^No reference closes for Ethereum yet\./)).toBeDefined();
    rerender({ closes: CLOSES });
    expect(screen.queryByText(/reference closes for Ethereum/)).toBeNull();
  });

  it('focuses the first Add button when no coin is chosen', async () => {
    mount();
    run();
    await act(async () => undefined);
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Add Aave' }));
    expect(screen.getByText('Make the shares add up to 100 %.')).toBeDefined();
  });
});
