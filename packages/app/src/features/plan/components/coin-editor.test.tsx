// @vitest-environment jsdom
import type { Coin, CoinId, Plan } from '@proofofcalm/core';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { userEvent } from 'storybook/test';
import { afterEach, describe, expect, it } from 'vitest';
import { createNumberInput } from '../../../lib/format';
import { I18nProvider } from '../../../lib/i18n';
import { fixtureSnapshot } from '../../../lib/services/fixtures';
import errors from '../../../messages/en/errors.json';
import plan from '../../../messages/en/plan.json';
import { type CoinSplitValue, coinSplit, MAX_COINS } from '../lib/split';
import { CoinEditor } from './coin-editor';

// The coin editor as a host holds it: the value in state, the issues from coinSplit in en-GB. Adding a
// coin offers only the catalogue's coins not in the plan; the sum message sits on the split.

afterEach(cleanup);

const thePlan = fixtureSnapshot().plan as Plan;
const [BTC, ETH] = thePlan.coins as [Coin, Coin];
const SOL = { id: 'SOL', name: 'Solana', geckoId: 'solana', decimals: 4 } as Coin;
const english = createNumberInput('en-GB');
const shares = (entries: Record<string, string>) => entries as Record<CoinId, string>;
const SUM = 'Make the shares add up to 100 %.';

function Host({ initial, catalogue }: { initial: CoinSplitValue; catalogue: readonly Coin[] }) {
  const [value, setValue] = useState(initial);
  const result = coinSplit(thePlan, value, english);
  return <CoinEditor value={value} catalogue={catalogue} issues={result.ok ? [] : result.error} onChange={setValue} />;
}

function mount(
  initial: CoinSplitValue = { coins: [BTC, ETH], shares: shares({ BTC: '70', ETH: '30' }) },
  catalogue: readonly Coin[] = [BTC, ETH, SOL],
) {
  render(
    <I18nProvider messages={{ plan, errors }}>
      <Host initial={initial} catalogue={catalogue} />
    </I18nProvider>,
  );
}

const coin = (ticker: string, name: string) => ({ ...SOL, id: ticker as CoinId, name });
const addButtons = () =>
  screen
    .queryAllByRole('button')
    .flatMap((button) => (button.textContent?.startsWith('Add ') ? [button.textContent] : []));

const share = (coin: string) => screen.getByRole('textbox', { name: `${coin} share (%)` });
const type = (coin: string, text: string) => fireEvent.change(share(coin), { target: { value: text } });

