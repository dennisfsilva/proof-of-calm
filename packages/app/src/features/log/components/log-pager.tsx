'use client';

import { Button } from '@proofofcalm/ui/components/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@proofofcalm/ui/components/select';
import type { Ref } from 'react';
import { useTranslations } from 'use-intl';
import { useFormatters } from '../../../lib/services';
import { figure } from '../lib/figure';
import type { LogRange } from './use-log-window';

// Under the Log's window of transactions (docs/DOMAIN.md §3.9, docs/CONTENT-STYLE.md §3): "Show newer entries" while
// a newer one is outside it, "Show older entries" while an older one is, and "Go to year" with each year that has a
// transaction, newest first, on the year of the window's first one. The screen moves the focus after a move.

export type LogPagerProps = {
  readonly range: LogRange;
  readonly years: readonly { readonly year: number; readonly start: number }[];
  /** The year of the window's first transaction. */
  readonly year: number | null;
  readonly onNewer: () => void;
  readonly onOlder: () => void;
  readonly onYear: (start: number) => void;
};

/** "Entries 1 to 48 of N" above the window: the line a move of the window brings to the top of the page. */
export function LogRangeLine({ range, ref }: { readonly range: LogRange; readonly ref: Ref<HTMLParagraphElement> }) {
  const t = useTranslations('log');
  const f = useFormatters();
  return (
    <p ref={ref} aria-live="polite" className="nums scroll-mt-result text-ink-2">
      {t('page.range', { first: figure(f, range.first), last: figure(f, range.last), count: figure(f, range.count) })}
    </p>
  );
}

export function LogPager({ range, years, year, onNewer, onOlder, onYear }: LogPagerProps) {
  const t = useTranslations('log');
  const choose = (chosen: number | null) => {
    const start = years.find((candidate) => candidate.year === chosen)?.start;
    if (start !== undefined) onYear(start);
  };
  return (
    <div className="flex flex-wrap items-end gap-target-gap">
      {range.first > 1 && (
        <Button variant="secondary" onClick={onNewer}>
          {t('page.newer')}
        </Button>
      )}
      {range.last < range.count && (
        <Button variant="secondary" onClick={onOlder}>
          {t('page.older')}
        </Button>
      )}
      {years.length > 1 && (
        <div className="flex w-40 flex-col gap-stack-xs">
          <Select<number> value={year} onValueChange={choose}>
            <SelectLabel>{t('page.year')}</SelectLabel>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {years.map((candidate) => (
                <SelectItem key={candidate.year} value={candidate.year}>
                  {String(candidate.year)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
    </div>
  );
}
