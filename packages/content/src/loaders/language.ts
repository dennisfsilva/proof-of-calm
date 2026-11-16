// The language of the text each loader returned (ADR-0057, Corrections of 2026-11-16): a translation where its
// overlay loaded, English for a country, template or rules file with none yet and for the offline fallback. The
// mark sits on the loader's own object, so an object no loader returned, a copy or a parse, gives undefined and
// the page's language stands for it. A translation keeps an English item it does not hold under its own mark: no
// overlay holds a null item today, so a translation that keeps one must extend this per path (WCAG 2.2 SC 3.1.2).
import type { ContentLanguage } from '../i18n/overlay.ts';

const languages = new WeakMap<object, ContentLanguage>();

/** Marks a loader's result with the language of its text, and returns it. */
export function markLanguage<T extends object>(value: T, language: ContentLanguage): T {
  languages.set(value, language);
  return value;
}

/** The language of the text a loader returned in `value`; undefined for an object no loader returned. */
export function contentLanguageOf(value: object): ContentLanguage | undefined {
  return languages.get(value);
}
