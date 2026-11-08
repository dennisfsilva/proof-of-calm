import { PRICE_TTL } from '@proofofcalm/core';
import { AppHeader } from '@proofofcalm/ui/components/app-header';
import { Button } from '@proofofcalm/ui/components/button';
import { type NavItem, TabBar } from '@proofofcalm/ui/components/navigation';
import { Toaster } from '@proofofcalm/ui/components/toast';
import { BookOpenIcon, ChartPieIcon, CircleDotIcon, ListIcon } from 'lucide-react';
import { type MouseEvent, type ReactNode, useEffect, useRef } from 'react';
import { useTranslations } from 'use-intl';
import { BRAND } from '../../lib/brand';
import { Link, usePathname } from '../../lib/navigation';
import { type UpdatePrompt, updateToast } from '../../lib/pwa';
import { useBoot, useDomainStatus, useServices, useSnapshot, useToasts } from '../../lib/services';
import { applyAppearance, writeAppearanceMirror } from '../../lib/theme';
import { NewerVersion } from './newer-version';
import { ScreenFrame } from './screen-frame';

// The app shell (ADR-0045 §9, §14; docs/DESIGN.md §7): the header with the wordmark, the top navigation
// and the Settings gear, the screen area, the phone tab bar, and the one toast viewport around them. The
// screen area waits for the services once, on the first boot (the snapshot and the plan's rules): a later
// write that changes the plan's country keeps the screens mounted, with their state and focus (ADR-0020
// readings, "The first-boot gate"). It shows the failure screen when the plan store cannot be opened,
// also after boot. The shell also holds what every screen needs once: scrolling to
// the top on a new pathname, the stored appearance on the document and its mirror for the next visit's
// before-paint script (§3, the store wins), today's date and the prices while the page is visible, and
// the update toast of the service worker (§5) through the host's `registerUpdates`. The skip link comes
// first and the one `main` is the ScreenFrame around whatever the screen area shows (DESIGN §6).

export type AppShellProps = {
  /**
   * Called once with the handler for a ready update (the "A new version is ready" toast): the web host
   * registers the service worker with it; the static-export host has none and leaves it out.
   */
  readonly registerUpdates?: ((onUpdateReady: (update: UpdatePrompt) => () => void) => void) | undefined;
  readonly children: ReactNode;
};

const DESTINATIONS = [
  { href: '/today', key: 'today', icon: CircleDotIcon },
  { href: '/portfolio', key: 'portfolio', icon: ChartPieIcon },
  { href: '/log', key: 'log', icon: ListIcon },
  { href: '/learn', key: 'learn', icon: BookOpenIcon },
] as const;

/**
 * The first tabbable element: shown only while focused, it moves focus to the screen area. It never
 * changes the URL (the static-export host routes on the hash), so the default jump is replaced. It keeps
 * its 44 px target at all times and waits above the viewport until focused: twice its height clears its
 * top offset and the overlay shadow. It sits over the header as a layer, so it wears the overlay tokens
 * (DESIGN §6 Elevation). No transition: it appears at once, also under reduced motion.
 */
function SkipLink({ label }: { label: string }) {
  const skip = (event: MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    const main = document.getElementById('main');
    main?.focus();
    main?.scrollIntoView();
  };
  return (
    // biome-ignore lint/a11y/useValidAnchor: a skip link is an in-page link (WCAG 2.4.1); only its jump is replaced, to keep the hash route
    <a
      href="#main"
      onClick={skip}
      className="fixed start-gutter top-stack-xs z-50 flex min-h-target items-center rounded-md border border-overlay-border bg-overlay px-inset text-16 text-ink shadow-overlay not-focus:-translate-y-[200%]"
    >
      {label}
    </a>
  );
}

const isUnder = (pathname: string, href: string) => pathname === href || pathname.startsWith(`${href}/`);

