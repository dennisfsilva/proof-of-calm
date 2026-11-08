import { Fragment, useId } from 'react';
import { useTranslations } from 'use-intl';

// Settings → About (docs/LEGAL.md §5, ADR-0047): the site line with its Risk link, then the other legal pages, so
// the installed app reaches each of them. Plain anchors to the site pages, as every Risk link in the app: they
// are not app routes, so the navigation adapter would hash-prefix them on the static-export host. The links sit
// inline in a sentence-like line, as on the site pages, so their target size follows the text (WCAG 2.5.8).

const LINK = 'text-ink underline underline-offset-4 hover:text-ink-2';
const PAGES = [
  ['terms', '/terms'],
  ['privacy', '/privacy'],
  ['cookies', '/cookies'],
  ['contact', '/contact'],
] as const;

export function AboutSection() {
  const t = useTranslations('settings.about');
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-stack-sm text-ink-2">
      <h2 id={headingId} className="font-semibold text-20 text-ink">
        {t('heading')}
      </h2>
      <p>
        {t('line')}{' '}
        <a href="/risk" className={LINK}>
          {t('riskLink')}
        </a>
      </p>
      <nav aria-label={t('legal')}>
        <p>
          {PAGES.map(([key, path], index) => (
            <Fragment key={key}>
              {index > 0 ? ' · ' : null}
              <a href={path} className={LINK}>
                {t(key)}
              </a>
            </Fragment>
          ))}
        </p>
      </nav>
    </section>
  );
}
