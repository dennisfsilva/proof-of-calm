// The country profiles the tax-year export's tests mount (components/tax-year-export.test.tsx), as literals: a
// content review may change any text, source or date of the live files (docs/CONTENT-OPS.md §8), so the expected
// files beside this one are made from these, never from the live data. Every field the export reads holds the value
// the live file held on 2026-11-16; the card is a placeholder the export never reads, and every rule names a source
// kept here. A test holds each to the schema.
import type { CountryProfile } from '@proofofcalm/content';

const CARD: CountryProfile['card'] = {
  classification: 'Fixture card: the tax-year file reads none of it.',
  taxableEvents: [{ event: 'sale-to-fiat', taxable: 'yes', note: 'Fixture note.' }],
  rates: [{ label: 'Fixture rate', value: '1%', validFrom: '2026-01-01', validTo: null }],
  allowances: [],
  holdingRuleText: 'Fixture holding rule text.',
  lotRuleText: 'Fixture lot rule text.',
  losses: 'Fixture losses.',
  reporting: ['Fixture reporting.'],
  caveats: ['Fixture caveat.'],
  summary60: 'Fixture summary.',
};

const STATUS = {
  confidence: 'high',
  changeNotice: null,
  lastReviewed: '2026-11-05',
  reviewedBy: 'owner',
} as const;

/** The rule sources of a profile: the holding rule cites its own source, every other rule the lot rule's. */
const ruleSources = (holdingRule: string, lotRule: string) => ({
  holdingRule,
  lotRule,
  rates: lotRule,
  losses: lotRule,
  reporting: lotRule,
});

const PT: CountryProfile = {
  schemaVersion: 1,
  code: 'PT',
  name: 'Portugal',
  currency: 'EUR',
  locales: ['pt-PT'],
  numberFormatLocale: 'pt-PT',
  dateFormatLocale: 'pt-PT',
  timezones: ['Europe/Lisbon', 'Atlantic/Madeira', 'Atlantic/Azores'],
  englishConfidence: 'low',
  taxYear: { start: '01-01', end: '12-31' },
  filingNote: 'Calendar tax year.',
  computationModel: { kind: 'per-lot' },
  holdingRule: { kind: 'days', days: 365, effect: 'exempt' },
  holdingRuleOverrides: [],
  holdingRuleConditions: [
    'Tax-free only when the counterparty is tax-resident in the EU, the EEA, or a treaty jurisdiction (declared in Anexo G Q18B otherwise).',
    'Exempt sales must still be declared (Anexo G1 Q7).',
    'Whether the holding period carries across a crypto-to-crypto swap is unsettled. Proof of Calm treats a swap as a sale and a new purchase, so a new holding period starts for the coins received.',
    'Loss of Portuguese tax residence counts as a disposal (art. 10 n.º 25 CIRS, numbered n.º 22 in 2023–2025 documents).',
  ],
  lotRule: 'fifo',
  lotScope: 'per-venue',
  lotRuleNote:
    'First in, first out, applied separately per custodian or platform when units are held at more than one (art. 43 n.º 9 CIRS, formerly n.º 7).',
  card: CARD,
  pendingChanges: [],
  sources: [
    {
      key: 'pt-cirs-art10',
      title: 'Código do IRS, artigo 10.º',
      url: 'https://info.portaldasfinancas.gov.pt/pt/informacao_fiscal/codigos_tributarios/cirs_rep/Pages/irs10.aspx',
      publisher: 'Autoridade Tributária e Aduaneira',
      kind: 'law',
      published: null,
      accessed: '2026-11-03',
    },
    {
      key: 'pt-cirs-art43',
      title: 'Código do IRS, artigo 43.º',
      url: 'https://info.portaldasfinancas.gov.pt/pt/informacao_fiscal/codigos_tributarios/cirs_rep/Pages/irs43.aspx',
      publisher: 'Autoridade Tributária e Aduaneira',
      kind: 'law',
      published: null,
      accessed: '2026-10-16',
    },
  ],
  ruleSources: ruleSources('pt-cirs-art10', 'pt-cirs-art43'),
  status: { ...STATUS, version: 2, changedOn: '2026-11-05', nextReviewDue: '2027-11-02' },
};

