import { Toggle } from '@base-ui/react/toggle';
import { CheckIcon } from 'lucide-react';
import type { WithClassName } from '#lib/types';
import { cn } from '#lib/utils';

// The circle toggle for the sell parts (docs/DESIGN.md §8, the prototype's tranche circles): Base UI's
// Toggle, a button with aria-pressed, drawn as a 20 px circle in a 44 px target. Done is the ink fill
// with a check, so the mark says it, not the colour. The part's own text sits beside it; the toggle
// needs a name all the same ("Part 1 sold"), which the types require.

type CircleToggleProps = WithClassName<Toggle.Props> & ({ 'aria-label': string } | { 'aria-labelledby': string });

function CircleToggle({ className, ...props }: CircleToggleProps) {
  return (
    <Toggle
      data-slot="circle-toggle"
      className={cn(
        'group inline-flex size-target shrink-0 cursor-pointer items-center justify-center rounded-full data-disabled:cursor-not-allowed data-disabled:opacity-50',
        className,
      )}
      {...props}
    >
      <span
        data-slot="circle-toggle-circle"
        className="flex size-5 items-center justify-center rounded-full border-2 border-line-2 text-background transition-colors duration-(--duration-fast) ease-enter group-hover:border-ink group-data-pressed:border-ink group-data-pressed:bg-ink"
      >
        <CheckIcon aria-hidden strokeWidth={3} className="invisible size-3.5 group-data-pressed:visible" />
      </span>
    </Toggle>
  );
}

export { CircleToggle, type CircleToggleProps };
