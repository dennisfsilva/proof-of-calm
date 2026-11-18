import { Fragment, type ReactNode } from 'react';
import { LEGAL_PAGES } from '../../lib/site/pages';
import { englishLang, siteTranslator, useSiteLanguage } from '../../lib/site-messages';

// The site pages before launch: each page's own content, then the footer that every site page
// carries, the one-line disclaimer with a link to the Risk page (docs/LEGAL.md §4) and the legal pages.
// The links sit inline in a sentence-like line, so their target size follows the text (WCAG 2.5.8).
// Plain anchors: the site pages are prerendered and ship no script (ADR-0045 §6).
export function SiteLayout({ children }: { children: ReactNode }) {
  const language = useSiteLanguage();
  const t = siteTranslator('site', language);
  const legal = siteTranslator('legal', language);
  const links = [
    { path: '/', label: t('home'), lang: undefined },
    ...LEGAL_PAGES.map((page) => ({
      path: page.path,
      label: legal(`${page.slug}.title`),
      lang: englishLang(language, `legal.${page.slug}.title`),
    })),
  ];
  return (
    <>
      {children}
      <footer className="mx-auto flex w-full max-w-reading flex-col gap-stack-sm px-gutter pb-stack-lg text-14">
        <p>
          {t('footer')} <a href="/risk">{t('risk')}</a>
        </p>
        <nav aria-label={t('legal')}>
          <p>
            {links.map((link, index) => (
              <Fragment key={link.path}>
                {index > 0 ? ' · ' : null}
                <a href={link.path} lang={link.lang}>
                  {link.label}
                </a>
              </Fragment>
            ))}
          </p>
        </nav>
      </footer>
    </>
  );
}

/** The one main column every site page uses. */
export function SiteMain({ children }: { children: ReactNode }) {
  return (
    <main id="main" className="mx-auto flex w-full max-w-reading flex-col gap-stack-lg px-gutter py-stack-lg">
      {children}
    </main>
  );
}
