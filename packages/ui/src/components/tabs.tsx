'use client';

import { Tabs as TabsPrimitive } from '@base-ui/react/tabs';
import type { WithClassName } from '#lib/types';
import { cn } from '#lib/utils';

// shadcn's base-nova Tabs on the tokens, for Settings (docs/DESIGN.md §8): 44 px tabs on a hairline; the
// active tab is marked by weight, ink and an underline, never by colour alone. The list never scrolls:
// the tabs share its width and a long label wraps onto a second line, so four tabs fit 360 px at 125 %
// text. The list is padded by the focus ring's extent (§6) so a focused tab's whole ring lies inside it,
// and the underline reaches down through that padding to sit on the hairline as before.

function Tabs({ className, ...props }: WithClassName<TabsPrimitive.Root.Props>) {
  return <TabsPrimitive.Root data-slot="tabs" className={cn('flex flex-col gap-stack-md', className)} {...props} />;
}

function TabsList({ className, ...props }: WithClassName<TabsPrimitive.List.Props>) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      className={cn(
        'flex w-full gap-1 border-line border-b p-[calc(var(--focus-offset)+var(--focus-width))]',
        className,
      )}
      {...props}
    />
  );
}

function TabsTrigger({ className, ...props }: WithClassName<TabsPrimitive.Tab.Props>) {
  return (
    <TabsPrimitive.Tab
      data-slot="tabs-trigger"
      className={cn(
        'relative inline-flex min-h-target min-w-0 flex-1 cursor-pointer items-center justify-center whitespace-normal text-balance px-2 text-center text-16 text-ink-2 transition-colors duration-(--duration-fast) ease-enter after:absolute after:inset-x-0 after:bottom-[calc(-1*(var(--focus-offset)+var(--focus-width)))] after:h-0.5 after:bg-transparent hover:text-ink data-disabled:cursor-not-allowed data-active:font-medium data-active:text-ink data-disabled:text-ink-3 data-active:after:bg-ink',
        className,
      )}
      {...props}
    />
  );
}

function TabsContent({ className, ...props }: WithClassName<TabsPrimitive.Panel.Props>) {
  return <TabsPrimitive.Panel data-slot="tabs-content" className={cn('text-16', className)} {...props} />;
}

export { Tabs, TabsContent, TabsList, TabsTrigger };
