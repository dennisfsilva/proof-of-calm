import { SECURITY_TXT_PATH } from '../../lib/site/pages';
import { englishLang, siteTranslator, useSiteLanguage } from '../../lib/site-messages';
import {
  emptyOwnerValue,
  LegalLink,
  LegalPage,
  type LegalSection,
  LegalSections,
  legalValues,
  OPTIONAL_OWNER_FIELDS,
} from './legal';

// The Impressum at launch (docs/LEGAL.md §5): the provider's identity, the DSA and privacy contacts, then the security
// section, which security.txt names as its Policy (docs/SECURITY.md §4 and §13), so it keeps its own id.
const SECTIONS: readonly LegalSection[] = [
  { id: 'provider', paragraphs: 0 },
  { id: 'dsa', paragraphs: 1 },
  { id: 'privacy', paragraphs: 1 },
];

const FIELDS = ['name', 'legalForm', 'address', 'email', 'nif', 'vat', 'register', 'manager'] as const;

const optional = (field: (typeof FIELDS)[number]) => (OPTIONAL_OWNER_FIELDS as readonly string[]).includes(field);

/**
 * The provider's identity as a list; an optional field the owner left empty, or holding only spaces, has no line
 * (docs/LEGAL.md §5).
 */
export function ProviderFields({ values }: { values: ReturnType<typeof legalValues> }) {
  const t = siteTranslator('legal', useSiteLanguage());
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-stack-md gap-y-stack-xs">
      {FIELDS.filter((field) => !(optional(field) && emptyOwnerValue(values[field]))).map((field) => (
        <div key={field} className="contents">
          <dt className="text-ink-2">{t(`contact.fields.${field}`)}</dt>
          <dd>{values[field]}</dd>
        </div>
      ))}
    </dl>
  );
}

export function ContactPage() {
  const language = useSiteLanguage();
  const t = siteTranslator('legal', language);
  const provider = (
    <>
      <ProviderFields values={legalValues()} />
      <p>{t('contact.provider.authority')}</p>
    </>
  );
  return (
    <LegalPage slug="contact">
      <LegalSections slug="contact" sections={SECTIONS} after={{ provider, privacy: <LegalLink slug="privacy" /> }} />
      <section
        id="security"
        aria-labelledby="security-title"
        className="flex flex-col gap-stack-sm"
        lang={englishLang(language, 'legal.contact.security')}
      >
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
