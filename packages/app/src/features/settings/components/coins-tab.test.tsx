// @vitest-environment jsdom
import type { Money, Plan } from '@proofofcalm/core';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { I18nProvider } from '../../../lib/i18n';
import { NavigationProvider } from '../../../lib/navigation';
import type { Snapshot } from '../../../lib/ports';
import { type Services, ServicesProvider } from '../../../lib/services';
import { fixtureSnapshot } from '../../../lib/services/fixtures';
import { createTestServices } from '../../../lib/services/testing';
import errors from '../../../messages/en/errors.json';
import plan from '../../../messages/en/plan.json';
import settings from '../../../messages/en/settings.json';
import today from '../../../messages/en/today.json';
import { CoinsTab } from './coins-tab';

// Settings' Coins & split tab (docs/DOMAIN.md §6 "Edit the plan"): the coin editor over the catalogue, each
// share tidied on blur (ADR-0034); a save sends the coins and the split together onto the plan as stored
// then, and a refused one shows its issues and moves the focus to the first invalid share.

afterEach(cleanup);

async function mount(snapshot: Snapshot = fixtureSnapshot()): Promise<Services> {
  const services = createTestServices({ snapshot });
  await services.start();
  render(
    <NavigationProvider location="memory" initialPath="/settings">
      <ServicesProvider services={services}>
        <I18nProvider messages={{ settings, plan, errors, today }}>
          <CoinsTab />
        </I18nProvider>
      </ServicesProvider>
    </NavigationProvider>,
  );
  return services;
}

const share = (coin: string) => screen.getByLabelText<HTMLInputElement>(`${coin} share (%)`);
const type = (coin: string, text: string) => fireEvent.change(share(coin), { target: { value: text } });
const stored = (services: Services) => services.domain.store.getState().snapshot.plan as Plan;
const save = () => act(async () => fireEvent.click(screen.getByRole('button', { name: 'Save changes' })));

describe('CoinsTab', () => {
  it("shows the plan's coins and shares, and the catalogue's other coins to add", async () => {
    await mount();
    expect(share('Bitcoin').value).toBe('70');
    expect(share('Ethereum').value).toBe('30');
    expect(screen.getByRole('button', { name: 'Add Solana' })).toBeDefined();
    expect(screen.queryByRole('button', { name: 'Add Bitcoin' })).toBeNull();
  });

  it('tidies a readable share on blur', async () => {
    await mount();
    type('Bitcoin', '70.50');
    fireEvent.blur(share('Bitcoin'));
    expect(share('Bitcoin').value).toBe('70.5');
  });

  it('adds a coin, sets the split and saves both', async () => {
    const services = await mount();
    fireEvent.click(screen.getByRole('button', { name: 'Add Solana' }));
    type('Bitcoin', '50');
    type('Solana', '20');
    await save();
    expect(stored(services).coins.map((coin) => coin.id)).toEqual(['BTC', 'ETH', 'SOL']);
    expect(stored(services).split).toEqual({ BTC: '50', ETH: '30', SOL: '20' });
    services.dispose();
  });

  it('refuses shares off 100 with the message on the split and the focus on the first share', async () => {
    const services = await mount();
    const before = stored(services);
    type('Ethereum', '20');
    await save();
    expect(screen.getByText('Make the shares add up to 100 %.')).toBeDefined();
    expect(document.activeElement).toBe(share('Bitcoin'));
    expect(stored(services)).toBe(before);
    services.dispose();
  });

  it('keeps what another tab changed meanwhile: the amounts are not sent with the split', async () => {
    const services = await mount();
    await act(() =>
      services.domain.write(({ plan }) => ({ plan: { ...(plan as Plan), monthlyAmount: '300' as Money } })),
    );
    type('Bitcoin', '60');
    type('Ethereum', '40');
    await save();
    expect(stored(services).monthlyAmount).toBe('300');
    expect(stored(services).split).toEqual({ BTC: '60', ETH: '40' });
    services.dispose();
  });

  it('refuses a save over a coin another tab added meanwhile, says so, and shows the plan as it is', async () => {
    const services = await mount();
    const sol = { id: 'SOL' as Plan['coins'][number]['id'], name: 'Solana', geckoId: 'solana', decimals: 4 };
    const added = { BTC: '50', ETH: '30', SOL: '20' } as Plan['split'];
    await act(() =>
      services.domain.write(({ plan }) => ({
        plan: { ...(plan as Plan), coins: [...(plan as Plan).coins, sol], split: added },
      })),
    );
    type('Bitcoin', '60');
    type('Ethereum', '40');
    await save();
    expect(screen.getByRole('alert').textContent).toBe(
      'Your plan changed in another browser tab, so this change was not saved. The form now shows the saved plan; make your change again.',
    );
    expect(stored(services).split).toEqual(added);
    expect(share('Solana').value).toBe('20');
    expect(share('Bitcoin').value).toBe('50');
    services.dispose();
  });

  it('shows the empty state without a plan', async () => {
    await mount({ ...fixtureSnapshot(), plan: null, entries: [] });
    expect(screen.getByText('No plan yet')).toBeDefined();
  });
});
