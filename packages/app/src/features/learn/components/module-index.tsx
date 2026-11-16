import type { LearnModuleMeta } from '@proofofcalm/content';
import { useLocale, useTranslations } from 'use-intl';
import { textLang } from '../../../lib/i18n/text-lang';
import { Link } from '../../../lib/navigation';

const ROW = 'flex min-h-target flex-col justify-center gap-stack-xs no-underline';
const TITLE = 'font-semibold text-18 text-ink underline underline-offset-4';

export type ModuleIndexProps = { modules: readonly LearnModuleMeta[]; thisFall?: boolean };

/**
 * Learn's index: the heading, a row per module, the whole row its link, then the country library's row. With
 * no module, the heading and that row, and no empty-state copy. The route nests under `/learn`, so a row's
 * href is relative to it. While a fall of the held coins is under way on this device (`thisFall`), the fall
 * page's row comes first.
 */
export function ModuleIndex({ modules, thisFall = false }: ModuleIndexProps) {
  const t = useTranslations('learn');
  // Each module's title and idea are its English front matter, marked as module-view marks them (ADR-0057).
  const lang = textLang('en', useLocale());
  return (
    <>
      <h1 className="text-28">{t('title')}</h1>
      <ul className="flex flex-col gap-stack-md">
        {thisFall && (
          <li>
            <Link href="/fall-under-way" className={ROW}>
              <span className={TITLE}>{t('thisFall.title')}</span>
              <span className="text-16 text-ink-2">{t('thisFall.row')}</span>
            </Link>
          </li>
        )}
        {modules.map((module) => (
          <li key={module.slug}>
            <Link href={`/${module.slug}`} className={ROW}>
              <span lang={lang} className={TITLE}>
                {module.title}
              </span>
              <span lang={lang} className="text-16 text-ink-2">
                {module.idea}
              </span>
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
