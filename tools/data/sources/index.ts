// The exchanges' readers of daily closes, one per exchange; Coinbase's stays `null` (README.md).
// A reader takes the clock, the network and the wait from its caller, so its tests need neither.
import type { CalendarDate } from '@proofofcalm/core';
import type { Exchange, StoreRow } from '@proofofcalm/data';
import { bitstamp } from './bitstamp.ts';
import { coinbase } from './coinbase.ts';
import { kraken } from './kraken.ts';

export type SourceIo = {
  readonly fetch: typeof fetch;
  readonly sleep: (ms: number) => Promise<void>;
  readonly now: () => Date;
};

/** One exchange's closes of a pair (its symbol in `pairs.json`) for the UTC days `from` to `to`. */
export type Source = {
  readonly exchange: Exchange;
  closes(pair: string, from: CalendarDate, to: CalendarDate, io: SourceIo): Promise<StoreRow[]>;
};

export const SOURCES: Record<Exchange, Source | null> = { kraken, bitstamp, coinbase };
