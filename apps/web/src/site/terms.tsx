import { LegalLink, LegalPage, type LegalSection, LegalSections, LegalVersion } from './legal';

// The Terms of use at launch (docs/LEGAL.md §5): the launch items in order; the Plus section and tips come before
// charging, the account with M3.
const SECTIONS: readonly LegalSection[] = [
  { id: 'who', paragraphs: 1 },
  { id: 'what', paragraphs: 2 },
  { id: 'age', paragraphs: 1 },
  { id: 'countries', paragraphs: 1 },
  { id: 'data', paragraphs: 2 },
  { id: 'use', paragraphs: 2 },
  { id: 'prices', paragraphs: 2 },
  { id: 'risk', paragraphs: 2 },
  { id: 'changes', paragraphs: 2 },
  { id: 'liability', paragraphs: 1 },
  { id: 'law', paragraphs: 2 },
];

export function TermsPage() {
  return (
    <LegalPage slug="terms">
      <LegalSections
        slug="terms"
        sections={SECTIONS}
        after={{
          who: <LegalLink slug="contact" />,
          data: <LegalLink slug="privacy" />,
          risk: <LegalLink slug="risk" />,
        }}
      />
      <LegalVersion />
    </LegalPage>
  );
}
