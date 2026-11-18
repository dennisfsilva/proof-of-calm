import { SECURITY_TXT_PATH } from '../../lib/site/pages';
import { englishLang, siteTranslator, useSiteLanguage } from '../../lib/site-messages';
import { LegalPage } from './legal';

// security.txt names this section as its Policy (docs/SECURITY.md §4 and §13).
export function ContactPage() {
  const language = useSiteLanguage();
  const t = siteTranslator('legal', language);
  return (
    <LegalPage slug="contact">
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
