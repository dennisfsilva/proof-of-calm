import type { LearnModuleMeta } from '@proofofcalm/content';
import type { CalendarDate } from '@proofofcalm/core';
import { Card } from '@proofofcalm/ui/components/card';
import type { ComponentType, ReactNode } from 'react';
import { useTranslations } from 'use-intl';
import { useFormatters } from '../../../lib/services';
import { type BodyElements, MODULE_ELEMENTS } from '../lib/body-elements';

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
 */
export function ModuleView({ module, Body, heading }: ModuleViewProps) {
  const t = useTranslations('learn');
  const f = useFormatters();
  return (
    <article className="flex flex-col gap-stack-md">
      <header className="flex flex-col gap-stack-xs">
        {heading ?? <h1 className="text-28">{module.title}</h1>}
        <p className="text-13 text-ink-2">
          {t('module.lastReviewed', { date: f.date(module.lastReviewed as CalendarDate) })}
        </p>
        <p className="text-13 text-ink-2">{t('index.readingTime', { minutes: module.readingMinutes })}</p>
      </header>
      <Card>
        <p className="text-16">{module.caveat}</p>
      </Card>
      <div className="flex flex-col gap-stack-md">
        <Body components={MODULE_ELEMENTS} />
      </div>
    </article>
  );
}