const GB: CountryProfile = {
  schemaVersion: 1,
  code: 'GB',
  name: 'United Kingdom',
  currency: 'GBP',
  locales: ['en-GB', 'cy-GB'],
  numberFormatLocale: 'en-GB',
  dateFormatLocale: 'en-GB',
  timezones: ['Europe/London'],
  taxYear: { start: '04-06', end: '04-05' },
  filingNote: 'Tax year 6 April to 5 April.',
  computationModel: { kind: 'per-lot' },
  holdingRule: { kind: 'none' },
  holdingRuleOverrides: [],
  holdingRuleConditions: [],
  lotRule: 'pooled',
  lotScope: 'global',
  lotRuleNote:
    'One section 104 pool per token type, after the same-day rule and the 30-day rule (TCGA 1992 ss. 104, 105, and 106A). Proof of Calm lists each purchase and leaves the pooling to the accountant.',
  card: CARD,
  pendingChanges: [],
  sources: [
    {
      key: 'gb-hmrc-crypto22100',
      title: 'Cryptoassets Manual CRYPTO22100: Capital Gains Tax: what is a disposal',
      url: 'https://www.gov.uk/hmrc-internal-manuals/cryptoassets-manual/crypto22100',
      publisher: 'HM Revenue & Customs',
      kind: 'authority',
      published: '2021-03-30',
      accessed: '2026-11-05',
    },
    {
      key: 'gb-hmrc-crypto22200',
      title: 'Cryptoassets Manual CRYPTO22200: Capital Gains Tax: pooling',
      url: 'https://www.gov.uk/hmrc-internal-manuals/cryptoassets-manual/crypto22200',
      publisher: 'HM Revenue & Customs',
      kind: 'authority',
      published: '2021-03-30',
      accessed: '2026-11-05',
    },
  ],
  ruleSources: ruleSources('gb-hmrc-crypto22100', 'gb-hmrc-crypto22200'),
  status: { ...STATUS, version: 1, changedOn: '2024-10-30', nextReviewDue: '2027-04-06' },
};

const FR: CountryProfile = {
  schemaVersion: 1,
  code: 'FR',
  name: 'France',
  currency: 'EUR',
  locales: ['fr-FR'],
  numberFormatLocale: 'fr-FR',
  dateFormatLocale: 'fr-FR',
  timezones: [
    'Europe/Paris',
    'America/Martinique',
    'America/Guadeloupe',
    'America/Cayenne',
    'Indian/Reunion',
    'Indian/Mayotte',
  ],
  taxYear: { start: '01-01', end: '12-31' },
  filingNote: 'Calendar tax year.',
  computationModel: { kind: 'portfolio-wide' },
  holdingRule: { kind: 'none' },
  holdingRuleOverrides: [],
  holdingRuleConditions: [],
  lotRule: 'unspecified',
  lotScope: 'global',
  lotRuleNote:
    'No matching per lot: the gain on each taxable sale is computed on the whole portfolio (art. 150 VH bis III CGI).',
  card: CARD,
  pendingChanges: [],
  sources: [
    {
      key: 'fr-impots-faq-actifs-numeriques',
      title: "Comment déclarer les plus ou moins-values sur cessions d'actifs numériques ?",
      url: 'https://www.impots.gouv.fr/particulier/questions/comment-declarer-les-plus-ou-moins-values-sur-cessions-dactifs-numeriques',
      publisher: 'Direction générale des Finances publiques',
      kind: 'authority',
      published: '2023-06-16',
      accessed: '2026-11-05',
    },
    {
      key: 'fr-bofip-pvbmc-30-20',
      title: "BOI-RPPM-PVBMC-30-20: Cession d'actifs numériques, base d'imposition",
      url: 'https://bofip.impots.gouv.fr/bofip/11968-PGP.html/identifiant=BOI-RPPM-PVBMC-30-20-20190902',
      publisher: 'Bulletin officiel des finances publiques',
      kind: 'authority',
      published: '2019-09-02',
      accessed: '2026-11-05',
    },
  ],
  ruleSources: ruleSources('fr-impots-faq-actifs-numeriques', 'fr-bofip-pvbmc-30-20'),
  status: { ...STATUS, version: 1, changedOn: '2026-01-01', nextReviewDue: '2027-01-01' },
};

