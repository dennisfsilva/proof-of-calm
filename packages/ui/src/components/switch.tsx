'use client';

import { Switch as SwitchPrimitive } from '@base-ui/react/switch';
import { useHydrated } from '#lib/hydrated';
import type { WithClassName } from '#lib/types';
import { cn } from '#lib/utils';

// shadcn's base-nova Switch on Base UI, restyled (docs/DESIGN.md §6 and §8): a 52 × 44 target around a
// 44 × 24 track. On is the ink fill with the thumb on the right, so the thumb's place says it, not the
// colour alone; the accent stays for "now". Label it with an enclosing <label> or a Field.

const rootClasses =
  'group inline-flex h-target w-13 shrink-0 cursor-pointer items-center justify-center rounded-full data-disabled:cursor-not-allowed data-disabled:opacity-50';
const trackClasses =
  'flex h-6 w-11 items-center rounded-full border border-line-2 bg-surface-2 p-0.5 transition-colors duration-(--duration-fast) ease-enter group-data-checked:border-ink group-data-checked:bg-ink';
const thumbClasses =
  'size-4.5 rounded-full bg-ink-2 transition-[translate,background-color] duration-(--duration-fast) ease-enter data-checked:translate-x-5 data-checked:bg-background';

type SwitchProps = WithClassName<SwitchPrimitive.Root.Props>;

function Switch(props: SwitchProps) {
  const hydrated = useHydrated();
  if (!hydrated) return <SwitchLookalike {...props} />;
  const { className, ...rest } = props;
  return (
    <SwitchPrimitive.Root data-slot="switch" className={cn(rootClasses, className)} {...rest}>
      <span data-slot="switch-track" className={trackClasses}>
        <SwitchPrimitive.Thumb data-slot="switch-thumb" className={thumbClasses} />
      </span>
    </SwitchPrimitive.Root>
  );
}

/** The server's picture of the switch (lib/hydrated.ts): the same boxes and state, no hidden input. */
function SwitchLookalike({ className, checked, defaultChecked = false, disabled = false }: SwitchProps) {
  const state = { [(checked ?? defaultChecked) ? 'data-checked' : 'data-unchecked']: '' };
  return (
    <span
      data-slot="switch"
      aria-hidden
      data-disabled={disabled ? '' : undefined}
      className={cn(rootClasses, className)}
      {...state}
    >
      <span data-slot="switch-track" className={trackClasses}>
        <span data-slot="switch-thumb" className={thumbClasses} {...state} />
      </span>
    </span>
  );
}

export { Switch, type SwitchProps };
