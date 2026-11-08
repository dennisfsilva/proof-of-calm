'use client';

import { Tooltip as TooltipPrimitive } from '@base-ui/react/tooltip';
import type { WithClassName } from '#lib/types';
import { cn } from '#lib/utils';

// shadcn's base-nova Tooltip on Base UI, restyled (docs/DESIGN.md §6 and §8): a short label in the
// inverse of the page (ink with background text), radius sm, fading in 180 ms. A visual aid only: an
// icon button carries the same words as its aria-label, and a chart says everything in its table, so
// nothing depends on hovering. Base UI opens it on mouse hover and keyboard focus, not on touch.

const TooltipProvider = TooltipPrimitive.Provider;

function Tooltip(props: TooltipPrimitive.Root.Props) {
  return <TooltipPrimitive.Root data-slot="tooltip" {...props} />;
}

function TooltipTrigger(props: TooltipPrimitive.Trigger.Props) {
  return <TooltipPrimitive.Trigger data-slot="tooltip-trigger" {...props} />;
}

type TooltipContentProps = WithClassName<TooltipPrimitive.Popup.Props> &
  Pick<TooltipPrimitive.Positioner.Props, 'align' | 'alignOffset' | 'side' | 'sideOffset' | 'anchor'>;

function TooltipContent({
  className,
  side = 'top',
  sideOffset = 8,
  align = 'center',
  alignOffset = 0,
  anchor,
  ...props
}: TooltipContentProps) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Positioner
        side={side}
        sideOffset={sideOffset}
        align={align}
        alignOffset={alignOffset}
        {...(anchor === undefined ? {} : { anchor })}
        className="isolate z-50"
      >
        <TooltipPrimitive.Popup
          data-slot="tooltip-content"
          className={cn(
            'nums max-w-xs rounded-sm bg-ink px-2 py-1 text-13 text-background transition-opacity duration-(--duration-base) ease-enter data-ending-style:opacity-0 data-starting-style:opacity-0 data-instant:duration-(--duration-fast)',
            className,
          )}
          {...props}
        />
      </TooltipPrimitive.Positioner>
    </TooltipPrimitive.Portal>
  );
}

export { Tooltip, TooltipContent, type TooltipContentProps, TooltipProvider, TooltipTrigger };
