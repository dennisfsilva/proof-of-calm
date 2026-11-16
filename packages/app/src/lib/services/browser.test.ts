// @vitest-environment jsdom
import * as content from '@proofofcalm/content';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createBrowserServices } from './browser';

// The browser services are built with the boot language (ADR-0045 §8) and ask the content loaders for it
// (ADR-0057); a language change reboots, so they never switch language in place.
vi.mock('@proofofcalm/content', async (original) => {
  const actual = await original<typeof import('@proofofcalm/content')>();
  return {
    ...actual,
    loadRules: vi.fn(actual.loadRules),
    loadProfile: vi.fn(actual.loadProfile),
    loadProfiles: vi.fn(actual.loadProfiles),
  };
});

// A pt-PT rules chunk that is not cached, offline (outside the worker's precache): its import rejects.
vi.mock('../../../../content/rules/pt-PT/de.json', () => {
  throw new TypeError('Failed to fetch dynamically imported module');
});

afterEach(() => vi.clearAllMocks());

describe('createBrowserServices', () => {
  it('asks the loaders for the boot language, pt-PT', async () => {
    const services = createBrowserServices({ apiBase: '', language: 'pt-PT' });
    const rules = await services.rules('PT');
    expect(content.loadRules).toHaveBeenCalledWith('PT', 'pt-PT');
    expect(rules).toEqual(await content.loadRules('PT', 'pt-PT'));
    await services.countries.list();
    expect(content.loadProfiles).toHaveBeenCalledWith('pt-PT');
    await services.countries.card('PT');
    expect(content.loadProfile).toHaveBeenCalledWith('PT', 'pt-PT');
    expect(await services.rules('ZZ')).toEqual(await content.loadRules('XX'));
    expect(content.loadRules).toHaveBeenCalledWith('XX', 'pt-PT');
  });

  it('asks for English in an English boot', async () => {
    const services = createBrowserServices({ apiBase: '', language: 'en' });
    await services.rules('PT');
    expect(content.loadRules).toHaveBeenCalledWith('PT', 'en');
  });

  it("gives the English rules, holding rule and all, when the language's chunk fails to load", async () => {
    const services = createBrowserServices({ apiBase: '', language: 'pt-PT' });
    const english = await content.loadRules('DE');
    const rules = await services.rules('DE');
    expect(rules).toBe(english);
    expect(rules?.holdingRules).toEqual(english?.holdingRules);
    expect(rules?.name).toBe(english?.name);
  });
});
