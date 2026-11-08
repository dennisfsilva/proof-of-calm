import { Field as FieldPrimitive } from '@base-ui/react/field';
import type { WithClassName } from '#lib/types';
import { cn } from '#lib/utils';

// A labelled form control on Base UI's Field, which ties the label, the description and the error to
// the control (for, aria-describedby, aria-invalid). The messages are the shell's: the core's error
// codes mapped to copy (ADR-0034).

function Field({ className, ...props }: WithClassName<FieldPrimitive.Root.Props>) {
  return <FieldPrimitive.Root data-slot="field" className={cn('flex flex-col gap-stack-xs', className)} {...props} />;
}

function FieldLabel({ className, ...props }: WithClassName<FieldPrimitive.Label.Props>) {
  return (
    <FieldPrimitive.Label
      data-slot="field-label"
      className={cn('font-medium text-14 text-ink data-disabled:text-ink-3', className)}
      {...props}
    />
  );
}

function FieldDescription({ className, ...props }: WithClassName<FieldPrimitive.Description.Props>) {
  return (
    <FieldPrimitive.Description
      data-slot="field-description"
      className={cn('text-13 text-ink-2', className)}
      {...props}
    />
  );
}

/** Shown while it is rendered: the form decides when a field has an error. */
function FieldError({ className, match = true, ...props }: WithClassName<FieldPrimitive.Error.Props>) {
  return (
    <FieldPrimitive.Error
      data-slot="field-error"
      match={match}
      className={cn('text-13 text-negative', className)}
      {...props}
    />
  );
}

export { Field, FieldDescription, FieldError, FieldLabel };
