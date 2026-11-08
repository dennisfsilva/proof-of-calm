// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../../../lib/i18n';
import onboarding from '../../../messages/en/onboarding.json';
import { StartRow } from './start-row';

afterEach(cleanup);

const START = 'Accept and start the plan';

function mount(pending?: boolean) {
  const handlers = { onBack: vi.fn(), onStart: vi.fn() };
  render(
    <I18nProvider messages={{ onboarding }}>
      <StartRow {...handlers} pending={pending} />
    </I18nProvider>,
  );
  return handlers;
}

describe('StartRow', () => {
  it('puts the disclosure with its Risk link above Back and Start, in one row that wraps', async () => {
    const { onBack, onStart } = mount();
    const link = screen.getByRole('link', { name: 'Risk disclosure' });
    expect(link.getAttribute('href')).toBe('/risk');
    const start = screen.getByRole('button', { name: START });
    const back = screen.getByRole('button', { name: 'Back' });
    expect(link.compareDocumentPosition(back) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(back.parentElement).toBe(start.parentElement);
    expect(start.parentElement?.className.split(' ')).toContain('flex-wrap');
    await act(() => fireEvent.click(back));
    await act(() => fireEvent.click(start));
    expect([onBack.mock.calls.length, onStart.mock.calls.length]).toEqual([1, 1]);
  });

  // docs/DESIGN.md §6: Start stays focusable while the plan is written, so the focus never drops to the body.
  it('disables Start while the plan is being written and keeps the focus on it', async () => {
    const onStart = vi.fn();
    const row = (pending: boolean) => (
      <I18nProvider messages={{ onboarding }}>
        <StartRow onBack={vi.fn()} onStart={onStart} pending={pending} />
      </I18nProvider>
    );
    const { rerender } = render(row(false));
    const start = screen.getByRole('button', { name: START });
    start.focus();
    rerender(row(true));
    expect(start.getAttribute('aria-disabled')).toBe('true');
    expect(start.hasAttribute('disabled')).toBe(false);
    expect(document.activeElement).toBe(start);
    await act(() => fireEvent.click(start));
    expect(onStart).not.toHaveBeenCalled();
  });
});
