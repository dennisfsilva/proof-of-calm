'use client';

import { Checkbox as CheckboxPrimitive } from '@base-ui/react/checkbox';
import { CheckIcon, MinusIcon } from 'lucide-react';
import { useHydrated } from '#lib/hydrated';
import type { WithClassName } from '#lib/types';
import { cn } from '#lib/utils';

// shadcn's base-nova Checkbox on Base UI, restyled (docs/DESIGN.md §6 and §8), for onboarding's
// acknowledgement: a 20 px box with a line-2 boundary inside a 44 px target; ticked is the ink fill with
// a check, so the mark says it, not the colour. A refused box (aria-invalid on the root) has the negative
// boundary, as a refused field's is; a tick takes the ink. Label it with an enclosing <label> or a Field.
// The focus ring is drawn just inside the 44 px target, so it keeps clear of the label beside it.

const rootClasses =
  'group inline-flex size-target shrink-0 cursor-pointer items-center justify-center rounded-md focus-visible:outline-offset-[calc(-1*var(--focus-width))] data-disabled:cursor-not-allowed data-disabled:opacity-50';
const boxClasses =
  'flex size-5 items-center justify-center rounded-sm border-2 border-line-2 bg-surface-2 text-background transition-colors duration-(--duration-fast) ease-enter group-aria-invalid:border-negative group-data-checked:border-ink group-data-indeterminate:border-ink group-data-checked:bg-ink group-data-indeterminate:bg-ink';

type CheckboxProps = WithClassName<CheckboxPrimitive.Root.Props>;

/** The check marks are glyphs inside the box: 16 px at a heavier stroke than icons, to stay legible. */
function Marks() {
  return (
    <>
      <CheckIcon aria-hidden strokeWidth={3} className="size-4 group-data-indeterminate:hidden" />
      <MinusIcon aria-hidden strokeWidth={3} className="hidden size-4 group-data-indeterminate:block" />
    </>
  );
}

function Checkbox(props: CheckboxProps) {
  const hydrated = useHydrated();
  if (!hydrated) return <CheckboxLookalike {...props} />;
  const { className, ...rest } = props;
  return (
    <CheckboxPrimitive.Root data-slot="checkbox" className={cn(rootClasses, className)} {...rest}>
      <span data-slot="checkbox-box" className={boxClasses}>
        <CheckboxPrimitive.Indicator data-slot="checkbox-indicator" className="flex">
          <Marks />
        </CheckboxPrimitive.Indicator>
      </span>
    </CheckboxPrimitive.Root>
  );
}

/** The server's picture of the checkbox (lib/hydrated.ts): the same boxes and state, no hidden input. */
function CheckboxLookalike({
  className,
  checked,
  defaultChecked = false,
  indeterminate = false,
  disabled = false,
}: CheckboxProps) {
  const ticked = checked ?? defaultChecked;
  const state = indeterminate ? 'data-indeterminate' : ticked ? 'data-checked' : 'data-unchecked';
  return (
    <span
      data-slot="checkbox"
      aria-hidden
      data-disabled={disabled ? '' : undefined}
      className={cn(rootClasses, className)}
      {...{ [state]: '' }}
    >
      <span data-slot="checkbox-box" className={boxClasses}>
        {(ticked || indeterminate) && (
          <span data-slot="checkbox-indicator" className="flex">
            <Marks />
          </span>
        )}
      </span>
    </span>
  );
}

export { Checkbox, type CheckboxProps };
