import type { ReactNode } from 'react';
import { SERIES_FILL, type SeriesColour } from '#lib/series';
import { cn } from '#lib/utils';

// The coin chip (docs/DESIGN.md §8): the coin's identity dot, its ticker and an amount, as on Today's
// primary action. The ticker always names the coin, so the dot's colour is never the only cue.

type CoinChipProps = {
  coin: string;
  colour: SeriesColour;
  /** Already formatted by the shell, such as "70 €". */
  amount?: ReactNode;
  className?: string;
};

function CoinChip({ coin, colour, amount, className }: CoinChipProps) {
  return (
    <span
      data-slot="coin-chip"
      className={cn(
        'inline-flex items-center gap-2 whitespace-nowrap rounded-full border border-line-2 px-3 py-1 text-14 text-ink-2',
        className,
      )}
    >
      <span aria-hidden className={cn('size-2 shrink-0 rounded-full', SERIES_FILL[colour])} />
      <span>{coin}</span>
      {amount !== undefined && <span className="nums font-medium text-ink">{amount}</span>}
    </span>
  );
}

export { CoinChip, type CoinChipProps };