const NL: CountryProfile = {
  schemaVersion: 1,
  code: 'NL',
  name: 'Netherlands',
  currency: 'EUR',
  locales: ['nl-NL'],
  numberFormatLocale: 'nl-NL',
  dateFormatLocale: 'nl-NL',
  timezones: ['Europe/Amsterdam'],
  taxYear: { start: '01-01', end: '12-31' },
  filingNote: 'Calendar tax year.',
  computationModel: { kind: 'wealth-snapshot', date: '01-01' },
  holdingRule: { kind: 'none' },
  holdingRuleOverrides: [],
  holdingRuleConditions: [],
  lotRule: 'unspecified',
  lotScope: 'global',
  lotRuleNote: 'No sale is matched to a purchase: box 3 taxes the value held on 1 January, not the result of a sale.',
  card: CARD,
  pendingChanges: [],
  sources: [
    {
      key: 'nl-bd-crypto',
      title: "Moet ik aangifte doen en belasting betalen over mijn crypto's?",
      url: 'https://www.belastingdienst.nl/wps/wcm/connect/nl/werk-en-inkomen/content/aangifte-doen-en-belasting-betalen-met-cryptos',
      publisher: 'Belastingdienst',
      kind: 'authority',
      published: null,
      accessed: '2026-11-05',
    },
  ],
  ruleSources: ruleSources('nl-bd-crypto', 'nl-bd-crypto'),
  status: { ...STATUS, version: 1, changedOn: '2026-01-01', nextReviewDue: '2027-01-01' },
};

// Italy has no expected file: the export test reads its lot rule (lifo) and its note from this literal.
const IT: CountryProfile = {
  schemaVersion: 1,
  code: 'IT',
  name: 'Italy',
  currency: 'EUR',
  locales: ['it-IT'],
  numberFormatLocale: 'it-IT',
  dateFormatLocale: 'it-IT',
  timezones: ['Europe/Rome'],
  taxYear: { start: '01-01', end: '12-31' },
  filingNote: 'Calendar tax year.',
  computationModel: { kind: 'per-lot' },
  holdingRule: { kind: 'none' },
  holdingRuleOverrides: [],
  holdingRuleConditions: [],
  lotRule: 'lifo',
  lotScope: 'global',
  lotRuleNote:
    'The most recently bought coins count as sold first: Circolare 30/E §3.2.1 states the L.I.F.O. method for cripto-attività of the same denomination under the regime dichiarativo. A cost without proof counts as zero.',
  card: CARD,
  pendingChanges: [],
  sources: [
    {
      key: 'it-ade-circolare-30e-2023',
      title: 'Circolare n. 30/E del 27 ottobre 2023: Trattamento fiscale delle cripto-attività',
      url: 'https://www.agenziaentrate.gov.it/portale/documents/20143/5589638/Circolare+criptoattivita+del+27+ottobre+2023.pdf',
      publisher: 'Agenzia delle Entrate',
      kind: 'authority',
      published: '2023-10-27',
      accessed: '2026-11-05',
    },
  ],
  ruleSources: ruleSources('it-ade-circolare-30e-2023', 'it-ade-circolare-30e-2023'),
  status: { ...STATUS, version: 1, changedOn: '2026-01-01', nextReviewDue: '2027-01-01' },
};

/** The literal profiles by country code. */
export const TAX_YEAR_PROFILES: Readonly<Record<'PT' | 'GB' | 'FR' | 'NL' | 'IT', CountryProfile>> = {
  PT,
  GB,
  FR,
  NL,
  IT,
};
