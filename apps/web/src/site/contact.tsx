import { SECURITY_TXT_PATH } from '../../lib/site/pages';
import { siteTranslator } from '../../lib/site-messages';
import { LegalLink, LegalPage, type LegalSection, LegalSections, legalValues } from './legal';

// The Impressum at launch (docs/LEGAL.md §5): the provider's identity, the DSA and privacy contacts, then the security
// section, which security.txt names as its Policy (docs/SECURITY.md §4 and §13), so it keeps its own id.
const SECTIONS: readonly LegalSection[] = [
  { id: 'provider', paragraphs: 0 },
  { id: 'dsa', paragraphs: 1 },
  { id: 'privacy', paragraphs: 1 },
];

const FIELDS = ['name', 'legalForm', 'address', 'email', 'nif', 'vat', 'register', 'manager'] as const;

export function ContactPage() {
  const t = siteTranslator('legal');
  const values = legalValues();
  const provider = (
    <>
      <dl className="grid grid-cols-[auto_1fr] gap-x-stack-md gap-y-stack-xs">
        {FIELDS.map((field) => (
          <div key={field} className="contents">
            <dt className="text-ink-2">{t(`contact.fields.${field}`)}</dt>
            <dd>{values[field]}</dd>
          </div>
        ))}
      </dl>
      <p>{t('contact.provider.authority')}</p>
    </>
  );
  return (
    <LegalPage slug="contact">
      <LegalSections slug="contact" sections={SECTIONS} after={{ provider, privacy: <LegalLink slug="privacy" /> }} />
      <section id="security" aria-labelledby="security-title" className="flex flex-col gap-stack-sm">
        <h2 id="security-title" className="text-20">
          {t('contact.securityTitle')}
        </h2>
        <p>{t('contact.security')}</p>
        <p>
          <a href={SECURITY_TXT_PATH}>{t('contact.securityFile')}</a>
        </p>
      </section>
    </LegalPage>
  );
}
