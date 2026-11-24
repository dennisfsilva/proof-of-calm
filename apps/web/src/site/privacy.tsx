import { siteTranslator, useSiteLanguage } from '../../lib/site-messages';
import { LegalLink, LegalPage, type LegalSection, LegalSections, LegalVersion } from './legal';

// The Privacy notice at launch (docs/LEGAL.md §5): only the processors M2 runs; the account's processors come with M3,
// the payment provider before charging.
const SECTIONS: readonly LegalSection[] = [
  { id: 'controller', paragraphs: 1 },
  { id: 'device', paragraphs: 2 },
  { id: 'requests', paragraphs: 2 },
  { id: 'hosting', paragraphs: 3 },
  { id: 'prices', paragraphs: 1 },
  { id: 'mail', paragraphs: 1 },
  { id: 'rights', paragraphs: 3 },
  { id: 'security', paragraphs: 1 },
  { id: 'age', paragraphs: 1 },
  { id: 'storage', paragraphs: 1 },
];

/** The host's own notice, which governs what Vercel keeps beyond its runtime logs (docs/LEGAL.md §5). */
const VERCEL_PRIVACY_URL = 'https://vercel.com/legal/privacy-policy';

export function PrivacyPage() {
  const t = siteTranslator('legal', useSiteLanguage());
  // The external-link markup of the Risk page's official links (risk.tsx).
  const notice = (
    <p>
      <a
        href={VERCEL_PRIVACY_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="text-ink underline underline-offset-4 hover:text-ink-2"
      >
        {t('privacy.hosting.notice')}
      </a>
    </p>
  );
  return (
    <LegalPage slug="privacy">
      <LegalSections
        slug="privacy"
        sections={SECTIONS}
        after={{ controller: <LegalLink slug="contact" />, hosting: notice, storage: <LegalLink slug="cookies" /> }}
      />
      <LegalVersion />
    </LegalPage>
  );
}
