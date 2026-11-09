import type { LearnModuleMeta } from '@proofofcalm/content';
import type { CalendarDate } from '@proofofcalm/core';
import { Card } from '@proofofcalm/ui/components/card';
import { type ComponentType, type ReactNode, useMemo } from 'react';
import { useTranslations } from 'use-intl';
import { useFormatters } from '../../../lib/services';
import { type BodyElements, moduleElements, pageJoiner, withJoiner } from '../lib/body-elements';
import { ModuleChart } from './module-chart';

export type ModuleViewProps = {
  module: LearnModuleMeta;
  Body: ComponentType<{ components: BodyElements }>;
  /** Stands where the title does: the sheet's dialog title, which is the module's idea. */
  heading?: ReactNode;
};

/**
 * One Learn module (ADR-0048, docs/CONTENT-STYLE.md §5): the title, the last-reviewed date under it, the
 * reading time, the caveat in its box and the body. No page chrome: the route around it holds that, and so
 * does the "Why?" sheet. `lastReviewed` passed the front matter's schema at build, so it is a calendar date.
 * A module with a chart writes its `N %` with the joiner of the chart's figures (docs/CONTENT-STYLE.md §4), and
 * its `<Chart />` draws that chart.
 */
export function ModuleView({ module, Body, heading }: ModuleViewProps) {
  const t = useTranslations('learn');
  const f = useFormatters();
  const { chart } = module;
  const joiner = chart === 'none' ? ' ' : pageJoiner(f);
  const components = useMemo(
    () => ({ ...moduleElements(chart, joiner), Chart: () => <ModuleChart chart={chart} /> }),
    [chart, joiner],
  );
  return (
    <article className="flex flex-col gap-stack-md">
      <header className="flex flex-col gap-stack-xs">
        {heading ?? <h1 className="text-28">{withJoiner(module.title, joiner)}</h1>}
        <p className="text-13 text-ink-2">
          {t('module.lastReviewed', { date: f.date(module.lastReviewed as CalendarDate) })}
        </p>
        <p className="text-13 text-ink-2">{t('index.readingTime', { minutes: module.readingMinutes })}</p>
      </header>
      <Card>
        <p className="text-16">{withJoiner(module.caveat, joiner)}</p>
      </Card>
      <div className="flex flex-col gap-stack-md">
        <Body components={components} />
      </div>
    </article>
  );
}
