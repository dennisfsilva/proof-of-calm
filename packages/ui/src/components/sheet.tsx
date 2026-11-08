'use client';

import { Dialog as SheetPrimitive } from '@base-ui/react/dialog';
import { cva, type VariantProps } from 'class-variance-authority';
import { XIcon } from 'lucide-react';
import type { ComponentProps } from 'react';
import { ModalLayer } from '#lib/modal-layer';
import type { WithClassName } from '#lib/types';
import { cn } from '#lib/utils';
import { Button } from './button';

// shadcn's base-nova Sheet on the tokens (docs/DESIGN.md §6 to §8): a dialog that slides in, for the
// "Why?" modules and the forms. It floats a step off the edges so every corner keeps the same radius,
// respects the home-indicator inset, and scrolls inside when it is taller than the screen. Its scroll
// padding is the focus ring's extent and a pixel for the whole-pixel scroll offsets, so a field scrolled
// into view stops with its whole ring inside the popup, which clips it (docs/DESIGN.md §6).

function Sheet(props: SheetPrimitive.Root.Props) {
  return <SheetPrimitive.Root data-slot="sheet" {...props} />;
}

function SheetTrigger(props: SheetPrimitive.Trigger.Props) {
  return <SheetPrimitive.Trigger data-slot="sheet-trigger" {...props} />;
}

function SheetClose(props: SheetPrimitive.Close.Props) {
  return <SheetPrimitive.Close data-slot="sheet-close" {...props} />;
}

const sheetVariants = cva(
  'fixed z-50 flex scroll-p-[calc(var(--focus-offset)+var(--focus-width)+1px)] flex-col gap-stack-md overflow-y-auto rounded-lg border border-overlay-border bg-overlay p-inset-lg text-ink shadow-overlay transition-[opacity,translate] duration-(--duration-slow) ease-enter data-ending-style:opacity-0 data-starting-style:opacity-0 data-ending-style:ease-exit',
  {
    variants: {
      side: {
        /** Bottom on phones, a side panel from 640 px (docs/DESIGN.md §8). */
        responsive:
          'inset-x-2 bottom-[calc(var(--space-unit)*2+env(safe-area-inset-bottom))] max-h-[85dvh] data-ending-style:translate-y-8 data-starting-style:translate-y-8 sm:top-2 sm:right-2 sm:bottom-2 sm:left-auto sm:max-h-none sm:w-full sm:max-w-md sm:data-ending-style:translate-x-8 sm:data-starting-style:translate-x-8 sm:data-ending-style:translate-y-0 sm:data-starting-style:translate-y-0',
        bottom:
          'inset-x-2 bottom-[calc(var(--space-unit)*2+env(safe-area-inset-bottom))] max-h-[85dvh] data-ending-style:translate-y-8 data-starting-style:translate-y-8',
        right:
          'top-2 right-2 bottom-2 w-[calc(100%-var(--space-unit)*4)] max-w-md data-ending-style:translate-x-8 data-starting-style:translate-x-8',
      },
    },
    defaultVariants: { side: 'responsive' },
  },
);

type SheetContentProps = WithClassName<SheetPrimitive.Popup.Props> &
  VariantProps<typeof sheetVariants> & {
    /** The accessible name of the close button; omit it to leave the closing to the content. */
    closeLabel?: string;
  };

function SheetContent({ className, children, side, closeLabel, ...props }: SheetContentProps) {
  return (
    <SheetPrimitive.Portal data-slot="sheet-portal">
      <SheetPrimitive.Backdrop
        data-slot="sheet-overlay"
        className="fixed inset-0 z-50 bg-scrim transition-opacity duration-(--duration-slow) ease-enter data-ending-style:opacity-0 data-starting-style:opacity-0"
      />
      <SheetPrimitive.Popup data-slot="sheet-content" className={cn(sheetVariants({ side }), className)} {...props}>
        <ModalLayer />
        {children}
        {closeLabel !== undefined && (
          <SheetPrimitive.Close
            data-slot="sheet-close"
            aria-label={closeLabel}
            render={<Button variant="ghost" size="icon" className="absolute top-2 right-2" />}
          >
            <XIcon aria-hidden />
          </SheetPrimitive.Close>
        )}
      </SheetPrimitive.Popup>
    </SheetPrimitive.Portal>
  );
}

function SheetHeader({ className, ...props }: ComponentProps<'div'>) {
  return <div data-slot="sheet-header" className={cn('flex flex-col gap-stack-xs pr-target', className)} {...props} />;
}

function SheetFooter({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      data-slot="sheet-footer"
      className={cn('mt-auto flex flex-col-reverse gap-target-gap sm:flex-row sm:justify-end', className)}
      {...props}
    />
  );
}

function SheetTitle({ className, ...props }: WithClassName<SheetPrimitive.Title.Props>) {
  return (
    <SheetPrimitive.Title
      data-slot="sheet-title"
      className={cn('font-semibold text-20 tracking-heading', className)}
      {...props}
    />
  );
}

function SheetDescription({ className, ...props }: WithClassName<SheetPrimitive.Description.Props>) {
  return (
    <SheetPrimitive.Description data-slot="sheet-description" className={cn('text-ink-2', className)} {...props} />
  );
}

export { Sheet, SheetClose, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle, SheetTrigger };
