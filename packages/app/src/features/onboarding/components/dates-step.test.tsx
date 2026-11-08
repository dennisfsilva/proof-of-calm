// @vitest-environment jsdom
import type { CalendarDate } from '@proofofcalm/core';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../../../lib/i18n';
import errors from '../../../messages/en/errors.json';
import onboarding from '../../../messages/en/onboarding.json';
import plan from '../../../messages/en/plan.json';
import { ScheduleEditor, type ScheduleIssue, type ScheduleValue } from '../../plan';
import { DatesStep } from './dates-step';

afterEach(cleanup);

const CONTINUE = 'Continue';
const STARTING_HINT =
  'Bought once on the first buy day and split across your coins like each monthly buy. Enter 0 for none.';
const OWN_COINS = ' For coins you already have, choose Add coins you already have on the Log after setup.';
const value: ScheduleValue = {
  monthlyAmount: '100',
  startingAmount: '',
  firstBuy: '2026-11-01' as CalendarDate,
  buyDay: 1,
  lastBuy: '2026-10-01' as CalendarDate,
  acceptEarly: false,
};

/** The screen's part: Continue reads the amounts and dates and hands back the issues it found. */
function Harness(props: { found: readonly ScheduleIssue[]; onContinue(): void }) {
  const [issues, setIssues] = useState<readonly ScheduleIssue[]>([]);
  return (
    <I18nProvider messages={{ errors, onboarding, plan }}>
      <DatesStep
        value={value}
        issues={issues}
        currency="EUR"
        onChange={() => {}}
        onBack={() => {}}
        onContinue={() => {
          props.onContinue();
          setIssues(props.found);
        }}
      />
    </I18nProvider>
  );
}

describe('DatesStep', () => {
  it("the own-coins path's hint names it, and Settings' Plan tab keeps its hint", () => {
    render(<Harness found={[]} onContinue={vi.fn()} />);
    const starting = screen.getByRole('textbox', { name: 'Starting amount (EUR)' });
    const hint = screen.getByText(STARTING_HINT + OWN_COINS);
    expect(starting.getAttribute('aria-describedby')?.split(' ')).toContain(hint.id);
    cleanup();
    // The editor without an onboarding hint, as Settings' Plan tab holds it.
    render(
      <I18nProvider messages={{ errors, onboarding, plan }}>
        <ScheduleEditor value={value} issues={[]} currency="EUR" early={null} onChange={() => {}} />
      </I18nProvider>,
    );
    expect(screen.getByText(STARTING_HINT)).toBeDefined();
    expect(screen.queryByText(/Add coins you already have/)).toBeNull();
  });

  it('heads the amount-and-dates editor and ends on Continue, with no disclosure', async () => {
    const onContinue = vi.fn();
    render(<Harness found={[]} onContinue={onContinue} />);
    expect(screen.getByRole('heading', { level: 2, name: 'Choose the amounts and dates' })).toBeDefined();
    expect(screen.getByRole('group', { name: 'Amounts and dates' })).toBeDefined();
    expect(screen.queryByRole('link', { name: 'Risk disclosure' })).toBeNull();
    expect(screen.queryByRole('checkbox')).toBeNull();
    await act(() => fireEvent.click(screen.getByRole('button', { name: CONTINUE })));
    expect(onContinue).toHaveBeenCalledOnce();
  });

  it('shows the step heading alone: the group legend is for screen readers only', () => {
    render(<Harness found={[]} onContinue={vi.fn()} />);
    expect(screen.getByText('Amounts and dates', { selector: 'legend' }).className).toBe('sr-only');
    expect(screen.getAllByRole('heading').map((heading) => heading.textContent)).toEqual([
      'Choose the amounts and dates',
    ]);
  });

  it('a refused Continue moves the focus to the first invalid field', async () => {
    render(<Harness found={[{ code: 'last-buy-before-first-buy', path: ['lastBuy'] }]} onContinue={vi.fn()} />);
    await act(() => fireEvent.click(screen.getByRole('button', { name: CONTINUE })));
    expect(screen.getByText('Choose a last buy on or after the first buy.')).toBeDefined();
    expect(document.activeElement).toBe(screen.getByLabelText(/^Last buy/));
  });
});
