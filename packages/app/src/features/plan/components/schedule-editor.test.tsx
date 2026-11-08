// @vitest-environment jsdom
import type { CalendarDate, Plan } from '@proofofcalm/core';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { userEvent } from 'storybook/test';
import { afterEach, describe, expect, it } from 'vitest';
import { createNumberInput } from '../../../lib/format';
import { I18nProvider } from '../../../lib/i18n';
import { ServicesProvider } from '../../../lib/services';
import { fixtureSnapshot } from '../../../lib/services/fixtures';
import { createTestServices } from '../../../lib/services/testing';
import errors from '../../../messages/en/errors.json';
import plan from '../../../messages/en/plan.json';
import { type ScheduleIssue, type ScheduleValue, schedule } from '../lib/schedule';
import { earlyOpen } from '../lib/sell-window';
import { ScheduleEditor } from './schedule-editor';

// The amount-and-dates editor as a host holds it: the value in state, the issues from schedule in en-GB.
// Each message sits under the field it concerns, which is the one marked invalid: the field a host moves
// the focus to when a save is refused.

afterEach(cleanup);

// Without the fixture's sell window, which a last buy years later opens too early, but for the notice's test.
const withWindow = fixtureSnapshot().plan as Plan;
const thePlan: Plan = { ...withWindow, sellWindow: null };
const english = createNumberInput('en-GB');
const day = (text: string) => text as CalendarDate;
const INITIAL: ScheduleValue = {
  monthlyAmount: '100.00',
  startingAmount: '1,000.00',
  firstBuy: day('2026-04-05'),
  buyDay: 5,
  lastBuy: day('2027-03-05'),
  acceptEarly: false,
};

type HostProps = { initial: ScheduleValue; onValue: ((value: ScheduleValue) => void) | undefined; of: Plan };

function Host({ initial, onValue, of }: HostProps) {
  const [value, setValue] = useState(initial);
  const result = schedule(of, value, english);
  const change = (next: ScheduleValue) => {
    setValue(next);
    onValue?.(next);
  };
  const { lastBuy } = value;
  const found = lastBuy === '' ? null : earlyOpen({ ...of, lastBuy }, of.sellWindow);
  const early = found && { ...found, rule: 'country' as const };
  return (
    <ScheduleEditor
      value={value}
      issues={result.ok ? [] : result.error}
      currency="EUR"
      early={early}
      onChange={change}
    />
  );
}

function mount(initial: ScheduleValue = INITIAL, onValue?: (value: ScheduleValue) => void, of = thePlan) {
  render(
    <ServicesProvider services={createTestServices({ snapshot: fixtureSnapshot() })}>
      <I18nProvider messages={{ plan, errors }}>
        <Host initial={initial} onValue={onValue} of={of} />
      </I18nProvider>
    </ServicesProvider>,
  );
}

const MONTHLY = 'Monthly amount (EUR)';
const STARTING = 'Starting amount (EUR)';
const field = (label: string) => screen.getByLabelText<HTMLInputElement>(label);
const type = (label: string, text: string) => fireEvent.change(field(label), { target: { value: text } });
const invalid = () => [...document.querySelectorAll('[aria-invalid="true"]')];
/** The one field marked invalid, described by the message. */
function expectOn(label: string, message: string) {
  const text = screen.getByText(message);
  expect(invalid()).toEqual([field(label)]);
  expect(field(label).getAttribute('aria-describedby')?.split(' ')).toContain(text.id);
}

