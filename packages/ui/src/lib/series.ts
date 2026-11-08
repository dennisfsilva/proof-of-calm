// Colour follows the entity (docs/DESIGN.md §4, ADR-0022): the four coins have fixed colours, any other
// coin takes the next extended slot in the plan's coin order, never cycled, and folds into "other" once
// the slots run out. Classes are written out in full so Tailwind generates them, and no inline style is
// needed: the CSP has no 'unsafe-inline' for styles (docs/SECURITY.md §4).

export const SERIES_COLOURS = [
  'btc',
  'eth',
  'sol',
  'link',
  'magenta',
  'purple',
  'olive',
  'rose',
  'brown',
  'steel',
  'other',
] as const;

export type SeriesColour = (typeof SERIES_COLOURS)[number];

const FIXED: Readonly<Record<string, SeriesColour>> = { BTC: 'btc', ETH: 'eth', SOL: 'sol', LINK: 'link' };
const EXTENDED = ['magenta', 'purple', 'olive', 'rose', 'brown', 'steel'] as const;

/**
 * The identity colour of a coin. `otherIndex` is the coin's position among the plan's coins that have
 * no fixed colour (0 for the first such coin).
 */
export function coinColour(coin: string, otherIndex: number): SeriesColour {
  return FIXED[coin.toUpperCase()] ?? EXTENDED[otherIndex] ?? 'other';
}

/** Fill classes for dots, swatches and bars. */
export const SERIES_FILL: Readonly<Record<SeriesColour, string>> = {
  btc: 'fill-coin-btc bg-coin-btc',
  eth: 'fill-coin-eth bg-coin-eth',
  sol: 'fill-coin-sol bg-coin-sol',
  link: 'fill-coin-link bg-coin-link',
  magenta: 'fill-coin-magenta bg-coin-magenta',
  purple: 'fill-coin-purple bg-coin-purple',
  olive: 'fill-coin-olive bg-coin-olive',
  rose: 'fill-coin-rose bg-coin-rose',
  brown: 'fill-coin-brown bg-coin-brown',
  steel: 'fill-coin-steel bg-coin-steel',
  other: 'fill-coin-other bg-coin-other',
};

/** Stroke classes for lines and markers. */
export const SERIES_STROKE: Readonly<Record<SeriesColour, string>> = {
  btc: 'stroke-coin-btc',
  eth: 'stroke-coin-eth',
  sol: 'stroke-coin-sol',
  link: 'stroke-coin-link',
  magenta: 'stroke-coin-magenta',
  purple: 'stroke-coin-purple',
  olive: 'stroke-coin-olive',
  rose: 'stroke-coin-rose',
  brown: 'stroke-coin-brown',
  steel: 'stroke-coin-steel',
  other: 'stroke-coin-other',
};
