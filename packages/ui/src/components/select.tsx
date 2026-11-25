'use client';

import { CSPProvider } from '@base-ui/react/csp-provider';
import { Select as SelectPrimitive } from '@base-ui/react/select';
import { CheckIcon, ChevronDownIcon, ChevronUpIcon } from 'lucide-react';
import { type ComponentProps, createContext, use, useLayoutEffect, useRef, useState } from 'react';
import type { WithClassName } from '#lib/types';
import { cn } from '#lib/utils';

// shadcn's base-nova Select on the tokens (docs/DESIGN.md §6 and §8): the trigger matches the Input, the
// popup is an overlay (surface with a shadow in light, surface-2 with a line-2 border in dark), every
// option is a 44 px target and the selected one carries a check, not only a colour. Base UI's inline
// <style> for its scrollbar class is off, as the hashed CSP refuses it (docs/SECURITY.md §4); globals.css
// holds the rule. The provider's context crosses the portal, so it covers the popup.
// The popup keeps clear of the phone tab bar (TabBar, below 48rem): Base UI's layout that aligns the selected item with
// the trigger reads the positioner's bottom margin, and the one that places it beside the trigger takes a collision
// padding in pixels, the tab bar's spacer measured as the popup opens (it hid an option at zoom-125, 2026-11-25).
// The margin is set only when the aligned list would reach the bar: Base UI's layout adds it to the list's height as
// well as taking it from the viewport, so a margin the list does not need lifts it off its trigger (2026-11-25).

const BottomBar = createContext(0);
const bottomBar = () => document.querySelector<HTMLElement>('[data-slot="tab-bar"]')?.offsetHeight ?? 0;

/** Whether the list, its selected option (or its first) centred on the trigger, would end below the bar's top. */
function reachesBar(positioner: HTMLElement, bar: number): boolean {
  if (bar === 0) return false;
  const doc = positioner.ownerDocument;
  const trigger = doc.querySelector('[data-slot="select-trigger"][aria-expanded="true"]');
  const popup = positioner.querySelector<HTMLElement>('[data-slot="select-content"]');
  const item =
    popup?.querySelector<HTMLElement>('[data-slot="select-item"][data-selected]') ??
    popup?.querySelector<HTMLElement>('[data-slot="select-item"]');
  if (!trigger || !popup || !item || popup.offsetHeight === 0) return true;
  const box = trigger.getBoundingClientRect();
  const below = popup.offsetHeight - item.offsetTop - item.offsetHeight / 2;
  return box.top + box.height / 2 + below > doc.documentElement.clientHeight - bar;
}

/**
 * The positioner's element, given the bar's margin only when the list would reach the bar. It measures in the commit
 * that shows the list, before Floating UI's first pass lets Base UI's layout read the margin.
 */
function BarPositioner({
  open,
  bar,
  ref,
  className,
  ...props
}: ComponentProps<'div'> & { open: boolean; bar: number }) {
  const own = useRef<HTMLDivElement | null>(null);
  const [clear, setClear] = useState(true);
  useLayoutEffect(() => {
    if (open && own.current !== null) setClear(reachesBar(own.current, bar));
  }, [open, bar]);
  return (
    <div
      {...props}
      ref={(node) => {
        own.current = node;
        if (typeof ref === 'function') return ref(node);
        if (ref) ref.current = node;
      }}
      className={cn(className, clear && 'mb-(--bottom-bar)')}
    />
  );
}

function Select<Value, Multiple extends boolean | undefined = false>({
  onOpenChange,
  ...props
}: SelectPrimitive.Root.Props<Value, Multiple>) {
  const [bottom, setBottom] = useState(0);
  return (
    <CSPProvider disableStyleElements>
      <BottomBar value={bottom}>
        <SelectPrimitive.Root<Value, Multiple>
          {...props}
          onOpenChange={(open, details) => {
            if (open) setBottom(bottomBar());
            onOpenChange?.(open, details);
          }}
        />
      </BottomBar>
    </CSPProvider>
  );
}

function SelectLabel({ className, ...props }: WithClassName<SelectPrimitive.Label.Props>) {
  return (
    <SelectPrimitive.Label
      data-slot="select-label"
      className={cn('font-medium text-14 text-ink', className)}
      {...props}
    />
  );
}