describe('ScheduleEditor', () => {
  it('shows the plan as typed in one group, with nothing marked invalid', () => {
    mount();
    expect(screen.getByRole('group', { name: 'Amounts and dates' })).toBeDefined();
    expect(field(MONTHLY).value).toBe('100.00');
    expect(field(STARTING).value).toBe('1,000.00');
    expect(field('First buy').value).toBe('2026-04-05');
    expect(field('Last buy').value).toBe('2027-03-05');
    expect(screen.getByRole('combobox', { name: 'Buy day' }).textContent).toContain('5');
    expect(invalid()).toEqual([]);
  });

  it('hands each change to the host as typed', () => {
    const seen: ScheduleValue[] = [];
    mount(INITIAL, (value) => seen.push(value));
    type(MONTHLY, '150');
    type('Last buy', '2028-03-05');
    expect(seen.at(-1)).toEqual({ ...INITIAL, monthlyAmount: '150', lastBuy: '2028-03-05' });
  });

  it('offers the buy days 1 to 28 and hands the chosen one to the host as a number', async () => {
    const seen: ScheduleValue[] = [];
    mount(INITIAL, (value) => seen.push(value));
    const user = userEvent.setup({ document });
    await user.click(screen.getByRole('combobox', { name: 'Buy day' }));
    const days = await screen.findAllByRole('option');
    expect(days.map((option) => option.textContent)).toEqual(Array.from({ length: 28 }, (_, n) => String(n + 1)));
    await user.click(screen.getByRole('option', { name: '12' }));
    expect(seen.at(-1)).toEqual({ ...INITIAL, buyDay: 12 });
  });

  it('puts no amount on the monthly amount, and clears it once there is one', () => {
    mount();
    type(STARTING, '');
    type(MONTHLY, '0');
    expectOn(MONTHLY, 'Enter a monthly amount, a starting amount, or both.');
    type(STARTING, '500');
    expect(invalid()).toEqual([]);
  });

  it('puts the reading and precision messages on the amount they belong to', () => {
    mount();
    type(STARTING, '10.005');
    expectOn(STARTING, 'Use at most 2 decimal places.');
    type(STARTING, '-10');
    expectOn(STARTING, 'Enter the number without a minus sign.');
    type(STARTING, '1000');
    type(MONTHLY, 'ten');
    expectOn(MONTHLY, 'Enter a number such as 1,234.56.');
  });

  it('asks for an empty date under that date', () => {
    mount();
    type('First buy', '');
    expectOn('First buy', 'Choose a full date: day, month, and year.');
  });

  it('puts the order and length of the plan on the last buy', () => {
    mount();
    type('Last buy', '2026-04-04');
    expectOn('Last buy', 'Choose a last buy on or after the first buy.');
    type('Last buy', '2046-04-05');
    expectOn('Last buy', 'A plan holds at most 240 monthly buys. Choose an earlier last buy.');
    type('Last buy', '2046-04-06');
    type(MONTHLY, '0');
    expectOn('Last buy', 'A plan lasts at most 20 years from the first buy. Choose an earlier last buy.');
  });

  it('shows the notice of a window the last buy opens early, and drops the acceptance when the last buy moves', () => {
    const seen: ScheduleValue[] = [];
    mount({ ...INITIAL, lastBuy: day('2030-01-05') }, (value) => seen.push(value), withWindow);
    expect(
      screen.getByText(
        'The sell window opens on 1 Sept 2029. This last buy is tax-free from 5 Jan 2031 under your ' +
          "plan's holding rule. You can also choose an earlier last buy.",
      ),
    ).toBeDefined();
    const box = screen.getByRole('checkbox', {
      name: 'Open the sell window on 1\u00a0Sept\u00a02029, before this last buy passes the holding rule',
    });
    expect(invalid()).toEqual([box]);
    fireEvent.click(box);
    expect(seen.at(-1)?.acceptEarly).toBe(true);
    expect(invalid()).toEqual([]);
    type('Last buy', '2030-02-05');
    expect(seen.at(-1)?.acceptEarly).toBe(false);
    type('Last buy', '2027-03-05');
    expect(screen.queryByRole('checkbox')).toBeNull();
  });

  it('keeps the last buy within the first buy and the last date the plan accepts in the date picker', () => {
    mount();
    expect(field('Last buy').min).toBe('2026-04-05');
    expect(field('Last buy').max).toBe('2046-04-04');
    type('Last buy', field('Last buy').max);
    expect(invalid()).toEqual([]);
    cleanup();
    mount({ ...INITIAL, buyDay: 12 });
    expect(field('Last buy').max).toBe('2046-04-05');
  });

  it('words every issue the editor can be given', () => {
    const issues: ScheduleIssue[] = [
      { code: 'amount-negative', path: ['monthlyAmount'] },
      { code: 'number-empty', path: ['startingAmount'] },
    ];
    render(
      <I18nProvider messages={{ plan, errors }}>
        <ScheduleEditor value={INITIAL} issues={issues} currency="EUR" early={null} onChange={() => undefined} />
      </I18nProvider>,
    );
    expect(field(MONTHLY).getAttribute('aria-invalid')).toBe('true');
    expect(screen.getByText('Enter the number without a minus sign.')).toBeDefined();
    expect(screen.getByText('Enter a number.')).toBeDefined();
  });
});

describe('ScheduleEditor legend', () => {
  const show = (legend?: 'shown' | 'hidden') =>
    render(
      <I18nProvider messages={{ plan, errors }}>
        <ScheduleEditor
          value={INITIAL}
          issues={[]}
          currency="EUR"
          early={null}
          onChange={() => undefined}
          legend={legend}
        />
      </I18nProvider>,
    );
  const legend = () => screen.getByText('Amounts and dates', { selector: 'legend' });

  it('keeps the legend visible by default, as Settings shows it', () => {
    show();
    expect(legend().classList.contains('sr-only')).toBe(false);
    expect(screen.getByRole('group', { name: 'Amounts and dates' })).toBeDefined();
  });

  it('hides the legend for screen readers only, so the group keeps its name under a step heading', () => {
    show('hidden');
    expect(legend().className).toBe('sr-only');
    expect(screen.getByRole('group', { name: 'Amounts and dates' })).toBeDefined();
  });
});
