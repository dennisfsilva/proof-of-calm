// @vitest-environment jsdom
import type { CountryRules } from '@proofofcalm/core';
import { anEntry, aPlan, date, instant, money, month, units } from '@proofofcalm/core/testing';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { EMPTY_SNAPSHOT } from '../adapters/memory-store';
import { createFormatters, type Formatters } from '../format';
import type { Snapshot } from '../ports';
import type { Services } from './create';
import { useBoot, useFormatters, useNumberInput, useRules, useRulesSettled, useSnapshot, useToday } from './hooks';
import { ServicesProvider } from './provider';
import { createTestServices } from './testing';

afterEach(cleanup);

const withPlan: Snapshot = { ...EMPTY_SNAPSHOT, plan: aPlan() };
const portugal = { locales: ['pt-PT'], numberFormatLocale: 'pt-PT', dateFormatLocale: 'pt-PT' } as CountryRules;

function Probe() {
  const entries = useSnapshot((snapshot) => snapshot.entries.length);
  const formatters = useFormatters();
  const numberInput = useNumberInput();
  const typed = numberInput?.parse('1,500');
  return (
    <>
      <output data-testid="entries">{entries}</output>
      <output data-testid="boot">{useBoot()}</output>
      <output data-testid="rules">{useRules() === null ? 'none' : 'loaded'}</output>
      <output data-testid="settled">{useRulesSettled() ? 'settled' : 'loading'}</output>
      <output data-testid="today">{useToday()}</output>
      <output data-testid="money">{formatters.money(money('1234.56'), 'EUR')}</output>
      <output data-testid="date">{formatters.date(date('2028-03-04'))}</output>
      <output data-testid="number">{typed === undefined ? 'none' : typed.ok ? typed.value : typed.error.code}</output>
    </>
  );
}

function mount(services: Services) {
  render(
    <ServicesProvider services={services}>
      <Probe />
    </ServicesProvider>,
  );
  return (id: string) => screen.getByTestId(id).textContent;
}

