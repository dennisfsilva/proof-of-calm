// The worker's registration waits for the first idle period after the screen settled (ADR-0045 §5, the
// deviation of 2026-10-26): its install and precache would otherwise run beside Today's first render.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IDLE_TIMEOUT_MS, whenIdle } from './idle';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('whenIdle', () => {
  it('starts nothing before the idle callback, then runs once in it, with the timeout as its deadline', () => {
    const callbacks: (() => void)[] = [];
    const requestIdleCallback = vi.fn((callback: () => void, _options?: { timeout: number }) => {
      callbacks.push(callback);
      return callbacks.length;
    });
    const run = vi.fn();
    whenIdle({ requestIdleCallback, setTimeout: (fn, ms) => setTimeout(fn, ms) }, run);
    vi.advanceTimersByTime(IDLE_TIMEOUT_MS * 2);
    expect(run).not.toHaveBeenCalled();
    expect(requestIdleCallback).toHaveBeenCalledTimes(1);
    expect(requestIdleCallback.mock.calls[0]?.[1]).toEqual({ timeout: IDLE_TIMEOUT_MS });
    callbacks[0]?.();
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('waits the timeout where the platform has no idle callback (Safari)', () => {
    const run = vi.fn();
    whenIdle({ setTimeout: (fn, ms) => setTimeout(fn, ms) }, run);
    vi.advanceTimersByTime(IDLE_TIMEOUT_MS - 1);
    expect(run).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('keeps the timeout to a few seconds', () => {
    expect(IDLE_TIMEOUT_MS).toBeGreaterThanOrEqual(1000);
    expect(IDLE_TIMEOUT_MS).toBeLessThanOrEqual(5000);
  });
});
