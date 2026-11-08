import { Button as ButtonPrimitive } from '@base-ui/react/button';
import { cva, type VariantProps } from 'class-variance-authority';
import type { WithClassName } from '#lib/types';
import { cn } from '#lib/utils';

// shadcn's base-nova Button, restyled on the tokens (docs/DESIGN.md §8): primary is the accent fill
// with on-accent text, secondary an outline in line-2, destructive the negative ink; every size but
// `inline` is a 44 px target, and focus is the global ring.
const buttonVariants = cva(
  'inline-flex shrink-0 cursor-pointer select-none items-center justify-center gap-2 whitespace-nowrap rounded-md border font-medium text-16 transition-colors duration-(--duration-fast) ease-enter data-disabled:cursor-not-allowed data-disabled:text-ink-3 [&_svg]:pointer-events-none [&_svg]:size-5 [&_svg]:shrink-0',
  {
    // Each variant names its own border colour: `cn` does not merge, so the base sets only the width.
    variants: {
      variant: {
        primary: 'border-transparent bg-primary text-primary-foreground hover:bg-primary/85 data-disabled:bg-surface-3',
        secondary: 'border-line-2 bg-transparent text-ink hover:bg-surface-2 data-disabled:border-line',
        ghost: 'border-transparent bg-transparent text-ink hover:bg-surface-2',
        link: 'border-transparent bg-transparent text-ink underline underline-offset-4 hover:text-ink-2',
        destructive: 'border-negative bg-transparent text-negative hover:bg-surface-2 data-disabled:border-line',
      },
      size: {
        default: 'min-h-target px-4',
        icon: 'size-target',
        /** For a link-styled button inside running text: inline text links are exempt from the 44 px rule. */
        inline: 'h-auto p-0',
      },
    },
    defaultVariants: { variant: 'primary', size: 'default' },
  },
);

type ButtonProps = WithClassName<ButtonPrimitive.Props> & VariantProps<typeof buttonVariants>;

function Button({ className, variant, size, ...props }: ButtonProps) {
  return <ButtonPrimitive data-slot="button" className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}

export { Button, type ButtonProps, buttonVariants };