describe('the services hooks', () => {
  it('useSnapshot re-renders after a write', async () => {
    const services = createTestServices({ snapshot: withPlan });
    const text = mount(services);
    await act(() => services.start());
    expect(text('entries')).toBe('0');
    await act(() => services.domain.write({ entries: [anEntry()] }));
    expect(text('entries')).toBe('1');
  });

  it('useBoot goes loading → ready, and stays loading while the rules are on their way', async () => {
    let answer: (rules: CountryRules | null) => void = () => undefined;
    const pending = new Promise<CountryRules | null>((resolve) => {
      answer = resolve;
    });
    const services = createTestServices({ snapshot: withPlan, rules: () => pending });
    const text = mount(services);
    expect(text('boot')).toBe('loading');
    const started = services.start();
    await waitFor(() => expect(services.domain.store.getState().status).toBe('ready'));
    expect(text('boot')).toBe('loading');
    answer(portugal);
    await act(() => started);
    expect(text('boot')).toBe('ready');
  });

  it('useRulesSettled tells rules still loading from rules the device does not have', async () => {
    let answer: (rules: CountryRules | null) => void = () => undefined;
    const pending = new Promise<CountryRules | null>((resolve) => {
      answer = resolve;
    });
    const services = createTestServices({ snapshot: withPlan, rules: () => pending });
    const text = mount(services);
    const started = services.start();
    await waitFor(() => expect(services.domain.store.getState().status).toBe('ready'));
    expect([text('rules'), text('settled')]).toEqual(['none', 'loading']);
    answer(null);
    await act(() => started);
    expect([text('rules'), text('settled')]).toEqual(['none', 'settled']);
  });

  it('useRulesSettled is false with no plan', async () => {
    const services = createTestServices({ snapshot: EMPTY_SNAPSHOT });
    const text = mount(services);
    await act(() => services.start());
    expect(text('settled')).toBe('loading');
  });

  it('useFormatters follows the loaded rules: Portugal’s format, British English without any', async () => {
    const services = createTestServices({ snapshot: withPlan, rules: async () => portugal });
    const text = mount(services);
    expect(text('money')).toBe('€1,234.56');
    await act(() => services.start());
    // Dates keep the English month name, never Portugal's 04/03/2028, which a reader can take as 3 April.
    expect(text('date')).toBe('4\u00a0Mar\u00a02028');
    expect(text('money')).toBe('1234,56 €');
  });

  it('useFormatters gives every mount of the same locales one set of formatters, written as createFormatters writes', async () => {
    const seen: Formatters[] = [];
    function Grab() {
      seen.push(useFormatters());
      return null;
    }
    const services = createTestServices({ snapshot: withPlan, rules: async () => portugal });
    render(
      <ServicesProvider services={services}>
        <Grab />
        <Grab />
      </ServicesProvider>,
    );
    await act(() => services.start());
    const [first, second] = [seen[0], seen.at(-1)];
    if (first === undefined || second === undefined) throw new Error('no formatters');
    expect(new Set(seen.filter((format) => format.locales.numbers === 'en-GB')).size).toBe(1);
    expect(new Set(seen.filter((format) => format.locales.numbers === 'pt-PT')).size).toBe(1);
    const fresh = createFormatters(second.locales.numbers, second.locales.ui);
    const write = (format: Formatters) => [
      format.money(money('-1234.56'), 'EUR', { signed: true }),
      format.units(units('0.00123456'), 'BTC', 8),
      format.percent(money('12.34')),
      format.date(date('2028-03-04')),
      format.dayMonth(date('2028-03-04')),
      format.month(month('2028-03')),
      format.list(['BTC', 'ETH', 'SOL']),
      format.time(instant('2026-03-29T00:30:00Z'), 'Europe/Lisbon', instant('2026-03-01T12:00:00Z')),
      format.instantDate(instant('2026-03-29T00:30:00Z'), 'Europe/Lisbon'),
      format.relativeDays(date('2028-03-02'), date('2028-03-04')),
    ];
    expect(write(second)).toEqual(write(fresh));
    expect(write(first)).toEqual(write(createFormatters(first.locales.numbers, first.locales.ui)));
  });

  it('useRules hides another country’s rules while the formatters keep their locale until the new ones load', async () => {
    let answer: (rules: CountryRules | null) => void = () => undefined;
    const rules = async (country: string) =>
      country === 'PT'
        ? portugal
        : new Promise<CountryRules | null>((resolve) => {
            answer = resolve;
          });
    const services = createTestServices({ snapshot: withPlan, rules });
    const text = mount(services);
    await act(() => services.start());
    expect(text('rules')).toBe('loaded');
    const portuguese = text('money');
    expect(portuguese).toMatch(/^1234,56\s€$/);
    const plan = services.domain.store.getState().snapshot.plan;
    if (plan === null) throw new Error('no plan');
    await act(() => services.domain.write({ plan: { ...plan, country: 'DE' } }));
    expect(services.ui.getState().rules?.country).toBe('PT');
    expect(text('rules')).toBe('none');
    expect(text('money')).toBe(portuguese);
    expect(text('boot')).toBe('ready');
    await act(async () => answer(null));
    expect(text('rules')).toBe('none');
    // Germany's rules did not load: its locales still come from the generated locales file (#261 A).
    expect(text('money')).toBe('1.234,56 €');
  });

  it('useNumberInput gives none while the plan’s rules load, then reads in its country’s locale', async () => {
    let answer: (rules: CountryRules | null) => void = () => undefined;
    const pending = new Promise<CountryRules | null>((resolve) => {
      answer = resolve;
    });
    const services = createTestServices({ snapshot: withPlan, rules: () => pending });
    const text = mount(services);
    const started = services.start();
    await waitFor(() => expect(services.domain.store.getState().status).toBe('ready'));
    expect(text('number')).toBe('none');
    answer(portugal);
    await act(() => started);
    expect(text('number')).toBe('1.5');
  });

  it('useNumberInput reads in the UI language’s locale with no plan, and in the country’s when its rules did not load', async () => {
    const empty = createTestServices();
    const text = mount(empty);
    await act(() => empty.start());
    expect(text('number')).toBe('1500');
    cleanup();
    const unloaded = createTestServices({ snapshot: withPlan, rules: async () => null });
    const again = mount(unloaded);
    await act(() => unloaded.start());
    expect(again('number')).toBe('1.5');
  });

  it('useNumberInput and useFormatters take the country’s number locale when its rules rejected', async () => {
    // #261 A: the locale comes from the generated locales file (ADR-0049), so it never depends on the rules chunk.
    const rejected = async (): Promise<CountryRules | null> => {
      throw new Error('the rules chunk did not arrive');
    };
    // The dates keep the UI language's month name (ADR-0023, Corrections of 2026-10-20).
    for (const [country, language, number, amount, day] of [
      ['PT', 'en', '1.5', '1234,56 €', '4 Mar 2028'],
      ['GB', 'pt-PT', '1500', '€1,234.56', '4 de março de 2028'],
    ] as const) {
      const services = createTestServices({
        snapshot: { ...EMPTY_SNAPSHOT, plan: aPlan({ country }) },
        rules: rejected,
        language,
      });
      const text = mount(services);
      await act(() => services.start());
      expect(services.ui.getState().rules).toEqual({ country, rules: null });
      expect([text('number'), text('money'), text('date')]).toEqual([number, amount, day]);
      cleanup();
    }
  });

  it('useToday follows the UI store', async () => {
    const services = createTestServices();
    const text = mount(services);
    await act(() => services.start());
    expect(text('today')).toBe('2026-10-20');
    act(() => services.ui.getState().setToday(date('2026-10-21')));
    expect(text('today')).toBe('2026-10-21');
  });
});
