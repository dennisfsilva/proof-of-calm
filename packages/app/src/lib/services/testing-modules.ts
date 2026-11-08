// The unit tests' stand-ins for the product's import() calls (the jurisdiction profiles and the lazy message
// namespaces), for `vi.mock` factories. Under Vitest every import() asks the main process for the module, even
// one already loaded (Vite's module runner sends `fetchModule` with `cached: true`); under load that round trip
// outlasts a findBy (1 s), and it happens on every mount that loads a profile. These load each file once,
// while the test file loads, and then answer from memory, so a findBy waits on renders only:
//
//   vi.mock('@proofofcalm/content', async (original) =>
//     (await import('../../../lib/services/testing-modules')).profilesInMemory(await original()));
//
// The stories need none of this: a browser answers a repeated import() from its module map.
import type * as Content from '@proofofcalm/content';
import type * as Namespaces from '../i18n/namespaces';

type ContentModule = typeof Content;
type NamespacesModule = typeof Namespaces;

/** `@proofofcalm/content` with `loadProfile` and `loadProfiles` answered from the profiles loaded once. */
export async function profilesInMemory(content: ContentModule): Promise<ContentModule> {
  const profiles = await content.loadProfiles();
  const byCode = new Map<string, (typeof profiles)[number]>(profiles.map((profile) => [profile.code, profile]));
  return {
    ...content,
    loadProfile: async (code: string) => byCode.get(code) ?? null,
    loadProfiles: async () => [...profiles],
  };
}

/** The namespaces module with each lazy namespace loaded once and answered from memory. */
export async function namespacesInMemory(namespaces: NamespacesModule): Promise<NamespacesModule> {
  const entries = await Promise.all(
    Object.entries(namespaces.NAMESPACE_LOADERS).map(async ([name, load]) => {
      const loaded = await load();
      return [name, async () => loaded] as const;
    }),
  );
  return {
    ...namespaces,
    NAMESPACE_LOADERS: Object.fromEntries(entries) as unknown as NamespacesModule['NAMESPACE_LOADERS'],
  };
}
