import { ok } from '@proofofcalm/core';
import { describe, expect, it } from 'vitest';
import { fixtureNowMs, fixtureSnapshot } from './fixtures';
import { createTestServices, TEST_HISTORY, TEST_PRICES } from './testing';

// The fixed price and history sources follow the test clock: a story or a test at another date gets
// prices fetched then and closes that end on that day, so nothing reads as days or years old.

async function pricesAndCloses(nowMs?: number) {
  const services = createTestServices({ snapshot: fixtureSnapshot(), ...(nowMs === undefined ? {} : { nowMs }) });
  await services.start();
  await services.prices.refresh();
  const prices = services.domain.store.getState().snapshot.prices;
  const history = await services.history.closes(TEST_HISTORY.coin, 'EUR');
  return { prices, history };
}

describe('createTestServices', () => {
  it('answers TEST_PRICES and TEST_HISTORY at the default time', async () => {
    const { prices, history } = await pricesAndCloses();
    expect(prices).toEqual(TEST_PRICES);
    expect(history).toEqual(ok(TEST_HISTORY));
  });

  it("dates the price and the last close on 2030-03-15 at fixtureNowMs('sell')", async () => {
    const { prices, history } = await pricesAndCloses(fixtureNowMs('sell'));
    expect(prices?.fetchedAt).toBe('2030-03-15T10:00:00.000Z');
    expect(prices?.snapshot.at).toBe('2030-03-15T09:59:30.000Z');
    expect(prices?.snapshot.prices).toEqual(TEST_PRICES.snapshot.prices);
    expect(history).toEqual(
      ok({
        ...TEST_HISTORY,
        closes: [
          ['2030-03-13', '58000'],
          ['2030-03-14', '59500.5'],
          ['2030-03-15', '60000.12'],
        ],
        fetchedAt: '2030-03-15T10:00:00.000Z',
      }),
    );
  });
});
