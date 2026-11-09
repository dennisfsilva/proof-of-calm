// @vitest-environment jsdom
import type { Plan } from '@proofofcalm/core';
import { FIXTURE_RULES } from '@proofofcalm/core/testing/country-change';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../../../lib/i18n';
import type { Snapshot } from '../../../lib/ports';
import { type Services, ServicesProvider } from '../../../lib/services';
import { fixtureSnapshot } from '../../../lib/services/fixtures';
import { createTestServices } from '../../../lib/services/testing';
import settings from '../../../messages/en/settings.json';
import { PayCurrencyLine } from './pay-currency-line';

// Currency & data's line while the plan's currency differs from its country's (ADR-0053, docs/DOMAIN.md §6
// "Change pay currency"): it says so, and its button relabels the plan to the country's currency.

afterEach(cleanup);

const PT = FIXTURE_RULES.PT;
const withPlan = (patch: Partial<Plan>): Snapshot => {
  const snapshot = fixtureSnapshot();
  return { ...snapshot, plan: { ...(snapshot.plan as Plan), ...patch } };
};
const stored = (services: Services) => services.domain.store.getState().snapshot.plan as Plan;

async function mount(snapshot: Snapshot, onDone = vi.fn()) {
  const services = createTestServices({ snapshot });
  await services.start();
  const plan = stored(services);
  render(
    <ServicesProvider services={services}>
      <I18nProvider messages={{ settings }}>
        <PayCurrencyLine plan={plan} rules={PT} onDone={onDone} />
      </I18nProvider>
    </ServicesProvider>,
  );
  return { services, onDone };
}
const press = () => act(async () => fireEvent.click(screen.getByRole('button', { name: 'Change to EUR' })));

describe('PayCurrencyLine', () => {
  it("shows nothing while the plan's currency is its country's", async () => {
    await mount(fixtureSnapshot());
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('says the currencies differ, and relabels the plan to the country\'s currency on the button', async () => {
    const { services, onDone } = await mount(withPlan({ payCurrency: 'USD', displayCurrency: 'USD' }));
    expect(screen.getByText(/^Your plan is in USD, and your country's currency is EUR\./)).toBeTruthy();
    const before = stored(services);
    await press();
    expect(stored(services)).toMatchObject({
      payCurrency: 'EUR',
      displayCurrency: 'EUR',
      monthlyAmount: before.monthlyAmount,
    });
    expect(onDone).toHaveBeenCalledWith('Plan currency changed to EUR.');
  });

  it('refuses once another tab moved the plan, and focuses the line that says so', async () => {
    const { services, onDone } = await mount(withPlan({ payCurrency: 'USD', displayCurrency: 'USD' }));
    await act(() => services.domain.write({ plan: { ...stored(services), displayCurrency: 'GBP' } }));
    await press();
    expect(stored(services).payCurrency).toBe('USD');
    const alert = screen.getByRole('alert');
    expect(alert.textContent).toContain('Your plan changed in another browser tab');
    expect(document.activeElement).toBe(alert);
    expect(onDone).not.toHaveBeenCalled();
  });
});
