'use client';

import { Radio } from '@base-ui/react/radio';
import { RadioGroup as RadioGroupPrimitive } from '@base-ui/react/radio-group';
import { createContext, type ReactNode, use, useId } from 'react';
import { useHydrated } from '#lib/hydrated';
import type { WithClassName } from '#lib/types';
import { cn } from '#lib/utils';

// shadcn's base-nova Radio Group on Base UI, drawn as choice cards (docs/DESIGN.md §8): onboarding's
// template choice and Hold & sell's holding rule and sell window. Each card is the radio: its title names
// it; its line, an optional leading badge (a risk label, a country code) and an optional `describedBy`,
// text the cards share, describe it. Chosen is an ink boundary on surface-2
// with a filled dot, so the dot says it, not the colour; in a group marked aria-invalid the chosen card's
// boundary is negative, as a refused field's is. Arrow keys move the choice (Base UI).

/** What the group starts with, for the cards' server picture (lib/hydrated.ts). */
const InitialValue = createContext<string | undefined>(undefined);
/** Whether the group is marked aria-invalid, which the chosen card shows on its boundary. */
const Invalid = createContext(false);

type RadioGroupProps<Value extends string> = WithClassName<RadioGroupPrimitive.Props<Value>>;

function RadioGroup<Value extends string>({ className, ...props }: RadioGroupProps<Value>) {
  const invalid = props['aria-invalid'] === true || props['aria-invalid'] === 'true';
  return (
    <InitialValue value={props.value ?? props.defaultValue}>
      <Invalid value={invalid}>
        <RadioGroupPrimitive
          data-slot="radio-group"
          className={cn('flex flex-col gap-target-gap', className)}
          {...props}
        />
      </Invalid>
    </InitialValue>
  );
}

const cardClasses =
  'group flex w-full cursor-pointer items-start gap-3 rounded-lg border border-line-2 bg-surface p-inset text-left text-ink transition-colors duration-(--duration-fast) ease-enter hover:bg-surface-2 data-checked:border-ink data-invalid:data-checked:border-negative data-checked:bg-surface-2 data-disabled:cursor-not-allowed data-disabled:opacity-50';

type RadioCardProps = {
  value: string;
  /** Names the choice ("Bitcoin and ether", "Portugal"). */
  title: ReactNode;
  /** One line under the title ("70 % BTC, 30 % ETH, monthly"). */
  line?: ReactNode;
  /** A short tag before the title, such as a risk label or a country code. */
  badge?: ReactNode;
  /** The id of text outside the card that also describes it, read after the badge and the line. */
  describedBy?: string | undefined;
  disabled?: boolean;
  className?: string;
};

function RadioCard({ value, title, line, badge, describedBy, disabled = false, className }: RadioCardProps) {
  const hydrated = useHydrated();
  const initial = use(InitialValue);
  const invalid = use(Invalid) ? '' : undefined;
  const id = useId();
  const ids = { title: `${id}-title`, line: `${id}-line`, badge: `${id}-badge` };
  const content = (
    <>
      <span className="flex min-w-0 flex-1 flex-col gap-stack-xs">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          {badge !== undefined && (
            <span id={ids.badge} className="rounded-sm border border-line-2 px-1.5 font-medium text-13 text-ink-2">
              {badge}
            </span>
          )}
          <span id={ids.title} className="font-semibold text-16">
            {title}
          </span>
        </span>
        {line !== undefined && (
          <span id={ids.line} className="text-14 text-ink-2">
            {line}
          </span>
        )}
      </span>
      <span
        data-slot="radio-card-indicator"
        className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border-2 border-line-2 group-data-checked:border-ink"
      >
        {hydrated ? (
          <Radio.Indicator className="size-2.5 rounded-full bg-ink" />
        ) : (
          initial === value && <span className="size-2.5 rounded-full bg-ink" />
        )}
      </span>
    </>
  );
  if (!hydrated) {
    const state = initial === value ? 'data-checked' : 'data-unchecked';
    return (
      <span
        data-slot="radio-card"
        data-disabled={disabled ? '' : undefined}
        data-invalid={invalid}
        className={cn(cardClasses, className)}
        {...{ [state]: '' }}
      >
        {content}
      </span>
    );
  }
  const described = [badge !== undefined && ids.badge, line !== undefined && ids.line, describedBy]
    .filter(Boolean)
    .join(' ');
  return (
    <Radio.Root
      value={value}
      disabled={disabled}
      data-slot="radio-card"
      aria-labelledby={ids.title}
      aria-describedby={described === '' ? undefined : described}
      data-invalid={invalid}
      className={cn(cardClasses, className)}
    >
      {content}
    </Radio.Root>
  );
}

export { RadioCard, type RadioCardProps, RadioGroup, type RadioGroupProps };
