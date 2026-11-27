// @vitest-environment jsdom
import { DEFAULT_PREFS, type Entry } from '@proofofcalm/core';
import { anEntry, aPlan, date, money, units } from '@proofofcalm/core/testing';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EMPTY_SNAPSHOT } from '../../../lib/adapters';
import type { PricesState } from '../../../lib/ports';
import { I18nProvider } from '../../../lib/i18n';
import { ServicesProvider } from '../../../lib/services';
import { createTestServices, TEST_PRICES } from '../../../lib/services/testing';
import errors from '../../../messages/en/errors.json';
import log from '../../../messages/en/log.json';
import { EntryForm, type EntryFormProps } from './entry-form';

// The CoinGecko credit beside the price the form filled in (ADR-0050, docs/CONTENT-STYLE.md §3 "Prices attribution"):
// shown while the field shows the snapshot's price, gone once the person types one of their own. The clock reads
// 20 Oct 2026; BTC costs €60,000.12 in CoinGecko's snapshot.

afterEach(cleanup);

const CREDIT = 'Price data by CoinGecko';

async function renderForm(props: Partial<EntryFormProps> = {}, prices: PricesState | null = TEST_PRICES) {
  const services = createTestServices({
    snapshot: { ...EMPTY_SNAPSHOT, prefs: DEFAULT_PREFS, plan: aPlan(), entries: [], prices },
  });
  render(
    <ServicesProvider services={services}>
      <I18nProvider messages={{ errors, log }}>
        <EntryForm kind="extra" editing={[]} onDone={vi.fn()} {...props} />
      </I18nProvider>
    </ServicesProvider>,
  );
  await act(() => services.start());
}

const type = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
const price = () => screen.getByLabelText<HTMLInputElement>('BTC price (EUR)');
const credit = () => screen.queryByText(CREDIT);

describe('EntryForm, the CoinGecko credit', () => {
  it('shows the credit at text-14 beside the price filled from the snapshot, in the price field', async () => {
    await renderForm();
    expect(price().value).toBe('60 000,12');
    expect(credit()?.closest('[data-slot="field"]')).toBe(price().closest('[data-slot="field"]'));
    expect(credit()?.className.split(' ')).toContain('text-14');
    expect(credit()?.closest('a')).toBeNull();
  });

  it('keeps the credit while an amount fills the units, and drops it once a price of their own is typed', async () => {
    await renderForm();
    type('BTC cost before fees (EUR)', '120.00');
    expect(credit()).not.toBeNull();
    type('BTC price (EUR)', '59000');
    expect(credit()).toBeNull();
  });

  it('drops the credit while an earlier date empties the filled price, and shows it again with the price', async () => {
    await renderForm();
    type('Date', '2026-10-18');
    expect(credit()).toBeNull();
    type('Date', '2026-10-20');
    expect(price().value).toBe('60 000,12');
    expect(credit()).not.toBeNull();
  });

  it('shows no credit with no price snapshot', async () => {
    await renderForm({}, null);
    expect(price().value).toBe('');
    expect(credit()).toBeNull();
  });

  it('shows no credit beside prices typed by hand, which CoinGecko did not supply', async () => {
    await renderForm({}, { ...TEST_PRICES, source: 'manual' });
    expect(price().value).toBe('60 000,12');
    expect(credit()).toBeNull();
  });

  it("shows no credit on an edit, whose price is the entry's own", async () => {
    const entry: Entry = anEntry({ date: date('2026-10-01'), amount: money('120'), units: units('0.002') });
    await renderForm({ editing: [entry] });
    expect(price().value).not.toBe('');
    expect(credit()).toBeNull();
  });
});
