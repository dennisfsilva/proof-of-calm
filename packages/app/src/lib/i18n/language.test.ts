import { describe, expect, it } from 'vitest';
import {
  deviceLanguage,
  isUiLanguage,
  LANGUAGE_NAMES,
  LANGUAGE_STORAGE_KEY,
  listedLanguages,
  localStorageOrNull,
  PREVIEW_LANGUAGES,
  readLanguage,
  VISIBLE_LANGUAGES,
  writeLanguage,
} from './language';
import { UI_LANGUAGES, type UiLanguage } from './locale';

/** The merged message files, `<language>/<namespace>.json`, by path (not loaded). */
const messageFiles = Object.keys(import.meta.glob('../../messages/*/*.json')).map((path) =>
  path.replace('../../messages/', ''),
);

/** A Storage over a Map, enough for the language's two calls. */
function memoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (key) => map.get(key) ?? null,
    key: (index) => [...map.keys()][index] ?? null,
    removeItem: (key) => void map.delete(key),
    setItem: (key, value) => void map.set(key, String(value)),
  };
}

describe('the UI language (ADR-0023, the device preference)', () => {
  it('shows English alone while pt-PT and German are hidden', () => {
    expect(VISIBLE_LANGUAGES).toEqual(['en']);
    expect(LANGUAGE_STORAGE_KEY).toBe('poc.language');
  });

  it("lists the preview languages only on the flag 'listed' (ADR-0023, Deviations of 2026-11-18)", () => {
    expect(listedLanguages('listed')).toEqual(PREVIEW_LANGUAGES);
    expect(listedLanguages('visible')).toEqual(VISIBLE_LANGUAGES);
    expect(PREVIEW_LANGUAGES).toEqual(['en', 'pt-PT']);
  });

  it('previews only UI languages, English first, each with every namespace English has', () => {
    expect(PREVIEW_LANGUAGES[0]).toBe('en');
    const english = messageFiles.filter((file) => file.startsWith('en/')).map((file) => file.slice('en/'.length));
    expect(english.length).toBeGreaterThan(0);
    for (const language of PREVIEW_LANGUAGES) {
      expect(UI_LANGUAGES).toContain(language);
      for (const namespace of english) expect(messageFiles).toContain(`${language}/${namespace}`);
    }
  });

  it('names every UI language in itself', () => {
    expect(LANGUAGE_NAMES).toEqual({ en: 'English', 'pt-PT': 'Português (Portugal)', de: 'Deutsch' });
  });

  it('knows the UI languages and nothing else', () => {
    for (const language of UI_LANGUAGES) expect(isUiLanguage(language)).toBe(true);
    for (const value of ['pt', 'PT-pt', 'en-GB', '', null, undefined, 1, {}]) expect(isUiLanguage(value)).toBe(false);
  });

  it('reads English with no storage, nothing stored or an invalid value', () => {
    const storage = memoryStorage();
    expect(readLanguage(null)).toBe('en');
    expect(readLanguage(storage)).toBe('en');
    storage.setItem(LANGUAGE_STORAGE_KEY, 'fr');
    expect(readLanguage(storage)).toBe('en');
    storage.setItem(LANGUAGE_STORAGE_KEY, '"pt-PT"');
    expect(readLanguage(storage)).toBe('en');
  });

  it('reads English when the storage throws', () => {
    const blocked = {
      getItem: () => {
        throw new DOMException('blocked', 'SecurityError');
      },
    };
    expect(readLanguage(blocked)).toBe('en');
  });

  it('reads back every UI language it wrote, hidden ones included until pt-PT is visible (#21)', () => {
    const storage = memoryStorage();
    for (const language of UI_LANGUAGES) {
      writeLanguage(storage, language);
      expect(storage.getItem(LANGUAGE_STORAGE_KEY)).toBe(language);
      expect(readLanguage(storage)).toBe(language);
    }
  });

  it('finds no storage where the accessor throws', () => {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      get: () => {
        throw new DOMException('blocked', 'SecurityError');
      },
    });
    try {
      expect(localStorageOrNull()).toBeNull();
      expect(readLanguage(localStorageOrNull())).toBe('en');
    } finally {
      if (descriptor) Object.defineProperty(globalThis, 'localStorage', descriptor);
      else Reflect.deleteProperty(globalThis, 'localStorage');
    }
  });
});

