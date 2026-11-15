// Translated content as sparse overlays on the English files (ADR-0057): `i18n/<language>/<kind>/<file>.json` holds
// only the prose fields TRANSLATABLE names, at paths that exist in English, arrays of the English length (null keeps
// an item English). English stays the schema and the source of every number, date and source. Pure; relative imports
// name their .ts files, so that Node runs the scripts without a build step.

/** The languages content is written in; `UI_LANGUAGES` in packages/app must equal it. */
export const CONTENT_LANGUAGES = ['en', 'pt-PT', 'de'] as const;
export type ContentLanguage = (typeof CONTENT_LANGUAGES)[number];
/** The languages an overlay holds; English is the files themselves. */
export type OverlayLanguage = Exclude<ContentLanguage, 'en'>;
export type ContentKind = 'jurisdiction' | 'template' | 'fact';

/** The paths an overlay may hold per kind, `*` for an array index; a fact's are within the fact its key names. */
export const TRANSLATABLE: Readonly<Record<ContentKind, readonly string[]>> = {
  jurisdiction: [
    'name',
    'filingNote',
    'lotRuleNote',
    'holdingRuleConditions.*',
    'card.classification',
    'card.holdingRuleText',
    'card.lotRuleText',
    'card.losses',
    'card.summary60',
    'card.allowances.*',
    'card.reporting.*',
    'card.caveats.*',
    'card.taxableEvents.*.note',
    'card.rates.*.label',
    'card.rates.*.value',
    'card.rates.*.note',
    'pendingChanges.*.title',
    'pendingChanges.*.summary',
    'status.changeNotice',
  ],
  template: ['name', 'oneLine', 'riskLabel', 'explanation'],
  fact: ['value', 'unit'],
};

export type Segment = string | number;

export const isTranslatable = (kind: ContentKind, at: readonly Segment[]) =>
  TRANSLATABLE[kind].includes(at.map((segment) => (typeof segment === 'number' ? '*' : segment)).join('.'));

export const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function merge(english: unknown, overlay: unknown, at: readonly Segment[], kind: ContentKind): unknown {
  if (typeof english === 'string') return typeof overlay === 'string' && isTranslatable(kind, at) ? overlay : english;
  if (Array.isArray(english)) {
    if (!Array.isArray(overlay) || overlay.length !== english.length) return english;
    return english.map((item: unknown, index) => merge(item, overlay[index], [...at, index], kind));
  }
  if (!isRecord(english) || !isRecord(overlay)) return english;
  return Object.fromEntries(
    Object.entries(english).map(([key, value]) => [
      key,
      Object.hasOwn(overlay, key) ? merge(value, overlay[key], [...at, key], kind) : value,
    ]),
  );
}

/**
 * The English value with the overlay's translatable strings in place: the shape, key order and every other value stay
 * English's, so a source, a date, a number or an array length cannot change whatever the overlay holds.
 */
export function applyOverlay<T>(english: T, overlay: unknown, kind: ContentKind): T {
  return merge(english, overlay, [], kind) as T;
}
