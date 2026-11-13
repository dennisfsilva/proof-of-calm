// @vitest-environment jsdom
import { countryRules, loadProfile } from '@proofofcalm/content';
import type { CountryCode, CountryRules } from '@proofofcalm/core';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { I18nProvider } from '../../../lib/i18n';
import { type Services, ServicesProvider } from '../../../lib/services';
import { fixtureNowMs, fixtureSnapshot } from '../../../lib/services/fixtures';
import { createTestServices } from '../../../lib/services/testing';
import errors from '../../../messages/en/errors.json';
import log from '../../../messages/en/log.json';
import { EntryForm } from './entry-form';

// The entry form's number locale (ADR-0034, ADR-0020 Readings) when it opens before the plan's country's
// rules have loaded, as a reload onto an open sheet does: the fixture plan is Portugal's, so an en-GB UI
// reads numbers in pt-PT once the rules are in, and the form never reads them in en-GB meanwhile.

afterEach(cleanup);

const PAID = 'BTC cost before fees (EUR)';
const RECEIVED = 'BTC received (units)';
const value = (label: string) => screen.getByLabelText<HTMLInputElement>(label).value;
const type = (label: string, text: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value: text } });

const portugal = async (): Promise<CountryRules | null> => {
  const profile = await loadProfile('PT');
  return profile === null ? null : countryRules(profile);
};

/** Rules that arrive when `release` is called, as a slow profile chunk does. */
function heldRules() {
  let release: () => void = () => undefined;
  const arrived = new Promise<void>((resolve) => {
    release = resolve;
  });
  return {
    rules: async () => {
      await arrived;
      return portugal();
    },
    release: () => release(),
  };
}

function servicesWith(
  rules: (country: CountryCode) => Promise<CountryRules | null>,
  drafts = createTestServices().drafts,
) {
  return createTestServices({ snapshot: fixtureSnapshot(), nowMs: fixtureNowMs('buy'), rules, drafts });
}

function mount(services: Services) {
  render(
    <ServicesProvider services={services}>
      <I18nProvider messages={{ errors, log }}>
        <EntryForm kind="dca" editing={[]} onDone={() => undefined} />
      </I18nProvider>
    </ServicesProvider>,
  );
}

/** Mounts the form, then starts the services without waiting for the rules; resolves once the plan is read. */
async function open(services: Services) {
  mount(services);
  let started: Promise<void> = Promise.resolve();
  act(() => {
    started = services.start();
  });
  await waitFor(() => expect(services.domain.store.getState().snapshot.plan).not.toBeNull());
  return () => act(() => started);
}

describe('EntryForm while the rules load', () => {
  it('keeps a draft typed after the rules loaded through a reload that mounts before they do', async () => {
    const drafts = createTestServices().drafts;
    const first = servicesWith(portugal, drafts);
    await act(() => first.start());
    mount(first);
    type(RECEIVED, '0.0012');
    fireEvent.blur(screen.getByLabelText(RECEIVED));
    expect(value(RECEIVED)).toBe('0,0012');
    first.dispose();
    cleanup();

    const held = heldRules();
    const second = servicesWith(held.rules, drafts);
    const started = await open(second);
    expect(screen.queryByLabelText(RECEIVED)).toBeNull();
    held.release();
    await started();
    expect(value(RECEIVED)).toBe('0,0012');
    second.dispose();
  });

  it('reads "1,500" as 1.5 in a Portuguese plan opened while the rules load, never as 1500', async () => {
    const held = heldRules();
    const services = servicesWith(held.rules);
    const started = await open(services);
    expect(screen.queryByLabelText(PAID)).toBeNull();
    held.release();
    await started();
    type(PAID, '1,500');
    fireEvent.blur(screen.getByLabelText(PAID));
    expect(value(PAID)).toBe('1,50');
    services.dispose();
  });

  it('stays open with what was typed when the plan moves to a country whose rules still load', async () => {
    // Portugal's rules arrive, Germany's never do: the form keeps the locale it opened with (ADR-0034 Readings).
    const services = servicesWith((country) =>
      country === 'PT' ? portugal() : new Promise<CountryRules | null>(() => undefined),
    );
    await act(() => services.start());
    mount(services);
    type(RECEIVED, '0,0012');
    const before = screen.getByLabelText(RECEIVED);
    await act(() =>
      services.domain.write((snapshot) => ({ plan: snapshot.plan && { ...snapshot.plan, country: 'DE' } })),
    );
    expect(screen.queryByLabelText(RECEIVED)).toBe(before);
    expect(value(RECEIVED)).toBe('0,0012');
    services.dispose();
  });
});
