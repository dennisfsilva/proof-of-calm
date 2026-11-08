import type { LearnModuleMeta } from '@proofofcalm/content';
import { useTranslations } from 'use-intl';
import { Link } from '../../../lib/navigation';

const ROW = 'flex min-h-target flex-col justify-center gap-stack-xs no-underline';
const TITLE = 'font-semibold text-18 text-ink underline underline-offset-4';

export type ModuleIndexProps = { modules: readonly LearnModuleMeta[] };

/**
 * Learn's index: the heading, a row per module, the whole row its link, then the country library's row. With
 * no module, the heading and that row, and no empty-state copy. The route nests under `/learn`, so a row's
 * href is relative to it.
 */
export function ModuleIndex({ modules }: ModuleIndexProps) {
  const t = useTranslations('learn');
  return (
    <>
      <h1 className="text-28">{t('title')}</h1>
      <ul className="flex flex-col gap-stack-md">
        {modules.map((module) => (
          <li key={module.slug}>
            <Link href={`/${module.slug}`} className={ROW}>
              <span className={TITLE}>{module.title}</span>
              <span className="text-16 text-ink-2">{module.idea}</span>
              <span className="text-13 text-ink-2">{t('index.readingTime', { minutes: module.readingMinutes })}</span>
            </Link>
          </li>
        ))}
        <li>
          <Link href="/countries" className={ROW}>
            <span className={TITLE}>{t('countries.title')}</span>
            <span className="text-16 text-ink-2">{t('countries.line')}</span>
          </Link>
        </li>
      </ul>
    </>
  );
}
