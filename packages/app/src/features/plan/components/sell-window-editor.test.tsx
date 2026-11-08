// @vitest-environment jsdom
import type { CalendarDate, Plan } from '@proofofcalm/core';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { userEvent } from 'storybook/test';
import { afterEach, describe, expect, it } from 'vitest';
import { I18nProvider } from '../../../lib/i18n';
import { ServicesProvider } from '../../../lib/services';
import { fixtureSnapshot } from '../../../lib/services/fixtures';
import { createTestServices } from '../../../lib/services/testing';
import plan from '../../../messages/en/plan.json';
import { earlyOpenOf, type SellWindowValue, sellWindowOf } from '../lib/sell-window';
import { SellWindowEditor } from './sell-window-editor';

// The sell-window editor as a host holds it: the value in state, the issues from sellWindowOf. Each message
// sits under the date it concerns, the one marked invalid; a window that opens before the last buy passes the
// holding rule shows the notice, and its acceptance is what a refused save marks.

afterEach(cleanup);

const thePlan = fixtureSnapshot().plan as Plan;
const day = (text: string) => text as CalendarDate;
const DATES: SellWindowValue = {
  mode: 'dates',
  opens: day('2029-09-01'),
  closes: day('2030-08-31'),
  exitBy: day('2030-12-31'),
  acceptEarly: false,
};

function Host({ initial, seen }: { initial: SellWindowValue; seen: SellWindowValue[] }) {
  const [value, setValue] = useState(initial);
  const result = sellWindowOf(thePlan, value);
  const early = earlyOpenOf(thePlan, value);
  const change = (next: SellWindowValue) => {
    setValue(next);
    seen.push(next);
  };
  return (
    <SellWindowEditor
      value={value}
      issues={result.ok ? [] : result.error}
      early={early && { ...early, rule: 'own' }}
      onChange={change}
    />
  );
}

function mount(initial: SellWindowValue = DATES) {
  const seen: SellWindowValue[] = [];
  render(
    <ServicesProvider services={createTestServices({ snapshot: fixtureSnapshot() })}>
      <I18nProvider messages={{ plan }}>
        <Host initial={initial} seen={seen} />
      </I18nProvider>
    </ServicesProvider>,
  );
  return seen;
}

const radio = (name: string) => screen.getByRole('radio', { name });
const field = (label: string) => screen.getByLabelText<HTMLInputElement>(label);
const type = (label: string, text: string) => fireEvent.change(field(label), { target: { value: text } });
const invalid = () => [...document.querySelectorAll('[aria-invalid="true"]')];
function expectOn(label: string, message: string) {
  const text = screen.getByText(message);
  expect(invalid()).toEqual([field(label)]);
  expect(field(label).getAttribute('aria-describedby')?.split(' ')).toContain(text.id);
}

describe('SellWindowEditor', () => {
  it('shows the dated window chosen with its three dates, each bounded by the one before', () => {
    mount();
    expect(screen.getByRole('group', { name: 'Sell window' })).toBeDefined();
    expect(radio('A sell window').getAttribute('aria-checked')).toBe('true');
    expect(field('Opens').value).toBe('2029-09-01');
    expect(field('Closes').min).toBe('2029-09-01');
    expect(field('Out by').min).toBe('2030-08-31');
    expect(screen.queryByRole('checkbox')).toBeNull();
  });

  it('hides the dates for no sell window and brings them back empty', async () => {
    const seen = mount();
    const user = userEvent.setup({ document });
    await user.click(radio('No sell window'));
    expect(seen.at(-1)).toEqual({ ...DATES, mode: 'none' });
    expect(screen.queryByLabelText('Opens')).toBeNull();
    cleanup();
    mount({ mode: 'none', opens: '', closes: '', exitBy: '', acceptEarly: false });
    await userEvent.setup({ document }).click(radio('A sell window'));
    expect(field('Opens').value).toBe('');
  });

  it('puts an empty date and a date out of order under that date', () => {
    mount();
    type('Closes', '');
    expectOn('Closes', 'Choose a full date: day, month, and year.');
    type('Closes', '2029-08-31');
    expectOn('Closes', 'Choose a closing date on or after the opening date.');
    type('Closes', '2030-08-31');
    type('Out by', '2030-08-30');
    expectOn('Out by', 'Choose an out-by date on or after the closing date.');
  });

  it('shows the notice for a window that opens early, marks its acceptance, and drops it when a date moves', () => {
    const seen = mount();
    type('Opens', '2028-01-01');
    expect(
      screen.getByText(
        'The sell window opens on 1 Jan 2028. Your last buy is tax-free from 4 Mar 2028 under your own rule. ' +
          'You can also choose a later opening date.',
      ),
    ).toBeDefined();
    const box = screen.getByRole('checkbox', {
      name: 'Open the sell window on 1\u00a0Jan\u00a02028, before your last buy passes the holding rule',
    });
    expect(invalid()).toEqual([box]);
    fireEvent.click(box);
    expect(seen.at(-1)).toEqual({ ...DATES, opens: '2028-01-01', acceptEarly: true });
    expect(invalid()).toEqual([]);
    type('Opens', '2028-02-01');
    expect(seen.at(-1)?.acceptEarly).toBe(false);
    expect(screen.getByRole('checkbox').getAttribute('aria-checked')).toBe('false');
  });
});
