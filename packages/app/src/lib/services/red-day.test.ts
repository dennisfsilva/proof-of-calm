import {
  addDays,
  type CalendarDate,
  type CoinId,
  type CurrencyCode,
  type Entry,
  err,
  ok,
  type Plan,
} from '@proofofcalm/core';
import { describe, expect, it } from 'vitest';
import type { CachedHistory, HistorySource } from '../ports';
import { fixtureSnapshot } from './fixtures';
import { createTestServices } from './testing';

// The red-day port on in-memory Services (docs/DOMAIN.md §3.11, the complete-closes rule): each copy's closes end on
// the UTC day of its fetch with the live price, as the history route answers (apps/web/lib/history/coingecko.ts).
// WEEKLY_FALL and SLOW_FALL are packages/core's (src/market/red-day.test.ts) with the live point after them, which
// the model drops: Red on the last two complete closes, the first of them exactly on the threshold. apps/web/e2e's
// 'week-fall' and 'high-fall' cross on the same days, a margin past it (support.ts says why).

const TODAY = '2026-10-20' as CalendarDate;
const FETCHED = '2026-10-20T10:00:00.000Z';
const repeat = (value: string, times: number) => Array.from({ length: times }, () => value);
/** A week and more at 100, then two a day down: 90 is 10 % below the close seven days before. */
const WEEKLY_FALL = [...repeat('100', 10), '98', '96', '94', '92', '90', '90', '90'];
/** One a day down from 100: 70 is 30 % below the 90-day high, while no week falls 10 %. */
const SLOW_FALL = [...Array.from({ length: 31 }, (_, offset) => String(100 - offset)), '70', '70'];
const RISE = Array.from({ length: 120 }, (_, n) => String(100 + n));

type Copy = { readonly values: readonly string[]; readonly end?: CalendarDate; readonly fetchedAt?: string };

/** The closes dated back from `end` (today by default), fetched at FETCHED by default. */
const copy = (coin: string, currency: CurrencyCode, { values, end = TODAY, fetchedAt = FETCHED }: Copy) =>
  ({
    coin,
    currency,
    closes: values.map((value, index) => [addDays(end, index - values.length + 1), value]),
    fetchedAt,
  }) as unknown as CachedHistory;

function historyOf(copies: Readonly<Record<string, Copy | 'fail' | 'never'>>) {
  const reads: string[] = [];
  const source: HistorySource = {
    closes(coin, currency) {
      reads.push(coin);
      const answer = copies[coin];
      if (answer === 'never' || answer === undefined) return new Promise(() => undefined);
      if (answer === 'fail') return Promise.resolve(err({ kind: 'http', status: 502 }));
      return Promise.resolve(ok(copy(coin, currency, answer)));
    },
  };
  return { reads, source };
}

const SNAPSHOT = fixtureSnapshot();
const PLAN = SNAPSHOT.plan as Plan;
const BTC_ONLY = SNAPSHOT.entries.filter((entry) => entry.coin === 'BTC');

function model(
  copies: Readonly<Record<string, Copy | 'fail' | 'never'>>,
  {
    entries = BTC_ONLY,
    today = TODAY,
    plan = PLAN,
  }: { readonly entries?: readonly Entry[]; readonly today?: CalendarDate; readonly plan?: Plan } = {},
) {
  const history = historyOf(copies);
  const services = createTestServices({ historySource: history.source });
  return { reads: history.reads, answer: services.redDay.model({ plan, entries, today }) };
}

const BITCOIN = { coin: 'BTC', name: 'Bitcoin' };

