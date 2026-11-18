import { BRAND } from '@proofofcalm/app/lib/brand';
import type { ReactNode } from 'react';
import type { LegalSlug } from '../../lib/site/pages';
import {
  englishLang,
  type SiteLanguage,
  siteTranslator,
  useSiteLanguage,
  useSiteTranslator,
} from '../../lib/site-messages';
import { SiteMain } from './layout';

// A legal page: its title and its lead, then, while the page is a draft, the notice that the full text comes before
// opening (docs/LEGAL.md §5). The footer of the site layout carries the disclaimer line (§4).
export function legalTitle(slug: LegalSlug, language: SiteLanguage = 'en'): string {
  return siteTranslator('legal', language)(`${slug}.title`);
}

type LegalPageProps = { slug: LegalSlug; draft?: boolean; children?: ReactNode };

export function LegalPage({ slug, draft = true, children }: LegalPageProps) {
  const language = useSiteLanguage();
  const t = siteTranslator('legal', language);
  return (
    <SiteMain>
      <h1 className="text-28" lang={englishLang(language, `legal.${slug}.title`)}>
        {t(`${slug}.title`)}
      </h1>
      <p lang={englishLang(language, `legal.${slug}.lead`)}>{t(`${slug}.lead`, { product: BRAND.name })}</p>
      {draft && <p>{t('placeholder', { product: BRAND.name })}</p>}
      {children}
    </SiteMain>
  );
}

/** One section of a legal page: its h2 is `legal.<slug>.<id>.title`, its paragraphs `p1` to `p<paragraphs>`. */
export type LegalSection = { readonly id: string; readonly paragraphs: number };

type LegalSectionsProps = {
  slug: LegalSlug;
  sections: readonly LegalSection[];
  /** What a section shows after its paragraphs: a table, a sentence with a link, a list of links. */
  after?: Readonly<Partial<Record<string, ReactNode>>>;
};

/** The sections in the order given, each a region named by its heading. */
export function LegalSections({ slug, sections, after = {} }: LegalSectionsProps) {
  const t = useSiteTranslator('legal');
  // The keys are built from the section list, so the typed translator cannot check them; a missing one throws.
  const message = (key: string) => t(`${slug}.${key}` as Parameters<typeof t>[0], { product: BRAND.name });
  return sections.map(({ id, paragraphs }) => (
    <section key={id} aria-labelledby={`${slug}-${id}-title`} className="flex flex-col gap-stack-sm">
      <h2 id={`${slug}-${id}-title`} className="text-20">
        {message(`${id}.title`)}
      </h2>
      {Array.from({ length: paragraphs }, (_, index) => (
        <p key={`p${index + 1}`}>{message(`${id}.p${index + 1}`)}</p>
      ))}
      {after[id]}
    </section>
  ));
}