const PRODUCTION: readonly UiLanguage[] = ['en'];
const PREVIEW: readonly UiLanguage[] = ['en', 'pt-PT'];
const WITH_GERMAN: readonly UiLanguage[] = ['en', 'pt-PT', 'de'];

describe("the device's language (ADR-0023, Deviations of 2026-11-18)", () => {
  // [the device's languages, production, preview]
  const rows: readonly (readonly [readonly string[], UiLanguage, UiLanguage])[] = [
    [['pt-PT', 'pt', 'en'], 'en', 'pt-PT'],
    [['pt-BR'], 'en', 'pt-PT'],
    [['en-GB'], 'en', 'en'],
    [['en-US'], 'en', 'en'],
    [['pt-PT', 'de-DE'], 'en', 'pt-PT'],
    [['it-IT'], 'en', 'en'],
    [['ja-JP', 'en-US'], 'en', 'en'],
    [['en-GB', 'pt-PT'], 'en', 'en'],
    [['de-DE', 'pt-PT'], 'en', 'pt-PT'],
    [['PT-br'], 'en', 'pt-PT'],
    [['pt_PT'], 'en', 'pt-PT'],
    [['pt-AO'], 'en', 'pt-PT'],
    [['pt'], 'en', 'pt-PT'],
    [[], 'en', 'en'],
    [['*', 'x-private'], 'en', 'en'],
  ];

  it.each(rows)('%j gives %s in production and %s on a preview', (device, production, preview) => {
    expect(deviceLanguage(device, PRODUCTION)).toBe(production);
    expect(deviceLanguage(device, PREVIEW)).toBe(preview);
  });

  it('walks the list in order, so the first offered language wins once German is offered', () => {
    expect(deviceLanguage(['de-DE', 'pt-PT'], WITH_GERMAN)).toBe('de');
    expect(deviceLanguage(['de'], WITH_GERMAN)).toBe('de');
    expect(deviceLanguage(['en-GB', 'de-DE'], WITH_GERMAN)).toBe('en');
  });

  it('gives no two UI languages the same primary subtag', () => {
    const primary = UI_LANGUAGES.map((language) => language.split('-')[0]?.toLowerCase());
    expect(new Set(primary).size).toBe(UI_LANGUAGES.length);
  });

  it('derives from the device with nothing valid stored, and writes nothing', () => {
    const storage = memoryStorage();
    expect(readLanguage(storage, ['pt-PT', 'en'], PREVIEW)).toBe('pt-PT');
    expect(readLanguage(storage, ['pt-PT', 'en'], PRODUCTION)).toBe('en');
    storage.setItem(LANGUAGE_STORAGE_KEY, 'fr');
    expect(readLanguage(storage, ['pt-BR'], PREVIEW)).toBe('pt-PT');
    storage.removeItem(LANGUAGE_STORAGE_KEY);
    expect(readLanguage(storage, ['pt-BR'], PREVIEW)).toBe('pt-PT');
    expect(storage.getItem(LANGUAGE_STORAGE_KEY)).toBeNull();
    expect(storage.length).toBe(0);
    expect(readLanguage(null, ['pt-PT'], PREVIEW)).toBe('pt-PT');
  });

  it('derives from the device when the storage throws', () => {
    const blocked = {
      getItem: () => {
        throw new DOMException('blocked', 'SecurityError');
      },
    };
    expect(readLanguage(blocked, ['pt-PT'], PREVIEW)).toBe('pt-PT');
    expect(readLanguage(blocked, ['pt-PT'], PRODUCTION)).toBe('en');
  });

  it('lets a stored English win on a pt-PT device', () => {
    const storage = memoryStorage();
    writeLanguage(storage, 'en');
    expect(readLanguage(storage, ['pt-PT', 'pt'], PREVIEW)).toBe('en');
  });

  it('still reads a stored hidden language, offered or not, until pt-PT is visible (#21)', () => {
    const storage = memoryStorage();
    writeLanguage(storage, 'pt-PT');
    expect(readLanguage(storage, ['en-GB'], PRODUCTION)).toBe('pt-PT');
    writeLanguage(storage, 'de');
    expect(readLanguage(storage, ['en-GB'], PREVIEW)).toBe('de');
  });

  it('defaults to the visible languages', () => {
    expect(readLanguage(null, ['pt-PT'])).toBe(deviceLanguage(['pt-PT'], VISIBLE_LANGUAGES));
    expect(readLanguage(null, ['pt-PT'])).toBe('en');
  });
});
