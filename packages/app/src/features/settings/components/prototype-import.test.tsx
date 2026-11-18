// @vitest-environment jsdom
import type { CoinId, CountryCode, Percent } from '@proofofcalm/core';
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { I18nProvider, type UiLanguage } from '../../../lib/i18n';
import { ServicesProvider } from '../../../lib/services';
import { fixtureSnapshot } from '../../../lib/services/fixtures';
import { createTestServices } from '../../../lib/services/testing';
import en from '../../../messages/en/settings.json';
import pt from '../../../messages/pt-PT/settings.json';
import { PrototypeReport } from './prototype-import';

// The report's split line names three percentages, the coin's old and new share and the whole they add up to: all
// three take the spacing of the plan's country (docs/CONTENT-STYLE.md §4), `100%` in Portugal and `100 %` with a
// no-break space in Germany, in English and in pt-PT alike, never a spacing typed into the message.

afterEach(cleanup);

const NOTE = { code: 'split-normalised', coin: 'BTC' as CoinId, from: '49.9' as Percent, to: '50.1' as Percent };
const NO_BREAK_SPACE = String.fromCodePoint(0xa0);

async function reportLine(country: CountryCode, language: UiLanguage): Promise<string> {
  const snapshot = fixtureSnapshot();
  const plan = snapshot.plan === null ? null : { ...snapshot.plan, country };
  const services = createTestServices({ snapshot: { ...snapshot, plan }, language });
  await act(() => services.start());
  render(
    <ServicesProvider services={services}>
      <I18nProvider locale={language} messages={{ settings: language === 'en' ? en : pt }}>
        <PrototypeReport notes={[NOTE] as const} />
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
  ] as const)('writes 100 with the percent spacing of %s’s numbers in %s, as {from} and {to}', async (country, language) => {
    const percentages = [...(await reportLine(country, language)).matchAll(/(\d[\d.,]*)(\s?)%/gu)];
    // Both countries' numbers take the decimal comma, in English too (ADR-0023).
    expect(percentages.map(([, figure]) => figure)).toEqual(['49,90', '50,10', '100']);
    const spacing = percentages.map(([, , space]) => space);
    expect(spacing).toEqual([spacing[0], spacing[0], spacing[0]]);
    expect(spacing[0]).toBe(country === 'DE' ? NO_BREAK_SPACE : '');
  });
});