describe('CoinEditor', () => {
  it('adds a coin from the catalogue, offering only the coins not in the plan', () => {
    mount({ coins: [BTC], shares: shares({ BTC: '100' }) });
    expect(screen.queryByRole('button', { name: 'Add Bitcoin' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Add Solana' }));
    expect(share('Solana')).toHaveProperty('value', '');
    expect(document.activeElement).toBe(share('Solana'));
    expect(screen.queryByRole('button', { name: 'Add Solana' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Add Ethereum' })).toBeDefined();
  });

  it('lists the coins to add alphabetically by name, never in the catalogue order', () => {
    const catalogue = [BTC, coin('AAVE', 'Aave'), coin('ADA', 'Cardano'), coin('ARB', 'Arbitrum'), ETH, SOL];
    mount({ coins: [BTC], shares: shares({ BTC: '100' }) }, catalogue);
    expect(addButtons()).toEqual(['Add Aave', 'Add Arbitrum', 'Add Cardano', 'Add Ethereum', 'Add Solana']);
  });

  it('at 20 coins offers no coin to add and says the plan holds at most 20', () => {
    const coins = Array.from({ length: MAX_COINS }, (_, n) => coin(`C${n}`, `Coin ${n}`));
    const full = { coins, shares: shares(Object.fromEntries(coins.map((c) => [c.id, '5']))) };
    mount(full, [...coins, SOL]);
    expect(addButtons()).toEqual([]);
    expect(screen.getByText('A plan holds at most 20 coins.')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Remove Coin 0' }));
    expect(addButtons()).toEqual(['Add Coin 0', 'Add Solana']);
    expect(screen.queryByText('A plan holds at most 20 coins.')).toBeNull();
  });

  it('shows the sum message on the split while the shares are off 100, and clears it when fixed', () => {
    mount();
    expect(screen.queryByText(SUM)).toBeNull();
    type('Ethereum', '20');
    const message = screen.getByText(SUM);
    for (const coin of ['Bitcoin', 'Ethereum']) {
      expect(share(coin).getAttribute('aria-invalid')).toBe('true');
      expect(share(coin).getAttribute('aria-describedby')?.split(' ')).toContain(message.id);
    }
    expect(screen.getByRole('group', { name: 'Coins & split' }).getAttribute('aria-describedby')).toBe(message.id);
    type('Ethereum', '30');
    expect(screen.queryByText(SUM)).toBeNull();
    expect(share('Bitcoin').getAttribute('aria-invalid')).not.toBe('true');
  });

  it('shows the precision and reading messages on the share they belong to', () => {
    mount();
    type('Bitcoin', '69.99999');
    type('Ethereum', '30.00001');
    const precision = screen.getAllByText('Use at most 4 decimal places.');
    expect(precision).toHaveLength(2);
    expect(share('Bitcoin').getAttribute('aria-describedby')?.split(' ')).toContain(precision[0]?.id);
    type('Ethereum', 'thirty');
    expect(screen.getByText('Enter a number such as 1,234.56.')).toBeDefined();
    expect(share('Ethereum').getAttribute('aria-invalid')).toBe('true');
  });

  it('removes a coin and offers it again; the last coin cannot be removed', () => {
    mount();
    fireEvent.click(screen.getByRole('button', { name: 'Remove Ethereum' }));
    expect(screen.queryByRole('textbox', { name: 'Ethereum share (%)' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Add Ethereum' })).toBeDefined();
    expect(screen.queryByRole('button', { name: 'Remove Bitcoin' })).toBeNull();
    expect(document.activeElement).toBe(share('Bitcoin'));
  });

  it('works with the keyboard only: Tab through the fields, Enter adds, Space removes', async () => {
    mount();
    const user = userEvent.setup({ document });
    await user.tab();
    expect(document.activeElement).toBe(share('Bitcoin'));
    await user.keyboard('{Control>}a{/Control}50');
    await user.tab();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Remove Bitcoin' }));
    await user.tab();
    await user.tab();
    await user.tab();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Add Solana' }));
    await user.keyboard('{Enter}');
    expect(document.activeElement).toBe(share('Solana'));
    await user.keyboard('20');
    expect(screen.queryByText(SUM)).toBeNull();
    await user.tab();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Remove Solana' }));
    await user.keyboard(' ');
    expect(screen.queryByRole('textbox', { name: 'Solana share (%)' })).toBeNull();
    expect(screen.getByText(SUM)).toBeDefined();
  });
});

describe('CoinEditor legend', () => {
  const show = (legend?: 'shown' | 'hidden') =>
    render(
      <I18nProvider messages={{ plan, errors }}>
        <CoinEditor
          value={{ coins: [BTC], shares: shares({ BTC: '100' }) }}
          catalogue={[BTC]}
          issues={[]}
          onChange={() => undefined}
          legend={legend}
        />
      </I18nProvider>,
    );
  const legend = () => screen.getByText('Coins & split', { selector: 'legend' });

  it('keeps the legend visible by default, as Settings shows it', () => {
    show();
    expect(legend().classList.contains('sr-only')).toBe(false);
    expect(screen.getByRole('group', { name: 'Coins & split' })).toBeDefined();
  });

  it('hides the legend for screen readers only, so the group keeps its name under a step heading', () => {
    show('hidden');
    expect(legend().className).toBe('sr-only');
    expect(screen.getByRole('group', { name: 'Coins & split' })).toBeDefined();
  });
});
