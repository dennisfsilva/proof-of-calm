// Bitstamp's reader of its public daily closes (ADR-0036, Reading of 2026-11-23): yesterday's candle
// only, once a day per pair, so a missed day is not caught up, and the first run reads the previous
// day's candle and nothing older (the Reading of 2026-11-27 on Bitstamp's first run). API v2's OHLC
// endpoint (www.bitstamp.net/api, OHLC data) with `step=86400`, `limit=1`, `start` at the window's day
// and the open candle excluded. The runner's window names the day; the real clock only bounds it: the
// window is one day, and that day is yesterday, or the day before yesterday while the clock is less
// than `MIDNIGHT_ALLOWANCE_MINUTES` past 00:00 UTC (a daily step that passed midnight after it started).
// Any other window is refused as a failure, unread, so a `--today` in the past fails every pair, except
// a `--today` of yesterday within that allowance after 00:00 UTC.
import { addDays, compareDates } from '@proofofcalm/core';
import type { StoreRow } from '@proofofcalm/data';
import * as z from 'zod/mini';
import { candleRow, dayStart, getJson, refused, utcToday } from './read.ts';
import type { Source } from './source.ts';

// A url_symbol of the trading-pairs listing (`btceur`), so nothing else reaches the URL.
const SYMBOL = /^[a-z0-9]{2,16}$/;
const SECONDS = /^\d{1,12}$/;

/**
 * The daily step's `timeout-minutes` in `closes-store.yml`: the longest a step started before midnight
 * can still be reading, so the day before yesterday is a window only this long after 00:00 UTC.
 * `workflow.test.ts` pins it to the template.
 */
export const MIDNIGHT_ALLOWANCE_MINUTES = 8;

const BodySchema = z.object({
  data: z.object({ ohlc: z.array(z.object({ timestamp: z.string(), close: z.unknown() })) }),
});
// Bitstamp's error answers carry `errors`, `code` or `response_code` (its API's error format).
const ErrorSchema = z.union([
  z.object({ errors: z.unknown() }),
  z.object({ code: z.unknown() }),
  z.object({ response_code: z.unknown() }),
]);

export const bitstamp: Source = {
  exchange: 'bitstamp',
  async closes(pair, from, to, io) {
    if (!SYMBOL.test(pair)) throw new Error('refused: bitstamp unknown pair');
    const now = io.now();
    const today = utcToday(now);
    const yesterday = addDays(today, -1);
    const pastMidnight = now.getTime() - dayStart(today) * 1000;
    const allowed = pastMidnight < MIDNIGHT_ALLOWANCE_MINUTES * 60_000;
    const known = from === yesterday || (allowed && from === addDays(yesterday, -1));
    if (compareDates(from, to) !== 0 || !known) throw refused('bitstamp', pair, 'out of window');
    const query = new URLSearchParams({
      step: '86400',
      limit: '1',
      start: String(dayStart(from)),
      exclude_current_candle: 'true',
    });
    const json = await getJson('bitstamp', pair, `https://www.bitstamp.net/api/v2/ohlc/${pair}/?${query}`, io);
    const body = BodySchema.safeParse(json);
    if (!body.success) throw refused('bitstamp', pair, ErrorSchema.safeParse(json).success ? 'error' : 'malformed');
    const rows = body.data.data.ohlc.map((candle) =>
      candleRow(SECONDS.test(candle.timestamp) ? Number.parseInt(candle.timestamp, 10) : null, candle.close),
    );
    if (rows.some((row) => row === null)) throw refused('bitstamp', pair, 'malformed');
    return rows.filter((row): row is StoreRow => row?.date === from).slice(0, 1);
  },
};
