// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FormStatus, SETTLE_MS } from './form-status';

// The one polite status of a Log form (docs/DESIGN.md §6): empty from the first render, it takes the lines once the
// form has stayed unchanged for SETTLE_MS, one <p> per line, the whole set replaced on each settled change.

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const status = () => screen.getByRole('status');
const said = () => [...status().querySelectorAll('p')].map((each) => each.textContent);
const wait = (ms: number) => act(() => void vi.advanceTimersByTime(ms));

describe('FormStatus', () => {
  it('mounts one empty polite, atomic, visually hidden status, even when lines are given', () => {
    render(<FormStatus lines={['First.', null, 'Second.']} typed={{ at: 0 }} />);
    expect(screen.getAllByRole('status')).toHaveLength(1);
    expect(status().getAttribute('aria-live')).toBe('polite');
    expect(status().getAttribute('aria-atomic')).toBe('true');
    expect(status().classList.contains('sr-only')).toBe(true);
    expect(status().textContent).toBe('');
  });

  it('restarts the wait on each change and takes one <p> per shown line once the form is still', async () => {
    const lines = ['First.', null, 'Second.'];
    const { rerender } = render(<FormStatus lines={lines} typed={{ at: 0 }} />);
    await wait(SETTLE_MS - 1);
    rerender(<FormStatus lines={lines} typed={{ at: 1 }} />);
    await wait(SETTLE_MS - 1);
    expect(status().textContent).toBe('');
    await wait(1);
    expect(said()).toEqual(['First.', 'Second.']);
  });

  it('changes no node when the settled lines are the same', async () => {
    const lines = ['First.', 'Second.'];
    const { rerender } = render(<FormStatus lines={lines} typed={{ at: 0 }} />);
    await wait(SETTLE_MS);
    const records: MutationRecord[] = [];
    const observer = new MutationObserver((each) => void records.push(...each));
    observer.observe(status(), { subtree: true, childList: true, characterData: true, attributes: true });
    rerender(<FormStatus lines={[...lines]} typed={{ at: 1 }} />);
    await wait(SETTLE_MS);
    expect([...records, ...observer.takeRecords()]).toHaveLength(0);
    observer.disconnect();
  });

  it('replaces the whole set when a line changes', async () => {
    const { rerender } = render(<FormStatus lines={['First.', 'Second.']} typed={{ at: 0 }} />);
    await wait(SETTLE_MS);
    const before = status().firstElementChild;
    rerender(<FormStatus lines={['First.', 'Third.']} typed={{ at: 1 }} />);
    await wait(SETTLE_MS);
    expect(said()).toEqual(['First.', 'Third.']);
    expect(before?.isConnected).toBe(false);
    expect(status().firstElementChild).not.toBe(before);
  });

  it('empties once the lines are gone', async () => {
    const { rerender } = render(<FormStatus lines={['First.']} typed={{ at: 0 }} />);
    await wait(SETTLE_MS);
    rerender(<FormStatus lines={[null]} typed={{ at: 1 }} />);
    await wait(SETTLE_MS);
    expect(status().textContent).toBe('');
    expect(status().childElementCount).toBe(0);
  });

  it('leaves no timer behind when it unmounts before the settle', () => {
    const { unmount } = render(<FormStatus lines={['First.']} typed={{ at: 0 }} />);
    expect(vi.getTimerCount()).toBe(1);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
