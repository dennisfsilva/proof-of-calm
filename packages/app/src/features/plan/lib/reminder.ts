// The plan's calendar file (ADR-0003 Readings), M1's only reminder: onboarding's reminder step offers it
// once, and Settings again for a plan whose buy day changed or that was started with Later.
import { type CalendarDate, type Entry, type Instant, type Plan, slotStatuses } from '@proofofcalm/core';
import { useTranslations } from 'use-intl';
import { calendarReminder } from '../../../lib/adapters';
import { BRAND } from '../../../lib/brand';

export type ReminderWords = { readonly summary: string; readonly description: string };

/**
 * The calendar file: the plan's buy days from the next one, its UID the plan's id, leading to Today; the
 * words carry no coin, amount or market (docs/CONTENT-STYLE.md §7). Null when no buy day is left, and once
 * buying ended, also on the day of the end: today's buy day stays open in the app, but there is no reminder
 * to add. Settings passes the stored entries, so a buy day already recorded is left out; onboarding has none.
 */
export function reminderFile(
  plan: Plan,
  today: CalendarDate,
  now: Instant,
  words: ReminderWords,
  entries: readonly Entry[] = [],
): string | null {
  if (plan.endedBuyingOn !== null) return null;
  const url = `${BRAND.origin}/today`;
  return calendarReminder({ plan, entries, today, ...words, url, uid: plan.id, stamp: now });
}

/**
 * Why `reminderFile` made no file: `ended` once buying ended, whatever its pauses (an ended plan cannot be
 * resumed; a file added earlier keeps its events in the calendar), `paused` while a buy day still to come
 * falls in a pause (the days keep their dates, so the file comes back once the pause ends), otherwise
 * `none-left`.
 */
export function reminderGap(
  plan: Plan,
  entries: readonly Entry[],
  today: CalendarDate,
): 'paused' | 'none-left' | 'ended' {
  if (plan.endedBuyingOn !== null) return 'ended';
  const ahead = slotStatuses(plan, entries, today).filter((slot) => slot.due >= today);
  return ahead.some((slot) => slot.status === 'paused') ? 'paused' : 'none-left';
}

/** The event's title and description, in the plan namespace that onboarding and Settings both load. */
export function useReminderWords(): { summary: string; description: string } {
  const t = useTranslations('plan');
  return {
    summary: t('reminder.event.summary'),
    description: t('reminder.event.description', { product: BRAND.name }),
  };
}
