// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { userEvent } from 'storybook/test';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../../../lib/i18n';
import onboarding from '../../../messages/en/onboarding.json';
import { CountryStep, type CountryStepProps } from './country-step';

afterEach(cleanup);

const CHOICES = [
  { code: 'DE', name: 'Germany' },
  { code: 'PT', name: 'Portugal' },
  { code: 'XX', name: 'Other country' },
] as const;

function mount(props: Partial<CountryStepProps>) {
  const onChoose = vi.fn();
  render(
    <I18nProvider messages={{ onboarding }}>
      <CountryStep choices={CHOICES} suggestion={null} value={null} onChoose={onChoose} {...props} />
    </I18nProvider>,
  );
  return onChoose;
}

const LINE = 'Residence, not language, decides tax.';

describe('CountryStep (docs/JURISDICTIONS.md §3)', () => {
  it('names a low suggestion without choosing it: Continue appears once a country is chosen', async () => {
    const onChoose = mount({ suggestion: { country: 'PT', confidence: 'low', languageDiffers: false } });
    expect(screen.getByText('This device suggests Portugal.')).toBeDefined();
    expect(screen.getByRole('combobox', { name: 'Country' }).textContent).toContain('Choose a country');
    expect(screen.queryByRole('button', { name: /Continue/ })).toBeNull();
    const user = userEvent.setup({ document });
    await user.click(screen.getByRole('combobox', { name: 'Country' }));
    await user.click(await screen.findByRole('option', { name: 'Portugal' }));
    await act(() => fireEvent.click(screen.getByRole('button', { name: 'Continue with Portugal' })));
    expect(onChoose).toHaveBeenCalledWith('PT');
  });

  it('chooses a medium suggestion for one tap', async () => {
    const onChoose = mount({ suggestion: { country: 'DE', confidence: 'medium', languageDiffers: false } });
    await act(() => fireEvent.click(screen.getByRole('button', { name: 'Continue with Germany' })));
    expect(onChoose).toHaveBeenCalledWith('DE');
  });

  it('shows the suggestion and the residence line together when the language points elsewhere', () => {
    mount({ suggestion: { country: 'DE', confidence: 'high', languageDiffers: true } });
    expect(screen.getByText('This device suggests Germany.')).toBeDefined();
    expect(screen.getByText(LINE)).toBeDefined();
    expect(screen.getByRole('button', { name: 'Continue with Germany' })).toBeDefined();
  });

  it('shows the residence line alone when nothing is named', () => {
    mount({ suggestion: { country: null, confidence: null, languageDiffers: true } });
    expect(screen.getByText(LINE)).toBeDefined();
    expect(screen.queryByText(/This device suggests/)).toBeNull();
    expect(screen.queryByRole('button', { name: /Continue/ })).toBeNull();
  });

  it('shows neither line when nothing is named and the language agrees', () => {
    mount({ suggestion: { country: null, confidence: null, languageDiffers: false } });
    expect(screen.queryByText(LINE)).toBeNull();
    expect(screen.queryByText(/This device suggests/)).toBeNull();
  });

  it('keeps the residence line away while the language agrees', () => {
    mount({ suggestion: { country: 'PT', confidence: 'high', languageDiffers: false } });
    expect(screen.getByRole('button', { name: 'Continue with Portugal' })).toBeDefined();
    expect(screen.queryByText(LINE)).toBeNull();
  });

  it('without a suggestion shows only the list, and nothing to continue with until a choice', () => {
    mount({});
    expect(screen.getByRole('heading', { name: 'Where do you live?' })).toBeDefined();
    expect(screen.getByRole('combobox', { name: 'Country' }).textContent).toContain('Choose a country');
    expect(screen.queryByText(/This device suggests/)).toBeNull();
    expect(screen.queryByRole('button', { name: /Continue/ })).toBeNull();
  });

  it('continues with a country chosen earlier, over the suggestion', async () => {
    const onChoose = mount({ value: 'XX', suggestion: { country: 'PT', confidence: 'high', languageDiffers: false } });
    expect(screen.getByText('This device suggests Portugal.')).toBeDefined();
    await act(() => fireEvent.click(screen.getByRole('button', { name: 'Continue with Other country' })));
    expect(onChoose).toHaveBeenCalledWith('XX');
  });
});
