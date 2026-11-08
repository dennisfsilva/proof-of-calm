// @vitest-environment jsdom
import { type CalendarDate, EntityIdSchema } from '@proofofcalm/core';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createFormatters } from '../../../lib/format';
import { I18nProvider } from '../../../lib/i18n';
import { ServicesProvider } from '../../../lib/services';
import { createTestServices } from '../../../lib/services/testing';
import errors from '../../../messages/en/errors.json';
import onboarding from '../../../messages/en/onboarding.json';
import plan from '../../../messages/en/plan.json';
import { emptyDraft } from '../model/setup';
import { NumbersStep, type NumbersStepProps } from './numbers-step';

afterEach(cleanup);

const TODAY = '2026-10-20' as CalendarDate;
const day = (text: string) => text as CalendarDate;
const ID = EntityIdSchema.parse('00000000-0000-4000-8000-000000000001');
const STARTING_HINT =
  'Bought once on the first buy day and split across your coins like each monthly buy. Enter 0 for none. ' +
  'For coins you already have, choose Add coins you already have on the Log after setup.';

function mount(props: Partial<NumbersStepProps>) {
  const handlers = { onChange: vi.fn(), onBack: vi.fn(), onContinue: vi.fn() };
  render(
    <ServicesProvider services={createTestServices()}>
      <I18nProvider messages={{ errors, onboarding, plan }}>
        <NumbersStep
          draft={emptyDraft(TODAY, ID, 'DE')}
          currency="EUR"
          format={createFormatters('de-DE', 'en-GB')}
          askLastBuy={false}
          templateLastBuy={null}
          fieldIssues={[]}
          early={null}
          {...handlers}
          {...props}
        />
      </I18nProvider>
    </ServicesProvider>,
  );
  return handlers;
}

describe('NumbersStep', () => {
  it('asks for no last buy when the template gives one, and ends on Continue with no disclosure', async () => {
    const { onContinue } = mount({});
    expect(screen.queryByLabelText(/^Last buy/)).toBeNull();
    expect(screen.queryByRole('link', { name: 'Risk disclosure' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Accept and start the plan' })).toBeNull();
    await act(() => fireEvent.click(screen.getByRole('button', { name: 'Continue' })));
    expect(onContinue).toHaveBeenCalledOnce();
  });

  it('labels the starting amount as the custom path does and describes it by its hint', () => {
    mount({});
    const starting = screen.getByRole('textbox', { name: 'Starting amount (EUR)' });
    const hint = screen.getByText(
      /^Bought once on the first buy day and split across your coins like each monthly buy\. Enter 0 for none\./,
    );
    expect(starting.getAttribute('aria-describedby')?.split(' ')).toContain(hint.id);
  });

  // Coins held before the plan are added on the Log (DOMAIN §2.2), which onboarding cannot open yet.
  it("the template path's hint names the Log's button", () => {
    mount({});
    const starting = screen.getByRole('textbox', { name: 'Starting amount (EUR)' });
    const hint = screen.getByText(STARTING_HINT);
    expect(starting.getAttribute('aria-describedby')?.split(' ')).toContain(hint.id);
  });

  it('words every issue under the field it names', () => {
    mount({
      askLastBuy: true,
      fieldIssues: [
        { field: 'monthly', error: { code: 'no-amount' } },
        { field: 'starting', error: { code: 'number-invalid', example: '1.234,56' } },
        { field: 'firstBuy', error: { code: 'date-empty' } },
        { field: 'lastBuy', error: { code: 'last-buy-before-first-buy' } },
      ],
    });
    const fieldOf = (text: string) => screen.getByText(text).closest('[data-slot="field"]')?.textContent ?? '';
    expect(fieldOf('Enter a monthly amount, a starting amount, or both.')).toMatch(/^Monthly amount/);
    expect(fieldOf('Enter a number such as 1.234,56.')).toMatch(/^Starting amount/);
    expect(fieldOf('Choose a full date: day, month, and year.')).toMatch(/^First buy/);
    expect(fieldOf('Choose a last buy on or after the first buy.')).toMatch(/^Last buy/);
  });

  it("names the template's last buy by its date when the first buy is after it (CONTENT-STYLE §1.1, §1.8)", () => {
    mount({
      templateLastBuy: day('2029-09-01'),
      fieldIssues: [{ field: 'firstBuy', error: { code: 'last-buy-before-first-buy' } }],
    });
    const message = screen.getByText("Choose a first buy on or before 1 Sept 2029, this starting point's last buy.");
    expect(message.closest('[data-slot="field"]')?.textContent).toMatch(/^First buy/);
  });

  it('words the refusals of a template with no Last buy field under First buy, asking for a later one', () => {
    mount({ fieldIssues: [{ field: 'firstBuy', error: { code: 'plan-too-long' } }] });
    const message = screen.getByText('A plan holds at most 240 monthly buys. Choose a later first buy.');
    expect(message.closest('[data-slot="field"]')?.textContent).toMatch(/^First buy/);
    cleanup();
    mount({ askLastBuy: true, fieldIssues: [{ field: 'lastBuy', error: { code: 'plan-too-long' } }] });
    expect(screen.getByText('A plan holds at most 240 monthly buys. Choose an earlier last buy.')).toBeDefined();
  });

  it("shows plan's early-window notice in the chosen country's formatting, and hands the acceptance back", async () => {
    const early = {
      opensOn: day('2029-06-01'),
      eligibleOn: day('2029-06-02'),
      effect: 'exempt',
      rule: 'country',
    } as const;
    const { onChange } = mount({ early, earlyInvalid: true });
    expect(
      screen.getByText(
        "The sell window opens on 1 Jun 2029. The template's last buy is tax-free from 2 Jun 2029 under your " +
          "plan's holding rule. You can also choose another starting point.",
      ),
    ).toBeDefined();
    const accept = screen.getByRole('checkbox', { name: /^Open the sell window on 1\u00a0Jun\u00a02029/ });
    expect(accept.getAttribute('aria-invalid')).toBe('true');
    await act(() => fireEvent.click(accept));
    expect(onChange).toHaveBeenCalledWith({ acceptEarlyOpen: true });
  });
});
