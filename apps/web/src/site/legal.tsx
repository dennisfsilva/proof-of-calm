import { BRAND } from '@proofofcalm/app/lib/brand';
import type { ReactNode } from 'react';
import { LEGAL_PAGES, type LegalSlug } from '../../lib/site/pages';
import {
  englishLang,
  type SiteLanguage,
  siteTranslator,
  useSiteLanguage,
} from '../../lib/site-messages';
import messages from '../../messages/en.json';
import { SiteMain } from './layout';

// A legal page: its title and its lead, then its sections (docs/LEGAL.md §5). The footer of the site layout carries
// the disclaimer line (§4).
export function legalTitle(slug: LegalSlug, language: SiteLanguage = 'en'): string {
  return siteTranslator('legal', language)(`${slug}.title`);
}

/**
 * The values every legal message may use: the product's name and the identity fields the owner fills in before the
 * pages are published (docs/LEGAL.md §5), each a visible `[Owner: …]` placeholder under `legal.owner` until then.
 */
export function legalValues(): typeof messages.legal.owner & { product: string } {
  return { ...messages.legal.owner, product: BRAND.name };
}

type LegalPageProps = { slug: LegalSlug; children?: ReactNode };

export function LegalPage({ slug, children }: LegalPageProps) {
  const language = useSiteLanguage();
  const t = siteTranslator('legal', language);
  return (
    <SiteMain>
      <h1 className="text-28" lang={englishLang(language, `legal.${slug}.title`)}>
        {t(`${slug}.title`)}
      </h1>
      <p lang={englishLang(language, `legal.${slug}.lead`)}>{t(`${slug}.lead`, { product: BRAND.name })}</p>
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

/** The sections in the order given, each a region named by its heading and marked `lang="en"` where it is English. */
export function LegalSections({ slug, sections, after = {} }: LegalSectionsProps) {
  const language = useSiteLanguage();
  const t = siteTranslator('legal', language);
  const values = legalValues();
  // The keys are built from the section list, so the typed translator cannot check them; a missing one throws.
  const message = (key: string) => t(`${slug}.${key}` as Parameters<typeof t>[0], values);
  return sections.map(({ id, paragraphs }) => (
    <section
      key={id}
      aria-labelledby={`${slug}-${id}-title`}
      className="flex flex-col gap-stack-sm"
      lang={englishLang(language, `legal.${slug}.${id}`)}
    >
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

/**
 * A link to another legal page, labelled with its title, on a line of its own. The four drafted pages that carry it
 * stay English, so a title the language translates (Risk's) carries that language's mark.
 */
export function LegalLink({ slug }: { slug: LegalSlug }) {
  const language = useSiteLanguage();
  const path = LEGAL_PAGES.find((page) => page.slug === slug)?.path;
  const lang = language === 'en' ? undefined : (englishLang(language, `legal.${slug}.title`) ?? language);
  return (
    <p>
      <a href={path} lang={lang} className="text-ink underline underline-offset-4 hover:text-ink-2">
        {legalTitle(slug, language)}
      </a>
    </p>
  );
}

/** The closing line of a drafted page: its version and the date the owner publishes it, English in every language. */
export function LegalVersion() {
  const language = useSiteLanguage();
  return (
    <p className="text-13 text-ink-2" lang={englishLang(language, 'legal.version')}>
      {siteTranslator('legal', language)('version', legalValues())}
    </p>
  );
}
