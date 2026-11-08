import { Button } from '@proofofcalm/ui/components/button';
import { useState } from 'react';
import { useTranslations } from 'use-intl';
import { BRAND } from '../../../lib/brand';
import { usePlatform } from '../../../lib/services';

// The account-free reminder of M1 (ADR-0003, ADR-0004): "Add to calendar" saves the plan's calendar file
// and goes on; a platform that saves no file keeps the step with a line saying so. "Later" goes on with no
// file. With no buy day left there is no file: the heading and a line say so, and Continue goes on as Later does, with no
// reminder recorded. Email reminders arrive in M3.
export type ReminderStepProps = {
  /** From `reminderFile`; null when no buy day is left. */
  readonly file: string | null;
  /** The file was saved. */
  onAdd(): void;
  onLater(): void;
  onBack(): void;
};

export function ReminderStep({ file, onAdd, onLater, onBack }: ReminderStepProps) {
  const t = useTranslations('onboarding');
  const platform = usePlatform();
  const [notSaved, setNotSaved] = useState(false);
  const add = async (content: string) => {
    const saved = await platform.download(`${BRAND.slug}-reminder.ics`, content, 'text/calendar').catch(() => false);
    setNotSaved(!saved);
    if (saved) onAdd();
  };
  return (
    <section className="flex flex-col gap-stack-md">
      <h2 tabIndex={-1} className="font-semibold text-20 tracking-heading">
        {file === null ? t('reminder.noneLeftHeading') : t('reminder.heading')}
      </h2>
      {file === null && <p className="text-ink">{t('reminder.noneLeft')}</p>}
      {notSaved && (
        <p role="alert" className="text-ink">
          {t('reminder.notSaved')}
        </p>
      )}
      <div className="flex flex-wrap gap-target-gap">
        <Button variant="secondary" onClick={onBack}>
          {t('back')}
        </Button>
        {file !== null && <Button onClick={() => void add(file)}>{t('reminder.calendar')}</Button>}
        {file === null ? (
          <Button onClick={onLater}>{t('next')}</Button>
        ) : (
          <Button variant="secondary" onClick={onLater}>
            {t('reminder.later')}
          </Button>
        )}
      </div>
    </section>
  );
}
