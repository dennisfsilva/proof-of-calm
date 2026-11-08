// The coin catalogue (packages/content/coins.json): what the coin picker offers and what the price route
// quotes (ADR-0036). Listed by ticker, a neutral order that ranks no coin. The file carries no colours: the
// chart palette follows the plan's coin order (docs/DESIGN.md §4), and `Coin.color` is the user's override.
import type { Coin } from '@proofofcalm/core';
import catalogue from '../../coins.json' with { type: 'json' };
import { asCoinId } from './brands.ts';

export const COINS: readonly Coin[] = catalogue.map((coin) => ({ ...coin, id: asCoinId(coin.id) }));
