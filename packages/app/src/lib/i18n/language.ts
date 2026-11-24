import * as z from 'zod/mini';
import { UI_LANGUAGES, type UiLanguage } from './locale';

// The UI language is a device preference (ADR-0023, the entries of 2026-11-15 and 2026-11-18): one
// localStorage value, read by the hosts' entries before the first render, outside the store and the
// backup. Changing it reloads the page, so every namespace a screen holds is in one language. With
// nothing valid stored, the device's languages give it, among the ones the build offers, at every boot;
// the derived language is never written (only Settings' picker writes it). Until pt-PT is visible
// (#21), every stored UI language reads back, the hidden ones included.

/** The languages a picker offers; it shows only when it has two. pt-PT and German stay hidden until their native read. */
export const VISIBLE_LANGUAGES: readonly UiLanguage[] = ['en'];

/**
 * The languages the picker offers on a preview deployment, for the native read (ADR-0023, Deviations of 2026-11-18),
 * each whole in every namespace (locales.test.ts); a device in one of them opens a preview in it.
 */
export const PREVIEW_LANGUAGES: readonly UiLanguage[] = ['en', 'pt-PT', 'de'];

/** The hosts' build flag, `__POC_LANGUAGES__`: only a web preview or development build is `listed`. */
export type LanguagesFlag = 'listed' | 'visible';

/** The languages a host offers for its build's flag; anything but `listed` gives the visible ones. */
export function listedLanguages(flag: LanguagesFlag): readonly UiLanguage[] {
  return flag === 'listed' ? PREVIEW_LANGUAGES : VISIBLE_LANGUAGES;
}

/** Each language's name in itself, as a picker shows it whatever the UI's language; not a message. */
export const LANGUAGE_NAMES: Record<UiLanguage, string> = {
  en: 'English',
  'pt-PT': 'Português (Portugal)',
  de: 'Deutsch',
};

export const LANGUAGE_STORAGE_KEY = 'poc.language';

const UiLanguageSchema = z.enum(UI_LANGUAGES);

export function isUiLanguage(value: unknown): value is UiLanguage {
  return UiLanguageSchema.safeParse(value).success;
}

/** A BCP 47 tag's primary language subtag, `pt` in `PT-br` or `pt_PT`; never `x` or `*`. */
const PRIMARY_SUBTAG = /^([a-z]{2,3})(?=$|[-_])/i;

function primarySubtag(tag: string): string | undefined {
  return PRIMARY_SUBTAG.exec(tag)?.[1]?.toLowerCase();
}

/** Each UI language by its primary subtag: every `pt` tag, whatever its region, gives pt-PT. */
const BY_PRIMARY_SUBTAG = new Map<string | undefined, UiLanguage>(
  UI_LANGUAGES.map((language) => [primarySubtag(language), language]),
);

/**
 * The first of the device's languages, in its order, whose primary subtag is an offered UI language;
 * English when none is. A device tag is never checked with `isUiLanguage`, which refuses `pt` and `en-GB`.
 */
export function deviceLanguage(languages: readonly string[], offered: readonly UiLanguage[]): UiLanguage {
  for (const tag of languages) {
    const language = BY_PRIMARY_SUBTAG.get(primarySubtag(tag));
    if (language !== undefined && offered.includes(language)) return language;
  }
  return 'en';
}

/**
 * The stored language, any UI language until #21; with nothing valid stored, or a storage that throws,
 * the device's language among the offered ones. Writes nothing.
 */
export function readLanguage(
  storage: Pick<Storage, 'getItem'> | null,
  device: readonly string[] = [],
  offered: readonly UiLanguage[] = VISIBLE_LANGUAGES,
): UiLanguage {
  let value: string | null = null;
  try {
    value = storage?.getItem(LANGUAGE_STORAGE_KEY) ?? null;
  } catch {
    // Unreadable storage: the device decides.
  }
  return isUiLanguage(value) ? value : deviceLanguage(device, offered);
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
