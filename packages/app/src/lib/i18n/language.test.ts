import { describe, expect, it } from 'vitest';
import {
  isUiLanguage,
  LANGUAGE_STORAGE_KEY,
  localStorageOrNull,
  readLanguage,
  VISIBLE_LANGUAGES,
  writeLanguage,
} from './language';
import { UI_LANGUAGES } from './locale';

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

  it('reads back every UI language it wrote, hidden ones included until the preview flag', () => {
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
