// @vitest-environment jsdom
import { COINS } from '@proofofcalm/content';
import type { CoinId } from '@proofofcalm/core';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../../../lib/i18n';
import errors from '../../../messages/en/errors.json';
import onboarding from '../../../messages/en/onboarding.json';
import plan from '../../../messages/en/plan.json';
import type { CoinSplitValue, SplitIssue } from '../../plan';
import { CoinsStep } from './coins-step';

afterEach(cleanup);

const twoCoins: CoinSplitValue = {
  coins: COINS.filter((coin) => coin.id === 'BTC' || coin.id === 'ETH'),
  shares: { ['BTC' as CoinId]: '60', ['ETH' as CoinId]: '30' },
};

/** The screen's part: Continue reads the coins and hands back the issues it found. */
function Harness(props: { value: CoinSplitValue; found: readonly SplitIssue[]; onContinue(): void }) {
  const [issues, setIssues] = useState<readonly SplitIssue[]>([]);
  return (
    <I18nProvider messages={{ errors, onboarding, plan }}>
      <CoinsStep
        value={props.value}
        issues={issues}
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

describe('CoinsStep', () => {
  it('heads the coin editor and continues only once a coin is in the plan', () => {
    render(<Harness value={{ coins: [], shares: {} }} found={[]} onContinue={vi.fn()} />);
    expect(screen.getByRole('heading', { level: 2, name: 'Choose your coins and their split' })).toBeDefined();
    expect(screen.getByRole('group', { name: 'Coins & split' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Continue' }).hasAttribute('disabled')).toBe(true);
  });

  it('shows the step heading alone: the group legend is for screen readers only', () => {
    render(<Harness value={twoCoins} found={[]} onContinue={vi.fn()} />);
    expect(screen.getByText('Coins & split', { selector: 'legend' }).className).toBe('sr-only');
    expect(screen.getAllByRole('heading').map((heading) => heading.textContent)).toEqual([
      'Choose your coins and their split',
    ]);
  });

  it('a refused Continue moves the focus to the first invalid share', async () => {
    const onContinue = vi.fn();
    render(<Harness value={twoCoins} found={[{ code: 'split-sum', path: ['split'] }]} onContinue={onContinue} />);
    await act(() => fireEvent.click(screen.getByRole('button', { name: 'Continue' })));
    expect(onContinue).toHaveBeenCalledOnce();
    expect(screen.getByText('Make the shares add up to 100 %.')).toBeDefined();
    expect(document.activeElement).toBe(screen.getByLabelText('Bitcoin share (%)'));
  });
});
