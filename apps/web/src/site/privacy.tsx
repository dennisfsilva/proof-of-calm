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

export function PrivacyPage() {
  return (
    <LegalPage slug="privacy">
      <LegalSections slug="privacy" sections={SECTIONS} after={{ storage: <LegalLink slug="cookies" /> }} />
      <LegalVersion />
    </LegalPage>
  );
}
