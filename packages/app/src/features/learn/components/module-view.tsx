import type { LearnModuleMeta } from '@proofofcalm/content';
import type { CalendarDate } from '@proofofcalm/core';
import { Card } from '@proofofcalm/ui/components/card';
import { type ComponentType, type ReactNode, useMemo } from 'react';
import { useTranslations } from 'use-intl';
import { useFormatters, useToday } from '../../../lib/services';
import { type BodyElements, moduleElements, moduleJoiner, withJoiner } from '../lib/body-elements';
import { reviewLine, TAXES_MODULE } from '../lib/taxes';
import { ModuleChart } from './module-chart';

export type ModuleViewProps = {
  module: LearnModuleMeta;
  Body: ComponentType<{ components: BodyElements }>;
  /** Stands where the title does: the sheet's dialog title, which is the module's idea. */
  heading?: ReactNode;
  /** Directly above the body: the route's line to the fall page while a fall is under way, the tax module's card. */
  lead?: ReactNode;
};

/**
 * One Learn module (ADR-0048, docs/CONTENT-STYLE.md §5): the title, the review line under it, the reading time,
 * the caveat in its box and the body. No page chrome: the route around it holds that, and so does the "Why?" sheet.
 * The review dates passed the front matter's schema at build, so they are calendar dates. From the day after
 * `nextReviewDue` the line says the review is overdue, and the tax module adds why that matters on a line of its own.
 * A module that shows figures the app formats writes its `N %` with the page's joiner (`moduleJoiner`,
 * docs/CONTENT-STYLE.md §4), and a module's `<Chart />` draws its chart.
 */
export function ModuleView({ module, Body, heading, lead }: ModuleViewProps) {
  const t = useTranslations('learn');
  const f = useFormatters();
  const { chart } = module;
  const joiner = moduleJoiner(module, f);
  const state = reviewLine(module, useToday());
  const components = useMemo(
    () => ({ ...moduleElements(joiner), Chart: () => <ModuleChart chart={chart} /> }),
    [chart, joiner],
  );
  return (
    <article className="flex flex-col gap-stack-md">
      <header className="flex flex-col gap-stack-xs">
        {heading ?? <h1 className="text-28">{withJoiner(module.title, joiner)}</h1>}
        <p className="text-13 text-ink-2">
          {t.rich('module.lastReviewed', {
            date: f.date(module.lastReviewed as CalendarDate),
            due: f.date(module.nextReviewDue as CalendarDate),
            state,
            ink: (text) => <span className="text-ink">{text}</span>,
          })}
        </p>
        {state === 'overdue' && module.slug === TAXES_MODULE && (
          <p className="text-13 text-ink">{t('module.taxOverdue')}</p>
        )}
        <p className="text-13 text-ink-2">{t('index.readingTime', { minutes: module.readingMinutes })}</p>
      </header>
      <Card>
        <p className="text-16">{withJoiner(module.caveat, joiner)}</p>
      </Card>
      {lead}
      <div className="flex flex-col gap-stack-md">
        <Body components={components} />
      </div>
    </article>
  );
}
