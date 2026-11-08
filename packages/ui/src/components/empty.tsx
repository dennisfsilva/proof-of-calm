import type { ComponentProps } from 'react';
import { cn } from '#lib/utils';

// The empty state (docs/DESIGN.md §8), from shadcn's base-nova Empty: a calm block that says what is
// missing and offers the one next step. No illustration (docs/DESIGN.md §2): an optional icon in a ring.

function Empty({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      data-slot="empty"
      className={cn(
        'flex w-full flex-col items-center gap-stack-md rounded-lg border border-line border-dashed p-inset-lg text-center',
        className,
      )}
      {...props}
    />
  );
}

function EmptyHeader({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      data-slot="empty-header"
      className={cn('flex max-w-reading flex-col items-center gap-stack-xs', className)}
      {...props}
    />
  );
}

function EmptyMedia({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      data-slot="empty-media"
      aria-hidden
      className={cn(
        'mb-stack-xs flex size-12 items-center justify-center rounded-full border border-line-2 text-ink-2 [&_svg]:size-5',
        className,
      )}
      {...props}
    />
  );
}

type EmptyTitleProps = ComponentProps<'h2'> & { level?: 1 | 2 | 3 };

function EmptyTitle({ className, level = 2, ...props }: EmptyTitleProps) {
  const Heading = `h${level}` as const;
  return (
    <Heading data-slot="empty-title" className={cn('font-semibold text-20 tracking-heading', className)} {...props} />
  );
}

function EmptyDescription({ className, ...props }: ComponentProps<'p'>) {
  return <p data-slot="empty-description" className={cn('text-16 text-ink-2', className)} {...props} />;
}

function EmptyContent({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      data-slot="empty-content"
      className={cn('flex flex-wrap items-center justify-center gap-target-gap', className)}
      {...props}
    />
  );
}

export { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle };
