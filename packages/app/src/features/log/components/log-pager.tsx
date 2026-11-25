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
import { type Ref, useRef } from 'react';
import { useTranslations } from 'use-intl';
import { useFormatters } from '../../../lib/services';
import { figure } from '../lib/figure';
import type { LogRange } from './use-log-window';

// Under the Log's window of transactions (docs/DOMAIN.md §3.9, docs/CONTENT-STYLE.md §3): "Show newer entries" while
// a newer one is outside it, "Show older entries" while an older one is, and "Go to year" with each year that has a
// transaction, newest first, on the year of the window's first one. The screen moves the focus after each move.

export type LogPagerProps = {
  readonly range: LogRange;
  readonly years: readonly { readonly year: number; readonly start: number }[];
  /** The year of the window's first transaction. */
  readonly year: number | null;
  readonly onNewer: () => void;
  readonly onOlder: () => void;
  /** Goes to the transaction at `start` and says whether the window moved. */
  readonly onYear: (start: number) => boolean;
};

/**
 * "Entries 1 to 100 of N" above the window, "Entry N of N" when it holds one: the line a move of the window brings to
 * the top of the page.
 */
export function LogRangeLine({ range, ref }: { readonly range: LogRange; readonly ref: Ref<HTMLParagraphElement> }) {
  const t = useTranslations('log');
  const f = useFormatters();
  const first = figure(f, range.first);
  const count = figure(f, range.count);
  return (
    <p ref={ref} aria-live="polite" className="nums scroll-mt-result text-ink-2">
      {range.first === range.last
        ? t('page.rangeOne', { first, count })
        : t('page.range', { first, last: figure(f, range.last), count })}
    </p>
  );
}

export function LogPager({ range, years, year, onNewer, onOlder, onYear }: LogPagerProps) {
  const t = useTranslations('log');
  // A year that moved the window leaves the focus to the screen, which moves it once the window commits; the list
  // closing would otherwise return it to the choice, under the grown window (zoom-125, 2026-11-25).
  const moved = useRef(false);
  const choose = (chosen: number | null) => {
    const start = years.find((candidate) => candidate.year === chosen)?.start;
    moved.current = start !== undefined && onYear(start);
  };
  const finalFocus = () => {
    const returns = !moved.current;
    moved.current = false;
    return returns;
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
            <SelectContent finalFocus={finalFocus}>
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
