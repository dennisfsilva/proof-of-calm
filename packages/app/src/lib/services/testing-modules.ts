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

type Profile = Awaited<ReturnType<ContentModule['loadProfiles']>>[number];

/**
 * `@proofofcalm/content` with `loadProfile` and `loadProfiles` answered from the profiles loaded once, in each
 * content language (ADR-0057).
 */
export async function profilesInMemory(content: ContentModule): Promise<ContentModule> {
  const languages = await Promise.all(
    content.CONTENT_LANGUAGES.map(async (language) => [language, await content.loadProfiles(language)] as const),
  );
  const byLanguage = new Map(languages);
  const byCode = new Map(
    languages.map(([language, profiles]) => [
      language,
      new Map<string, Profile>(profiles.map((profile) => [profile.code, profile])),
    ]),
  );
  return {
    ...content,
    loadProfile: async (code: string, language = 'en') => byCode.get(language)?.get(code) ?? null,
    loadProfiles: async (language = 'en') => [...(byLanguage.get(language) ?? [])],
  };
}

/** The namespaces module with each lazy namespace of each language loaded once and answered from memory. */
export async function namespacesInMemory(namespaces: NamespacesModule): Promise<NamespacesModule> {
  const entries = await Promise.all(
    Object.entries(namespaces.NAMESPACE_LOADERS).map(async ([language, loaders]) => {
      const inMemory = await Promise.all(
        Object.entries(loaders).map(async ([name, load]) => {
          const loaded = await load();
          return [name, async () => loaded] as const;
        }),
      );
      return [language, Object.fromEntries(inMemory)] as const;
    }),
  );
  return {
    ...namespaces,
    NAMESPACE_LOADERS: Object.fromEntries(entries) as unknown as NamespacesModule['NAMESPACE_LOADERS'],
  };
}
