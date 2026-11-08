// @vitest-environment jsdom
import { type CoinId, type CurrencyCode, err, ok, type Result } from '@proofofcalm/core';
import { act, cleanup, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import type { ApiFailure, CachedHistory, HistorySource } from '../../../lib/ports';
import { ServicesProvider } from '../../../lib/services';
import { createTestServices } from '../../../lib/services/testing';
import { useHistories } from './use-histories';

// The closes the value chart needs (docs/DOMAIN.md §3.6, §3.11): one read per coin, ready only once every
// coin has its closes, the oldest fetch as the time, and an answer for inputs that have changed ignored.

afterEach(cleanup);

type Answer = Result<CachedHistory, ApiFailure>;
type Call = { readonly coin: CoinId; readonly currency: CurrencyCode; answer(result: Answer): Promise<void> };

/** A history source whose calls wait until the test answers them. */
function waitingSource(): HistorySource & { readonly calls: Call[] } {
  const calls: Call[] = [];
  return {
    calls,
    closes: (coin, currency) =>
      new Promise<Answer>((resolve) => {
        calls.push({ coin, currency, answer: (result) => act(async () => resolve(result)) });
      }),
  };
}

const closes = (coin: string, currency: CurrencyCode, fetchedAt: string): Answer =>
  ok({
    coin: coin as CoinId,
    currency,
    closes: [
      ['2026-10-19', '100'],
      ['2026-10-20', '110'],
    ] as unknown as CachedHistory['closes'],
    fetchedAt: fetchedAt as CachedHistory['fetchedAt'],
  });

const coins = (...ids: string[]) => ids as CoinId[];

function mount(source: HistorySource, initial: { coins: readonly CoinId[]; currency: CurrencyCode }) {
  const services = createTestServices({ historySource: source });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <ServicesProvider services={services}>{children}</ServicesProvider>
  );
  return renderHook((props) => useHistories(props.coins, props.currency), { wrapper, initialProps: initial });
}

describe('useHistories', () => {
  it('loads every coin once and is ready with the oldest fetch time when all have closes', async () => {
    const source = waitingSource();
    const { result, rerender } = mount(source, { coins: coins('BTC', 'ETH'), currency: 'EUR' });
    expect(result.current).toEqual({ status: 'loading' });
    expect(source.calls.map((call) => [call.coin, call.currency])).toEqual([
      ['BTC', 'EUR'],
      ['ETH', 'EUR'],
    ]);

    await source.calls[1]?.answer(closes('ETH', 'EUR', '2026-10-20T09:00:00.000Z'));
    expect(result.current).toEqual({ status: 'loading' });
    await source.calls[0]?.answer(closes('BTC', 'EUR', '2026-10-20T10:00:00.000Z'));
    expect(result.current).toMatchObject({ status: 'ready', fetchedAt: '2026-10-20T09:00:00.000Z' });
    if (result.current.status !== 'ready') throw new Error('not ready');
    expect(result.current.histories.currency).toBe('EUR');
    expect(Object.keys(result.current.histories.coins)).toEqual(['BTC', 'ETH']);

    // A new array of the same coins is the same input: nothing is read again.
    rerender({ coins: coins('BTC', 'ETH'), currency: 'EUR' });
    expect(source.calls).toHaveLength(2);
  });

  it('sends no request and stays loading with no coins', () => {
    const source = waitingSource();
    const { result } = mount(source, { coins: coins(), currency: 'EUR' });
    expect(source.calls).toEqual([]);
    expect(result.current).toEqual({ status: 'loading' });
  });

  it('asks for no closes of a coin outside the catalogue, which the history route refuses', async () => {
    const source = waitingSource();
    const { result } = mount(source, { coins: coins('BTC', 'KAS'), currency: 'EUR' });
    expect(source.calls.map((call) => call.coin)).toEqual(['BTC']);
    await source.calls[0]?.answer(closes('BTC', 'EUR', '2026-10-20T10:00:00.000Z'));
    expect(result.current).toMatchObject({ status: 'ready', fetchedAt: '2026-10-20T10:00:00.000Z' });
    if (result.current.status !== 'ready') throw new Error('not ready');
    expect(Object.keys(result.current.histories.coins)).toEqual(['BTC']);

    cleanup();
    const none = waitingSource();
    const only = mount(none, { coins: coins('KAS'), currency: 'EUR' });
    expect(none.calls).toEqual([]);
    expect(only.result.current).toEqual({ status: 'loading' });
  });

  it('fails with the first failure when a coin has no closes', async () => {
    const source = waitingSource();
    const { result } = mount(source, { coins: coins('BTC', 'ETH'), currency: 'EUR' });
    await source.calls[0]?.answer(closes('BTC', 'EUR', '2026-10-20T10:00:00.000Z'));
    await source.calls[1]?.answer(err({ kind: 'http', status: 502 }));
    expect(result.current).toEqual({ status: 'failed', failure: { kind: 'http', status: 502 } });
  });

  it('ignores an answer that arrives after the inputs changed', async () => {
    const source = waitingSource();
    const { result, rerender } = mount(source, { coins: coins('BTC'), currency: 'EUR' });
    rerender({ coins: coins('BTC'), currency: 'USD' });
    expect(result.current).toEqual({ status: 'loading' });
    await source.calls[0]?.answer(closes('BTC', 'EUR', '2026-10-20T10:00:00.000Z'));
    expect(result.current).toEqual({ status: 'loading' });
    await source.calls[1]?.answer(closes('BTC', 'USD', '2026-10-20T10:00:00.000Z'));
    expect(result.current).toMatchObject({ status: 'ready', histories: { currency: 'USD' } });
  });
});
