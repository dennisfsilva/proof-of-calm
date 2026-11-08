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
});

describe('namespacesInMemory', () => {
  it('answers each lazy namespace with the file the loader imports', async () => {
    const memory = await namespacesInMemory(namespaces);
    expect(Object.keys(memory.NAMESPACE_LOADERS)).toEqual(Object.keys(namespaces.NAMESPACE_LOADERS));
    expect((await memory.NAMESPACE_LOADERS.log()).default).toEqual((await namespaces.NAMESPACE_LOADERS.log()).default);
  });
});
