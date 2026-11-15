import type { LearnModuleMeta } from '@proofofcalm/content';
import type { CalendarDate } from '@proofofcalm/core';
import type { ReactNode } from 'react';
import { useTranslations } from 'use-intl';
import type { PastFall } from '../../../lib/services/red-day-types';
import { DrawdownBars } from '../components/module-chart';
import { ModuleArticle, type ModuleViewProps } from '../components/module-view';
import { type SiteLinks, useSiteFormatters } from './static';

// Learn's index and one module as static pages (ADR-0048 Deviations of 2026-11-15), rendered inside `StaticLearn`:
// plain anchors, no script, and only what holds on any device. So the index has no row for a fall under way, and a
// module page has no line to the fall page and no plan's card: those read the device's plan and prices.

const PAGE = 'mx-auto flex w-full max-w-reading flex-col gap-stack-lg px-gutter py-stack-lg';
const BACK_LINK =
  'inline-flex min-h-target items-center self-start font-semibold text-16 text-ink underline underline-offset-4';
const ROW = 'flex min-h-target flex-col justify-center gap-stack-xs no-underline';
const TITLE = 'font-semibold text-18 text-ink underline underline-offset-4';

export type SiteLearnIndexProps = { modules: readonly LearnModuleMeta[]; links: SiteLinks };

/** The app's Learn index as a page: the heading, a row per module, the whole row its link, then the country library's. */
export function SiteLearnIndex({ modules, links }: SiteLearnIndexProps) {
  const t = useTranslations('learn');
  return (
    <div className={PAGE}>
      <h1 className="text-28">{t('title')}</h1>
      <ul className="flex flex-col gap-stack-md">
        {modules.map((module) => (
          <li key={module.slug}>
            <a href={links.module(module.slug)} className={ROW}>
              <span className={TITLE}>{module.title}</span>
              <span className="text-16 text-ink-2">{module.idea}</span>
              <span className="text-13 text-ink-2">{t('index.readingTime', { minutes: module.readingMinutes })}</span>
            </a>
          </li>
        ))}
        <li>
          <a href={links.countries} className={ROW}>
            <span className={TITLE}>{t('countries.title')}</span>
            <span className="text-16 text-ink-2">{t('countries.line')}</span>
          </a>
        </li>
      </ul>
    </div>
  );
}

export type SiteModulePageProps = {
  module: LearnModuleMeta;
  Body: ModuleViewProps['Body'];
  /** The cycles file's rows, which a module with a chart draws. */
  falls: readonly PastFall[];
  /** The day the review line is read at. */
  today: CalendarDate;
  links: SiteLinks;
  /** After the module: the tax module's country rows. */
  after?: ReactNode;
};

/** One module as a page: the way back to the index, then the module as the app's route shows it. */
export function SiteModulePage({ module, Body, falls, today, links, after }: SiteModulePageProps) {
  const t = useTranslations('learn');
  const f = useSiteFormatters();
  const Chart = module.chart === 'drawdowns-bar' ? () => <DrawdownBars falls={falls} f={f} /> : undefined;
  return (
    <div className={PAGE}>
      <a href={links.learn} className={BACK_LINK}>
        {t('module.back')}
      </a>
      <ModuleArticle module={module} Body={Body} f={f} today={today} {...(Chart !== undefined && { Chart })} />
      {after}
    </div>
  );
}
