// @vitest-environment jsdom
import { anEntry } from '@proofofcalm/core/testing';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { I18nProvider } from '../../../lib/i18n';
import { ServicesProvider } from '../../../lib/services';
import { createTestServices } from '../../../lib/services/testing';
import log from '../../../messages/en/log.json';
import { FormHints } from './form-hints';

// The line over a grouped edit whose entries were at different venues (docs/CONTENT-STYLE.md §3, Edit an entry): the
// venues named, "Venue" for one; the entries with none counted as a figure with its unit (§1 rule 1, §4).

afterEach(cleanup);

const at = (venue: string | null) => anEntry({ venue });
const KEEPS = 'Each keeps its own unless you type a venue for all of them.';

function venuesLine(venues: readonly (string | null)[]) {
  render(
    <ServicesProvider services={createTestServices()}>
      <I18nProvider messages={{ log }}>
        <FormHints added={false} editing={venues.map(at)} />
      </I18nProvider>
    </ServicesProvider>,
  );
  return screen.getByText(/these entries/).textContent;
}

describe('FormHints on a grouped edit at different venues', () => {
  it('names two venues', () => {
    expect(venuesLine(['Bitvavo', 'Ledger'])).toBe(`Venues on these entries: Bitvavo and Ledger. ${KEEPS}`);
  });

  it('names the one venue and counts the 2 entries with none', () => {
    expect(venuesLine(['Bitvavo', null, null])).toBe(`Venue on these entries: Bitvavo. 2 entries have none. ${KEEPS}`);
  });

  it('names two venues and counts the 1 entry with none', () => {
    expect(venuesLine(['Bitvavo', 'Ledger', null])).toBe(
      `Venues on these entries: Bitvavo and Ledger. 1 entry has none. ${KEEPS}`,
    );
  });
});
