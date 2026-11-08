// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../../../lib/i18n';
import errors from '../../../messages/en/errors.json';
import onboarding from '../../../messages/en/onboarding.json';
import { WhyStep } from './why-step';

afterEach(cleanup);

function mount(value = '') {
  const handlers = { onChange: vi.fn(), onBack: vi.fn(), onContinue: vi.fn() };
  render(
    <I18nProvider messages={{ errors, onboarding }}>
      <WhyStep value={value} {...handlers} />
    </I18nProvider>,
  );
  return handlers;
}

describe('WhyStep', () => {
  it('asks for the one sentence under its heading, at most 280 characters, and hands it back', async () => {
    const { onChange, onContinue, onBack } = mount();
    const heading = screen.getByRole('heading', { level: 2, name: 'In one sentence, why are you doing this?' });
    expect(heading.getAttribute('tabindex')).toBe('-1');
    const field = screen.getByRole('textbox', { name: 'In one sentence, why are you doing this?' });
    expect(field.getAttribute('maxlength')).toBe('280');
    expect(field.getAttribute('placeholder')).toBe('I buy on the 1st and I do not check the price on other days.');
    expect(screen.getByText('You will see it on the days the market falls.')).toBeDefined();
    await act(() => fireEvent.change(field, { target: { value: 'Calm.' } }));
    expect(onChange).toHaveBeenCalledWith('Calm.');
    await act(() => fireEvent.click(screen.getByRole('button', { name: 'Continue' })));
    await act(() => fireEvent.click(screen.getByRole('button', { name: 'Back' })));
    expect([onContinue.mock.calls.length, onBack.mock.calls.length]).toEqual([1, 1]);
  });

  it('may stay empty: Continue goes on without a sentence', async () => {
    const { onContinue } = mount('');
    await act(() => fireEvent.click(screen.getByRole('button', { name: 'Continue' })));
    expect(onContinue).toHaveBeenCalledOnce();
  });
});
