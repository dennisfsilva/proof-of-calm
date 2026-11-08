'use client';

import { Collapsible as CollapsiblePrimitive } from '@base-ui/react/collapsible';
import { ChevronDownIcon } from 'lucide-react';
import { useHydrated } from '#lib/hydrated';
import type { WithClassName } from '#lib/types';
import { cn } from '#lib/utils';

// shadcn's base-nova Collapsible on Base UI, restyled (docs/DESIGN.md §6 and §8), for the log form's
// "more" section: a 44 px trigger whose chevron turns, and a panel that opens to its height in 180 ms
// (1 ms with reduced motion). Base UI ties the trigger to the panel (aria-expanded, aria-controls).

function Collapsible({ className, ...props }: WithClassName<CollapsiblePrimitive.Root.Props>) {
  return <CollapsiblePrimitive.Root data-slot="collapsible" className={cn('flex flex-col', className)} {...props} />;
}

function CollapsibleTrigger({ className, children, ...props }: WithClassName<CollapsiblePrimitive.Trigger.Props>) {
  return (
    <CollapsiblePrimitive.Trigger
      data-slot="collapsible-trigger"
      // The padding keeps the focus ring off the letters; the equal negative margin keeps the label on
      // the left edge of the step around it, so the row moves nothing in the closed layout. Positioned
      // (z-index auto, no stacking context), it paints above the open panel, whose negative margin
      // reaches under its bottom edge when the root has no gap, so the panel never takes its taps.
      className={cn(
        'group relative -mx-2 inline-flex min-h-target w-fit cursor-pointer items-center gap-2 rounded-md px-2 text-left text-16 text-ink-2 transition-colors duration-(--duration-fast) ease-enter hover:text-ink data-disabled:cursor-not-allowed data-disabled:text-ink-3 data-panel-open:text-ink',
        className,
      )}
      {...props}
    >
      {/* A button centres its text by default; the step around the trigger is left-aligned. A label that
          wraps at phone width balances its lines, so no word stands alone on the second (text-wrap). */}
      <span className="text-balance">{children}</span>
      <ChevronDownIcon
        aria-hidden
        strokeWidth={1.75}
        className="size-5 shrink-0 transition-transform duration-(--duration-base) ease-enter group-data-panel-open:rotate-180"
      />
    </CollapsiblePrimitive.Trigger>
  );
}

/**
 * Rendered on the client only (lib/hydrated.ts): an open panel carries Base UI's inline size
 * variables. A closed one renders nothing on the server either, so only an initially open panel waits.
 * Without a script it never arrives: for client-rendered app screens only, never on the script-free
 * site pages (lib/hydrated.ts, docs/DESIGN.md §8).
 */
function CollapsibleContent({ className, ...props }: WithClassName<CollapsiblePrimitive.Panel.Props>) {
  const hydrated = useHydrated();
  if (!hydrated) return null;
  return (
    <CollapsiblePrimitive.Panel
      data-slot="collapsible-content"
      // The height animation needs the clip, which cuts at the padding box: padding of the focus ring's
      // extent keeps every field's ring inside it, and the equal negative margin keeps the fields on the
      // root's edges, so the panel moves nothing in the layout (docs/DESIGN.md §6).
      className={cn(
        '-m-[calc(var(--focus-offset)+var(--focus-width))] h-(--collapsible-panel-height) overflow-hidden p-[calc(var(--focus-offset)+var(--focus-width))] transition-[height] duration-(--duration-base) ease-enter data-ending-style:h-0 data-starting-style:h-0 data-ending-style:ease-exit [&[hidden]:not([hidden=until-found])]:hidden',
        className,
      )}
      {...props}
    />
  );
}

export { Collapsible, CollapsibleContent, CollapsibleTrigger };
