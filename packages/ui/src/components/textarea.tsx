import { Field as FieldPrimitive } from '@base-ui/react/field';
import type { ComponentProps } from 'react';
import type { WithClassName } from '#lib/types';
import { cn } from '#lib/utils';

// shadcn's base-nova Textarea on the tokens (docs/DESIGN.md §8), for the plan's "why" sentence and an
// entry's note: the Input's look (surface-2, a line-2 boundary, 16 px text so phones do not zoom), at
// least three lines, growing with its text where the browser can. It is Base UI's Field.Control drawn
// as a <textarea>, so inside a Field it is labelled, described and marked invalid like the Input. Its
// props are a textarea's, so handlers see HTMLTextAreaElement; Field.Control, typed for an <input>,
// takes them through one cast, as it passes them on to the <textarea> it renders.

type TextareaProps = WithClassName<ComponentProps<'textarea'>> &
  Pick<FieldPrimitive.Control.Props, 'onValueChange'> & {
    /** The visible lines before it grows; three by default. */
    rows?: number;
  };

function Textarea({ className, rows = 3, ...props }: TextareaProps) {
  const control = props as unknown as Omit<FieldPrimitive.Control.Props, 'className'>;
  return (
    <FieldPrimitive.Control
      data-slot="textarea"
      render={<textarea rows={rows} />}
      className={cn(
        'field-sizing-content min-h-22 w-full min-w-0 resize-y rounded-md border border-line-2 bg-surface-2 px-3 py-2 text-16 text-ink transition-colors duration-(--duration-fast) ease-enter placeholder:text-ink-3 aria-invalid:border-negative data-disabled:cursor-not-allowed data-disabled:border-line data-invalid:border-negative data-disabled:text-ink-3',
        className,
      )}
      {...control}
    />
  );
}

export { Textarea, type TextareaProps };
