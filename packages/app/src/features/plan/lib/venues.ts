import {
  type CalendarDate,
  type CoinId,
  coinsWithEntries,
  compareDates,
  type Entry,
  isEstimate,
  liveEntries,
  type Plan,
  type VenueUnits,
  venueUnits,
} from '@proofofcalm/core';

// The review page's units per venue (docs/DOMAIN.md §3.12; ADR-0039, the yearly review's comparison): for each coin
// held at the end of `today`, in the portfolio's coin order, the units the Log shows at each venue (`venueUnits`: per
// venue, first in, first out, read through `heldLots`, so they add up to the units held). A coin with none left is
// left out. `estimated` counts the same entries `venueUnits` reads (live, the coin's, dated on or before `today`) that
// the one-tap fill estimated (`isEstimate`). Nothing here is typed, stored or written.

/** The fixed decimals of a coin's units: the plan's, or 8 for a coin the plan does not hold, as Portfolio's. */
const UNIT_DECIMALS = 8;

export type CoinVenues = {
  readonly coin: CoinId;
  readonly decimals: number;
  readonly venues: readonly VenueUnits[];
  readonly estimated: number;
};

export function reviewVenues(plan: Plan, entries: readonly Entry[], today: CalendarDate): readonly CoinVenues[] {
  const live = liveEntries(entries);
  const upTo = live.filter((entry) => compareDates(entry.date, today) <= 0);
  return coinsWithEntries(plan, live).flatMap((coin) => {
    const venues = venueUnits(upTo, coin, today);
    if (venues.length === 0) return [];
    const decimals = plan.coins.find((one) => one.id === coin)?.decimals ?? UNIT_DECIMALS;
    const estimated = upTo.filter((entry) => entry.coin === coin && isEstimate(entry)).length;
    return [{ coin, decimals, venues, estimated }];
  });
}
