// The red-day port (docs/ARCHITECTURE.md "Inside packages/app"; docs/DOMAIN.md §3.11): the Red day page's one way to
// its figures, which it reads as plain models, so the lazy Learn chunk imports no value of core or content
// (features/learn/lazy-chunk.test.ts). This stub is all Today's entry carries: the maths, the catalogue, the cycles
// file and its parser load with `./red-day-model` on the first question.
import type { CalendarDate, CoinId, CurrencyCode, Entry, Percent, Plan, RedDayEpisode } from '@proofofcalm/core';
import type { HistorySource } from '../ports';

export type RedDayInput = { readonly plan: Plan; readonly entries: readonly Entry[]; readonly today: CalendarDate };

/** The figures of the held portfolio at today's units over the complete closes (docs/DOMAIN.md §3.11). */
export type RedDayFigure = {
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
  readonly state: 'nothing-held' | 'failed' | 'clear' | 'episode';
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

/** A completed cycle's fall from packages/content, intraday high to intraday low in positive whole percent, USD. */
export type PastFall = {
  readonly coin: CoinId;
  readonly high: CalendarDate;
  readonly low: CalendarDate;
  readonly fall: Percent;
  readonly publisher: string;
};

export type RedDayPort = {
  /** Never rejects for a read: a failed read is the state 'failed'. */
  model(input: RedDayInput): Promise<RedDayModel>;
  /** The cycles file's rows of each coin passed, in that order. */
  pastFalls(coins: readonly CoinId[]): Promise<readonly PastFall[]>;
};

export function createRedDay(history: HistorySource): RedDayPort {
  const maths = () => import('./red-day-model');
  return {
    model: async (input) => (await maths()).redDayModel(history, input),
    pastFalls: async (coins) => (await maths()).pastFalls(coins),
  };
}
