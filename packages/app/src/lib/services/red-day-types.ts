// The red-day port's types (docs/DOMAIN.md §3.11), apart from `./red-day` so the lazy model imports them without a
// cycle back into the stub that loads it.
import type { CalendarDate, CoinId, CurrencyCode, Entry, Percent, Plan, RedDayEpisode } from '@proofofcalm/core';

export type RedDayInput = { readonly plan: Plan; readonly entries: readonly Entry[]; readonly today: CalendarDate };

/** The figures of the held portfolio at today's units over the complete closes (docs/DOMAIN.md §3.11). */
type RedDayFigure = {
  /** The held coins with closes, in the plan's order. */
  readonly coins: readonly CoinId[];
  /** The held coins with no served history: outside the catalogue, or fewer than two complete closes. */
  readonly missing: readonly CoinId[];
  /** The last closed day's figures. */
  readonly sevenDay: Percent | null;
  readonly fromHigh90: Percent;
  /** The closed days read, first to last. */
  readonly first: CalendarDate;
  readonly last: CalendarDate;
  readonly currency: CurrencyCode;
  /** Fewer than 90 closes. */
  readonly shortWindow: boolean;
};

export type RedDayModel = {
  /**
   * 'failed': a read was rejected, so a retry can still bring history; 'no-history': no read was rejected and no held
   * coin has a served history with two or more complete closes, so no retry brings one and `figure` is null.
   */
  readonly state: 'nothing-held' | 'failed' | 'no-history' | 'clear' | 'episode';
  /**
   * The coins with units above 0, in the portfolio's order (the plan's coins, then any other coin with entries;
   * docs/DOMAIN.md §3.6), each named as the plan names it, else as the catalogue does, else by its id. Read from the
   * plan and the entries alone, so every state carries it.
   */
  readonly held: readonly { readonly coin: CoinId; readonly name: string }[];
  readonly figure: RedDayFigure | null;
  readonly episode: RedDayEpisode | null;
  /** The figures of `episode.last`, for the banner's sentence. */
  readonly lastRed: {
    readonly date: CalendarDate;
    readonly sevenDay: Percent | null;
    readonly fromHigh90: Percent;
  } | null;
  /** `nextBuyReminder`'s due date: null once no slot ahead is open, never a late slot. */
  readonly nextBuy: CalendarDate | null;
  readonly buyDayToday: boolean;
};

/**
 * A cycle's fall from packages/content, intraday high to intraday low in positive whole percent, USD: a completed
 * cycle's, or one from a high the coin has not regained (LINK 2021), to its lowest low so far.
 */
export type PastFall = {
  readonly coin: CoinId;
  readonly high: CalendarDate;
  readonly low: CalendarDate;
  readonly fall: Percent;
  readonly publisher: string;
};

export type RedDayPort = {
  /** Never rejects for a read: a failed read is the state 'failed'; held coins with no served history, 'no-history'. */
  model(input: RedDayInput): Promise<RedDayModel>;
  /** The cycles file's rows of each coin passed, in that order. */
  pastFalls(coins: readonly CoinId[]): Promise<readonly PastFall[]>;
};
