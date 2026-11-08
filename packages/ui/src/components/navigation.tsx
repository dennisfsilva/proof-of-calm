import type { LucideIcon } from 'lucide-react';
import type { ComponentProps, ComponentType } from 'react';
import { cn } from '#lib/utils';

// The four destinations (docs/DESIGN.md §7): a bottom tab bar on phones and a top navigation on wider
// screens, switching at 48rem (768 px at the default text size), where a tablet in portrait and every
// desktop get the top navigation. packages/ui knows no router: every link renders through the `link`
// component the app passes, its navigation adapter from lib/navigation (docs/ARCHITECTURE.md), and a
// plain anchor otherwise. The current destination carries aria-current="page" and is marked by weight and a
// bar, never by colour alone. Neighbouring links keep the 8 px between targets (docs/DESIGN.md §6).

type LinkProps = Omit<ComponentProps<'a'>, 'href'> & { href: string };

/** Renders a link with the props it is given: the app's adapter over its router, or a plain anchor. */
type LinkComponent = ComponentType<LinkProps>;

function Anchor(props: LinkProps) {
  return <a {...props} />;
}

type NavItem = {
  readonly href: string;
  readonly label: string;
  /** A lucide icon, drawn at 20 px with a 1.75 stroke in the tab bar. */
  readonly icon: LucideIcon;
  /** The destination the page belongs to. */
  readonly current?: boolean;
};

type NavigationProps = {
  /** Names the landmark ("Main"); the tab bar and the top navigation never show at the same width. */
  label: string;
  items: readonly NavItem[];
  link?: LinkComponent;
  className?: string;
};

/** The top navigation, from 48rem: text links on the header's line. */
function TopNav({ label, items, link: Link = Anchor, className }: NavigationProps) {
  return (
    <nav data-slot="top-nav" aria-label={label} className={cn('hidden md:block', className)}>
      <ul className="flex items-center gap-target-gap">
        {items.map((item) => (
          <li key={item.href}>
            <Link
              href={item.href}
              aria-current={item.current ? 'page' : undefined}
              className="relative inline-flex min-h-target items-center px-3 text-16 text-ink-2 no-underline transition-colors duration-(--duration-fast) ease-enter after:absolute after:inset-x-3 after:bottom-1 after:h-0.5 after:rounded-full hover:text-ink aria-[current=page]:font-semibold aria-[current=page]:text-ink aria-[current=page]:after:bg-ink"
            >
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/**
 * The bottom tab bar, below 48rem: fixed over the home indicator's inset, with an in-flow spacer of its
 * height so the end of the page scrolls clear of it. Render it last, after the page's content.
 */
function TabBar({ label, items, link: Link = Anchor, className }: NavigationProps) {
  return (
    <div
      data-slot="tab-bar"
      className={cn('h-[calc(var(--tab-bar-height)+env(safe-area-inset-bottom))] shrink-0 md:hidden', className)}
    >
      <nav
        aria-label={label}
        className="fixed inset-x-0 bottom-0 z-40 bg-surface pr-[env(safe-area-inset-right)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] before:absolute before:inset-x-0 before:top-0 before:h-px before:bg-line"
      >
        <ul className="mx-auto flex max-w-reading gap-target-gap">
          {items.map(({ href, label: name, icon: Icon, current }) => (
            <li key={href} className="flex min-w-0 flex-1">
              <Link
                href={href}
                aria-current={current ? 'page' : undefined}
                className="relative flex min-h-(--tab-bar-height) min-w-0 flex-1 flex-col items-center justify-center gap-0.5 px-1 text-13 text-ink-2 no-underline transition-colors duration-(--duration-fast) ease-enter before:absolute before:inset-x-5 before:top-0 before:h-0.5 before:rounded-full hover:text-ink aria-[current=page]:font-semibold aria-[current=page]:text-ink aria-[current=page]:before:bg-ink"
              >
                <Icon aria-hidden strokeWidth={1.75} className="size-5 shrink-0" />
                <span className="wrap-anywhere max-w-full text-center">{name}</span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}

export { Anchor, type LinkComponent, type LinkProps, type NavItem, type NavigationProps, TabBar, TopNav };
