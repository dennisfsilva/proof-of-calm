import type { ComponentProps } from 'react';
import { cn } from '#lib/utils';

// shadcn's base-nova Card on the tokens (docs/DESIGN.md §2 and §6): a surface with a hairline, radius
// lg, inset-lg padding and no shadow. The title is a real heading; its level is the page's choice.

function Card({ className, ...props }: ComponentProps<'section'>) {
  return (
    <section
      data-slot="card"
      className={cn(
        'flex flex-col gap-stack-md rounded-lg border border-line bg-surface p-inset-lg text-ink',
        className,
      )}
      {...props}
    />
  );
}

function CardHeader({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-header"
      className={cn('flex flex-wrap items-start justify-between gap-x-stack-md gap-y-stack-xs', className)}
      {...props}
    />
  );
}

type CardTitleProps = ComponentProps<'h2'> & { level?: 2 | 3 | 4 };

function CardTitle({ className, level = 2, ...props }: CardTitleProps) {
  const Heading = `h${level}` as const;
  return (
    <Heading data-slot="card-title" className={cn('font-semibold text-18 tracking-heading', className)} {...props} />
  );
}

function CardDescription({ className, ...props }: ComponentProps<'p'>) {
  return <p data-slot="card-description" className={cn('text-14 text-ink-2', className)} {...props} />;
}

function CardContent({ className, ...props }: ComponentProps<'div'>) {
  return <div data-slot="card-content" className={cn('flex flex-col gap-stack-sm', className)} {...props} />;
}

function CardFooter({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div data-slot="card-footer" className={cn('flex flex-wrap items-center gap-target-gap', className)} {...props} />
  );
}

export { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle };
