import { BRAND } from '@proofofcalm/app/lib/brand';
import type { ReactNode } from 'react';
import type { LegalSlug } from '../../lib/site/pages';
import { siteTranslator } from '../../lib/site-messages';
import { SiteMain } from './layout';

// A legal page before launch: its title, the one sentence that is already true, and the notice that
// the full text comes before opening (docs/LEGAL.md §5). The footer of the site layout carries the
// disclaimer line (§4).
export function legalTitle(slug: LegalSlug): string {
  return siteTranslator('legal')(`${slug}.title`);
}

export function LegalPage({ slug, children }: { slug: LegalSlug; children?: ReactNode }) {
  const t = siteTranslator('legal');
  return (
    <SiteMain>
      <h1 className="text-28">{t(`${slug}.title`)}</h1>
      <p>{t(`${slug}.lead`, { product: BRAND.name })}</p>
      <p>{t('placeholder', { product: BRAND.name })}</p>
      {children}
    </SiteMain>
  );
}
