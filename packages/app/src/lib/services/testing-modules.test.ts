import * as content from '@proofofcalm/content';
import { describe, expect, it } from 'vitest';
import * as namespaces from '../i18n/namespaces';
import { namespacesInMemory, profilesInMemory } from './testing-modules';

describe('profilesInMemory', () => {
  it('answers every profile as the loader does, and null for a country without one', async () => {
    const memory = await profilesInMemory(content);
    expect(await memory.loadProfiles()).toEqual(await content.loadProfiles());
    expect(await memory.loadProfile('PT')).toEqual(await content.loadProfile('PT'));
    expect(await memory.loadProfile('ZZ')).toBeNull();
    expect(memory.countryRules).toBe(content.countryRules);
  });

  it('answers each content language as the loader does (ADR-0057)', async () => {
    const memory = await profilesInMemory(content);
    for (const language of content.CONTENT_LANGUAGES) {
      expect(await memory.loadProfiles(language)).toEqual(await content.loadProfiles(language));
      expect(await memory.loadProfile('PT', language)).toEqual(await content.loadProfile('PT', language));
    }
  });
});

describe('namespacesInMemory', () => {
  it('answers each lazy namespace with the file the loader imports', async () => {
    const memory = await namespacesInMemory(namespaces);
    expect(Object.keys(memory.NAMESPACE_LOADERS)).toEqual(Object.keys(namespaces.NAMESPACE_LOADERS));
    expect((await memory.NAMESPACE_LOADERS.en.log()).default).toEqual(
      (await namespaces.NAMESPACE_LOADERS.en.log()).default,
    );
  });
});
