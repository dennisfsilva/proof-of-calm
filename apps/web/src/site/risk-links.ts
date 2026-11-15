import type { CalendarDate } from '@proofofcalm/core';

// The official pages the Risk disclosure links to (docs/LEGAL.md §5): ESMA's register in the register sentence, then
// the supervisors' warnings and the ESAs' joint factsheet on crypto-assets and MiCA of 2025-10-06. Each was read on
// its `accessed` day; the labels are `legal.risk.links.<id>` and say only what the page holds.

export type OfficialLink = {
  id: 'esma-register' | 'cmvm' | 'bafin' | 'fca' | 'esas-pt' | 'esas-de' | 'esas-en';
  url: `https://${string}`;
  accessed: CalendarDate;
};

const FACTSHEET =
  'https://www.eba.europa.eu/sites/default/files/2025-10/0b10e48a-1a95-404c-b771-8bdb6503aac1/Updated%20Joint%20ESAs%20Factsheet%20on%20crypto-assets';
const READ = '2026-11-15' as CalendarDate;

/** The register first, as the register sentence links it; the warnings after it, in the page's order. */
export const RISK_LINKS: readonly OfficialLink[] = [
  {
    id: 'esma-register',
    url: 'https://www.esma.europa.eu/esmas-activities/digital-finance-and-innovation/markets-crypto-assets-regulation-mica',
    accessed: READ,
  },
  { id: 'cmvm', url: 'https://investidor.cmvm.pt/PInvestidor/', accessed: READ },
  {
    id: 'bafin',
    url: 'https://www.bafin.de/EN/die-bafin/publikationen-daten/risiken-im-fokus/Fokusrisiken_2026/RIF_Verbraucher_2/RIF_verbraucher_sozialemedien_node_en.html',
    accessed: READ,
  },
  { id: 'fca', url: 'https://www.fca.org.uk/consumers/cryptoassets', accessed: READ },
  { id: 'esas-pt', url: `${FACTSHEET}_PT.pdf`, accessed: READ },
  { id: 'esas-de', url: `${FACTSHEET}_DE_DE.pdf`, accessed: READ },
  { id: 'esas-en', url: `${FACTSHEET}_EN.pdf`, accessed: READ },
];
