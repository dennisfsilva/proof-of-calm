import type { ContentLanguage, LearnModuleMeta } from '@proofofcalm/content';
import type { CalendarDate } from '@proofofcalm/core';
import { Card } from '@proofofcalm/ui/components/card';
import { type ComponentType, type ReactNode, useCallback, useMemo } from 'react';
import { useLocale, useTranslations } from 'use-intl';
import type { Formatters } from '../../../lib/format';
import { textLang } from '../../../lib/i18n/text-lang';
import { useFormatters, useToday } from '../../../lib/services';
import { type BodyElements, moduleElements, moduleJoiner, withJoiner } from '../lib/body-elements';
import { reviewLine, TAXES_MODULE } from '../lib/taxes';
import { ModuleChart } from './module-chart';

const NO_CHART: BodyElements['Chart'] = () => null;

/**
 * When a module's language differs from the screen's (English when no translation exists or its chunk fails), its
 * title, idea, caveat and body carry that `lang` (ADR-0057, WCAG 2.2 SC 3.1.2); when the two agree, nothing is marked.
 */
export const useModuleLang = (language: ContentLanguage = 'en') => textLang(language, useLocale());

export type ModuleViewProps = {
  module: LearnModuleMeta;
  Body: ComponentType<{ components: BodyElements }>;
  /** The language the module's texts are in (`useModuleBody`); English by default. */
  language?: ContentLanguage;
  /** Stands where the title does: the sheet's dialog title, which is the module's idea. */
  heading?: ReactNode;
  /** Directly above the body: the route's line to the fall page while a fall is under way, the tax module's card. */
  lead?: ReactNode;
};

/**
 * One Learn module (ADR-0048, docs/CONTENT-STYLE.md §5): the title, the review line under it, the reading time,
 * the caveat in its box and the body. No page chrome: the route around it holds that, and so does the "Why?" sheet.
 * The review dates passed the front matter's schema at build, so they are calendar dates. From the day after
 * `nextReviewDue` the line says the review is overdue, and the tax module adds why that matters on a line of its own,
 * naming the same last-reviewed date, since the country card below it carries a date of its own.
 * A module that shows figures the app formats writes its `N %` with the page's joiner (`moduleJoiner`,
 * docs/CONTENT-STYLE.md §4), and a module's `<Chart />` draws its chart.
 */
export function ModuleView(props: ModuleViewProps) {
  const f = useFormatters();
  const today = useToday();
  const { chart } = props.module;
  // One component per chart, so a render of the route or the sheet keeps the chart mounted with its rows.
  const Chart = useCallback(() => <ModuleChart chart={chart} />, [chart]);
  return <ModuleArticle {...props} f={f} today={today} Chart={Chart} />;
}

export type ModuleArticleProps = ModuleViewProps & {
  f: Formatters;
  /** The day the review line is read at: the app's tick, or the static page's build date. */
  today: CalendarDate;
  /** What the body's `<Chart />` draws; none for a module without one. */
  Chart?: BodyElements['Chart'];
};

/** `ModuleView` without services: the static site pages render it with their own formatters, date and chart. */
export function ModuleArticle({
  module,
  Body,
  language,
  heading,
  lead,
  f,
  today,
  Chart = NO_CHART,
}: ModuleArticleProps) {
  const t = useTranslations('learn');
  const joiner = moduleJoiner(module, f);
  const state = reviewLine(module, today);
  const reviewed = f.date(module.lastReviewed as CalendarDate);
  const components = useMemo(() => ({ ...moduleElements(joiner), Chart }), [Chart, joiner]);
  const lang = useModuleLang(language);
  return (
    <article className="flex flex-col gap-stack-md">
      <header className="flex flex-col gap-stack-xs">
        {heading ?? (
          <h1 lang={lang} className="text-28">
            {withJoiner(module.title, joiner)}
          </h1>
        )}
        <p className="text-13 text-ink-2">
          {t.rich('module.lastReviewed', {
            date: reviewed,
            due: f.date(module.nextReviewDue as CalendarDate),
            state,
            ink: (text) => <span className="text-ink whitespace-nowrap">{text}</span>,
            keep: (text) => <span className="whitespace-nowrap">{text}</span>,
          })}
        </p>
        {state === 'overdue' && module.slug === TAXES_MODULE && (
          <p className="text-13 text-ink">{t('module.taxOverdue', { date: reviewed })}</p>
        )}
        <p className="text-13 text-ink-2">{t('index.readingTime', { minutes: module.readingMinutes })}</p>
      </header>
      <Card>
        <p lang={lang} className="text-16">
          {withJoiner(module.caveat, joiner)}
        </p>
      </Card>
      {lead}
      <div lang={lang} className="flex flex-col gap-stack-md">
        <Body components={components} />
      </div>
    </article>
  );
}
