'use client';

import { Toggle } from '@base-ui/react/toggle';
import { ToggleGroup } from '@base-ui/react/toggle-group';
import { type ReactNode, useState } from 'react';
import { cn } from '#lib/utils';

// The range selector, the currency toggle and the entry sheet's choice of kinds (docs/DESIGN.md §8) on
// Base UI's ToggleGroup: a group of pressed-state buttons, exactly one pressed. Pressing the pressed one
// again keeps it, unlike a plain toggle group, which would leave nothing selected. Each option is a 44 px
// target. By default the group hugs its options; stretched, it spans its container and each option takes
// its label's width plus an equal share of the rest, its label wrapping onto a balanced line only when
// that share is too narrow (as the Tabs do).

type SegmentedControlProps<Value extends string> = {
  /** Names the group, such as "Chart range". */
  'aria-label': string;
  options: readonly { readonly value: Value; readonly label: ReactNode }[];
  value?: Value;
  defaultValue?: Value;
  onValueChange?: (value: Value) => void;
  disabled?: boolean;
  /** Spans the container, the options sharing its width, so a long set fits a narrow sheet. */
  stretch?: boolean;
  className?: string;
};

function SegmentedControl<Value extends string>({
  options,
  value,
  defaultValue,
  onValueChange,
  disabled = false,
  stretch = false,
  className,
  'aria-label': label,
}: SegmentedControlProps<Value>) {
  const [own, setOwn] = useState(defaultValue ?? options[0]?.value);
  const selected = value ?? own;
  return (
    <ToggleGroup
      data-slot="segmented-control"
      aria-label={label}
      disabled={disabled}
      value={selected === undefined ? [] : [selected]}
      onValueChange={(pressed) => {
        const next = options.find((option) => option.value === pressed[0]);
        if (next === undefined) return;
        setOwn(next.value);
        onValueChange?.(next.value);
      }}
      className={cn(
        stretch ? 'flex w-full' : 'inline-flex',
        // Padded by the focus ring's extent (docs/DESIGN.md §6), so a focused option's ring stays inside
        // the border, the first and the last option's included.
        'gap-0.5 rounded-full border border-line-2 p-[calc(var(--focus-offset)+var(--focus-width))]',
        className,
      )}
    >
      {options.map((option) => (
        <Toggle
          key={option.value}
          value={option.value}
          data-slot="segmented-control-item"
          className={cn(
            'inline-flex min-h-target min-w-target cursor-pointer items-center justify-center rounded-full font-medium text-14 text-ink-2 transition-colors duration-(--duration-fast) ease-enter hover:text-ink data-disabled:cursor-not-allowed data-pressed:bg-ink data-disabled:text-ink-3 data-pressed:text-background',
            stretch ? 'flex-auto px-1 text-center text-balance' : 'px-4',
          )}
        >
          {option.label}
        </Toggle>
      ))}
    </ToggleGroup>
  );
}

export { SegmentedControl, type SegmentedControlProps };
