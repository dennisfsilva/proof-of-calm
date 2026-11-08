import { SettingsIcon } from 'lucide-react';
import { cn } from '#lib/utils';
import { buttonVariants } from './button';
import { Anchor, type LinkComponent, type NavItem, TopNav } from './navigation';

// The app's header (docs/DESIGN.md §1 and §7): the wordmark, the top navigation from 48rem, and the
// Settings gear, an icon link padded to a 44 px target and named by its aria-label; on Settings it takes
// the destinations' 2 px ink bar under the icon, so the current page is never told by colour alone. It
// carries no tooltip: Base UI's would bring its positioning to every page, about 37 kB brotli against
// Today's budget (ADR-0043). On phones the destinations move to the tab bar and the header keeps the wordmark
// and the gear. It scrolls away with the page, so nothing needs scroll padding at the top.

type AppHeaderProps = {
  /** The wordmark, linking to Today: set lowercase at weight 600 (docs/DESIGN.md §1). */
  brand: { readonly href: string; readonly label: string };
  /** The destinations, the same as the tab bar's, and the name of their landmark. */
  navigation: { readonly label: string; readonly items: readonly NavItem[] };
  settings: { readonly href: string; readonly label: string; readonly current?: boolean };
  link?: LinkComponent;
  className?: string;
};

function AppHeader({ brand, navigation, settings, link: Link = Anchor, className }: AppHeaderProps) {
  return (
    <header data-slot="app-header" className={cn('border-line border-b bg-background', className)}>
      <div className="mx-auto flex max-w-table items-center gap-stack-md px-gutter">
        <Link
          href={brand.href}
          className="inline-flex min-h-target items-center font-semibold text-18 text-ink lowercase tracking-heading no-underline"
        >
          {brand.label}
        </Link>
        <TopNav label={navigation.label} items={navigation.items} link={Link} />
        <Link
          href={settings.href}
          aria-label={settings.label}
          aria-current={settings.current ? 'page' : undefined}
          className={cn(
            buttonVariants({ variant: 'ghost', size: 'icon' }),
            'relative ml-auto no-underline after:absolute after:inset-x-3 after:bottom-1 after:h-0.5 after:rounded-full aria-[current=page]:bg-surface-2 aria-[current=page]:after:bg-ink',
          )}
        >
          <SettingsIcon aria-hidden strokeWidth={1.75} />
        </Link>
      </div>
    </header>
  );
}

export { AppHeader, type AppHeaderProps };
