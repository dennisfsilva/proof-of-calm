import {
  backupNeeded,
  bannerFor,
  type CalendarDate,
  isPositive,
  liveEntries,
  type Plan,
  portfolio,
  ruleChangeNotice,
} from '@proofofcalm/core';
import { type ReactNode, useState } from 'react';
import { useTranslations } from 'use-intl';
import { Link } from '../../../lib/navigation';
import { useClock, useFormatters, usePlatform, useRules, useSnapshot } from '../../../lib/services';
import { RedDayFoot } from './red-day-foot';
import { RuleChangeBanner } from './rule-change-banner';

// Today's foot (docs/DOMAIN.md §3.11; docs/DESIGN.md §8), loaded on demand by the screen, so Today's entry carries
// none of its banners (docs/ENGINEERING.md §4); the service worker precaches its chunk with every hashed asset.

const link = (href: string) => (chunks: ReactNode) => (
  <Link href={href} className="text-ink underline underline-offset-4">
    {chunks}
  </Link>
);

/**
 * The foot of Today (docs/DOMAIN.md §3.11; docs/DESIGN.md §8): it settles once per visit. A visit that starts with
 * units held waits for the red-day model, then shows its banner or the next box; otherwise the next box at once.
 */
export function Foot({ plan, today }: { plan: Plan; today: CalendarDate }) {
  const entries = useSnapshot((snapshot) => snapshot.entries);
  const [held] = useState(() => portfolio(plan, entries).positions.some((position) => isPositive(position.units)));
  const next = <NextBanner plan={plan} today={today} />;
  return held ? <RedDayFoot plan={plan} next={next} /> : next;
}

/** The foot's box after the red day: the one banner `bannerFor` picks, else the durability line. */
function NextBanner({ plan, today }: { plan: Plan; today: CalendarDate }) {
  const t = useTranslations('today');
  const f = useFormatters();
  const clock = useClock();
  const platform = usePlatform();
  const rules = useRules();
  const entries = useSnapshot((snapshot) => snapshot.entries);
  const prefs = useSnapshot((snapshot) => snapshot.prefs);
  // A country with no profile of its own gets the generic rules, under another code: no notice applies to it.
  const ruleChange = rules !== null && rules.code === plan.country ? ruleChangeNotice(plan, rules) : null;
  const banner = bannerFor({
    today,
    redDay: null,
    ruleChange,
    backupNeeded: backupNeeded(entries, prefs, false),
    dismissed: prefs.dismissedBanners,
  });
  // Without a banner, the durability line once live entries exist, counted as the banner counts them (ADR-0004):
  // quiet, no dismiss. The backup banner says the same and names the export, so one thing at most stands here.
  // The installed app asks only for the export.
  if (banner === null) {
    const line = platform.installed() ? t('durabilityInstalled') : t('durability');
    return liveEntries(entries).length > 0 ? <p className="text-14 text-ink-2">{line}</p> : null;
  }
  if (banner.kind === 'rule-change' && ruleChange !== null) {
    return <RuleChangeBanner notice={ruleChange} country={rules?.name ?? ruleChange.country} />;
  }
  const last = prefs.lastBackupAt;
  return (
    <p role="status" className="rounded-lg border border-line p-inset text-14 text-ink-2">
      {last === null
        ? t.rich('banner.never', { link: link('/settings') })
        : t.rich('banner.last', { link: link('/settings'), date: f.instantDate(last, clock.timeZone) })}
    </p>
  );
}