describe('the red-day port (docs/DOMAIN.md §3.11)', () => {
  it('reads no history when nothing is held', async () => {
    const { reads, answer } = model({ BTC: { values: RISE } }, { entries: [] });
    expect(await answer).toEqual(
      expect.objectContaining({ state: 'nothing-held', figure: null, episode: null, lastRed: null }),
    );
    expect(reads).toEqual([]);
  });

  it('is clear on a rise, with the closed days it read', async () => {
    const { answer } = model({ BTC: { values: RISE } });
    const result = await answer;
    expect(result.state).toBe('clear');
    expect(result.episode).toBeNull();
    expect(result.figure).toEqual({
      coins: ['BTC'],
      missing: [],
      sevenDay: '3.3175',
      fromHigh90: '0',
      first: addDays(TODAY, -119),
      last: addDays(TODAY, -1),
      currency: 'EUR',
      shortWindow: false,
    });
  });

  it('starts the episode on the day a week-long fall crosses', async () => {
    const result = await model({ BTC: { values: WEEKLY_FALL } }).answer;
    expect(result.state).toBe('episode');
    expect(result.episode).toEqual({ start: addDays(TODAY, -2), last: addDays(TODAY, -1) });
    expect(result.lastRed).toEqual({ date: addDays(TODAY, -1), sevenDay: '-10', fromHigh90: '-10' });
  });

  it('starts the episode on the day a slow fall reaches 30 % below the 90-day high', async () => {
    const result = await model({ BTC: { values: SLOW_FALL } }).answer;
    expect(result.state).toBe('episode');
    expect(result.episode).toEqual({ start: addDays(TODAY, -2), last: addDays(TODAY, -1) });
    expect(result.lastRed).toEqual({ date: addDays(TODAY, -1), sevenDay: '-7.8947', fromHigh90: '-30' });
  });

  it('drops the live point dated the UTC day of the fetch, so it starts no episode', async () => {
    const result = await model({ BTC: { values: [...repeat('100', 99), '80'] } }).answer;
    expect(result.state).toBe('clear');
    expect(result.figure?.last).toBe(addDays(TODAY, -1));
    expect(result.figure?.sevenDay).toBe('0');
  });

  it('drops a point dated after today: a copy fetched at 23:30 in New York (UTC−5)', async () => {
    const late = { values: [...repeat('100', 99), '60'], end: addDays(TODAY, 1), fetchedAt: '2026-10-21T04:30:00Z' };
    const result = await model({ BTC: late }).answer;
    expect(result.state).toBe('clear');
    expect(result.figure?.last).toBe(TODAY);
    // A copy fetched a day later keeps the close of 21 Oct, which today's date still drops.
    const later = await model({ BTC: { ...late, fetchedAt: '2026-10-22T04:30:00Z' } }).answer;
    expect(later).toEqual(
      expect.objectContaining({ state: 'clear', figure: expect.objectContaining({ last: TODAY }) }),
    );
  });

  it('reports a held coin the history route does not serve as missing, without waiting for it', async () => {
    const unserved = {
      ...(BTC_ONLY[0] as Entry),
      id: '00000000-0000-4000-8000-000000000099' as Entry['id'],
      coin: 'ZZZ' as CoinId,
    };
    const { reads, answer } = model({ BTC: { values: RISE }, ZZZ: 'never' }, { entries: [...BTC_ONLY, unserved] });
    const result = await answer;
    expect(result.state).toBe('clear');
    expect(result.figure?.coins).toEqual(['BTC']);
    expect(result.figure?.missing).toEqual(['ZZZ']);
    expect(result.held).toEqual([BITCOIN, { coin: 'ZZZ', name: 'ZZZ' }]);
    expect(reads).toEqual(['BTC']);
  });

  it('holds a coin removed from the plan whose entries stay, named from the catalogue, after the plan’s coins', async () => {
    const btcOnly = { ...PLAN, coins: PLAN.coins.filter((coin) => coin.id === 'BTC') };
    const { answer } = model(
      { BTC: { values: RISE }, ETH: { values: RISE } },
      { entries: SNAPSHOT.entries, plan: btcOnly },
    );
    const result = await answer;
    expect(result.held).toEqual([BITCOIN, { coin: 'ETH', name: 'Ethereum' }]);
    expect(result.figure?.coins).toEqual(['BTC', 'ETH']);
  });

  it('leaves a plan coin with 0 units out of the held coins, in every state', async () => {
    // The plan holds BTC and ETH; only BTC has entries.
    expect((await model({ BTC: { values: RISE } }).answer).held).toEqual([BITCOIN]);
    expect(await model({ BTC: 'fail' }).answer).toEqual(expect.objectContaining({ state: 'failed', held: [BITCOIN] }));
    expect((await model({}, { entries: [] }).answer).held).toEqual([]);
  });

  it('fails when one coin’s read fails', async () => {
    const result = await model({ BTC: { values: RISE }, ETH: 'fail' }, { entries: SNAPSHOT.entries }).answer;
    expect(result).toEqual(expect.objectContaining({ state: 'failed', figure: null, episode: null }));
  });

  it('has no history when every held coin is outside the catalogue, without a read', async () => {
    const recoined = BTC_ONLY.map((entry) => ({ ...entry, coin: 'ZZZ' as CoinId }));
    const { reads, answer } = model({ ZZZ: 'never' }, { entries: recoined });
    expect(await answer).toEqual(
      expect.objectContaining({ state: 'no-history', held: [{ coin: 'ZZZ', name: 'ZZZ' }], figure: null }),
    );
    expect(reads).toEqual([]);
  });

  it('has no history when the one served coin has a single complete close', async () => {
    // The second close is dated the UTC day of the fetch, which the model drops.
    const result = await model({ BTC: { values: ['100', '101'] } }).answer;
    expect(result).toEqual(expect.objectContaining({ state: 'no-history', held: [BITCOIN], figure: null }));
  });

  it('stays failed on a rejected read, also beside a coin the route does not serve', async () => {
    const unserved = { ...(BTC_ONLY[0] as Entry), id: '00000000-0000-4000-8000-000000000099' as Entry['id'] };
    const entries = [...BTC_ONLY, { ...unserved, coin: 'ZZZ' as CoinId }];
    expect((await model({ BTC: 'fail' }).answer).state).toBe('failed');
    expect((await model({ BTC: 'fail', ZZZ: 'never' }, { entries }).answer).state).toBe('failed');
    // A short copy beside a rejected read: a retry can still bring the other coin's history.
    const short = await model({ BTC: { values: ['100'] }, ETH: 'fail' }, { entries: SNAPSHOT.entries }).answer;
    expect(short.state).toBe('failed');
  });

  it('keeps the episode of the served coin and names the unserved one as missing', async () => {
    const unserved = { ...(BTC_ONLY[0] as Entry), id: '00000000-0000-4000-8000-000000000099' as Entry['id'] };
    const entries = [...BTC_ONLY, { ...unserved, coin: 'ZZZ' as CoinId }];
    const result = await model({ BTC: { values: WEEKLY_FALL }, ZZZ: 'never' }, { entries }).answer;
    expect(result.state).toBe('episode');
    expect(result.figure?.missing).toEqual(['ZZZ']);
  });

  it('weighs several coins at today’s units', async () => {
    // Today's units: 0.02215 BTC (0.0125 + 5 × 0.00121 + 0.0036) and 0.119 ETH (0.12 + 5 × 0.0118 − 0.06).
    const btc = { values: repeat('100', 30) };
    const eth = { values: [...repeat('100', 22), '90', '80', '70', '60', '50', '40', '30', '999'] };
    const result = await model({ BTC: btc, ETH: eth }, { entries: SNAPSHOT.entries }).answer;
    expect(result.figure?.coins).toEqual(['BTC', 'ETH']);
    // (0.02215 × 100 + 0.119 × 30) / (0.02215 × 100 + 0.119 × 100) − 1 = 5.785 / 14.115 − 1
    expect(result.figure?.sevenDay).toBe('-59.0152');
    expect(result.state).toBe('episode');
  });

  it('marks a window of fewer than 90 closes as short', async () => {
    const result = await model({ BTC: { values: RISE.slice(0, 90) } }).answer;
    expect(result.figure?.shortWindow).toBe(true);
    expect((await model({ BTC: { values: RISE.slice(0, 91) } }).answer).figure?.shortWindow).toBe(false);
  });

  it('names the next buy day, none once buying is over, and whether it is today', async () => {
    const buying = await model({ BTC: { values: RISE } }).answer;
    expect(buying).toEqual(expect.objectContaining({ nextBuy: '2026-11-05', buyDayToday: false }));
    const buyDay = '2026-11-05' as CalendarDate;
    const onTheDay = await model(
      { BTC: { values: RISE, end: buyDay, fetchedAt: `${buyDay}T10:00:00Z` } },
      { today: buyDay },
    ).answer;
    expect(onTheDay).toEqual(expect.objectContaining({ nextBuy: buyDay, buyDayToday: true }));
    const over = '2027-03-06' as CalendarDate;
    const after = await model({ BTC: { values: RISE, end: over, fetchedAt: `${over}T10:00:00Z` } }, { today: over })
      .answer;
    expect(after).toEqual(expect.objectContaining({ nextBuy: null, buyDayToday: false }));
  });
});

describe('pastFalls', () => {
  it('gives each coin’s rows in the order of the coins passed, with their publishers', async () => {
    const falls = await createTestServices().redDay.pastFalls(['SOL', 'BTC'] as CoinId[]);
    expect(falls.map((fall) => `${fall.coin} ${fall.high} ${fall.fall}`)).toEqual([
      'SOL 2021-11-06 97',
      'BTC 2011-06-08 94',
      'BTC 2013-11-30 87',
      'BTC 2017-12-17 84',
      'BTC 2021-11-10 78',
    ]);
    expect(falls[1]).toEqual({
      coin: 'BTC',
      high: '2011-06-08',
      low: '2011-11-22',
      fall: '94',
      publisher: 'Bitcoinity (Mt. Gox) and CoinMarketCap',
    });
  });

  it('gives none for a coin with no rows', async () => {
    expect(await createTestServices().redDay.pastFalls(['DOGE'] as CoinId[])).toEqual([]);
  });
});
