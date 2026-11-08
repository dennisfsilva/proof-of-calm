// @vitest-environment jsdom
import type { CountryRules } from '@proofofcalm/core';
import { anEntry, aPlan, date, money } from '@proofofcalm/core/testing';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { EMPTY_SNAPSHOT } from '../adapters/memory-store';
import type { Snapshot } from '../ports';
import type { Services } from './create';
import { useBoot, useFormatters, useNumberInput, useRules, useSnapshot, useToday } from './hooks';
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

  it('useFormatters follows the loaded rules: Portugal’s format, British English without any', async () => {
    const services = createTestServices({ snapshot: withPlan, rules: async () => portugal });
    const text = mount(services);
    expect(text('money')).toBe('€1,234.56');
    await act(() => services.start());
    // Dates keep the English month name, never Portugal's 04/03/2028, which a reader can take as 3 April.
    expect(text('date')).toBe('4\u00a0Mar\u00a02028');
    expect(text('money')).toBe('1234,56 €');
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
    expect(text('money')).toBe('€1,234.56');
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

  it('useNumberInput reads in the UI language’s locale with no plan, or when the rules did not load', async () => {
    const empty = createTestServices();
    const text = mount(empty);
    await act(() => empty.start());
    expect(text('number')).toBe('1500');
    cleanup();
    const unloaded = createTestServices({ snapshot: withPlan, rules: async () => null });
    const again = mount(unloaded);
    await act(() => unloaded.start());
    expect(again('number')).toBe('1500');
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
