// @vitest-environment jsdom
import type { CoinId, CountryCode, Percent } from '@proofofcalm/core';
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider, type UiLanguage } from '../../../lib/i18n';
import { ServicesProvider } from '../../../lib/services';
import { fixtureSnapshot } from '../../../lib/services/fixtures';
import { createTestServices } from '../../../lib/services/testing';
import en from '../../../messages/en/settings.json';
import pt from '../../../messages/pt-PT/settings.json';
import type { ReportNote } from '../actions';
import { PrototypeImport, PrototypeReport } from './prototype-import';

// The country step suggests from the device (`deviceLocale()`): the device is a Lisbon one, as in onboarding's
// tests, so the suggestion does not depend on the machine's time zone (CI's runner is UTC).
const LISBON = { languages: ['en-GB', 'pt-PT'], timeZone: 'Europe/Lisbon' } as const;
vi.mock('../../../lib/adapters', async (original) => ({
  ...(await original<typeof import('../../../lib/adapters')>()),
  deviceLocale: () => LISBON,
}));

// The report's split line names three percentages, the coin's old and new share and the whole they add up to: all
// three take the spacing of the plan's country (docs/CONTENT-STYLE.md §4), `100%` in Portugal and `100 %` with a
// no-break space in Germany, in English and in pt-PT alike, never a spacing typed into the message.

afterEach(cleanup);

const NOTE: ReportNote = {
  code: 'split-normalised',
  coin: 'BTC' as CoinId,
  from: '49.9' as Percent,
  to: '50.1' as Percent,
};
const NO_BREAK_SPACE = String.fromCodePoint(0xa0);

async function reportLine(country: CountryCode, language: UiLanguage, note: ReportNote = NOTE): Promise<string> {
  const snapshot = fixtureSnapshot();
  const plan = snapshot.plan === null ? null : { ...snapshot.plan, country };
  const services = createTestServices({ snapshot: { ...snapshot, plan }, language });
  await act(() => services.start());
  render(
    <ServicesProvider services={services}>
      <I18nProvider locale={language} messages={{ settings: language === 'en' ? en : pt }}>
        <PrototypeReport notes={[note]} />
      </I18nProvider>
    </ServicesProvider>,
  );
  const line = screen.getByRole('listitem').textContent ?? '';
  services.dispose();
  return line;
}

describe('PrototypeReport’s split line', () => {
  it.each([
    ['PT', 'en'],
    ['PT', 'pt-PT'],
    ['DE', 'en'],
    ['DE', 'pt-PT'],
  ] as const)(
    'writes 100 with the percent spacing of %s’s numbers in %s, as {from} and {to}',
    async (country, language) => {
      const percentages = [...(await reportLine(country, language)).matchAll(/(\d[\d.,]*)(\s?)%/gu)];
      // Both countries' numbers take the decimal comma, in English too (ADR-0023).
      expect(percentages.map(([, figure]) => figure)).toEqual(['49,90', '50,10', '100']);
      const spacing = percentages.map(([, , space]) => space);
      expect(spacing).toEqual([spacing[0], spacing[0], spacing[0]]);
      expect(spacing[0]).toBe(country === 'DE' ? NO_BREAK_SPACE : '');
    },
  );

  // A share closed within the rounding tolerance can change by less than 0.005: at two decimals the line read
  // "from 50,00% to 50,00%". Both figures take the fewest decimals, from 2 to 4, that tell them apart.
  it.each([
    ['PT', 'en'],
    ['PT', 'pt-PT'],
    ['DE', 'en'],
    ['DE', 'pt-PT'],
  ] as const)('never writes the same figure twice in %s’s numbers in %s', async (country, language) => {
    const note: ReportNote = { ...NOTE, from: '49.995' as Percent, to: '50' as Percent };
    const percentages = [...(await reportLine(country, language, note)).matchAll(/(\d[\d.,]*)\s?%/gu)];
    expect(percentages.map(([, figure]) => figure)).toEqual(['49,995', '50,000', '100']);
  });
});

// The country step names its country through its forms (docs/CONTENT-STYLE.md §9): it loads the `countries` messages with
// onboarding's, so no line renders a bare key.
describe('PrototypeImport’s country step', () => {
  it('loads the country forms with the step', async () => {
    const logged = vi.spyOn(console, 'error');
    const services = createTestServices({ snapshot: { ...fixtureSnapshot(), plan: null }, language: 'en' });
    await act(() => services.start());
    render(
      <ServicesProvider services={services}>
        <I18nProvider messages={{ settings: en }}>
          <PrototypeImport
            name={null}
            count={3}
            hasPlan={false}
            pending={false}
            onReplace={vi.fn()}
            onImport={vi.fn()}
          />
        </I18nProvider>
      </ServicesProvider>,
    );
    expect(await screen.findByText('This device suggests Portugal.', {}, { timeout: 4000 })).toBeDefined();
    expect(logged.mock.calls.filter((call) => String(call[0]).includes('MISSING_MESSAGE'))).toEqual([]);
    logged.mockRestore();
    services.dispose();
  });
});
