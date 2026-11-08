// The display-currency ratio (docs/DOMAIN.md §3.11), ported from the prototype's fx(). It converts what
// is shown when the user switches the display currency, never what is stored.
import type { CurrencyCode } from '../money/currency';
import { type Ratio, ratio } from '../money/decimal';
import { priceIn } from '../portfolio/portfolio';
import type { CoinId } from '../schema/ids';
import type { PriceSnapshot } from '../schema/prices';

const FX_DP = 12;

/** Units of `to` per unit of `from`, implied by the first of `coins` priced in both; null when none is. */
export function fxRatio(
  snapshot: PriceSnapshot | null,
  from: CurrencyCode,
  to: CurrencyCode,
  coins: readonly CoinId[],
): Ratio | null {
  if (from === to) return '1' as Ratio;
  for (const coin of coins) {
    const base = priceIn(snapshot, coin, from);
    const quote = priceIn(snapshot, coin, to);
    if (base !== null && quote !== null) return ratio(quote, base, FX_DP);
  }
  return null;
}
