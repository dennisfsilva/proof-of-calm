import { type BannerKey, bannerFor, type Plan, UNDO_WINDOW_MS } from '@proofofcalm/core';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { useTranslations } from 'use-intl';
import { reportError } from '../../../lib/errors';
import { type RedDayModel, useServices } from '../../../lib/services';
import { todayActions } from '../actions';
import { RedDayBanner } from './red-day-banner';

// The red-day half of Today's foot (docs/DOMAIN.md §3.11; docs/DESIGN.md §8), loaded on demand by the foot when
// the visit starts with units held, so Today's entry carries none of it (docs/ENGINEERING.md §4).

type Shown = {
  readonly key: BannerKey;
  readonly lastRed: NonNullable<RedDayModel['lastRed']>;
  readonly coins: RedDayModel['held'];
};

/**
 * Asks the model once per visit, on the plan the visit started with, and records the banner as it shows, so it
 * shows on this visit only; undefined while the model is on its way, null for none. A failed read is no episode,
 * and says nothing. `record` repeats the write if the first failed; that one toasts on failure, as the rule-change
 * notice does.
 */
function useRedDay(plan: Plan) {
  const t = useTranslations('today.redDay');
  const services = useServices();
  const [visit] = useState(plan);
  const [shown, setShown] = useState<Shown | null | undefined>(undefined);
  const recorded = useRef(false);
  useEffect(() => {
    let live = true;
    const { domain, clock, redDay } = services;
    const today = clock.today();
    const settle = async () => {
      const model = await redDay
        .model({ plan: visit, entries: domain.store.getState().snapshot.entries, today })
        .catch(() => null);
      if (!live) return;
      const banner = bannerFor({
        today,
        redDay: model?.episode ?? null,
        ruleChange: null,
        backupNeeded: false,
        dismissed: domain.store.getState().snapshot.prefs.dismissedBanners,
      });
      const lastRed = model?.lastRed ?? null;
      if (banner === null || lastRed === null) return setShown(null);
      const covered = model?.figure?.coins ?? [];
      const coins = model?.held.filter(({ coin }) => covered.includes(coin)) ?? [];
      setShown({ key: banner.key, lastRed, coins: coins.length > 0 ? coins : (model?.held ?? []) });
      try {
        await todayActions(services).recordBanner(banner.key);
        recorded.current = true;
      } catch (error) {
        reportError(error);
      }
    };
    void settle();
    return () => {
      live = false;
    };
  }, [visit, services]);
  const record = async (key: BannerKey) => {
    if (recorded.current) return;
    try {
      await todayActions(services).recordBanner(key);
      recorded.current = true;
    } catch (error) {
      reportError(error);
      services.toasts.add({ title: t('failed'), timeout: UNDO_WINDOW_MS });
    }
  };
  return { shown, record, hide: () => setShown(null) };
}

export type RedDayFootProps = {
  readonly plan: Plan;
  /** The foot's next box, once the red day has settled on none or the banner is dismissed. */
  readonly next: ReactNode;
};

/** Nothing until the model answers, then the red-day banner or `next`; only Dismiss turns one into the other. */
export function RedDayFoot({ plan, next }: RedDayFootProps) {
  const { shown, record, hide } = useRedDay(plan);
  const dismissed = useRef(false);
  /**
   * Dismiss's button goes with the banner, so once the commit has removed it the card's heading takes the focus and
   * comes into view by the least scroll: read at the foot of a phone's page, the heading is above the window
   * (docs/DESIGN.md §6).
   */
  useEffect(() => {
    if (shown !== null || !dismissed.current) return;
    dismissed.current = false;
    const heading = document.getElementById('today-action');
    heading?.focus({ preventScroll: true });
    heading?.scrollIntoView({ block: 'nearest' });
  }, [shown]);
  if (shown === undefined) return null;
  if (shown === null) return next;
  const dismiss = () => {
    dismissed.current = true;
    hide();
    void record(shown.key);
  };
  return (
    <RedDayBanner
      lastRed={shown.lastRed}
      coins={shown.coins}
      onOpen={() => void record(shown.key)}
      onDismiss={dismiss}
    />
  );
}
