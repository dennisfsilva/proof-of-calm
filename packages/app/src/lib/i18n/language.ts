import * as z from 'zod/mini';
import { UI_LANGUAGES, type UiLanguage } from './locale';

// The UI language is a device preference (ADR-0023, the entry of 2026-11-15): one localStorage value,
// read by the hosts' entries before the first render, outside the store and the backup. Changing it
// reloads the page, so every namespace a screen holds is in one language. Until a preview flag, every
// UI language reads back, the hidden ones included; nothing links to a hidden one.

/** The languages a picker offers; it shows only when it has two. pt-PT and German stay hidden until complete. */
export const VISIBLE_LANGUAGES: readonly UiLanguage[] = ['en'];

export const LANGUAGE_STORAGE_KEY = 'poc.language';

const UiLanguageSchema = z.enum(UI_LANGUAGES);

export function isUiLanguage(value: unknown): value is UiLanguage {
  return UiLanguageSchema.safeParse(value).success;
}

/** The stored language; English when nothing valid is stored or the storage throws. */
export function readLanguage(storage: Pick<Storage, 'getItem'> | null): UiLanguage {
  try {
    const value = storage?.getItem(LANGUAGE_STORAGE_KEY) ?? null;
    return isUiLanguage(value) ? value : 'en';
  } catch {
    return 'en';
  }
}

/** Stores the language; the caller reloads the page after it. */
export function writeLanguage(storage: Storage, language: UiLanguage): void {
  storage.setItem(LANGUAGE_STORAGE_KEY, language);
}

/** The browser's localStorage; missing in a server render, and the accessor itself may throw. */
export function localStorageOrNull(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}
