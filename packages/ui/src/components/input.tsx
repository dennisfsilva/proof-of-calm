import { Input as InputPrimitive } from '@base-ui/react/input';
import type { WithClassName } from '#lib/types';
import { cn } from '#lib/utils';

// shadcn's base-nova Input on the tokens (docs/DESIGN.md §8): a 44 px field on surface-2 with a line-2
// boundary (3:1) and 16 px text, so phones do not zoom on focus. Inside a Field it is labelled and
// described automatically.
const inputClasses =
  'min-h-target w-full min-w-0 rounded-md border border-line-2 bg-surface-2 px-3 text-16 text-ink transition-colors duration-(--duration-fast) ease-enter placeholder:text-ink-3 aria-invalid:border-negative data-disabled:cursor-not-allowed data-disabled:border-line data-disabled:text-ink-3 data-invalid:border-negative';

type InputProps = WithClassName<InputPrimitive.Props>;

function Input({ className, ...props }: InputProps) {
  return <InputPrimitive data-slot="input" className={cn(inputClasses, className)} {...props} />;
}

/**
 * Amounts, units and prices: a text field with the decimal keypad and tabular figures. The shell parses
 * the value with the formatting locale; `type="number"` is never used (ADR-0034).
 */
function NumericInput({ className, ...props }: Omit<InputProps, 'type' | 'inputMode'>) {
  return (
    <Input
      data-slot="numeric-input"
      type="text"
      inputMode="decimal"
      autoComplete="off"
      spellCheck={false}
      className={cn('nums', className)}
      {...props}
    />
  );
}

/** A calendar date: the native picker, valued `YYYY-MM-DD` whatever the display locale (ADR-0034). */
function DateInput({ className, ...props }: Omit<InputProps, 'type'>) {
  return <Input data-slot="date-input" type="date" className={cn('nums', className)} {...props} />;
}

export { DateInput, Input, type InputProps, NumericInput };
