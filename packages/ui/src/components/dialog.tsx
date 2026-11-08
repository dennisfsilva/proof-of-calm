'use client';

import { Dialog as DialogPrimitive } from '@base-ui/react/dialog';
import { XIcon } from 'lucide-react';
import type { ComponentProps } from 'react';
import { ModalLayer } from '#lib/modal-layer';
import type { WithClassName } from '#lib/types';
import { cn } from '#lib/utils';
import { Button } from './button';

// shadcn's base-nova Dialog on the tokens (docs/DESIGN.md §6): a centred overlay on the scrim, radius lg,
// 240 ms in and out (1 ms with reduced motion). Base UI traps focus and restores it on close. While it is
// open, the toast under its scrim holds its window (lib/modal-layer.ts); the Sheet does the same.

function Dialog(props: DialogPrimitive.Root.Props) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />;
}

function DialogTrigger(props: DialogPrimitive.Trigger.Props) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />;
}

function DialogClose(props: DialogPrimitive.Close.Props) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />;
}

function DialogOverlay({ className, ...props }: WithClassName<DialogPrimitive.Backdrop.Props>) {
  return (
    <DialogPrimitive.Backdrop
      data-slot="dialog-overlay"
      className={cn(
        'fixed inset-0 z-50 bg-scrim transition-opacity duration-(--duration-slow) ease-enter data-ending-style:opacity-0 data-starting-style:opacity-0',
        className,
      )}
      {...props}
    />
  );
}

type DialogContentProps = WithClassName<DialogPrimitive.Popup.Props> & {
  /** The accessible name of the close button; omit it to leave the closing to the content. */
  closeLabel?: string;
};

function DialogContent({ className, children, closeLabel, ...props }: DialogContentProps) {
  return (
    <DialogPrimitive.Portal data-slot="dialog-portal">
      <DialogOverlay />
      <DialogPrimitive.Popup
        data-slot="dialog-content"
        className={cn(
          'fixed top-1/2 left-1/2 z-50 grid w-[calc(100%-2*var(--gutter))] max-w-md -translate-x-1/2 -translate-y-1/2 gap-stack-md rounded-lg border border-overlay-border bg-overlay p-inset-lg text-ink shadow-overlay transition-[opacity,scale] duration-(--duration-slow) ease-enter data-ending-style:scale-95 data-starting-style:scale-95 data-ending-style:opacity-0 data-starting-style:opacity-0 data-ending-style:ease-exit',
          className,
        )}
        {...props}
      >
        <ModalLayer />
        {children}
        {closeLabel !== undefined && (
          <DialogPrimitive.Close
            data-slot="dialog-close"
            aria-label={closeLabel}
            render={<Button variant="ghost" size="icon" className="absolute top-2 right-2" />}
          >
            <XIcon aria-hidden />
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Popup>
    </DialogPrimitive.Portal>
  );
}

function DialogHeader({ className, ...props }: ComponentProps<'div'>) {
  return <div data-slot="dialog-header" className={cn('flex flex-col gap-stack-xs pr-target', className)} {...props} />;
}

function DialogFooter({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn('flex flex-col gap-target-gap sm:flex-row sm:justify-end', className)}
      {...props}
    />
  );
}

function DialogTitle({ className, ...props }: WithClassName<DialogPrimitive.Title.Props>) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn('font-semibold text-20 tracking-heading', className)}
      {...props}
    />
  );
}

function DialogDescription({ className, ...props }: WithClassName<DialogPrimitive.Description.Props>) {
  return (
    <DialogPrimitive.Description data-slot="dialog-description" className={cn('text-ink-2', className)} {...props} />
  );
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogTitle,
  DialogTrigger,
};
