import { Button } from '@proofofcalm/ui/components/button';
import { type JSX, useId, useState } from 'react';
import { useTranslations } from 'use-intl';
import { BRAND } from '../../../lib/brand';
import { useClock, useFormatters, usePlatform, useSnapshot, useToday } from '../../../lib/services';
import { reminderFile, reminderGap, useReminderWords } from '../../plan';

// The calendar file again (ADR-0003, ADR-0004: M1's only reminder until M3's email), under the Plan tab: for a
// plan started with Later, or whose buy day or last buy changed since the file was added. It is made from the
// plan and entries as stored, so it holds the open buy days from the next one. Calendars treat a file added
// again differently, so the copy never says it replaces the earlier event (docs/CONTENT-STYLE.md §3). With no
// file, the line says why: the buy days left are paused, buying ended (a file added earlier keeps its events),
// or none is left. The lines take About's body size.
export function CalendarRow(): JSX.Element | null {
  const t = useTranslations('settings.reminder');
  const plan = useSnapshot((snapshot) => snapshot.plan);
  const entries = useSnapshot((snapshot) => snapshot.entries);
  const today = useToday();
  const clock = useClock();
  const platform = usePlatform();
  const words = useReminderWords();
  const f = useFormatters();
  const headingId = useId();
  const [saved, setSaved] = useState<boolean | null>(null);
  const file = plan === null ? null : reminderFile(plan, today, clock.now(), words, entries);
  // The outcome describes only the file on screen: a change to it, or none for a while, clears it. The
  // file's DTSTAMP lines, one per event, carry the clock's time, so they are left out of the comparison.
  const shown = file?.replace(/^DTSTAMP:.*$/gm, '') ?? null;
  const [savedFor, setSavedFor] = useState(shown);
  if (savedFor !== shown) {
    setSavedFor(shown);
    setSaved(null);
  }
  if (plan === null) return null;
  const gapLine = (gap: ReturnType<typeof reminderGap>) =>
    gap === 'ended' && plan.endedBuyingOn !== null
      ? t('ended', { date: f.date(plan.endedBuyingOn) })
      : t(gap === 'paused' ? 'paused' : 'noneLeft');
  const add = async (content: string) => {
    // Cleared first, so a second save announces its line again.
    setSaved(null);
    setSaved(await platform.download(`${BRAND.slug}-reminder.ics`, content, 'text/calendar').catch(() => false));
  };
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-stack-md">
      <h2 id={headingId} className="font-semibold text-20">
        {t('heading')}
      </h2>
      {file === null ? (
        <p className="text-16 text-ink-2">{gapLine(reminderGap(plan, entries, today))}</p>
      ) : (
        <>
          <p className="text-16 text-ink-2">{t('line')}</p>
          {saved === false && (
            <p role="alert" className="text-ink">
              {t('notSaved')}
            </p>
          )}
          <div>
            <Button variant="secondary" onClick={() => void add(file)}>
              {t('calendar')}
            </Button>
            {/* Mounted while empty, so the line is announced; the gap comes with the words. */}
            <p role="status" aria-live="polite" className="text-16 text-ink">
              {saved === true && <span className="mt-stack-sm block">{t('saved')}</span>}
            </p>
          </div>
        </>
      )}
    </section>
  );
}
