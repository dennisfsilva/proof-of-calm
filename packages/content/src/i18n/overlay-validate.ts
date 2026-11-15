// A translation file against its English file (ADR-0057), for validate.ts: every path exists in English, holds prose
// TRANSLATABLE names, keeps the English array lengths and carries the English numbers, and the overlaid value passes
// the schema. The checks on the overlaid text (the ban list, the hyphen, the percent joiner, the 60 words) are
// validate.ts's, passed in. Pure.
import { type Problem, schemaProblems } from '../problem.ts';
import { FactSchema } from '../schema/fact.ts';
import { type CountryProfile, CountryProfileSchema } from '../schema/jurisdiction.ts';
import { type ContentTemplate, TemplateSchema } from '../schema/template.ts';
import {
  applyOverlay,
  CONTENT_LANGUAGES,
  type ContentKind,
  isRecord,
  isTranslatable,
  type Segment,
} from './overlay.ts';

// Digits with the decimal and group separators between them: `31.4`, `31,4`, `1,000`, `1 000`, `1 000`. A space joins
// only a group of three digits, so `365 28` stays two numbers.
const NUMBER = /\d+(?:(?:[.,]|[   ](?=\d{3}(?!\d)))\d+)*/g;

/** The numbers of a text as digit strings, separators between digits removed, sorted: a multiset to compare. */
export const numbersIn = (text: string): string[] =>
  [...text.matchAll(NUMBER)].map(([match]) => match.replace(/\D/g, '')).sort();

/** Every way the overlay departs from English; the empty list is a pass. */
export function overlayProblems(kind: ContentKind, path: string, english: unknown, overlay: unknown): Problem[] {
  const problems: Problem[] = [];
  const report = (code: string, at: readonly Segment[], detail = '') =>
    problems.push({ path, code: `overlay-${code}`, detail: `${at.join('.') || '(root)'}${detail}` });
  const walk = (en: unknown, over: unknown, at: readonly Segment[]): void => {
    if (en === undefined || (en === null && over !== null)) return void report('unknown-path', at);
    if (isRecord(over)) {
      if (!isRecord(en)) return void report('not-translatable', at);
      for (const [key, value] of Object.entries(over)) {
        walk(Object.hasOwn(en, key) ? en[key] : undefined, value, [...at, key]);
      }
      return;
    }
    if (Array.isArray(over)) {
      if (!Array.isArray(en)) return void report('not-translatable', at);
      if (over.length !== en.length) {
        return void report('array-length', at, `: ${over.length} items, English ${en.length}`);
      }
      for (const [index, item] of over.entries()) {
        if (item !== null) walk(en[index], item, [...at, index]);
      }
      return;
    }
    if (typeof over !== 'string' || typeof en !== 'string' || !isTranslatable(kind, at)) {
      return void report('not-translatable', at);
    }
    const [mine, theirs] = [numbersIn(over).join(' ') || 'none', numbersIn(en).join(' ') || 'none'];
    if (mine !== theirs) report('number-mismatch', at, `: ${mine}, English ${theirs}`);
  };
  walk(english, overlay, []);
  return problems;
}

const OVERLAY_FILE = /^(.*\/)?packages\/content\/i18n\/([^/]+)\/(jurisdictions|templates|facts)\/([^/]+\.json)$/;
const KINDS = { jurisdictions: 'jurisdiction', templates: 'template', facts: 'fact' } as const;
const LANGUAGES: readonly string[] = CONTENT_LANGUAGES.filter((language) => language !== 'en');

export const isOverlayFile = (path: string) => OVERLAY_FILE.test(path);

/** The texts whose overlaid value differs from English: the ones the English checks have not seen. */
export const changedTexts = (english: readonly [string, string][], translated: readonly [string, string][]) => {
  const before = new Map(english);
  return translated.filter(([field, text]) => before.get(field) !== text);
};

type Pair<T> = readonly [english: T, translated: T];
/** validate.ts's checks on what users read, run on a translation: dependency-cruiser forbids the import cycle. */
export type TextChecks = {
  readonly jurisdiction: (path: string, language: string, profiles: Pair<CountryProfile>) => Problem[];
  readonly template: (path: string, templates: Pair<ContentTemplate>) => Problem[];
};

/**
 * A translation file (ADR-0057): its English file among `files`, its shape against English, the schema and every check
 * the English field takes on its overlaid value. An English file that fails its schema is the English file's problem.
 */
export function overlayFileProblems(
  file: { readonly path: string; readonly json: unknown },
  files: readonly { readonly path: string; readonly json: unknown }[],
  checks: TextChecks,
): Problem[] {
  const { path, json } = file;
  const [, prefix = '', language = '', folder = '', name = ''] = OVERLAY_FILE.exec(path) ?? [];
  if (!LANGUAGES.includes(language)) {
    return [{ path, code: 'overlay-orphan', detail: `${language} is not a content language` }];
  }
  const englishPath = `${prefix}packages/content/${folder}/${name}`;
  const english = files.find((candidate) => candidate.path === englishPath)?.json;
  if (english === undefined) return [{ path, code: 'overlay-orphan', detail: `no English ${englishPath}` }];
  const kind = KINDS[folder as keyof typeof KINDS];
  if (kind === 'fact') return factProblems(path, english, json);
  if (kind === 'template') {
    const parsed = TemplateSchema.safeParse(english);
    if (!parsed.success) return [];
    const translated = applyOverlay(parsed.data, json, kind);
    const check = TemplateSchema.safeParse(translated);
    return [
      ...overlayProblems(kind, path, parsed.data, json),
      ...(check.success ? [] : schemaProblems(path, check.error.issues)),
      ...checks.template(path, [parsed.data, translated]),
    ];
  }
  const parsed = CountryProfileSchema.safeParse(english);
  if (!parsed.success) return [];
  const translated = applyOverlay(parsed.data, json, kind);
  const check = CountryProfileSchema.safeParse(translated);
  return [
    ...overlayProblems(kind, path, parsed.data, json),
    ...(check.success ? [] : schemaProblems(path, check.error.issues)),
    ...checks.jurisdiction(path, language, [parsed.data, translated]),
  ];
}

/** A facts translation: each fact's `value` and `unit` by its key, a key of the English file. */
function factProblems(path: string, english: unknown, json: unknown): Problem[] {
  if (!isRecord(json)) return [{ path, code: 'schema', detail: 'expected the translated facts by key' }];
  const facts = Array.isArray(english) ? english.filter(isRecord) : [];
  return Object.entries(json).flatMap(([key, translation]): Problem[] => {
    const fact = facts.find((candidate) => candidate.key === key);
    if (fact === undefined) return [{ path, code: 'overlay-orphan', detail: key }];
    const shape = overlayProblems('fact', path, fact, translation).map((problem) => ({
      ...problem,
      detail: `${key}.${problem.detail}`,
    }));
    const check = FactSchema.safeParse(applyOverlay(fact, translation, 'fact'));
    return check.success ? shape : [...shape, ...schemaProblems(`${path}#${key}`, check.error.issues)];
  });
}
