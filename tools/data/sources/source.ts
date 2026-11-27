// The reader's type, apart from `index.ts` so a reader and the pacer import it without a cycle.
// A reader takes the clock, the network and the wait from its caller, so its tests need neither.
import type { CalendarDate } from '@proofofcalm/core';
import type { Exchange, StoreRow } from '@proofofcalm/data';

export type SourceIo = {
  readonly fetch: typeof fetch;
  readonly sleep: (ms: number) => Promise<void>;
  readonly now: () => Date;
  /** A signal that aborts `ms` after it is made: `AbortSignal.timeout` in the real io. */
  readonly timeout: (ms: number) => AbortSignal;
};

/** One exchange's closes of a pair (its symbol in `pairs.json`) for the UTC days `from` to `to`. */
export type Source = {
  readonly exchange: Exchange;
  closes(pair: string, from: CalendarDate, to: CalendarDate, io: SourceIo): Promise<StoreRow[]>;
};
