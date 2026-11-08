import { InfoIcon } from 'lucide-react';
import type { ComponentProps } from 'react';
import { cn } from '#lib/utils';

// The one banner Today shows at a time (docs/DESIGN.md §8), from shadcn's base-nova Alert: ink on
// surface-2, an icon and a sentence, an action beside it. No warning hue exists (docs/DESIGN.md §3), and
// it is a polite status, not an alert: nothing here is urgent.

function Banner({ className, children, ...props }: ComponentProps<'div'>) {
  return (
    <div
      data-slot="banner"
      role="status"
      className={cn(
        'flex flex-col gap-stack-sm rounded-md border border-line bg-surface-2 p-inset text-ink sm:flex-row sm:items-center',
        className,
      )}
      {...props}
    >
      <InfoIcon aria-hidden className="hidden size-5 shrink-0 text-ink-2 sm:block" />
      {children}
    </div>
  );
}

function BannerContent({ className, ...props }: ComponentProps<'div'>) {
  return <div data-slot="banner-content" className={cn('flex min-w-0 flex-1 flex-col', className)} {...props} />;
}

function BannerTitle({ className, ...props }: ComponentProps<'p'>) {
  return <p data-slot="banner-title" className={cn('font-medium text-16', className)} {...props} />;
}

function BannerDescription({ className, ...props }: ComponentProps<'p'>) {
  return <p data-slot="banner-description" className={cn('text-14 text-ink-2', className)} {...props} />;
}

function BannerActions({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      data-slot="banner-actions"
      className={cn('flex flex-wrap items-center gap-target-gap', className)}
      {...props}
    />
  );
}

export { Banner, BannerActions, BannerContent, BannerDescription, BannerTitle };
