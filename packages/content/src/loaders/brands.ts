// The core brands its dates, tickers and decimals (packages/core/src/schema), and the dependency rule lets
// this package import the core's types only, never its runtime. The content schemas check the same
// patterns, `pnpm validate:content` runs them over every file in CI, and the tests parse every loaded value
// with the core's own schemas, so the loaders assert the brands here instead of parsing again on every
// device: the app ships the data, not a second copy of the checks.
import type { CalendarDate, CoinId, Percent } from '@proofofcalm/core';

export const asDate = (value: string) => value as CalendarDate;
export const asCoinId = (value: string) => value as CoinId;
export const asPercent = (value: string) => value as Percent;