function SelectTrigger({ className, children, ...props }: WithClassName<SelectPrimitive.Trigger.Props>) {
  return (
    <SelectPrimitive.Trigger
      data-slot="select-trigger"
      className={cn(
        'flex min-h-target w-full cursor-pointer items-center justify-between gap-2 rounded-md border border-line-2 bg-surface-2 px-3 text-left text-16 text-ink transition-colors duration-(--duration-fast) ease-enter data-disabled:cursor-not-allowed data-disabled:border-line data-invalid:border-negative data-disabled:text-ink-3 data-placeholder:text-ink-2',
        className,
      )}
      {...props}
    >
      {children}
      <SelectPrimitive.Icon render={<ChevronDownIcon aria-hidden className="size-5 shrink-0 text-ink-2" />} />
    </SelectPrimitive.Trigger>
  );
}

function SelectValue({ className, ...props }: WithClassName<SelectPrimitive.Value.Props>) {
  return <SelectPrimitive.Value data-slot="select-value" className={cn('flex-1 truncate', className)} {...props} />;
}

type SelectContentProps = WithClassName<SelectPrimitive.Popup.Props> &
  Pick<SelectPrimitive.Positioner.Props, 'align' | 'alignOffset' | 'side' | 'sideOffset' | 'alignItemWithTrigger'>;

function SelectContent({
  className,
  children,
  side = 'bottom',
  sideOffset = 4,
  align = 'start',
  alignOffset = 0,
  alignItemWithTrigger = true,
  ...props
}: SelectContentProps) {
  // Base UI's default padding of 5 px on every side, the tab bar's height added at the bottom.
  const bar = use(BottomBar);
  const bottom = bar + 5;
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Positioner
        render={(positioner, { open }) => <BarPositioner {...positioner} open={open} bar={bar} />}
        side={side}
        sideOffset={sideOffset}
        align={align}
        alignOffset={alignOffset}
        alignItemWithTrigger={alignItemWithTrigger}
        collisionPadding={{ top: 5, right: 5, bottom, left: 5 }}
        className="isolate z-50"
      >
        <SelectPrimitive.Popup
          data-slot="select-content"
          className={cn(
            'relative max-h-(--available-height) min-w-(--anchor-width) origin-(--transform-origin) overflow-y-auto rounded-md border border-overlay-border bg-overlay p-1 text-ink shadow-overlay transition-[opacity,scale] duration-(--duration-base) ease-enter data-ending-style:scale-95 data-starting-style:scale-95 data-ending-style:opacity-0 data-starting-style:opacity-0 data-ending-style:ease-exit',
            className,
          )}
          {...props}
        >
          <SelectPrimitive.ScrollUpArrow className="flex w-full items-center justify-center bg-overlay py-1 text-ink-2">
            <ChevronUpIcon aria-hidden className="size-5" />
          </SelectPrimitive.ScrollUpArrow>
          <SelectPrimitive.List>{children}</SelectPrimitive.List>
          <SelectPrimitive.ScrollDownArrow className="flex w-full items-center justify-center bg-overlay py-1 text-ink-2">
            <ChevronDownIcon aria-hidden className="size-5" />
          </SelectPrimitive.ScrollDownArrow>
        </SelectPrimitive.Popup>
      </SelectPrimitive.Positioner>
    </SelectPrimitive.Portal>
  );
}

function SelectItem({ className, children, ...props }: WithClassName<SelectPrimitive.Item.Props>) {
  return (
    <SelectPrimitive.Item
      data-slot="select-item"
      className={cn(
        'relative flex min-h-target w-full cursor-default select-none items-center gap-2 rounded-sm py-2 pr-10 pl-3 text-16 text-ink data-highlighted:bg-surface-3 data-disabled:text-ink-3',
        className,
      )}
      {...props}
    >
      <SelectPrimitive.ItemText className="flex-1">{children}</SelectPrimitive.ItemText>
      <SelectPrimitive.ItemIndicator className="absolute right-3 flex items-center">
        <CheckIcon aria-hidden className="size-5" />
      </SelectPrimitive.ItemIndicator>
    </SelectPrimitive.Item>
  );
}

function SelectGroup({ className, ...props }: WithClassName<SelectPrimitive.Group.Props>) {
  return <SelectPrimitive.Group data-slot="select-group" className={cn('py-1', className)} {...props} />;
}

function SelectGroupLabel({ className, ...props }: WithClassName<SelectPrimitive.GroupLabel.Props>) {
  return (
    <SelectPrimitive.GroupLabel
      data-slot="select-group-label"
      className={cn('px-3 py-1 text-13 text-ink-2', className)}
      {...props}
    />
  );
}

function SelectSeparator({ className, ...props }: WithClassName<SelectPrimitive.Separator.Props>) {
  return (
    <SelectPrimitive.Separator data-slot="select-separator" className={cn('my-1 h-px bg-line', className)} {...props} />
  );
}

export {
  Select,
  SelectContent,
  SelectGroup,
  SelectGroupLabel,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
};
