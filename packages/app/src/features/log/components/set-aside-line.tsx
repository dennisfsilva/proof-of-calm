import { UNDO_WINDOW_MS } from '@proofofcalm/core';
import { Button } from '@proofofcalm/ui/components/button';
import { type RefObject, useRef, useState } from 'react';
import { useTranslations } from 'use-intl';
import { Link } from '../../../lib/navigation';
import { useFormatters, useMissingEntries, useServices, useSnapshot } from '../../../lib/services';
import { logActions } from '../actions';
import { figure } from '../lib/figure';
import { focusInView } from './row-focus';

/**
 * Saved entries that could not be read and are still missing (ADR-0019 Readings, 2026-11-26): how to bring
 * them back, and a button that hides the line on this device until another is set aside. The import ends the
 * line; a new record gets a new id and never does, so the line names recording only without a backup, then the
 * hide. Shown only while a plan is, since only then does the Log record. Hidden, focus goes to the Log's title,
 * since the button is gone; when the write fails a toast says so and focus stays on the button (docs/DESIGN.md §6).
 */
export function SetAsideLine({ heading }: { readonly heading: RefObject<HTMLHeadingElement | null> }) {
  const t = useTranslations('log');
  const f = useFormatters();
  const { domain, clock, toasts } = useServices();
  const [actions] = useState(() => logActions({ domain, clock }));
  const rows = useSnapshot((snapshot) => snapshot.setAside.entries.length);
  const { count, since } = useMissingEntries();
  const button = useRef<HTMLButtonElement>(null);
  if (since === null) return null;
  const hide = () => {
    actions.hideSetAside(rows).then(
      () => focusInView(heading.current),
      () => {
        toasts.add({ title: t('setAside.failed'), timeout: UNDO_WINDOW_MS });
        button.current?.focus();
      },
    );
  };
  return (
    <div className="flex flex-col gap-stack-md">
      <p className="text-16 text-ink-2">
        {t.rich('setAside.line', {
          count,
          figure: figure(f, count),
          date: f.instantDate(since, clock.timeZone),
          settings: (chunks) => (
            <Link href="/settings" className="text-ink underline underline-offset-4">
              {chunks}
            </Link>
          ),
        })}
      </p>
      <Button ref={button} variant="secondary" className="self-start" onClick={hide}>
        {t('setAside.hide')}
      </Button>
    </div>
  );
}