export function AppShell({ registerUpdates, children }: AppShellProps) {
  const t = useTranslations('shell');
  const services = useServices();
  const toasts = useToasts();
  const pathname = usePathname();
  const boot = useBoot();
  const status = useDomainStatus();
  const theme = useSnapshot((snapshot) => snapshot.prefs.theme);
  const motion = useSnapshot((snapshot) => snapshot.prefs.motion);

  // A new pathname starts at the top, as a document navigation would, and after the first screen the focus
  // moves to the new screen's heading, so a keyboard or screen reader starts there rather than on the
  // page (DESIGN §6). The first screen, also after a redirect, leaves the focus where the page starts. A
  // lazy screen's heading appears once its chunk has loaded, so the screen area is watched until then.
  const shown = useRef<string | null>(null);
  useEffect(() => {
    window.scrollTo(0, 0);
    const main = document.getElementById('main');
    if (main === null) return;
    const moved = shown.current !== null && shown.current !== pathname;
    const settle = () => {
      // Not the last screen's heading, which Suspense keeps hidden while the next one loads.
      const heading = [...main.querySelectorAll<HTMLElement>('h1')].find(
        (candidate) => candidate.closest('[hidden], [style*="display: none"]') === null,
      );
      if (heading === undefined) return false;
      shown.current = pathname;
      if (moved) {
        if (!heading.hasAttribute('tabindex')) heading.tabIndex = -1;
        heading.focus({ preventScroll: true });
      }
      return true;
    };
    if (settle()) return;
    const observer = new MutationObserver(() => {
      if (settle()) observer.disconnect();
    });
    observer.observe(main, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [pathname]);

  // The appearance, once the snapshot is hydrated: the store wins over the mirror the before-paint script
  // read, and the mirror is rewritten for the next visit (ADR-0045 §3). Not after a failed hydration: the
  // empty snapshot's defaults would undo the mirror.
  useEffect(() => {
    if (status !== 'ready') return;
    const value = { theme, motion };
    applyAppearance(document.documentElement, value);
    try {
      writeAppearanceMirror(window.localStorage, value);
    } catch {
      // No storage (a private window that refuses it): the store still rules this visit.
    }
  }, [status, theme, motion]);

  // Today's date and the live prices: on start, each time the page becomes visible or the platform reports
  // the network back (a refresh that failed offline clears only on a refresh that answers), and every client
  // TTL while the page stays visible (the services fetch only when the prices are stale).
  useEffect(() => {
    if (boot !== 'ready') return;
    let timer: ReturnType<typeof setInterval> | null = null;
    const wake = () => {
      services.tick();
      void services.prices.refresh();
    };
    const stop = () => {
      if (timer !== null) clearInterval(timer);
      timer = null;
    };
    const sync = () => {
      if (document.visibilityState !== 'visible') {
        stop();
        return;
      }
      wake();
      if (timer === null) timer = setInterval(wake, PRICE_TTL.clientSeconds * 1000);
    };
    sync();
    document.addEventListener('visibilitychange', sync);
    window.addEventListener('online', sync);
    return () => {
      stop();
      document.removeEventListener('visibilitychange', sync);
      window.removeEventListener('online', sync);
    };
  }, [boot, services]);

  // The update toast's handler, handed to the host once: a service worker registers once, whatever the
  // shell re-renders (StrictMode keeps the ref through its second mount). It waits for the screen to settle,
  // the first boot and the first prices refresh (the in-flight one of the effect above), so the worker's
  // install never runs beside the first screen's render (ADR-0045 §5, the deviation of 2026-10-26).
  const registered = useRef(false);
  useEffect(() => {
    if (registered.current || registerUpdates === undefined || boot === 'loading') return;
    registered.current = true;
    const hand = () => registerUpdates(updateToast(toasts, { title: t('update.title'), reload: t('update.reload') }));
    if (boot === 'failed') hand();
    else void services.prices.refresh().then(hand, hand);
  }, [boot, registerUpdates, services, toasts, t]);

  const items: NavItem[] = DESTINATIONS.map(({ href, key, icon }) => ({
    href,
    label: t(`nav.${key}`),
    icon,
    current: isUnder(pathname, href),
  }));

  return (
    <Toaster closeLabel={t('toast.close')} toastManager={toasts}>
      <div className="flex min-h-dvh flex-col">
        <SkipLink label={t('skip')} />
        <AppHeader
          brand={{ href: '/today', label: BRAND.name }}
          navigation={{ label: t('nav.label'), items }}
          settings={{ href: '/settings', label: t('settings'), current: isUnder(pathname, '/settings') }}
          link={Link}
        />
        <ScreenFrame busy={boot === 'loading'}>
          {boot === 'failed' && (
            <div className="mx-auto flex w-full max-w-reading flex-1 flex-col gap-stack-lg px-gutter py-stack-lg">
              <h1 className="text-28">{t('failure.title')}</h1>
              <div>
                <Button onClick={() => void services.start()}>{t('failure.retry')}</Button>
              </div>
            </div>
          )}
          {boot === 'ready' && <NewerVersion>{children}</NewerVersion>}
        </ScreenFrame>
        <TabBar label={t('nav.label')} items={items} link={Link} />
      </div>
    </Toaster>
  );
}
